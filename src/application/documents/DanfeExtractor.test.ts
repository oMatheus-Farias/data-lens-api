import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractDanfe } from './DanfeExtractor';
import type { IOcrWord } from './OcrPage';

const completeDanfe = `
DANFE
NOTA FISCAL ELETRÔNICA
EMITENTE
LOGRADOURO: Rua Exemplo Um
BAIRRO: Centro
CEP: 00000-000
NÚMERO: 00123
COMPLEMENTO: Sala 02
MUNICÍPIO: Cidade Alfa - XX
FONE/FAX: (00) 0000-0000
CNPJ/CPF: 00.000.000/0000-00
DESTINATÁRIO/REMETENTE
LOGRADOURO: Avenida Ficticia
BAIRRO: Jardim Ficticio
CEP: 99999-999
NÚMERO: 00456
COMPLEMENTO: Bloco B
MUNICÍPIO: Cidade Beta - XX
FONE/FAX: (00) 0000-0001
CNPJ/CPF: 000.000.000-00
DN: 000123456789
NÚMERO DA NOTA: 000123
SÉRIE: 001
DATA DE EMISSÃO: 31/12/2099
CHAVE DE ACESSO: 11111111111111111111111111111111111111111111
CÁLCULO DO IMPOSTO
BASE DE CÁLCULO DO ICMS: 1.500,00
VALOR DO ICMS: 270,00
VALOR TOTAL DOS PRODUTOS: 1.500,00
VALOR TOTAL DA NOTA: 1.770,00
PESO BRUTO: 25,500 kg
`;

test('maps DANFE sections and keeps source values as strings', () => {
  assert.deepEqual(extractDanfe(completeDanfe, 3), {
    type: 'nfDanfe',
    pageNumber: 3,
    sender: {
      street: 'Rua Exemplo Um',
      neighborhood: 'Centro',
      postalCode: '00000-000',
      number: '00123',
      complement: 'Sala 02',
      municipality: 'Cidade Alfa - XX',
      phone_fax: '(00) 0000-0000',
      cnpjCpf: '00.000.000/0000-00',
    },
    recipient: {
      street: 'Avenida Ficticia',
      neighborhood: 'Jardim Ficticio',
      postalCode: '99999-999',
      number: '00456',
      complement: 'Bloco B',
      municipality: 'Cidade Beta - XX',
      phone_fax: '(00) 0000-0001',
      cnpjCpf: '000.000.000-00',
      dn: '000123456789',
    },
    invoice_number: '000123',
    series: '001',
    issueDate: '31/12/2099',
    accessKey: '11111111111111111111111111111111111111111111',
    icmsCalculationBasis: '1.500,00',
    icmsAmount: '270,00',
    totalProducts_amount: '1.500,00',
    totalInvoiceAmount: '1.770,00',
    grossWeight: '25,500 kg',
  });
});

test('returns null for missing DANFE values and rejects unrelated pages', () => {
  const result = extractDanfe('DANFE NOTA FISCAL ELETRÔNICA', 2);

  assert.ok(result);
  assert.equal(result.sender.street, null);
  assert.equal(result.recipient.dn, null);
  assert.equal(result.invoice_number, null);
  assert.equal(result.grossWeight, null);
  assert.equal(extractDanfe('shipping list', 2), null);
});

test('extracts footer totals when Vision flattens DANFE table columns and misreads labels', () => {
  const ocrText = `DANFE NOTA FISCAL ELETRÔNICA
VALOR DO ICHS BASE DE CÁLCULO DO ICMS SUBSTITUIÇÃO VALOR DO ICHS SUBSTITUIÇÃO
1.234.56 234.56 2.345,67
VALOR TOTAL DOS PRODUTOS 123.45
VALOR TOTAL DA NOTA 0.00
VALOR UNITÁRIO VALOR TOTAL B. CALC ICMS BAGE CALC ICME SUBST. VALOR ICMS VALOR IP
7 123.4567 1.234.56 1.234.56 2.345.67 ICMS SUBST. 123.45 234.56
UF 1.234.56 1.358.01 21.321 KG`;
  const result = extractDanfe(ocrText, 1);

  assert.equal(result?.icmsCalculationBasis, '1.234.56');
  assert.equal(result?.icmsAmount, '234.56');
  assert.equal(result?.totalProducts_amount, '1.234.56');
  assert.equal(result?.totalInvoiceAmount, '1.358.01');
});

test('maps footer tax cells after a four-decimal unit price even when quantity is absent', () => {
  const ocrText = `DANFE NOTA FISCAL ELETRÔNICA
VALOR UNITÁRIO
VALOR TOTAL
B. CALC ICMS
987.6543
7.901,23
7.901.23
BASE CALC ICMS SUBST.
9.876,54
VALOR ICMS SUBST.
987,65
VALOR ICMS
VALOR IPI
ALIQUOTA
1.422,22
88,88`;
  const result = extractDanfe(ocrText, 4);

  assert.equal(result?.totalProducts_amount, '7.901,23');
  assert.equal(result?.icmsCalculationBasis, '7.901.23');
  assert.equal(result?.icmsAmount, '1.422,22');
});

test('extracts party numbers when OCR omits the label colon', () => {
  const text = completeDanfe
    .replace('NÚMERO: 00123', 'Nº 00123')
    .replace('NÚMERO: 00456', 'Nº 00456');
  const result = extractDanfe(text, 1);

  assert.equal(result?.sender.number, '00123');
  assert.equal(result?.recipient.number, '00456');
});

test('keeps issuer and recipient separate when Vision emits a column-oriented DANFE', () => {
  const ocrText = [
    'TEST AUTOMOTIVE INDUSTRIA LTDA',
    'LOGRADOURO: AVENIDA TESTE UM',
    'BAIRRO: BAIRRO INDUSTRIAL TESTE',
    'CEP: 13000-000',
    'NÚMERO: S/N',
    'COMPLEMENTO:',
    'MUNICIPIO: CIDADE GAMMA UF: XX',
    'FONE/FAX: 00 0000-0000',
    'NATUREZA DA OPERAÇÃO',
    'Outra saída merc.',
    'DESTINATÁRIO / REMETENTE',
    'NOME/RAZÃO SOCIAL',
    'TEST CUSTOMER S.A.',
    'LOGRADOURO',
    'AV. CLIENTE.',
    '1180',
    'BAIRRO/DISTRITO',
    'STATUS LEGAL - SEFAZ',
    'Autorizado',
    'MUNICIPIO',
    'CITY ALPHA',
    'DANFE',
    'DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA',
    'N°',
    '000000123',
    'SÉRIE',
    '69',
    'CHAVE DE ACESSO',
    '22222222222222222222222222222222222222222222',
    'DN 7788',
    'CNPJ CPF',
    '00.000.000/0001-11',
    'INSCRIÇÃO ESTADUAL',
    '714.091.560.119',
    'INSCR. SUPRAMA SOB N°:',
    'CNPJ / CPF',
    'NÚMERO',
    'COMPLEMENTO',
    '1180',
    'FONE/FAX',
    '00 0000-0001',
    'UF',
    'XX',
    'INSCRIÇÃO ESTADUAL',
    '116.069.901.118',
    '11.111.111/0001-22',
    'CÁLCULO DO IMPOSTO',
    'PESO BRUTO',
    'PESO LÍQUIDO',
    '21.321',
    'KG',
  ].join('\n');

  const result = extractDanfe(ocrText, 2);

  assert.ok(result);
  assert.equal(result.sender.street, 'AVENIDA TESTE UM');
  assert.equal(result.sender.neighborhood, 'BAIRRO INDUSTRIAL TESTE');
  assert.equal(result.sender.number, 'S/N');
  assert.equal(result.sender.municipality, 'CIDADE GAMMA UF: XX');
  assert.equal(result.sender.cnpjCpf, '00.000.000/0001-11');
  assert.equal(result.recipient.street, 'AV. CLIENTE.');
  assert.equal(result.recipient.number, '1180');
  assert.equal(result.recipient.municipality, 'CITY ALPHA');
  assert.equal(result.recipient.cnpjCpf, '11.111.111/0001-22');
  assert.equal(result.recipient.dn, '7788');
  assert.equal(result.invoice_number, '000000123');
  assert.equal(result.series, '69');
  assert.equal(result.grossWeight, '21.321 KG');
});

test('recovers recipient neighborhood when Vision separates the label from its value', () => {
  const text = [
    'DANFE NOTA FISCAL ELETRÔNICA',
    'DESTINATÁRIO / REMETENTE',
    'LOGRADOURO',
    'AV. CLIENTE',
    'BAIRRO/DISTRITO',
    'STATUS LEGAL - SEFAZ',
    'Autorizado',
    'MUNICIPIO',
    'CITY ALPHA',
    'CÁLCULO DO IMPOSTO',
    'BAIRRO FICTICIO',
    'FATURA',
  ].join('\n');

  assert.equal(extractDanfe(text, 1)?.recipient.neighborhood, 'FICTICIO');
});

test('finds recipient section when OCR accents the last letter in its heading', () => {
  const text = [
    'DANFE NOTA FISCAL ELETRÔNICA',
    'DESTINATÁRIO / REMETENTË',
    'LOGRADOURO',
    'AV. CLIENTE CENTRAL. 1180',
    'BAIRRO/DISTRITO',
    'FICTICIO',
    'FATURA',
    'NÚMERO',
    'COMPLEMENTO',
    'CNPJ / CPF',
    '11.111.111/0001-22',
    'CEP',
    '01010-100',
    'MUNICIPIO',
    'CITY ALPHA',
  ].join('\n');
  const result = extractDanfe(text, 4);

  assert.equal(result?.recipient.street, 'AV. CLIENTE CENTRAL. 1180');
  assert.equal(result?.recipient.neighborhood, 'FICTICIO');
  assert.equal(result?.recipient.postalCode, '01010-100');
  assert.equal(result?.recipient.municipality, 'CITY ALPHA');
  assert.equal(result?.recipient.number, '1180');
  assert.equal(result?.recipient.complement, null);
});

test('recovers the invoice number placed before Série and ICMS amount under a reordered OCR header', () => {
  const text = [
    'DANFE NOTA FISCAL ELETRÔNICA',
    '900001237',
    'SÉRIE',
    '69',
    'N°',
    'CHAVE DE ACESSO',
    '33333333333333333333333333333333333333333333',
    'CÁLCULO DO IMPOSTO',
    'VALOR DO ICMS',
    'BASE DE CÁLCULO DO ICMS SUBSTITUIÇÃO',
    'VALOR DO ICHS SUBSTITUIÇÃO',
    '4.321,09',
    '789.01',
    '6.543.21',
    'TRANSPORTADOR / VOLUMES TRANSPORTADOS',
  ].join('\n');
  const result = extractDanfe(text, 4);

  assert.equal(result?.invoice_number, '900001237');
  assert.equal(result?.icmsAmount, '4.321,09');
});

test('finds the invoice total even when OCR places it after the freight section', () => {
  const text = [
    'DANFE NOTA FISCAL ELETRÔNICA',
    'CÁLCULO DO IMPOSTO',
    'TRANSPORTADOR / VOLUMES TRANSPORTADOS',
    'DADOS ADICIONAIS',
    'VALOR TOTAL DOS PRODUTOS',
    '13,96',
    '4,85',
    'VALOR TOTAL DA NOTA',
    '149,25',
    '168,06',
  ].join('\n');

  assert.equal(extractDanfe(text, 6)?.totalInvoiceAmount, '168,06');
});

test('does not let a spatial row of unrelated labels replace the recognized recipient street', () => {
  const text = completeDanfe;
  const word = (value: string, x: number, y: number): IOcrWord => ({
    text: value,
    confidence: 0.99,
    box: { x, y, width: 0.08, height: 0.015 },
  });
  const words = [
    word('DESTINATÁRIO', 0.05, 0.1),
    word('LOGRADOURO', 0.05, 0.2),
    word('MUNICIPIO', 0.05, 0.25),
    word('INSCRIÇÃO', 0.2, 0.25),
    word('ESTADUAL', 0.35, 0.25),
    word('SANTO', 0.5, 0.25),
    word('AMARO', 0.65, 0.25),
    word('FATURA', 0.05, 0.4),
  ];
  const result = extractDanfe(text, 2, words);

  assert.equal(result?.recipient.street, 'Avenida Ficticia');
  assert.equal(result?.recipient.municipality, 'Cidade Beta - XX');
});
