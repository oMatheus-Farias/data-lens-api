import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TesseractDocumentProcessor } from './TesseractDocumentProcessor';

test('recognizes an image with Portuguese and English and returns its OCR text', async () => {
  let actualImagePath = '';
  let actualLanguages = '';
  const processor = new TesseractDocumentProcessor(async (imagePath, languages) => {
    actualImagePath = imagePath;
    actualLanguages = languages;

    return 'texto reconhecido';
  });

  const result = await processor.process('/tmp/upload-1.png');

  assert.equal(result, 'texto reconhecido');
  assert.equal(actualImagePath, '/tmp/upload-1.png');
  assert.equal(actualLanguages, 'por+eng');
});
