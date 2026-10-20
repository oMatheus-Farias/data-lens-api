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

test('extracts party numbers when OCR omits the label colon', () => {
  const text = completeDanfe
    .replace('NÚMERO: 00123', 'Nº 00123')
    .replace('NÚMERO: 00456', 'Nº 00456');
  const result = extractDanfe(text, 1);

  assert.equal(result?.sender.number, '00123');
  assert.equal(result?.recipient.number, '00456');
});
