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
          data: [],
        },
        {
          type: 'unrecognized',
          pageNumber: 2,
          ocrText: 'second page text',
        },
      ],
      matches: [],
    });
  });
});

test('returns Romaneio to DANFE matches alongside all extracted pages', async () => {
  const app = buildApp({
    processDocument: async () => [
      {
        pageNumber: 1,
        ocrText: [
          'New Shipping List',
          'Country ZZ Shipname TEST-SHIP-01',
          'Shipment 9999999999',
          'DN City State Route',
          '7788 CITY ALPHA XX TST009',
          'Box Number Box Code Fiscal Note Real Wt (Kg) Cubic Wt (Kg) Vol (m3)',
          '12345001 CODE-1 900001234-01 11,111 22,222 0,333',
        ].join('\n'),
      },
      {
        pageNumber: 5,
        ocrText: 'DANFE\nNOTA FISCAL ELETRÔNICA\nN° 90000123401',
      },
    ],
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/shipments/extract',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'batch.pdf', content: pdf('fixture') }]),
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.docExtracts.length, 2);
    assert.equal(body.docExtracts[0].type, 'shippingList');
    assert.equal(body.docExtracts[1].type, 'nfDanfe');
    assert.deepEqual(body.matches, [
      {
        status: 'matched',
        fiscalNote: '900001234-01',
        romaneioPageNumber: 1,
        romaneioRowNumber: 1,
        danfePageNumber: 5,
        candidatePageNumbers: [],
      },
    ]);
  } finally {
    await app.close();
  }
});

test('matches a column-oriented Romaneio row to its DANFE through the extract endpoint', async () => {
  const app = buildApp({
    processDocument: async () => [
      {
        pageNumber: 1,
        ocrText: [
          'New Shipping List',
          'Shipname TEST-SHIP',
          'Shipment 6500000000',
          'DN',
          '7788',
          'Box Number',
          '55510000000',
          'Box Code',
          'CODE-1',
          'Fiscal Note',
          '000000123-45',
          'Total',
          'Real Wt (Kg)',
          '10,000',
          '10,000',
          'Cubic Wt (Kg)',
          '20,000',
          'Vol (m³)',
          '0,100',
          '0,100',
        ].join('\n'),
      },
      {
        pageNumber: 2,
        ocrText: 'DANFE\nNOTA FISCAL ELETRÔNICA\nN°\n000000123\nSÉRIE\n45',
      },
    ],
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/shipments/extract',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'batch.pdf', content: pdf('fixture') }]),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().matches, [
      {
        status: 'matched',
        fiscalNote: '000000123-45',
        romaneioPageNumber: 1,
        romaneioRowNumber: 1,
        danfePageNumber: 2,
        candidatePageNumbers: [],
      },
    ]);
  } finally {
    await app.close();
  }
});

test('returns DANFE OCR pages as nfDanfe records with their page number', async () => {
  const app = buildApp({
    processDocument: async () => [
      {
        pageNumber: 4,
        ocrText: 'DANFE NOTA FISCAL ELETRÔNICA\nNÚMERO DA NOTA: 000123\nSÉRIE: 001',
      },
    ],
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/shipments/extract',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'danfe.pdf', content: pdf('fixture') }]),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().docExtracts[0].type, 'nfDanfe');
    assert.equal(response.json().docExtracts[0].pageNumber, 4);
    assert.equal(response.json().docExtracts[0].invoice_number, '000123');
  } finally {
    await app.close();
  }
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
      matches: [],
    });
    assert.deepEqual(await readdir(root), []);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
