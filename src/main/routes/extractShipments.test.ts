import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildApp } from '../app';

const boundary = 'data-lens-test-boundary';

function createMultipart(files: { name?: string; filename: string; content: string }[]) {
  const chunks: Buffer[] = [];
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${file.name ?? 'file'}"; filename="${file.filename}"\r\n` +
          'Content-Type: application/pdf\r\n\r\n',
      ),
      Buffer.from(file.content),
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

function pdf(content: string) {
  return `%PDF-1.4\n${content}\n%%EOF`;
}

async function withApp<T>(run: (app: ReturnType<typeof buildApp>) => Promise<T>) {
  const app = buildApp({
    processDocument: async () => [
      { pageNumber: 1, ocrText: 'New Shipping List' },
      { pageNumber: 2, ocrText: 'second page text' },
    ],
  });
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

test('accepts one PDF in the singular file field and returns OCR pages in order', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/shipments/extract',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'batch.pdf', content: pdf('fixture') }]),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      docExtracts: [
        {
          type: 'shippingList',
          pageNumber: 1,
          shipname: null,
          shipment: null,
          dn: { number: null },
          total: { realWt: null, cubicWt: null, Vol: null },
          data: [],
        },
        {
          type: 'unrecognized',
          pageNumber: 2,
          ocrText: 'second page text',
        },
      ],
    });
  });
});

test('rejects missing, multiple, wrong-field, and non-PDF uploads', async () => {
  await withApp(async (app) => {
    const headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/shipments/extract',
        headers,
        payload: createMultipart([]),
      }),
      app.inject({
        method: 'POST',
        url: '/shipments/extract',
        headers,
        payload: createMultipart([
          { filename: 'one.pdf', content: pdf('one') },
          { filename: 'two.pdf', content: pdf('two') },
        ]),
      }),
      app.inject({
        method: 'POST',
        url: '/shipments/extract',
        headers,
        payload: createMultipart([{ name: 'files', filename: 'one.pdf', content: pdf('one') }]),
      }),
      app.inject({
        method: 'POST',
        url: '/shipments/extract',
        headers,
        payload: createMultipart([{ filename: 'one.png', content: pdf('image') }]),
      }),
    ]);

    assert.ok(responses.every((response) => response.statusCode === 400));
    assert.ok(responses.every((response) => response.json().error.code === 'VALIDATION'));
  });
});

test('cleans up request files when OCR processing fails and returns a safe error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'data-lens-route-test-'));
  const app = buildApp({
    temporaryDirectoryRoot: root,
    processDocument: async () => {
      throw new Error('private-secret /private/path/input.pdf');
    },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/shipments/extract',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'batch.pdf', content: pdf('fixture') }]),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      docExtracts: [
        {
          type: 'failed',
          fileName: 'batch.pdf',
          status: 'failed',
          reason: 'Document could not be processed',
        },
      ],
    });
    assert.deepEqual(await readdir(root), []);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
