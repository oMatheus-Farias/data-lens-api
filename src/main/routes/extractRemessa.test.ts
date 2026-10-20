import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildApp } from '../app';

const boundary = 'data-lens-test-boundary';

interface IUploadedFile {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

function createMultipart(files: IUploadedFile[]) {
  const chunks: Buffer[] = [];

  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="files"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.contentType ?? 'application/pdf'}\r\n\r\n`,
      ),
      Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content),
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
    processDocument: async (filePath) => {
      const { readFile } = await import('node:fs/promises');
      const uploadedPdf = await readFile(filePath, 'utf8');
      const marker = uploadedPdf.match(/\n([\s\S]*)\n%%EOF$/)?.[1];

      if (marker === 'processor-failure') {
        throw new Error(`Failed at /tmp/private/input.pdf: ${marker}`);
      }

      return marker ?? '';
    },
  });

  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

test('returns OCR results in upload order with original filenames', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([
        { filename: 'first.pdf', content: pdf('recognized first text') },
        { filename: 'second.pdf', content: pdf('recognized second text') },
      ]),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      documents: [
        {
          fileName: 'first.pdf',
          status: 'unrecognized',
          ocrText: 'recognized first text',
        },
        {
          fileName: 'second.pdf',
          status: 'unrecognized',
          ocrText: 'recognized second text',
        },
      ],
    });
  });
});

test('reports a failed PDF safely and continues processing later files', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([
        { filename: 'first.pdf', content: pdf('recognized text') },
        { filename: 'broken.pdf', content: pdf('processor-failure') },
        { filename: 'last.pdf', content: pdf('last recognized text') },
      ]),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      documents: [
        {
          fileName: 'first.pdf',
          status: 'unrecognized',
          ocrText: 'recognized text',
        },
        {
          fileName: 'broken.pdf',
          status: 'failed',
          reason: 'Document could not be processed',
        },
        {
          fileName: 'last.pdf',
          status: 'unrecognized',
          ocrText: 'last recognized text',
        },
      ],
    });

    assert.equal(response.body.includes('/tmp/private'), false);
  });
});

test('rejects requests without files', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([]),
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'VALIDATION');
    assert.equal(
      response.json().error.message,
      "At least one PDF file is required in the 'files' field",
    );
  });
});

test('rejects non-PDF content before invoking the processor', async () => {
  const app = buildApp({
    processDocument: async () => {
      assert.fail('non-PDF uploads must not be processed');
    },
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'not-a-pdf.pdf', content: 'not a PDF' }]),
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'VALIDATION');
    assert.equal(response.json().error.message, "The 'files' field must contain PDF files");
  } finally {
    await app.close();
  }
});

test('rejects malformed multipart input', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.from(`--${boundary}\r\ninvalid multipart`),
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'VALIDATION');
    assert.equal(response.json().error.message, 'Malformed multipart request');
  });
});

test('rejects batches containing more than ten PDFs', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart(
        Array.from({ length: 11 }, (_, index) => ({
          filename: `document-${index + 1}.pdf`,
          content: pdf(`document ${index + 1}`),
        })),
      ),
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'VALIDATION');
    assert.equal(response.json().error.message, 'A maximum of 10 PDF files is allowed');
  });
});

test('returns a size failure for an oversized file and continues with later files', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'data-lens-route-test-'));
  const app = buildApp({
    maxFileSizeBytes: 32,
    temporaryDirectoryRoot: temporaryRoot,
    processDocument: async (filePath) => {
      const { readFile } = await import('node:fs/promises');
      const uploadedPdf = await readFile(filePath, 'utf8');

      return uploadedPdf.includes('accepted document') ? 'accepted document' : 'partial';
    },
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([
        { filename: 'oversized.pdf', content: pdf('x'.repeat(64)) },
        { filename: 'valid.pdf', content: pdf('accepted document') },
      ]),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      documents: [
        {
          fileName: 'oversized.pdf',
          status: 'failed',
          reason: 'File exceeds the maximum size limit',
        },
        {
          fileName: 'valid.pdf',
          status: 'unrecognized',
          ocrText: 'accepted document',
        },
      ],
    });
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await app.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects oversized non-PDF content as invalid input', async () => {
  const app = buildApp({
    maxFileSizeBytes: 16,
    processDocument: async () => 'should not run',
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'not-a-pdf.pdf', content: 'x'.repeat(64) }]),
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'VALIDATION');
    assert.equal(response.json().error.message, "The 'files' field must contain PDF files");
  } finally {
    await app.close();
  }
});

test('removes the request temporary directory after successful processing', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'data-lens-route-test-'));
  const app = buildApp({
    temporaryDirectoryRoot: temporaryRoot,
    processDocument: async (_filePath, workDirectory) => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(workDirectory, 'ocr-output.pdf'), 'temporary OCR intermediate');

      return 'recognized text';
    },
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'document.pdf', content: pdf('document') }]),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await app.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('preserves the original filename without using it as a temporary path', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'data-lens-route-test-'));
  let actualPdfPath = '';
  const app = buildApp({
    temporaryDirectoryRoot: temporaryRoot,
    processDocument: async (filePath) => {
      actualPdfPath = filePath;

      return 'recognized text';
    },
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: '../original.pdf', content: pdf('document') }]),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().documents[0].fileName, '../original.pdf');
    assert.equal(actualPdfPath.startsWith(`${temporaryRoot}/`), true);
    assert.equal(actualPdfPath.endsWith('/upload-1.pdf'), true);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await app.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('enforces the 25 MiB per-file limit', async () => {
  const fileSizeLimit = 25 * 1024 * 1024;
  const oversizedPdf = Buffer.alloc(fileSizeLimit + 1, 0x20);
  Buffer.from('%PDF-1.4\n').copy(oversizedPdf);

  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'oversized.pdf', content: oversizedPdf }]),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      documents: [
        {
          fileName: 'oversized.pdf',
          status: 'failed',
          reason: 'File exceeds the maximum size limit',
        },
      ],
    });
  });
});

test('removes the request temporary directory after OCR failure', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'data-lens-route-test-'));
  const app = buildApp({
    temporaryDirectoryRoot: temporaryRoot,
    processDocument: async () => {
      throw new Error('private processor diagnostic');
    },
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'document.pdf', content: pdf('document') }]),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await app.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('removes the request temporary directory after malformed multipart input', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'data-lens-route-test-'));
  const app = buildApp({ temporaryDirectoryRoot: temporaryRoot });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.from(`--${boundary}\r\ninvalid multipart`),
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await app.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('returns a safe server error when temporary-file cleanup fails', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'data-lens-route-test-'));
  const app = buildApp({
    temporaryDirectoryRoot: temporaryRoot,
    processDocument: async () => 'recognized text',
    cleanupTemporaryDirectory: async (directory) => {
      throw new Error(`Could not remove ${directory}`);
    },
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'document.pdf', content: pdf('document') }]),
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.json().error.message, 'Internal Server Error');
    assert.equal(response.body.includes(temporaryRoot), false);
  } finally {
    await app.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
