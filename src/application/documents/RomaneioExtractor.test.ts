import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractRomaneio } from './RomaneioExtractor';

const romaneioOcr = [
  'ROMANEIO DE CARGA',
  'REMESSA: RM-123',
  'DATA: 19/10/2026',
  'TRANSPORTADORA: Expresso Exemplo',
  'CNPJ: 00.000.000/0001-00',
  'ROTA: São Paulo -> Campinas',
  'FECHAMENTO: 19/10/2026 08:30',
  'VOLUMES: 2',
  'PESO TOTAL: 16,50 kg',
  'VOLUME TOTAL: 0,120 m3',
  'TOTAL DE NOTAS: 2',
  'CAIXAS / VOLUMES',
  'CX-001 | NF 12345 | 10,00 kg | 0,080 m3',
  'CX-002 | NF 12346 | 6,50 kg | 0,040 m3',
].join('\n');

test('classifies a romaneio and groups its shipment and package data', () => {
  const extraction = extractRomaneio(romaneioOcr);

  assert.ok(extraction);
  assert.equal(extraction.documentType, 'romaneio');
  assert.equal(extraction.fields.remessa.numero, 'RM-123');
  assert.equal(extraction.fields.remessa.data, '19/10/2026');
  assert.equal(extraction.fields.transportadora.razaoSocial, 'Expresso Exemplo');
  assert.equal(extraction.fields.transportadora.cnpjCpf, '00.000.000/0001-00');
  assert.equal(extraction.fields.rota.origem, 'São Paulo');
  assert.equal(extraction.fields.rota.destino, 'Campinas');
  assert.equal(extraction.fields.fechamento.dataHora, '19/10/2026 08:30');
  assert.equal(extraction.fields.volumes.quantidade, '2');
  assert.equal(extraction.fields.totais.peso, '16,50 kg');
  assert.equal(extraction.fields.totais.volume, '0,120 m3');
  assert.equal(extraction.fields.totais.quantidadeNotas, '2');
  assert.deepEqual(extraction.fields.caixas, [
    {
      referencia: 'CX-001',
      codigo: null,
      notaFiscal: '12345',
      peso: '10,00 kg',
      pesoCubico: null,
      volume: '0,080 m3',
    },
    {
      referencia: 'CX-002',
      codigo: null,
      notaFiscal: '12346',
      peso: '6,50 kg',
      pesoCubico: null,
      volume: '0,040 m3',
    },
  ]);
});

test('classifies the supplied shipping-list layout and keeps box weight references', () => {
  const englishRomaneioOcr = [
    'New Shipping List',
    'Closure date: 19/10/2026 08:30',
    'Country BR Shipname Navio de Exemplo',
    'Shipment SHIP-123',
    'Operator Operador de Exemplo Payment Option F-02 Fracionado',
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

  const extraction = extractRomaneio(englishRomaneioOcr);

  assert.ok(extraction);
  assert.equal(extraction.fields.remessa.numero, 'SHIP-123');
  assert.equal(extraction.fields.remessa.pais, 'BR');
  assert.equal(extraction.fields.remessa.nomeNavio, 'Navio de Exemplo');
  assert.equal(extraction.fields.remessa.operador, 'Operador de Exemplo');
  assert.equal(extraction.fields.remessa.formaPagamento, 'F-02 Fracionado');
  assert.equal(extraction.fields.transportadora.identificador, 'C-100');
  assert.equal(extraction.fields.transportadora.razaoSocial, 'Expresso Exemplo');
  assert.equal(extraction.fields.rota.origem, 'SAO PAULO');
  assert.equal(extraction.fields.rota.estado, 'SP');
  assert.equal(extraction.fields.rota.codigo, 'SPC006');
  assert.equal(extraction.fields.fechamento.dataHora, '19/10/2026 08:30');
  assert.equal(extraction.fields.volumes.embalagem, 'Cardboard Box');
  assert.equal(extraction.fields.volumes.quantidade, '2');
  assert.equal(extraction.fields.totais.quantidadeCaixas, '2');
  assert.equal(extraction.fields.totais.peso, '8,659');
  assert.equal(extraction.fields.totais.pesoCubico, '90,083');
  assert.equal(extraction.fields.totais.volume, '0,300');
  assert.deepEqual(extraction.fields.caixas, [
    {
      referencia: '5551001',
      codigo: 'CODE-1',
      notaFiscal: '12345-67',
      peso: '5,752',
      pesoCubico: '57,251',
      volume: '0,191',
    },
    {
      referencia: '5551002',
      codigo: 'CODE-2',
      notaFiscal: '12346-78',
      peso: '2,907',
      pesoCubico: '32,832',
      volume: '0,109',
    },
  ]);
});

test('returns null for OCR text that does not identify a romaneio', () => {
  assert.equal(extractRomaneio('Texto de outro tipo de documento'), null);
});

test('does not classify a DANFE as a romaneio when its body mentions one', () => {
  assert.equal(
    extractRomaneio(
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
  const extraction = extractRomaneio('ROMANEIO DE CARGA');

  assert.ok(extraction);
  assert.equal(extraction.fields.remessa.numero, null);
  assert.equal(extraction.fields.transportadora.razaoSocial, null);
  assert.deepEqual(extraction.fields.caixas, []);
  assert.ok(extraction.warnings.includes('remessa.numero: campo não reconhecido no OCR'));
  assert.ok(
    extraction.warnings.includes('transportadora.razaoSocial: campo não reconhecido no OCR'),
  );
});
