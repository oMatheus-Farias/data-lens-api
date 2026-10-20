import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractShippingManifest } from './ShippingManifestExtractor';

const shippingManifestOcr = [
  'ROMANEIO DE CARGA',
  'REMESSA: RM-123',
  'DATA: 31/12/2099',
  'TRANSPORTADORA: Expresso Exemplo',
  'CNPJ: 00.000.000/0001-00',
  'ROTA: Cidade Alfa -> Cidade Beta',
  'FECHAMENTO: 31/12/2099 08:30',
  'VOLUMES: 2',
  'PESO TOTAL: 16,50 kg',
  'VOLUME TOTAL: 0,120 m3',
  'TOTAL DE NOTAS: 2',
  'CAIXAS / VOLUMES',
  'CX-001 | NF 12345 | 10,00 kg | 0,080 m3',
  'CX-002 | NF 12346 | 6,50 kg | 0,040 m3',
].join('\n');

test('classifies a shipping manifest and groups its shipment and package data', () => {
  const extraction = extractShippingManifest(shippingManifestOcr);

  assert.ok(extraction);
  assert.equal(extraction.documentType, 'shipping_manifest');
  assert.equal(extraction.fields.shipment.number, 'RM-123');
  assert.equal(extraction.fields.carrier.companyName, 'Expresso Exemplo');
  assert.equal(extraction.fields.route.origin, 'Cidade Alfa');
  assert.equal(extraction.fields.boxes[0]?.invoiceNumber, '12345');
  assert.equal(extraction.fields.shipment.date, '31/12/2099');
  assert.equal(extraction.fields.carrier.companyName, 'Expresso Exemplo');
  assert.equal(extraction.fields.carrier.taxId, '00.000.000/0001-00');
  assert.equal(extraction.fields.route.origin, 'Cidade Alfa');
  assert.equal(extraction.fields.route.destination, 'Cidade Beta');
  assert.equal(extraction.fields.closing.dateTime, '31/12/2099 08:30');
  assert.equal(extraction.fields.packages.quantity, '2');
  assert.equal(extraction.fields.totals.weight, '16,50 kg');
  assert.equal(extraction.fields.totals.volume, '0,120 m3');
  assert.equal(extraction.fields.totals.invoiceCount, '2');
  assert.deepEqual(extraction.fields.boxes, [
    {
      reference: 'CX-001',
      code: null,
      invoiceNumber: '12345',
      weight: '10,00 kg',
      cubicWeight: null,
      volume: '0,080 m3',
    },
    {
      reference: 'CX-002',
      code: null,
      invoiceNumber: '12346',
      weight: '6,50 kg',
      cubicWeight: null,
      volume: '0,040 m3',
    },
  ]);
});

test('classifies the supplied English manifest layout and keeps box weight references', () => {
  const englishShippingManifestOcr = [
    'New Shipping List',
    'Closure date: 31/12/2099 08:30',
    'Country ZZ Shipname Navio de Exemplo',
    'Shipment SHIP-123',
    'Operator Operador de Exemplo Payment Option F-02 Fracionado',
    'Carrier C-100 Expresso Exemplo',
    'Packaging QTD',
    'Cardboard Box 2',
    'TOTAL 2',
    'DN City State Route',
    '38 CITY ALPHA XX TST009',
    'Box Number Box Code Fiscal Note Real Wt (Kg) Cubic Wt (Kg) Vol (m3)',
    '12345001 CODE-1 12345-67 5,752 57,251 0,191',
    '12345002 CODE-2 12346-78 2,907 32,832 0,109',
    'Total 8,659 90,083 0,300',
  ].join('\n');

  const extraction = extractShippingManifest(englishShippingManifestOcr);

  assert.ok(extraction);
  assert.equal(extraction.fields.shipment.number, 'SHIP-123');
  assert.equal(extraction.fields.shipment.country, 'ZZ');
  assert.equal(extraction.fields.shipment.shipName, 'Navio de Exemplo');
  assert.equal(extraction.fields.shipment.operator, 'Operador de Exemplo');
  assert.equal(extraction.fields.shipment.paymentMethod, 'F-02 Fracionado');
  assert.equal(extraction.fields.carrier.identifier, 'C-100');
  assert.equal(extraction.fields.carrier.companyName, 'Expresso Exemplo');
  assert.equal(extraction.fields.route.origin, 'CITY ALPHA');
  assert.equal(extraction.fields.route.state, 'XX');
  assert.equal(extraction.fields.route.code, 'TST009');
  assert.equal(extraction.fields.closing.dateTime, '31/12/2099 08:30');
  assert.equal(extraction.fields.packages.packaging, 'Cardboard Box');
  assert.equal(extraction.fields.packages.quantity, '2');
  assert.equal(extraction.fields.totals.boxCount, '2');
  assert.equal(extraction.fields.totals.weight, '8,659');
  assert.equal(extraction.fields.totals.cubicWeight, '90,083');
  assert.equal(extraction.fields.totals.volume, '0,300');
  assert.deepEqual(extraction.fields.boxes, [
    {
      reference: '12345001',
      code: 'CODE-1',
      invoiceNumber: '12345-67',
      weight: '5,752',
      cubicWeight: '57,251',
      volume: '0,191',
    },
    {
      reference: '12345002',
      code: 'CODE-2',
      invoiceNumber: '12346-78',
      weight: '2,907',
      cubicWeight: '32,832',
      volume: '0,109',
    },
  ]);
});

test('returns null for OCR text that does not identify a shipping manifest', () => {
  assert.equal(extractShippingManifest('Texto de outro tipo de documento'), null);
});

test('does not classify a DANFE as a shipping manifest when its body mentions one', () => {
  assert.equal(
    extractShippingManifest(
      [
        'DANFE',
        'NOTA FISCAL ELETRÔNICA',
        'Dados adicionais: documento vinculado ao romaneio.',
      ].join('\n'),
    ),
    null,
  );
});

test('represents recognized-layout fields missing from OCR as null with warnings', () => {
  const extraction = extractShippingManifest('ROMANEIO DE CARGA');

  assert.ok(extraction);
  assert.equal(extraction.fields.shipment.number, null);
  assert.equal(extraction.fields.carrier.companyName, null);
  assert.deepEqual(extraction.fields.boxes, []);
  assert.ok(extraction.warnings.includes('boxes: no package rows were recognized in OCR'));
  assert.ok(extraction.warnings.includes('shipment.number: field was not recognized in OCR'));
  assert.ok(extraction.warnings.includes('carrier.companyName: field was not recognized in OCR'));
});
