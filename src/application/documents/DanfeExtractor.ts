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
  street: /(?:logradouro|endere[cç]o|rua|avenida)\s*[:.]?\s*(.+)/i,
  neighborhood: /bairro\s*[:.]?\s*(.+)/i,
  postalCode: /(?:CEP|c[oó]digo\s+postal)\s*[:.]?\s*([\d.-]+)/i,
  number: /(?:^|\n)\s*(?:n[uú]mero|n[ºo°])\s*[:.]\s*([\w/-]+)/i,
  complement: /complemento\s*[:.]?\s*(.+)/i,
  municipality: /(?:munic[ií]pio|cidade)\s*[:.]?\s*(.+)/i,
  phone_fax: /(?:fone\s*\/\s*fax|telefone|fone|fax)\s*[:.]?\s*([\d()+\s-]+)/i,
  cnpjCpf: /CNPJ\s*[-/]?\s*CPF\s*[:.]?\s*([\d./-]+)/i,
  dn: /\bDN\s*[:#.]?\s*([\w/-]+)/i,
};

function value(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1]?.trim().replace(/\s+/g, ' ') || null;
}

function party(text: string, includeDn = false): IDanfeParty & { dn?: string | null } {
  const result: IDanfeParty & { dn?: string | null } = {
    street: value(text, PARTY_LABELS.street),
    neighborhood: value(text, PARTY_LABELS.neighborhood),
    postalCode: value(text, PARTY_LABELS.postalCode),
    number: value(text, PARTY_LABELS.number),
    complement: value(text, PARTY_LABELS.complement),
    municipality: value(text, PARTY_LABELS.municipality),
    phone_fax: value(text, PARTY_LABELS.phone_fax),
    cnpjCpf: value(text, PARTY_LABELS.cnpjCpf),
  };

  if (includeDn) {
    result.dn = value(text, PARTY_LABELS.dn);
  }

  return result;
}

export function extractDanfe(ocrText: string, pageNumber: number): IDanfeExtraction | null {
  const text = ocrText.replace(/\r/g, '');

  if (
    !/\bDANFE\b/i.test(text) ||
    !/NOTA\s+FISCAL\s+ELETR[ÔO]NICA|CHAVE\s+DE\s+ACESSO/i.test(text)
  ) {
    return null;
  }

  const senderText =
    text.match(
      /(?:EMITENTE|REMETENTE)([\s\S]*?)(?=DESTINAT[AÁ]RIO\s*[-/]?\s*REMETENTE|DESTINAT[AÁ]RIO|$)/i,
    )?.[1] ?? '';
  const recipientText =
    text.match(
      /DESTINAT[AÁ]RIO\s*[-/]?\s*REMETENTE([\s\S]*?)(?=FATURA|C[ÁA]LCULO\s+DO\s+IMPOSTO|TRANSPORTADOR|DADOS\s+DOS\s+PRODUTOS|$)/i,
    )?.[1] ?? '';
  const totalsText =
    text.match(
      /C[ÁA]LCULO\s+DO\s+IMPOSTO([\s\S]*?)(?=TRANSPORTADOR|DADOS\s+DOS\s+PRODUTOS|$)/i,
    )?.[1] ?? text;
  const weightText =
    text.match(/TRANSPORTADOR([\s\S]*?)(?=DADOS\s+DOS\s+PRODUTOS|DADOS\s+ADICIONAIS|$)/i)?.[1] ??
    text;
  const key = value(text, /CHAVE\s+DE\s+ACESSO\s*[:.]?\s*([\d\s]{30,})/i);

  return {
    type: 'nfDanfe',
    pageNumber,
    sender: party(senderText),
    recipient: party(recipientText, true) as IDanfeParty & { dn: string | null },
    invoice_number: value(
      text,
      /(?:N[ÚU]MERO\s+DA\s+NOTA|N[ºO.]\s*DA\s+NOTA|N[ºO.])\s*[:.]?\s*([\d./-]+)/i,
    ),
    series: value(text, /S[ÉE]RIE\s*[:.]?\s*([\w./-]+)/i),
    issueDate: value(text, /DATA\s+DE\s+EMISS[AÃ]O\s*[:.]?\s*([\d./-]+)/i),
    accessKey: key?.replace(/\s+/g, '') ?? null,
    icmsCalculationBasis: value(
      totalsText,
      /BASE\s+DE\s+C[AÁ]LCULO\s+(?:DO\s+)?ICMS(?!\s+ST)\s*[:.]?\s*([\d.,]+)/i,
    ),
    icmsAmount: value(totalsText, /VALOR\s+(?:DO\s+)?ICMS(?!\s+ST)\s*[:.]?\s*([\d.,]+)/i),
    totalProducts_amount: value(
      totalsText,
      /VALOR\s+(?:TOTAL\s+)?DOS\s+PRODUTOS\s*[:.]?\s*([\d.,]+)/i,
    ),
    totalInvoiceAmount: value(
      totalsText,
      /VALOR\s+TOTAL\s+DA\s+(?:NOTA|NF-?E?)\s*[:.]?\s*([\d.,]+)/i,
    ),
    grossWeight: value(weightText, /PESO\s+BRUTO\s*[:.]?\s*([\d.,]+\s*(?:kg)?)/i),
  };
}
