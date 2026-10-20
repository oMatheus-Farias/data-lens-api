import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractRomaneio } from './RomaneioExtractor';

const englishRomaneioOcr = [
  'New Shipping List',
  'Country BR Shipname BR-PIQ1623',
  'Shipment 0006500117770',
  'DN City State Route',
  '1147 SAO PAULO SP SPC006',
  'Box Number Box Code Fiscal Note Real Wt (Kg) Cubic Wt (Kg) Vol (m3)',
  '5551001 CODE-1 000864375-69 47,420 199,800 0,666',
  '5551002 CODE-2 000864376-70 12,500 15,250 0,125',
  'Total 59,920 215,050 0,791',
].join('\n');

test('maps a Romaneio page to the public shape and preserves every printed value', () => {
  assert.deepEqual(extractRomaneio(englishRomaneioOcr, 3), {
    type: 'shippingList',
    pageNumber: 3,
    shipname: 'BR-PIQ1623',
    shipment: '0006500117770',
    dn: { number: '1147' },
    total: { realWt: '59,920', cubicWt: '215,050', Vol: '0,791' },
    data: [
      { fiscalNote: '000864375-69', realWt: '47,420', cubicWt: '199,800', Vol: '0,666' },
      { fiscalNote: '000864376-70', realWt: '12,500', cubicWt: '15,250', Vol: '0,125' },
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
    total: { realWt: null, cubicWt: null, Vol: null },
    data: [],
  });
});

test('keeps a Fiscal Note row when OCR omits trailing measurements', () => {
  const ocrText = [
    'New Shipping List',
    'Box Number Box Code Fiscal Note Real Wt (Kg) Cubic Wt (Kg) Vol (m3)',
    '5551001 CODE-1 000864375-69 47,420',
  ].join('\n');

  assert.deepEqual(extractRomaneio(ocrText, 2)?.data, [
    { fiscalNote: '000864375-69', realWt: '47,420', cubicWt: null, Vol: null },
  ]);
});
