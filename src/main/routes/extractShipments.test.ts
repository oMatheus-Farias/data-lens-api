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
      url: '/shipments/extract',
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

test('exposes the English shipment endpoint and removes the Portuguese endpoint', async () => {
  await withApp(async (app) => {
    const payload = createMultipart([{ filename: 'unknown.pdf', content: pdf('unknown text') }]);
    const headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
    const englishResponse = await app.inject({
      method: 'POST',
      url: '/shipments/extract',
      headers,
      payload,
    });
    const portugueseResponse = await app.inject({
      method: 'POST',
      url: '/remessas/extrair',
      headers,
      payload,
    });

    assert.equal(englishResponse.statusCode, 200);
    assert.equal(portugueseResponse.statusCode, 404);
  });
});

test('classifies a DANFE and returns organized fields and complete OCR text', async () => {
  const invoiceOcr = [
    'ACME EXEMPLO LTDA',
    'CNPJ: 00.000.000/0001-00',
    'ENDEREÇO: Rua Industrial, 100',
    'MUNICÍPIO: São Paulo',
    'UF: SP',
    'CEP: 01000-000',
    'DANFE',
    'DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA',
    'NÚMERO: 12345',
    'SÉRIE: 2',
    'CHAVE DE ACESSO: 35261012345678000199550020000123451000012345',
    'NATUREZA DA OPERAÇÃO: Venda de mercadoria',
    'DESTINATÁRIO / REMETENTE',
    'NOME / RAZÃO SOCIAL: Cliente Exemplo Ltda',
    'CNPJ / CPF: 11.111.111/0001-11',
    'IE: 123456789',
    'ENDEREÇO: Rua Comercial, 200',
    'MUNICÍPIO: Campinas',
    'UF: SP',
    'CEP: 13000-000',
    'DATA DE EMISSÃO: 01/10/2026',
    'CÁLCULO DO IMPOSTO',
    'BASE DE CÁLCULO DO ICMS: 20,00',
    'VALOR DO ICMS: 3,60',
    'VALOR DOS PRODUTOS: 20,00',
    'VALOR TOTAL DA NOTA: 20,00',
    'TRANSPORTADOR / VOLUMES TRANSPORTADOS',
    'NOME / RAZÃO SOCIAL: Transportes Exemplo',
    'CNPJ / CPF: 22.222.222/0001-22',
    'FRETE POR CONTA: 0',
    'PLACA DO VEÍCULO: ABC1234',
    'ENDEREÇO: Rua Logística, 300',
    'MUNICÍPIO: Santos',
    'UF: SP',
    'QUANTIDADE: 2',
    'ESPÉCIE: Caixa',
    'MARCA: Exemplo',
    'NUMERAÇÃO: 1-2',
    'PESO BRUTO: 4,00',
    'PESO LÍQUIDO: 3,00',
    'DADOS DOS PRODUTOS / SERVIÇOS',
    'CÓDIGO DESCRIÇÃO NCM CST CFOP UN QTD VLR UNIT VLR TOTAL BC ICMS V ICMS V IPI ALIQ ICMS ALIQ IPI',
    'A-1 Produto exemplo 12345678 00 5102 UN 2 10,00 20,00 20,00 3,60 0,00 18,00 0,00',
    'B-2 Produto parcial 87654321 00 5102 UN 1 1,00 1,00',
    'DADOS ADICIONAIS:',
    'Informação complementar reconhecida. Documento vinculado ao romaneio.',
  ].join('\n');
  const app = buildApp({ processDocument: async () => invoiceOcr });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/shipments/extract',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'danfe.pdf', content: pdf('sample') }]),
    });

    assert.equal(response.statusCode, 200);
    const document = response.json().documents[0];
    assert.equal(document.documentType, 'danfe');
    assert.equal(document.status, 'success');
    assert.equal(document.fileName, 'danfe.pdf');
    assert.equal(document.ocrText, invoiceOcr);
    assert.deepEqual(Object.keys(document.fields).sort(), [
      'additionalInformation',
      'billing',
      'carrier',
      'identification',
      'issuer',
      'products',
      'recipient',
      'taxesAndTotals',
    ]);
    assert.equal(document.fields.identification.number, '12345');
    assert.equal(document.fields.identification.series, '2');
    assert.equal(document.fields.issuer.companyName, 'ACME EXEMPLO LTDA');
    assert.equal(document.fields.issuer.taxId, '00.000.000/0001-00');
    assert.equal(document.fields.recipient.companyName, 'Cliente Exemplo Ltda');
    assert.equal(document.fields.recipient.taxId, '11.111.111/0001-11');
    assert.equal(document.fields.recipient.address, 'Rua Comercial, 200');
    assert.equal(document.fields.carrier.companyName, 'Transportes Exemplo');
    assert.equal(document.fields.carrier.vehiclePlate, 'ABC1234');
    assert.equal(document.fields.taxesAndTotals.icmsAmount, '3,60');
    assert.equal(document.fields.taxesAndTotals.productsAmount, '20,00');
    assert.equal(document.fields.taxesAndTotals.totalAmount, '20,00');
    assert.deepEqual(document.fields.products, [
      {
        code: 'A-1',
        description: 'Produto exemplo',
        ncm: '12345678',
        cst: '00',
        cfop: '5102',
        unit: 'UN',
        quantity: '2',
        unitPrice: '10,00',
        totalAmount: '20,00',
        icmsTaxBase: '20,00',
        icmsAmount: '3,60',
        ipiAmount: '0,00',
        icmsRate: '18,00',
        ipiRate: '0,00',
      },
      {
        code: 'B-2',
        description: 'Produto parcial',
        ncm: '87654321',
        cst: '00',
        cfop: '5102',
        unit: 'UN',
        quantity: '1',
        unitPrice: '1,00',
        totalAmount: '1,00',
        icmsTaxBase: null,
        icmsAmount: null,
        ipiAmount: null,
        icmsRate: null,
        ipiRate: null,
      },
    ]);
    assert.equal(
      document.fields.additionalInformation,
      'Informação complementar reconhecida. Documento vinculado ao romaneio.',
    );
    assert.ok(document.warnings.length > 0);
    assert.ok(
      document.warnings.includes('products[1].icmsAmount: field was not recognized in OCR'),
    );
    assert.equal(JSON.stringify(document).includes('undefined'), false);
  } finally {
    await app.close();
  }
});

test('classifies a shipping manifest and returns grouped shipment and box data', async () => {
  const shippingManifestOcr = [
    'New Shipping List',
    'Closure date: 19/10/2026 08:30',
    'Country BR Shipname NavioExemplo',
    'Shipment SHIP-123',
    'Operator OperadorExemplo Payment Option F-02',
    'Carrier C-100 Expresso Exemplo',
    'Packaging QTD',
    'Cardboard Box 2',
    'TOTAL 2',
    'DN City State Route',
    '38 SAO PAULO SP SPC006',
    'Box Number Box Code Fiscal Note Real Wt (Kg) Cubic Wt (Kg) Vol (m3)',
    '5551001 CODE-1 12345-67 5,752 57,251 0,191',
    '5551002 CODE-2 12346-78 2,907 32,832 0,109',
    'Total 8,659 90,083 0,300',
  ].join('\n');
  const app = buildApp({ processDocument: async () => shippingManifestOcr });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/shipments/extract',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: createMultipart([{ filename: 'romaneio.pdf', content: pdf('sample') }]),
    });

    assert.equal(response.statusCode, 200);
    const document = response.json().documents[0];
    assert.equal(document.documentType, 'shipping_manifest');
    assert.equal(document.status, 'success');
    assert.equal(document.fileName, 'romaneio.pdf');
    assert.equal(document.ocrText, shippingManifestOcr);
    assert.equal(document.fields.shipment.number, 'SHIP-123');
    assert.equal(document.fields.shipment.country, 'BR');
    assert.equal(document.fields.carrier.companyName, 'Expresso Exemplo');
    assert.equal(document.fields.carrier.identifier, 'C-100');
    assert.equal(document.fields.route.origin, 'SAO PAULO');
    assert.equal(document.fields.route.state, 'SP');
    assert.equal(document.fields.route.code, 'SPC006');
    assert.equal(document.fields.closing.dateTime, '19/10/2026 08:30');
    assert.equal(document.fields.packages.quantity, '2');
    assert.equal(document.fields.packages.packaging, 'Cardboard Box');
    assert.equal(document.fields.totals.boxCount, '2');
    assert.equal(document.fields.totals.weight, '8,659');
    assert.equal(document.fields.totals.cubicWeight, '90,083');
    assert.equal(document.fields.totals.volume, '0,300');
    assert.deepEqual(document.fields.boxes, [
      {
        reference: '5551001',
        code: 'CODE-1',
        invoiceNumber: '12345-67',
        weight: '5,752',
        cubicWeight: '57,251',
        volume: '0,191',
      },
      {
        reference: '5551002',
        code: 'CODE-2',
        invoiceNumber: '12346-78',
        weight: '2,907',
        cubicWeight: '32,832',
        volume: '0,109',
      },
    ]);
    assert.ok(document.warnings.includes('shipment.date: field was not recognized in OCR'));
  } finally {
    await app.close();
  }
});

test('reports a failed PDF safely and continues processing later files', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
      url: '/shipments/extract',
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
