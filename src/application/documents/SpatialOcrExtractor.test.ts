import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { IOcrWord } from './OcrPage';
import { extractSpatialOcrValues } from './SpatialOcrExtractor';

function word(text: string, x: number, y: number, height = 0.01): IOcrWord {
  return { text, confidence: 0.99, box: { x, y, width: 0.08, height } };
}

test('does not merge adjacent rows through an unusually tall word bounding box', () => {
  const words = [
    word('DESTINATÁRIO', 0.05, 0.1, 0.1),
    word('LOGRADOURO', 0.05, 0.17),
    word('AVENIDA', 0.05, 0.185),
    word('FICTÍCIA', 0.14, 0.185),
    word('FATURA', 0.05, 0.4),
  ];

  const result = extractSpatialOcrValues(
    words,
    { street: /\bLOGRADOURO\b/i },
    { regionStart: /DESTINAT[AÁ]RIO/i, regionEnd: /FATURA/i },
  );

  assert.equal(result.street?.text, 'AVENIDA FICTÍCIA');
  assert.equal(result.street?.confidence, 0.99);
  assert.equal(result.street?.labelText, 'LOGRADOURO');
});

test('uses nearby horizontal column labels to bind the amount under the right tax label', () => {
  const sizedWord = (text: string, x: number, y: number, width = 0.025): IOcrWord => ({
    text,
    confidence: 0.99,
    box: { x, y, width, height: 0.007 },
  });
  const words = [
    sizedWord('CÁLCULO', 0.02, 0.1),
    sizedWord('DO', 0.05, 0.1),
    sizedWord('IMPOSTO', 0.07, 0.1, 0.04),
    sizedWord('BASE', 0.02, 0.2),
    sizedWord('DE', 0.05, 0.2),
    sizedWord('CÁLCULO', 0.07, 0.2, 0.04),
    sizedWord('DO', 0.12, 0.2),
    sizedWord('ICMS', 0.14, 0.2),
    sizedWord('VALOR', 0.24, 0.2),
    sizedWord('DO', 0.3, 0.2),
    sizedWord('ICMS', 0.33, 0.2),
    sizedWord('5.555,55', 0.16, 0.215, 0.05),
    sizedWord('999,99', 0.36, 0.215, 0.04),
    sizedWord('TRANSPORTADOR', 0.02, 0.35, 0.12),
  ];
  const result = extractSpatialOcrValues(
    words,
    {
      icmsCalculationBasis: /BASE\s+DE\s+CÁLCULO\s+DO\s+ICMS/i,
      icmsAmount: /VALOR\s+DO\s+ICMS/i,
    },
    {
      regionStart: /CÁLCULO\s+DO\s+IMPOSTO/i,
      regionEnd: /TRANSPORTADOR/i,
      valuePattern: /^\d[\d.,]*$/,
    },
  );

  assert.equal(result.icmsCalculationBasis?.text, '5.555,55');
  assert.equal(result.icmsAmount?.text, '999,99');
});
