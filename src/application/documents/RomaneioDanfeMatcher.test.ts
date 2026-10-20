import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchRomaneioDanfe } from './RomaneioDanfeMatcher';

const romaneio = {
  type: 'shippingList' as const,
  pageNumber: 2,
  shipname: 'BR-PIQ1623',
  shipment: '0006500117770',
  dn: { number: '1147' },
  data: [
    { fiscalNote: '000864375-69', realWt: '1,00', cubicWt: null, Vol: null },
    { fiscalNote: '000864376-70', realWt: '2,00', cubicWt: null, Vol: null },
    { fiscalNote: '000864377-71', realWt: '3,00', cubicWt: null, Vol: null },
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
      [danfe('00086437569', 4), danfe('00086437771', 6), danfe('000864377-71', 7)],
    ),
    [
      {
        status: 'matched',
        fiscalNote: '000864375-69',
        romaneioPageNumber: 2,
        romaneioRowNumber: 1,
        danfePageNumber: 4,
        candidatePageNumbers: [],
      },
      {
        status: 'unmatched',
        fiscalNote: '000864376-70',
        romaneioPageNumber: 2,
        romaneioRowNumber: 2,
        danfePageNumber: null,
        candidatePageNumbers: [],
      },
      {
        status: 'ambiguous',
        fiscalNote: '000864377-71',
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
