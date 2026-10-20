import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractDanfe } from './DanfeExtractor';

const completeDanfe = `
DANFE
NOTA FISCAL ELETRÔNICA
EMITENTE
LOGRADOURO: Rua das Flores
BAIRRO: Centro
CEP: 01000-000
NÚMERO: 00123
COMPLEMENTO: Sala 02
MUNICÍPIO: São Paulo - SP
FONE/FAX: (11) 3333-4444
CNPJ/CPF: 12.345.678/0001-90
DESTINATÁRIO/REMETENTE
LOGRADOURO: Avenida Brasil
BAIRRO: Jardim América
CEP: 01310-100
NÚMERO: 00456
COMPLEMENTO: Bloco B
MUNICÍPIO: Campinas - SP
FONE/FAX: (19) 3222-5555
CNPJ/CPF: 123.456.789-00
DN: 000123456789
NÚMERO DA NOTA: 000123
SÉRIE: 001
DATA DE EMISSÃO: 20/10/2026
CHAVE DE ACESSO: 35261012345678000190550010000001231234567890
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
      street: 'Rua das Flores',
      neighborhood: 'Centro',
      postalCode: '01000-000',
      number: '00123',
      complement: 'Sala 02',
      municipality: 'São Paulo - SP',
      phone_fax: '(11) 3333-4444',
      cnpjCpf: '12.345.678/0001-90',
    },
    recipient: {
      street: 'Avenida Brasil',
      neighborhood: 'Jardim América',
      postalCode: '01310-100',
      number: '00456',
      complement: 'Bloco B',
      municipality: 'Campinas - SP',
      phone_fax: '(19) 3222-5555',
      cnpjCpf: '123.456.789-00',
      dn: '000123456789',
    },
    invoice_number: '000123',
    series: '001',
    issueDate: '20/10/2026',
    accessKey: '35261012345678000190550010000001231234567890',
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
14.256.54 2.566.18 20.984,20
VALOR TOTAL DOS PRODUTOS 1.210.98
VALOR TOTAL DA NOTA 0.00
VALOR UNITÁRIO VALOR TOTAL B. CALC ICMS BAGE CALC ICME SUBST. VALOR ICMS VALOR IP
30 475.2180 14.256.54 14.256.54 20.994.20 ICMS SUBST. 1.210.98 2.566.18
UF 14.256.54 15.467.52 31.920 KG`;
  const result = extractDanfe(ocrText, 1);

  assert.equal(result?.icmsCalculationBasis, '14.256.54');
  assert.equal(result?.icmsAmount, '2.566.18');
  assert.equal(result?.totalProducts_amount, '14.256.54');
  assert.equal(result?.totalInvoiceAmount, '15.467.52');
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
    'LOGRADOURO: AV. DAS INDUSTRIAS',
    'BAIRRO: DISTRITO INDUSTRIAL',
    'CEP: 13288-163',
    'NÚMERO: S/N',
    'COMPLEMENTO:',
    'MUNICIPIO: VINHEDO UF: SP',
    'FONE/FAX: 11 3000-0000',
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
    'SAO PAULO',
    'DANFE',
    'DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA',
    'N°',
    '000000123',
    'SÉRIE',
    '69',
    'CHAVE DE ACESSO',
    '35260900000000000000550690000001231244087696',
    'DN 1147',
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
    '11 3000-1111',
    'UF',
    'SP',
    'INSCRIÇÃO ESTADUAL',
    '116.069.901.118',
    '11.111.111/0001-22',
    'CÁLCULO DO IMPOSTO',
    'PESO BRUTO',
    'PESO LÍQUIDO',
    '31.920',
    'KG',
  ].join('\n');

  const result = extractDanfe(ocrText, 2);

  assert.ok(result);
  assert.equal(result.sender.street, 'AV. DAS INDUSTRIAS');
  assert.equal(result.sender.neighborhood, 'DISTRITO INDUSTRIAL');
  assert.equal(result.sender.number, 'S/N');
  assert.equal(result.sender.municipality, 'VINHEDO UF: SP');
  assert.equal(result.sender.cnpjCpf, '00.000.000/0001-11');
  assert.equal(result.recipient.street, 'AV. CLIENTE.');
  assert.equal(result.recipient.number, '1180');
  assert.equal(result.recipient.municipality, 'SAO PAULO');
  assert.equal(result.recipient.cnpjCpf, '11.111.111/0001-22');
  assert.equal(result.recipient.dn, '1147');
  assert.equal(result.invoice_number, '000000123');
  assert.equal(result.series, '69');
  assert.equal(result.grossWeight, '31.920 KG');
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
    'SAO PAULO',
    'CÁLCULO DO IMPOSTO',
    'SANTO AMARO',
    'FATURA',
  ].join('\n');

  assert.equal(extractDanfe(text, 1)?.recipient.neighborhood, 'SANTO AMARO');
});
