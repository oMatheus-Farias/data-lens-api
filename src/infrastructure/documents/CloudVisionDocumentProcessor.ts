import { execFile } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

export interface IOcrPage {
  pageNumber: number;
  ocrText: string;
}

type IRenderPdf = (args: string[]) => Promise<void>;
type IRequest = (url: string, init: RequestInit) => Promise<Response>;

function renderPdf(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('pdftoppm', args, { maxBuffer: 5 * 1024 * 1024, windowsHide: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function pageNumberFromFile(fileName: string): number {
  return Number(fileName.match(/-(\d+)\.png$/)?.[1] ?? 0);
}

export class CloudVisionDocumentProcessor {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly runRenderer: IRenderPdf = renderPdf,
    private readonly request: IRequest = fetch,
  ) {}

  async process(pdfPath: string, workDirectory: string): Promise<IOcrPage[]> {
    if (!this.apiKey) {
      throw new Error('Cloud Vision OCR is not configured');
    }

    const imagePrefix = join(workDirectory, `${basename(pdfPath, extname(pdfPath))}-page`);
    const imagePaths: string[] = [];

    try {
      await this.runRenderer(['-png', '-r', '300', pdfPath, imagePrefix]);
      const imageFiles = (await readdir(workDirectory))
        .filter(
          (fileName) =>
            fileName.startsWith(`${basename(imagePrefix)}-`) && fileName.endsWith('.png'),
        )
        .sort((left, right) => pageNumberFromFile(left) - pageNumberFromFile(right));
      imagePaths.push(...imageFiles.map((fileName) => join(workDirectory, fileName)));

      const pages: IOcrPage[] = [];
      for (let offset = 0; offset < imagePaths.length; offset += 16) {
        const batchPaths = imagePaths.slice(offset, offset + 16);
        const requests = await Promise.all(
          batchPaths.map(async (imagePath) => ({
            image: { content: (await readFile(imagePath)).toString('base64') },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          })),
        );
        const url = new URL('https://vision.googleapis.com/v1/images:annotate');
        url.searchParams.set('key', this.apiKey);

        let response: Response;
        try {
          response = await this.request(url.toString(), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ requests }),
          });
        } catch {
          throw new Error('Cloud Vision OCR failed');
        }

        if (!response.ok) {
          throw new Error('Cloud Vision OCR failed');
        }

        let payload: {
          responses?: {
            error?: unknown;
            fullTextAnnotation?: { text?: string };
            textAnnotations?: { description?: string }[];
          }[];
        };
        try {
          payload = (await response.json()) as typeof payload;
        } catch {
          throw new Error('Cloud Vision OCR failed');
        }

        if ((payload.responses ?? []).some((result) => result.error)) {
          throw new Error('Cloud Vision OCR failed');
        }

        for (const [index, result] of (payload.responses ?? []).entries()) {
          pages.push({
            pageNumber: offset + index + 1,
            ocrText:
              result.fullTextAnnotation?.text ?? result.textAnnotations?.[0]?.description ?? '',
          });
        }
        for (let index = (payload.responses ?? []).length; index < batchPaths.length; index += 1) {
          pages.push({ pageNumber: offset + index + 1, ocrText: '' });
        }
      }

      return pages;
    } finally {
      await Promise.all(imagePaths.map((imagePath) => rm(imagePath, { force: true })));
      // pdftoppm can leave partial images behind if rendering fails.
      const partialImages = (await readdir(workDirectory)).filter(
        (fileName) => fileName.startsWith(`${basename(imagePrefix)}-`) && fileName.endsWith('.png'),
      );
      await Promise.all(
        partialImages.map((fileName) => rm(join(workDirectory, fileName), { force: true })),
      );
    }
  }
}
