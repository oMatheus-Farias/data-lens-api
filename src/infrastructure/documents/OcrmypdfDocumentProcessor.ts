import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import type { IDocumentProcessor } from '@application/documents/DocumentProcessor';

type IOcrmypdfCommandRunner = (args: string[]) => Promise<void>;

function runOcrmypdf(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('ocrmypdf', args, { maxBuffer: 5 * 1024 * 1024, windowsHide: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export class OcrmypdfDocumentProcessor implements IDocumentProcessor {
  constructor(private readonly runCommand: IOcrmypdfCommandRunner = runOcrmypdf) {}

  async process(pdfPath: string, workDirectory: string): Promise<string> {
    const fileBaseName = basename(pdfPath, extname(pdfPath));
    const outputPdfPath = join(workDirectory, `${fileBaseName}-ocr.pdf`);
    const sidecarTextPath = join(workDirectory, `${fileBaseName}-ocr.txt`);

    await this.runCommand([
      '-l',
      'por+eng',
      '--deskew',
      '--sidecar',
      sidecarTextPath,
      pdfPath,
      outputPdfPath,
    ]);

    return readFile(sidecarTextPath, 'utf8');
  }
}
