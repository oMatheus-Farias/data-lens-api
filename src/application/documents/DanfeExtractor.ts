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

    let weight = clean(match[1]);
    let valueIndex = index;
    while (!weight && valueIndex < lines.length - 1) {
      valueIndex += 1;
      const candidate = lines[valueIndex]?.trim() ?? '';
      if (/^PESO\s+L[IÍ]QUIDO\b/i.test(candidate)) {
        continue;
      }
      if (/^[\d.,]+$/.test(candidate)) {
        weight = candidate;
        break;
      }
      if (PARTY_LABEL_LINE.test(candidate)) {
        return null;
      }
    }

    if (weight) {
      const unit = /^\s*[KG]{1,2}\s*$/i.test(lines[valueIndex + 1] ?? '')
        ? ` ${lines[valueIndex + 1]?.trim()}`
        : '';
      return `${weight}${unit}`;
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
  const tableHeader =
    /VALOR\s+UNIT[ÁA]RIO[\s\S]{0,180}?(?:B\.?\s*(?:CALC|C[AÁ]LC)\s+ICMS)[\s\S]{0,50}?(?:BAGE|BASE)[\s\S]{0,40}?CALC\s+ICM[SE][\s\S]{0,40}?VALOR\s+ICMS[\s\S]{0,30}?VALOR\s+IP/i.exec(
      text,
    );

  if (!tableHeader) {
    return {
      icmsCalculationBasis: null,
      icmsAmount: null,
      totalProductsAmount: null,
      totalInvoiceAmount: null,
    };
  }

  const rowText = text.slice(tableHeader.index + tableHeader[0].length);
  const amounts = rowText.match(/(?<!\d)\d[\d.,]*(?!\d)/g) ?? [];
  const footerTotals = /\bUF\s+[\d.,]+\s+([\d.,]+)\s+[\d.,]+\s+KG\b/i.exec(text);

  return {
    totalProductsAmount: amounts[2] ?? null,
    icmsCalculationBasis: amounts[3] ?? null,
    icmsAmount: amounts[6] ?? null,
    totalInvoiceAmount: footerTotals?.[1] ?? null,
  };
}

export function extractDanfe(ocrText: string, pageNumber: number): IDanfeExtraction | null {
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
  const sender = party(senderText);
  sender.cnpjCpf = cnpjs[0] ?? sender.cnpjCpf;
  const recipient = party(
    recipientText,
    true,
    text,
    recipientStart >= 0 ? text.slice(recipientStart) : '',
  ) as IDanfeParty & { dn: string | null };
  recipient.cnpjCpf = cnpjs.at(-1) ?? recipient.cnpjCpf;

  return {
    type: 'nfDanfe',
    pageNumber,
    sender,
    recipient,
    invoice_number: value(
      text,
      /(?:N[ÚU]MERO\s+DA\s+NOTA|N[º°O.]\s*DA\s+NOTA|N[º°O.])\s*[:.]?\s*([\d./-]+)/i,
    ),
    series: value(text, /S[ÉE]RIE\s*[:.]?\s*([\w./-]+)/i),
    issueDate: value(text, /DATA\s+DE\s+EMISS[AÃ]O\s*[:.]?\s*([\d./-]+)/i),
    accessKey: key?.replace(/\s+/g, '') ?? null,
    icmsCalculationBasis:
      tableAmounts.icmsCalculationBasis ??
      value(totalsText, /BASE\s+DE\s+C[AÁ]LCULO\s+(?:DO\s+)?ICMS(?!\s+ST)\s*[:.]?\s*([\d.,]+)/i),
    icmsAmount:
      tableAmounts.icmsAmount ??
      value(totalsText, /VALOR\s+(?:DO\s+)?ICMS(?!\s+ST)\s*[:.]?\s*([\d.,]+)/i),
    totalProducts_amount:
      tableAmounts.totalProductsAmount ??
      value(totalsText, /VALOR\s+(?:TOTAL\s+)?DOS\s+PRODUTOS\s*[:.]?\s*([\d.,]+)/i),
    totalInvoiceAmount:
      tableAmounts.totalInvoiceAmount ??
      value(totalsText, /VALOR\s+TOTAL\s+DA\s+(?:NOTA|NF-?E?)\s*[:.]?\s*([\d.,]+)/i),
    grossWeight: grossWeight(weightText),
  };
}
