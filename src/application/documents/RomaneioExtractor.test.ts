import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { IOcrWord } from './OcrPage';
import { extractRomaneio } from './RomaneioExtractor';

const englishRomaneioOcr = [
  'New Shipping List',
  'Country ZZ Shipname TEST-SHIP-01',
  'Shipment 9999999999',
  'DN City State Route',
  '7788 CITY ALPHA XX TST009',
  'Box Number Box Code Fiscal Note Real Wt (Kg) Cubic Wt (Kg) Vol (m3)',
  '12345001 CODE-1 900001234-01 11,111 22,222 0,333',
  '12345002 CODE-2 900001235-01 12,222 22,555 0,222',
  'Total 23,333 44,777 0,555',
].join('\n');

test('maps a Romaneio page to the public shape and preserves every printed value', () => {
  assert.deepEqual(extractRomaneio(englishRomaneioOcr, 3), {
    type: 'shippingList',
    pageNumber: 3,
    shipname: 'TEST-SHIP-01',
    shipment: '9999999999',
    dn: { number: '7788' },
    data: [
      { fiscalNote: '900001234-01', realWt: '11,111', cubicWt: '22,222', Vol: '0,333' },
      { fiscalNote: '900001235-01', realWt: '12,222', cubicWt: '22,555', Vol: '0,222' },
    ],
  });
});

test('returns null fields for a recognized Romaneio with missing OCR values', () => {
  assert.deepEqual(extractRomaneio('New Shipping List', 1), {
    type: 'shippingList',
    pageNumber: 1,
    shipname: null,
    shipment: null,
    dn: { number: null },
    data: [],
  });
});

test('keeps a Fiscal Note row when OCR omits trailing measurements', () => {
  const ocrText = [
    'New Shipping List',
    'Box Number Box Code Fiscal Note Real Wt (Kg) Cubic Wt (Kg) Vol (m3)',
    '12345001 CODE-1 900001234-01 11,111',
  ].join('\n');

  assert.deepEqual(extractRomaneio(ocrText, 2)?.data, [
    { fiscalNote: '900001234-01', realWt: '11,111', cubicWt: null, Vol: null },
  ]);
});

test('extracts a column-oriented Vision table and a DN split from its headings', () => {
  const ocrText = [
    'New Shipping List',
    'Closure date: 31.12.2099 08:15:30',
    'Shipname TEST-SHIP',
    'QTD',
    'Country ZZ',
    'Shipment 6500000000',
    'Operator OP1 Payment Option PAY_TEST_09 Fracionado',
    'Carrier 3300000000 TEST CARRIER',
    'Packaging',
    'Cardboard Box 1',
    'TOTAL',
    '3',
    '1',
    'DN',
    '7788',
    'Box Number',
    '55510000000',
    'City',
    'CITY ALPHA',
    'Box Code',
    'TEST-BOX-01',
    '-123-456-78',
    'Fiscal Note',
    '000000123-45',
    'Total',
    'State',
    'XX',
    'Route',
    'CDP123',
    'Real Wt (Kg)',
    '10,000',
    '10,000',
    '20,00',
    'Cubic Wt (Kg)',
    '20,000',
    'Vol (m³).',
    '0,100',
    '0,100',
  ].join('\n');

  assert.deepEqual(extractRomaneio(ocrText, 1), {
    type: 'shippingList',
    pageNumber: 1,
    shipname: 'TEST-SHIP',
    shipment: '6500000000',
    dn: { number: '7788' },
    data: [{ fiscalNote: '000000123-45', realWt: '10,000', cubicWt: '20,000', Vol: '0,100' }],
  });
});

test('keeps cubic weight and volume aligned when OCR separates measurements from their labels', () => {
  const ocrText = [
    'New Shipping List',
    'Box Number',
    '12345678901/',
    'Box Code',
    'TEST-BOX-02',
    'Fiscal Note',
    '900001237-01',
    'Real Wt (Kg)',
    '11,111',
    'Cubic Wt (Kg)',
    'Vol (m³)',
    '22,222',
    '0,333',
    'Total',
    '11,111',
    '22,222',
    '0,333',
  ].join('\n');

  assert.deepEqual(extractRomaneio(ocrText, 3)?.data, [
    { fiscalNote: '900001237-01', realWt: '11,111', cubicWt: '22,222', Vol: '0,333' },
  ]);
});

test('keeps measurements aligned when OCR puts Real and Cubic headers on one line', () => {
  const ocrText = [
    'New Shipping List',
    'Box Number',
    '12345678902',
    'Box Code',
    '1071/M',
    'Fiscal Note',
    '900001238-01',
    'Real Wt (Kg) Cubic Wt (Kg)',
    '12,222',
    'Vol (m³)',
    '33,333',
    '0,444',
    'Total',
    '12,222',
    '33,333',
    '0,444',
  ].join('\n');

  assert.deepEqual(extractRomaneio(ocrText, 5)?.data, [
    { fiscalNote: '900001238-01', realWt: '12,222', cubicWt: '33,333', Vol: '0,444' },
  ]);
});

test('uses Vision word positions to map measurement values to their columns', () => {
  const ocrText = [
    'New Shipping List',
    'Box Number 12345678901',
    'Fiscal Note 900001237-01',
    'Real Wt (Kg) Cubic Wt (Kg) Vol (m³)',
    '11,111 22,222 0,333',
    'Total 11,111 22,222 0,333',
  ].join('\n');
  const word = (text: string, x: number, y: number): IOcrWord => ({
    text,
    confidence: 0.99,
    box: { x, y, width: 0.025, height: 0.015 },
  });
  const words = [
    word('Box', 0.03, 0.1),
    word('Number', 0.06, 0.1),
    word('Real', 0.1, 0.3),
    word('Wt', 0.14, 0.3),
    word('(Kg)', 0.17, 0.3),
    word('Cubic', 0.42, 0.3),
    word('Wt', 0.47, 0.3),
    word('(Kg)', 0.5, 0.3),
    word('Vol', 0.78, 0.3),
    word('(m³)', 0.82, 0.3),
    word('11,111', 0.12, 0.4),
    word('22,222', 0.53, 0.4),
    word('0,333', 0.84, 0.4),
    word('Total', 0.03, 0.6),
  ];

  assert.deepEqual(extractRomaneio(ocrText, 3, words)?.data, [
    { fiscalNote: '900001237-01', realWt: '11,111', cubicWt: '22,222', Vol: '0,333' },
  ]);
});
