import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CloudVisionDocumentProcessor } from './CloudVisionDocumentProcessor';

function twoPagePdf(): string {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 6 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let document = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(document);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return document;
}

test('renders PDF pages without a system pdftoppm executable', async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), 'data-lens-vision-test-'));
  const pdfPath = join(workDirectory, 'upload.pdf');
  await writeFile(pdfPath, twoPagePdf());
  const processor = new CloudVisionDocumentProcessor('test-secret', undefined, async (_, init) => {
    const body = JSON.parse(String(init?.body)) as {
      requests: { image: { content: string } }[];
    };

    return new Response(
      JSON.stringify({
        responses: body.requests.map((_, index) => ({
          fullTextAnnotation: { text: `page ${index + 1}` },
        })),
      }),
      { status: 200 },
    );
  });

  try {
    const pages = await processor.process(pdfPath, workDirectory);

    assert.deepEqual(pages, [
      { pageNumber: 1, ocrText: 'page 1' },
      { pageNumber: 2, ocrText: 'page 2' },
    ]);
    assert.deepEqual((await readdir(workDirectory)).sort(), ['upload.pdf']);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test('renders a PDF, batches pages by 16, and returns OCR text in page order', async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), 'data-lens-vision-test-'));
  const pdfPath = join(workDirectory, 'upload.pdf');
  await writeFile(pdfPath, '%PDF-1.4');
  let renderArgs: string[] = [];
  const requestSizes: number[] = [];
  const requestUrls: string[] = [];
  const processor = new CloudVisionDocumentProcessor(
    'test-secret',
    async (renderedPdfPath, renderDirectory) => {
      renderArgs = [renderedPdfPath, renderDirectory];
      const prefix = join(renderDirectory, 'upload-page');
      for (let page = 1; page <= 17; page += 1) {
        await writeFile(`${prefix}-${page}.png`, `page-${page}`);
      }
      return Array.from({ length: 17 }, (_, index) => `${prefix}-${index + 1}.png`);
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

    assert.deepEqual(renderArgs, [pdfPath, workDirectory]);
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
    async (_, renderDirectory) => {
      const prefix = join(renderDirectory, 'upload-page');
      await writeFile(`${prefix}-1.png`, 'page');
      return [`${prefix}-1.png`];
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
