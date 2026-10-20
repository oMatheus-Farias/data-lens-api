import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { OcrmypdfDocumentProcessor } from './OcrmypdfDocumentProcessor';

test('runs local OCRmyPDF with Portuguese and English and returns sidecar text', async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), 'data-lens-ocr-test-'));
  const pdfPath = join(workDirectory, 'upload-1.pdf');
  await writeFile(pdfPath, '%PDF-1.4\nsynthetic fixture\n%%EOF');
  let actualArgs: string[] = [];

  const processor = new OcrmypdfDocumentProcessor(async (args) => {
    actualArgs = args;
    const sidecarIndex = args.indexOf('--sidecar');
    assert.notEqual(sidecarIndex, -1);
    await writeFile(args[sidecarIndex + 1]!, 'recognized OCR text\ncomplete output\n');
  });

  try {
    const ocrText = await processor.process(pdfPath, workDirectory);

    assert.equal(ocrText, 'recognized OCR text\ncomplete output\n');
    assert.deepEqual(actualArgs.slice(0, 3), ['-l', 'por+eng', '--deskew']);
    assert.equal(actualArgs[3], '--sidecar');
    assert.equal(actualArgs[5], pdfPath);
    assert.equal(actualArgs[6], join(workDirectory, 'upload-1-ocr.pdf'));

    const sidecarPath = actualArgs[4];
    assert.ok(sidecarPath);
    assert.equal(await readFile(sidecarPath, 'utf8'), 'recognized OCR text\ncomplete output\n');
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});
