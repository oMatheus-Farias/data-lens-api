import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join, sep } from 'node:path';

import { pdf } from 'pdf-to-img';

export interface IOcrPage {
  pageNumber: number;
  ocrText: string;
}

type IRenderPdf = (pdfPath: string, workDirectory: string) => Promise<string[]>;
type IRequest = (url: string, init: RequestInit) => Promise<Response>;
type IOcrDebugLogger = (page: IOcrPage) => void;

const require = createRequire(import.meta.url);
const pdfToImgRequire = createRequire(require.resolve('pdf-to-img'));
const pdfjsDirectory = dirname(pdfToImgRequire.resolve('pdfjs-dist/package.json'));
const PDFJS_WASM_DIRECTORY = `${join(pdfjsDirectory, 'wasm')}${sep}`;

async function renderPdf(pdfPath: string, workDirectory: string): Promise<string[]> {
  const imageDocument = await pdf(pdfPath, {
    scale: 300 / 72,
    docInitParams: { wasmUrl: PDFJS_WASM_DIRECTORY },
  });
  const imagePrefix = join(workDirectory, `${basename(pdfPath, extname(pdfPath))}-page`);
  const imagePaths: string[] = [];

  try {
    let pageNumber = 0;
    for await (const image of imageDocument) {
      pageNumber += 1;
      const imagePath = `${imagePrefix}-${pageNumber}.png`;
      await writeFile(imagePath, image);
      imagePaths.push(imagePath);
    }

    return imagePaths;
  } finally {
    await imageDocument.destroy();
  }
}

export class CloudVisionDocumentProcessor {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly runRenderer: IRenderPdf = renderPdf,
    private readonly request: IRequest = fetch,
    private readonly debugOcr = false,
    private readonly logOcrPage: IOcrDebugLogger = (page) =>
      process.stdout.write(`[cloud-vision-ocr] ${JSON.stringify(page)}\n`),
  ) {}

  async process(pdfPath: string, workDirectory: string): Promise<IOcrPage[]> {
    if (!this.apiKey) {
      throw new Error('Cloud Vision OCR is not configured');
    }

    const imagePrefix = `${basename(pdfPath, extname(pdfPath))}-page-`;
    const imagePaths: string[] = [];

    try {
      imagePaths.push(...(await this.runRenderer(pdfPath, workDirectory)));

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
          const page = {
            pageNumber: offset + index + 1,
            ocrText:
              result.fullTextAnnotation?.text ?? result.textAnnotations?.[0]?.description ?? '',
          };
          pages.push(page);
          if (this.debugOcr) {
            this.logOcrPage(page);
          }
        }
        for (let index = (payload.responses ?? []).length; index < batchPaths.length; index += 1) {
          pages.push({ pageNumber: offset + index + 1, ocrText: '' });
        }
      }

      return pages;
    } finally {
      await Promise.all(imagePaths.map((imagePath) => rm(imagePath, { force: true })));
      // A failed render can leave some page images behind before returning its paths.
      const partialImages = (await readdir(workDirectory)).filter(
        (fileName) => fileName.startsWith(imagePrefix) && fileName.endsWith('.png'),
      );
      await Promise.all(
        partialImages.map((fileName) => rm(join(workDirectory, fileName), { force: true })),
      );
    }
  }
}
