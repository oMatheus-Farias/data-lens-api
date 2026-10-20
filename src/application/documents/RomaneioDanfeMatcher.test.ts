import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchRomaneioDanfe } from './RomaneioDanfeMatcher';

const romaneio = {
  type: 'shippingList' as const,
  pageNumber: 2,
  shipname: 'TEST-SHIP-01',
  shipment: '9999999999',
  dn: { number: '7788' },
  data: [
    { fiscalNote: '900001234-01', realWt: '1,00', cubicWt: null, Vol: null },
    { fiscalNote: '900001235-01', realWt: '2,00', cubicWt: null, Vol: null },
    { fiscalNote: '900001236-01', realWt: '3,00', cubicWt: null, Vol: null },
  ],
};

function danfe(invoiceNumber: string, pageNumber: number, series: string | null = null) {
  const party = {
    street: null,
    neighborhood: null,
    postalCode: null,
    number: null,
    complement: null,
    municipality: null,
    phone_fax: null,
    cnpjCpf: null,
  };

  return {
    type: 'nfDanfe' as const,
    pageNumber,
    invoice_number: invoiceNumber,
    sender: party,
    recipient: { ...party, dn: null },
    series,
    issueDate: null,
    accessKey: null,
    icmsCalculationBasis: null,
    icmsAmount: null,
    totalProducts_amount: null,
    totalInvoiceAmount: null,
    grossWeight: null,
  };
}

test('links each fiscal note row to a unique DANFE and reports missing or duplicate candidates', () => {
  assert.deepEqual(
    matchRomaneioDanfe(
      [romaneio],
      [danfe('90000123401', 4), danfe('90000123601', 6), danfe('900001236-01', 7)],
    ),
    [
      {
        status: 'matched',
        fiscalNote: '900001234-01',
        romaneioPageNumber: 2,
        romaneioRowNumber: 1,
        danfePageNumber: 4,
        candidatePageNumbers: [],
      },
      {
        status: 'unmatched',
        fiscalNote: '900001235-01',
        romaneioPageNumber: 2,
        romaneioRowNumber: 2,
        danfePageNumber: null,
        candidatePageNumbers: [],
      },
      {
        status: 'ambiguous',
        fiscalNote: '900001236-01',
        romaneioPageNumber: 2,
        romaneioRowNumber: 3,
        danfePageNumber: null,
        candidatePageNumbers: [6, 7],
      },
    ],
  );
});

test('normalizes common separators without dropping leading zeroes', () => {
  const rows = [
    {
      ...romaneio,
      data: [{ ...romaneio.data[0]!, fiscalNote: '00012.345/67' }],
    },
  ];

  assert.equal(matchRomaneioDanfe(rows, [danfe(' 00012 345-67 ', 9)])[0]?.status, 'matched');
  assert.equal(matchRomaneioDanfe(rows, [danfe('12345-67', 9)])[0]?.status, 'unmatched');
});

test('matches a Romaneio number-series pair to separate DANFE number and series fields', () => {
  assert.deepEqual(
    matchRomaneioDanfe(
      [{ ...romaneio, data: [{ ...romaneio.data[0]!, fiscalNote: '000123-45' }] }],
      [danfe('000123', 3, '45')],
    ),
    [
      {
        status: 'matched',
        fiscalNote: '000123-45',
        romaneioPageNumber: 2,
        romaneioRowNumber: 1,
        danfePageNumber: 3,
        candidatePageNumbers: [],
      },
    ],
  );
});
