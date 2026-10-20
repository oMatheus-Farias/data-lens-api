import type { IOcrWord } from './OcrPage';
import { extractSpatialOcrValues } from './SpatialOcrExtractor';

interface IDanfeParty {
  street: string | null;
  neighborhood: string | null;
  postalCode: string | null;
  number: string | null;
  complement: string | null;
  municipality: string | null;
  phone_fax: string | null;
  cnpjCpf: string | null;
}

export interface IDanfeExtraction {
  type: 'nfDanfe';
  pageNumber: number;
  sender: IDanfeParty;
  recipient: IDanfeParty & { dn: string | null };
  invoice_number: string | null;
  series: string | null;
  issueDate: string | null;
  accessKey: string | null;
  icmsCalculationBasis: string | null;
  icmsAmount: string | null;
  totalProducts_amount: string | null;
  totalInvoiceAmount: string | null;
  grossWeight: string | null;
}

type Field = keyof IDanfeParty | 'dn';

const PARTY_LABELS: Record<Field, RegExp> = {
  street: /^\s*(?:logradouro|endere[cç]o|rua|avenida)\s*[:.]?\s*(.*)$/i,
  neighborhood: /^\s*bairro(?:\s*\/\s*distrito)?\s*[:.]?\s*(.*)$/i,
  postalCode: /^\s*(?:CEP|c[oó]digo\s+postal)\s*[:.]?\s*(.*)$/i,
  number: /^\s*(?:n[uú]mero|n[ºo°](?![a-z]))\s*[:.]?\s*(.*)$/i,
  complement: /^\s*complemento\s*[:.]?\s*(.*)$/i,
  municipality: /^\s*(?:munic[ií]pio|cidade)\s*[:.]?\s*(.*)$/i,
  phone_fax: /^\s*(?:fone\s*\/\s*fax|telefone|fone|fax)\s*[:.]?\s*(.*)$/i,
  cnpjCpf: /^\s*CNPJ\s*[-/]?\s*CPF\s*[:.]?\s*(.*)$/i,
  dn: /^\s*DN\s*[:#.]?\s*(.*)$/i,
};

const PARTY_LABEL_LINE =
  /^(?:LOGRADOURO|ENDERE[CÇ]O|RUA|AVENIDA|BAIRRO|CEP|C[ÓO]DIGO POSTAL|N[ÚU]MERO|N[ºO°]|COMPLEMENTO|MUNIC[IÍ]PIO|CIDADE|FONE|FAX|TELEFONE|CNPJ|DN)\b/i;

const RECIPIENT_SPATIAL_LABELS = {
  street: /\b(?:LOGRADOURO|ENDERE[CÇ]O)\b/i,
  neighborhood: /\bBAIRRO(?:\s*\/\s*DISTRITO)?\b/i,
  postalCode: /\bCEP\b/i,
  number: /\bN[ÚU]MERO\b/i,
  complement: /\bCOMPLEMENTO\b/i,
  municipality: /\b(?:MUNIC[IÍ]PIO|CIDADE)\b/i,
  phone_fax: /\b(?:FONE\s*\/\s*FAX|TELEFONE|FONE|FAX)\b/i,
  dn: /\bDN\b/i,
};

const DANFE_TOTAL_SPATIAL_LABELS = {
  icmsCalculationBasis: /\bBASE\s+DE\s+C[AÁ]LCULO\s+(?:DO\s+)?ICMS\b(?!\s+SUBSTITUI[CÇ][ÃA]O)/i,
  icmsAmount: /\bVALOR\s+(?:DO\s+)?I(?:C(?:H)?M|CH?)S\b/i,
  totalProductsAmount: /\bVALOR\s+TOTAL\s+DOS\s+PRODUTOS\b/i,
  totalInvoiceAmount: /\bVALOR\s+TOTAL\s+DA\s+NOTA\b/i,
};

function spatialFieldValue(field: string | undefined, validator: RegExp): string | null {
  return field && validator.test(field) ? field : null;
}

function invoiceNumber(text: string): string | null {
  const labeled = value(
    text,
    /(?:N[ÚU]MERO\s+DA\s+NOTA|N[º°O.]\s*DA\s+NOTA|N[º°O.])\s*[:.]?\s*([\d./-]+)/i,
  );
  if (labeled && labeled.length >= 6) {
    return labeled;
  }

  const danfeHeader = /DANFE[\s\S]{0,300}?(?=CHAVE\s+DE\s+ACESSO)/i.exec(text)?.[0];
  return danfeHeader?.match(/(?<!\d)(\d{6,9})\s*\n?\s*S[ÉE]RIE\b/i)?.[1] ?? null;
}

function labeledAmount(text: string, label: RegExp, preferLast = false): string | null {
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = label.exec(line);
    if (!match || match.index === undefined) {
      continue;
    }

    const inline = line.slice(match.index + match[0].length).match(/[\d][\d.,]*/)?.[0];
    if (inline) {
      return inline;
    }
    const amounts: string[] = [];
    for (
      let candidateIndex = index + 1;
      candidateIndex < Math.min(index + 6, lines.length);
      candidateIndex += 1
    ) {
      const candidate = lines[candidateIndex]?.trim() ?? '';
      if (/^(?:VALOR|BASE|AL[IÍ]QUOTA|ICMS|IPI|FRETE|SEGURO)\b/i.test(candidate)) {
        if (amounts.length > 0) {
          break;
        }
        continue;
      }
      const amount = candidate.match(/(?<!\d)\d[\d.,]*(?!\d)/)?.[0];
      if (amount) {
        amounts.push(amount);
      } else if (amounts.length > 0) {
        break;
      }
    }

    if (amounts.length > 0) {
      return preferLast ? (amounts.at(-1) ?? null) : (amounts[0] ?? null);
    }
  }
  return null;
}

function clean(value: string | undefined): string | null {
  return value?.trim().replace(/\s+/g, ' ') || null;
}

function labeledValue(text: string, pattern: RegExp): string | null {
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(pattern);
    if (!match) {
      continue;
    }

    const inlineValue = clean(match[1]);
    if (inlineValue) {
      return inlineValue;
    }

    const nextLine = lines[index + 1]?.trim();
    if (nextLine && !PARTY_LABEL_LINE.test(nextLine) && !/^STATUS\s+LEGAL\b/i.test(nextLine)) {
      return nextLine;
    }
  }

  return null;
}

function numberAfterStreet(text: string): string | null {
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const streetMatch = lines[index]?.match(PARTY_LABELS.street);
    if (!streetMatch) {
      continue;
    }

    const inlineStreet = clean(streetMatch[1]);
    const streetValueLine = inlineStreet ?? lines[index + 1]?.trim();
    const inlineNumber = streetValueLine?.match(/(?:^|[\s,.])([\d]+[A-Z]?(?:[-/]\w+)?)$/i)?.[1];
    if (inlineNumber) {
      return inlineNumber;
    }

    const followingLine = inlineStreet ? lines[index + 1]?.trim() : lines[index + 2]?.trim();
    if (followingLine && /^\d+[A-Z]?(?:[-/]\w+)?$/i.test(followingLine)) {
      return followingLine;
    }
  }

  return null;
}

function labeledPostalCode(text: string): string | null {
  const lines = text.split('\n');
  const postalCodePattern = /(?<!\d)\d{5}-?\d{3}(?!\d)/;

  for (let index = 0; index < lines.length; index += 1) {
    const labelMatch = lines[index]?.match(PARTY_LABELS.postalCode);
    if (!labelMatch) {
      continue;
    }

    const candidates = [labelMatch[1], ...lines.slice(index + 1, index + 5)];
    for (const candidateLine of candidates) {
      const candidate = candidateLine?.match(postalCodePattern)?.[0];
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

function value(text: string, pattern: RegExp): string | null {
  return clean(text.match(pattern)?.[1]);
}

function cnpjValues(text: string): string[] {
  const lines = text.split('\n');
  const values: string[] = [];
  const label = /^\s*CNPJ\s*[-/]?\s*CPF\s*[:.]?\s*(.*)$/i;
  const cnpj =
    /(?<!\d)(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{14}|\d{11})(?!\d)/;

  for (let index = 0; index < lines.length; index += 1) {
    const labelMatch = lines[index]?.match(label);
    if (!labelMatch) {
      continue;
    }

    const inlineValue = labelMatch[1]?.match(cnpj)?.[0];
    if (inlineValue) {
      values.push(inlineValue);
      continue;
    }

    for (
      let candidateIndex = index + 1;
      candidateIndex < Math.min(index + 24, lines.length);
      candidateIndex += 1
    ) {
      const candidateLine = lines[candidateIndex]?.trim() ?? '';
      if (
        label.test(candidateLine) ||
        /^(?:C[ÁA]LCULO DO IMPOSTO|FATURA|DADOS DOS PRODUTOS)\b/i.test(candidateLine)
      ) {
        break;
      }

      const candidate = candidateLine.match(cnpj)?.[0];
      if (candidate) {
        values.push(candidate);
        break;
      }
    }
  }

  return values;
}

function recipientNeighborhood(
  recipientText: string,
  documentRemainder: string,
  documentText: string,
): string | null {
  const neighborhood = labeledValue(recipientText, PARTY_LABELS.neighborhood);
  if (neighborhood) {
    return neighborhood;
  }

  const reorderedNeighborhood = labeledValue(documentRemainder, PARTY_LABELS.neighborhood);
  if (reorderedNeighborhood) {
    return reorderedNeighborhood;
  }

  if (
    !/BAIRRO\s*\/\s*DISTRITO/i.test(recipientText) ||
    !/STATUS\s+LEGAL\s*[-–]/i.test(recipientText)
  ) {
    return null;
  }

  return clean(documentText.match(/(?:^|\n)\s*([A-ZÀ-Ú][A-ZÀ-Ú ]{2,})\s*\n\s*FATURA\b/i)?.[1]);
}

function grossWeight(text: string): string | null {
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^\s*PESO\s+BRUTO\s*[:.]?\s*(.*)$/i);
    if (!match) {
      continue;
    }

    const inlineWeight = clean(match[1])?.match(/[\d.,]+\s*KG\b/i)?.[0];
    if (inlineWeight) {
      return inlineWeight.replace(/\s+/g, ' ');
    }

    for (
      let valueIndex = index + 1;
      valueIndex < Math.min(index + 20, lines.length);
      valueIndex += 1
    ) {
      const candidate = lines[valueIndex]?.trim() ?? '';
      if (/^PESO\s+L[IÍ]QUIDO\b/i.test(candidate)) {
        continue;
      }
      if (/^[\d.,]+$/.test(candidate)) {
        let unitIndex = valueIndex + 1;
        while (unitIndex < Math.min(valueIndex + 4, lines.length) && !lines[unitIndex]?.trim()) {
          unitIndex += 1;
        }
        if (/^KG\b/i.test(lines[unitIndex]?.trim() ?? '')) {
          return `${candidate} ${lines[unitIndex]?.trim()}`;
        }
      }
      if (/^TRANSPORTADOR\b|^DADOS\s+DO\s+PRODUTO\b/i.test(candidate)) {
        break;
      }
    }
  }

  return null;
}

function party(
  text: string,
  includeDn = false,
  documentText = text,
  documentRemainder = text,
): IDanfeParty & { dn?: string | null } {
  const number = numberAfterStreet(text) ?? labeledValue(text, PARTY_LABELS.number);
  const complement = labeledValue(text, PARTY_LABELS.complement);
  const fallbackValue = (pattern: RegExp): string | null =>
    includeDn ? labeledValue(documentRemainder, pattern) : null;
  const result: IDanfeParty & { dn?: string | null } = {
    street: labeledValue(text, PARTY_LABELS.street),
    neighborhood: includeDn
      ? recipientNeighborhood(text, documentRemainder, documentText)
      : labeledValue(text, PARTY_LABELS.neighborhood),
    postalCode:
      labeledPostalCode(text) ?? (includeDn ? labeledPostalCode(documentRemainder) : null),
    number: number ?? fallbackValue(PARTY_LABELS.number),
    complement: complement === number ? null : complement,
    municipality:
      labeledValue(text, PARTY_LABELS.municipality) ?? fallbackValue(PARTY_LABELS.municipality),
    phone_fax: labeledValue(text, PARTY_LABELS.phone_fax) ?? fallbackValue(PARTY_LABELS.phone_fax),
    cnpjCpf: cnpjValues(text)[0] ?? labeledValue(text, PARTY_LABELS.cnpjCpf),
  };

  if (includeDn) {
    result.dn = labeledValue(text, PARTY_LABELS.dn) ?? fallbackValue(PARTY_LABELS.dn);
  }

  return result;
}

function footerTableAmounts(text: string): {
  icmsCalculationBasis: string | null;
  icmsAmount: string | null;
  totalProductsAmount: string | null;
  totalInvoiceAmount: string | null;
} {
  const tableHeaders = [...text.matchAll(/VALOR\s+UNIT[ÁA]RIO/gi)];
  const tableHeader = tableHeaders.at(-1);

  if (!tableHeader || tableHeader.index === undefined) {
    return {
      icmsCalculationBasis: null,
      icmsAmount: null,
      totalProductsAmount: null,
      totalInvoiceAmount: null,
    };
  }

  const rowText =
    text.slice(tableHeader.index + tableHeader[0].length).split(/\bNCM\s*\/\s*SH\b/i)[0] ?? '';
  const amounts = rowText.match(/(?<!\d)\d[\d.,]*(?!\d)/g) ?? [];
  const unitPriceIndex = amounts.findIndex((amount) => /[.,]\d{4}$/.test(amount));
  const footerTotals = /\bUF\s+[\d.,]+\s+([\d.,]+)\s+[\d.,]+\s+KG\b/i.exec(text);

  return {
    totalProductsAmount: unitPriceIndex >= 0 ? (amounts[unitPriceIndex + 1] ?? null) : null,
    icmsCalculationBasis: unitPriceIndex >= 0 ? (amounts[unitPriceIndex + 2] ?? null) : null,
    icmsAmount: unitPriceIndex >= 0 ? (amounts[unitPriceIndex + 5] ?? null) : null,
    totalInvoiceAmount: footerTotals?.[1] ?? null,
  };
}

export function extractDanfe(
  ocrText: string,
  pageNumber: number,
  ocrWords?: IOcrWord[],
  debugLayout = false,
): IDanfeExtraction | null {
  const text = ocrText.replace(/\r/g, '');

  if (
    !/\bDANFE\b/i.test(text) ||
    !/NOTA\s+FISCAL\s+ELETR[ÔO]NICA|CHAVE\s+DE\s+ACESSO/i.test(text)
  ) {
    return null;
  }

  const recipientHeading = /DESTINAT[AÁ]RIO\s*[-/]?\s*REMETENT[EÈÉÊË]/i;
  const recipientHeadingMatch = recipientHeading.exec(text);
  const recipientStart = recipientHeadingMatch
    ? recipientHeadingMatch.index + recipientHeadingMatch[0].length
    : -1;
  const operationStart = text.search(/NATUREZA\s+DA\s+OPERA[CÇ][ÃA]O/i);
  const recipientStartForSender = recipientHeadingMatch?.index ?? -1;
  const senderEndCandidates = [operationStart, recipientStartForSender].filter(
    (index) => index >= 0,
  );
  const senderText = text.slice(
    0,
    senderEndCandidates.length > 0 ? Math.min(...senderEndCandidates) : text.length,
  );
  const recipientEndMatch = /FATURA|C[ÁA]LCULO\s+DO\s+IMPOSTO|TRANSPORTADOR/i.exec(
    text.slice(Math.max(recipientStart, 0)),
  );
  const recipientEnd = recipientEndMatch
    ? Math.max(recipientStart, 0) + recipientEndMatch.index
    : text.length;
  const recipientText = recipientStart >= 0 ? text.slice(recipientStart, recipientEnd) : '';
  const totalsText =
    text.match(
      /C[ÁA]LCULO\s+DO\s+IMPOSTO([\s\S]*?)(?=TRANSPORTADOR|DADOS\s+DOS\s+PRODUTOS|$)/i,
    )?.[1] ?? text;
  const weightText = text;
  const key = value(text, /CHAVE\s+DE\s+ACESSO\s*[:.]?\s*([\d\s]{30,})/i);
  const cnpjs = cnpjValues(text);
  const tableAmounts = footerTableAmounts(text);
  const spatialRecipient = ocrWords
    ? extractSpatialOcrValues(ocrWords, RECIPIENT_SPATIAL_LABELS, {
        regionStart: /DESTINAT[AÁ]RIO/i,
        regionEnd: /FATURA|C[ÁA]LCULO\s+DO\s+IMPOSTO/i,
        ...(debugLayout ? { debug: { pageNumber, section: 'danfe-recipient' } } : {}),
      })
    : {};
  const spatialTotals = ocrWords
    ? extractSpatialOcrValues(ocrWords, DANFE_TOTAL_SPATIAL_LABELS, {
        regionStart: /C[ÁA]LCULO\s+DO\s+IMPOSTO/i,
        regionEnd: /TRANSPORTADOR/i,
        maxRegionHeight: 0.24,
        valuePattern: /^\d[\d.,]*$/,
        ...(debugLayout ? { debug: { pageNumber, section: 'danfe-totals' } } : {}),
      })
    : {};
  const sender = party(senderText);
  sender.cnpjCpf = cnpjs[0] ?? sender.cnpjCpf;
  const recipient = party(
    recipientText,
    true,
    text,
    recipientStart >= 0 ? text.slice(recipientStart) : '',
  ) as IDanfeParty & { dn: string | null };
  recipient.cnpjCpf = cnpjs.at(-1) ?? recipient.cnpjCpf;

  const spatialPartyValues = {
    street: spatialFieldValue(
      spatialRecipient.street?.text,
      /^(?!\d)(?!.*\b\d{5}-?\d{3}\b)(?!.*\b(?:MUNIC[IÍ]PIO|BAIRRO|COMPLEMENTO|CNPJ|INSCRI[CÇ][ÃA]O|TRANSPORTADOR|VALOR|C[ÁA]LCULO)\b)[\p{L}\d][\p{L}\d .,'/-]{0,99}$/iu,
    ),
    neighborhood: spatialFieldValue(
      spatialRecipient.neighborhood?.text,
      /^[\p{L}][\p{L} .'-]{1,49}$/u,
    ),
    postalCode: spatialFieldValue(spatialRecipient.postalCode?.text, /^\d{5}-?\d{3}$/),
    number: spatialFieldValue(spatialRecipient.number?.text, /^\d+[A-Z]?(?:[-/]\w+)?$/i),
    complement: spatialFieldValue(
      spatialRecipient.complement?.text,
      /^(?!.*\b(?:CEP|DATA|ENTRADA|SA[IÍ]DA|MUNIC[IÍ]PIO|FONE|FAX|N[ÚU]MERO|BAIRRO|INSCRI[CÇ][ÃA]O)\b)[\p{L}][\p{L}\d .,'/-]*$/iu,
    ),
    municipality: spatialFieldValue(
      spatialRecipient.municipality?.text,
      /^(?!.*\d{5,})[\p{L}][\p{L}\d .'-]+$/u,
    ),
    phone_fax: spatialFieldValue(spatialRecipient.phone_fax?.text, /^[\d() .+-]+$/),
    dn: spatialFieldValue(spatialRecipient.dn?.text, /^[\d./-]+$/),
  };
  for (const [field, fieldValue] of Object.entries(spatialPartyValues)) {
    const spatialValue = spatialRecipient[field];
    if (
      fieldValue &&
      (spatialValue?.confidence === null || (spatialValue?.confidence ?? 0) >= 0.5)
    ) {
      if (field === 'dn' && recipient.dn === null) {
        recipient.dn = fieldValue;
      } else if (field in recipient && recipient[field as keyof IDanfeParty] === null) {
        recipient[field as keyof IDanfeParty] = fieldValue;
      }
    }
  }

  const spatialAmount = (
    field: { text: string; confidence: number | null } | undefined,
  ): string | null => {
    if (field?.confidence !== null && field && field.confidence < 0.5) {
      return null;
    }

    return spatialFieldValue(field?.text, /^\d[\d.,]*$/);
  };

  return {
    type: 'nfDanfe',
    pageNumber,
    sender,
    recipient,
    invoice_number: invoiceNumber(text),
    series: value(text, /S[ÉE]RIE\s*[:.]?\s*([\w./-]+)/i),
    issueDate: value(text, /DATA\s+DE\s+EMISS[AÃ]O\s*[:.]?\s*([\d./-]+)/i),
    accessKey: key?.replace(/\s+/g, '') ?? null,
    icmsCalculationBasis:
      tableAmounts.icmsCalculationBasis ??
      spatialAmount(spatialTotals.icmsCalculationBasis) ??
      value(totalsText, /BASE\s+DE\s+C[AÁ]LCULO\s+(?:DO\s+)?ICMS(?!\s+ST)\s*[:.]?\s*([\d.,]+)/i),
    icmsAmount:
      tableAmounts.icmsAmount ??
      spatialAmount(spatialTotals.icmsAmount) ??
      labeledAmount(text, /VALOR\s+(?:DO\s+)?IC(?:M|H|MH)S(?!\s+ST)\b/i),
    totalProducts_amount:
      tableAmounts.totalProductsAmount ??
      spatialAmount(spatialTotals.totalProductsAmount) ??
      value(totalsText, /VALOR\s+(?:TOTAL\s+)?DOS\s+PRODUTOS\s*[:.]?\s*([\d.,]+)/i),
    totalInvoiceAmount:
      tableAmounts.totalInvoiceAmount ??
      spatialAmount(spatialTotals.totalInvoiceAmount) ??
      labeledAmount(text, /VALOR\s+TOTAL\s+DA\s+(?:NOTA|NF-?E?)\b/i, true),
    grossWeight: grossWeight(weightText),
  };
}
