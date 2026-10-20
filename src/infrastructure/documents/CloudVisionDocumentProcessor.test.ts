import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CloudVisionDocumentProcessor } from './CloudVisionDocumentProcessor';

test('renders a PDF, batches pages by 16, and returns OCR text in page order', async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), 'data-lens-vision-test-'));
  const pdfPath = join(workDirectory, 'upload.pdf');
  await writeFile(pdfPath, '%PDF-1.4');
  let renderArgs: string[] = [];
  const requestSizes: number[] = [];
  const requestUrls: string[] = [];
  const processor = new CloudVisionDocumentProcessor(
    'test-secret',
    async (args) => {
      renderArgs = args;
      const prefix = args.at(-1);
      assert.ok(prefix);
      for (let page = 1; page <= 17; page += 1) {
        await writeFile(`${prefix}-${page}.png`, `page-${page}`);
      }
    },
    async (url, init) => {
      requestUrls.push(String(url));
      const body = JSON.parse(String(init?.body)) as {
        requests: { image: { content: string } }[];
      };
      requestSizes.push(body.requests.length);
      return new Response(
        JSON.stringify({
          responses: body.requests.map(({ image }) => ({
            fullTextAnnotation: { text: Buffer.from(image.content, 'base64').toString() },
          })),
        }),
        { status: 200 },
      );
    },
  );

  try {
    const pages = await processor.process(pdfPath, workDirectory);

    assert.deepEqual(renderArgs.slice(0, -1), ['-png', '-r', '300', pdfPath]);
    assert.deepEqual(requestSizes, [16, 1]);
    assert.ok(requestUrls.every((url) => url.endsWith('?key=test-secret')));
    assert.deepEqual(
      pages.map((page) => [page.pageNumber, page.ocrText]),
      Array.from({ length: 17 }, (_, index) => [index + 1, `page-${index + 1}`]),
    );
    assert.deepEqual((await readdir(workDirectory)).sort(), ['upload.pdf']);
    assert.equal(await readFile(pdfPath, 'utf8'), '%PDF-1.4');
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test('does not expose the API key or provider response when Cloud Vision fails', async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), 'data-lens-vision-test-'));
  const pdfPath = join(workDirectory, 'upload.pdf');
  await writeFile(pdfPath, '%PDF-1.4');
  const processor = new CloudVisionDocumentProcessor(
    'private-secret',
    async (args) => {
      const prefix = args.at(-1);
      assert.ok(prefix);
      await writeFile(`${prefix}-1.png`, 'page');
    },
    async () => new Response('private-secret at /private/path', { status: 403 }),
  );

  try {
    await assert.rejects(processor.process(pdfPath, workDirectory), {
      message: 'Cloud Vision OCR failed',
    });
    assert.deepEqual((await readdir(workDirectory)).sort(), ['upload.pdf']);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});
