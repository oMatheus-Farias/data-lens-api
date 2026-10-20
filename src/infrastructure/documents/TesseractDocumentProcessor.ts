import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IDocumentProcessor } from '@application/documents/DocumentProcessor';
import { env } from '@shared/config/env';
import Tesseract from 'tesseract.js';

type IImageRecognizer = (imagePath: string, languages: string) => Promise<string>;
const languageCachePath = join(tmpdir(), 'data-lens-tesseract-cache');

async function recognizeWithTesseract(imagePath: string, languages: string): Promise<string> {
  await mkdir(languageCachePath, { recursive: true });
  const options = env.TESSERACT_LANG_PATH
    ? { cachePath: languageCachePath, langPath: env.TESSERACT_LANG_PATH, gzip: false }
    : { cachePath: languageCachePath };
  const result = await Tesseract.recognize(imagePath, languages, options);

  return result.data.text;
}

export class TesseractDocumentProcessor implements IDocumentProcessor {
  constructor(private readonly recognize: IImageRecognizer = recognizeWithTesseract) {}

  process(imagePath: string): Promise<string> {
    return this.recognize(imagePath, 'por+eng');
  }
}
