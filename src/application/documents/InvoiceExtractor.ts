export interface IInvoiceProduct {
  code: string | null;
  description: string | null;
  ncm: string | null;
  cst: string | null;
  cfop: string | null;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  totalAmount: string | null;
  icmsTaxBase: string | null;
  icmsAmount: string | null;
  ipiAmount: string | null;
  icmsRate: string | null;
  ipiRate: string | null;
}

export interface IInvoiceFields {
  identification: {
    number: string | null;
    series: string | null;
    accessKey: string | null;
    operationNature: string | null;
    authorizationProtocol: string | null;
    issueDate: string | null;
    departureArrivalDate: string | null;
  };
  issuer: {
    companyName: string | null;
    taxId: string | null;
    stateTaxId: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    phone: string | null;
  };
  recipient: {
    companyName: string | null;
    taxId: string | null;
    stateTaxId: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    issueDate: string | null;
  };
  billing: {
    invoice: string | null;
    installments: string[];
    paymentMethod: string | null;
  };
  taxesAndTotals: {
    icmsTaxBase: string | null;
    icmsAmount: string | null;
    icmsStTaxBase: string | null;
    icmsStAmount: string | null;
    productsAmount: string | null;
    freightAmount: string | null;
    insuranceAmount: string | null;
    discountAmount: string | null;
    otherExpenses: string | null;
    ipiAmount: string | null;
    totalAmount: string | null;
  };
  carrier: {
    companyName: string | null;
    taxId: string | null;
    freightResponsibility: string | null;
    vehiclePlate: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    quantity: string | null;
    packageType: string | null;
    brand: string | null;
    numbering: string | null;
    grossWeight: string | null;
    netWeight: string | null;
  };
  products: IInvoiceProduct[];
  additionalInformation: string | null;
}

export interface IInvoiceExtraction {
  documentType: 'danfe';
  fields: IInvoiceFields;
  warnings: string[];
}

type FieldPath =
  | `identification.${keyof IInvoiceFields['identification']}`
  | `issuer.${Exclude<keyof IInvoiceFields['issuer'], 'companyName'>}`
  | `recipient.${keyof IInvoiceFields['recipient']}`
  | `taxesAndTotals.${keyof IInvoiceFields['taxesAndTotals']}`
  | `carrier.${keyof IInvoiceFields['carrier']}`;

const FIELD_LABELS: Record<FieldPath, RegExp[]> = {
  'identification.number': [
    /\b(?:n[úu]mero|n[ºo.]?\s*da\s*nota|n[ºo.]?\s*\/)\s*[:.]?\s*([\d./-]+)/i,
  ],
  'identification.series': [/\bs[ée]rie\s*[:.]?\s*([\w./-]+)/i],
  'identification.accessKey': [/\bchave\s+de\s+acesso\s*[:.]?\s*([\d\s]{30,})/i],
  'identification.operationNature': [/\bnatureza\s+da\s+opera[cç][aã]o\s*[:.]?\s*(.+)/i],
  'identification.authorizationProtocol': [
    /\bprotocolo\s+de\s+autoriza[cç][aã]o(?:\s+de\s+uso)?\s*[:.]?\s*([\d./-]+)/i,
  ],
  'identification.issueDate': [/\bdata\s+de\s+emiss[aã]o\s*[:.]?\s*([\d./-]+)/i],
  'identification.departureArrivalDate': [
    /\bdata\s+(?:de\s+)?sa[ií]da\s*[-/]?\s*entrada\s*[:.]?\s*([\d./-]+)/i,
  ],
  'issuer.taxId': [/\bCNPJ\s*[-/]?\s*CPF\s*[:.]?\s*([\d./-]+)/i, /\bCNPJ\s*[:.]?\s*([\d./-]+)/i],
  'issuer.stateTaxId': [/\binscri[cç][aã]o\s+estadual\s*[:.]?\s*([\w./-]+)/i],
  'issuer.address': [/\b(?:logradouro|endere[cç]o)\s*[:.]?\s*(.+)/i],
  'issuer.city': [/\bmunic[ií]pio\s*[:.]?\s*([^\n,;]+)/i],
  'issuer.state': [/\bUF\s*[:.]?\s*([A-Z]{2})\b/i],
  'issuer.postalCode': [/\bCEP\s*[:.]?\s*([\d.-]+)/i],
  'issuer.phone': [/\b(?:fone|telefone)\s*[:.]?\s*([\d()\s-]{8,})/i],
  'recipient.companyName': [/\b(?:nome\s*[-/]?\s*)?raz[aã]o\s+social\s*[:.]?\s*([^\n]+)/i],
  'recipient.taxId': [/\bCNPJ\s*[-/]?\s*CPF\s*[:.]?\s*([\d./-]+)/i, /\bCPF\s*[:.]?\s*([\d./-]+)/i],
  'recipient.stateTaxId': [/\bIE\s*[:.]?\s*([\w./-]+)/i],
  'recipient.address': [/\bendere[cç]o\s*[:.]?\s*(.+)/i],
  'recipient.city': [/\bmunic[ií]pio\s*[:.]?\s*([^\n,;]+)/i],
  'recipient.state': [/\bUF\s*[:.]?\s*([A-Z]{2})\b/i],
  'recipient.postalCode': [/\bCEP\s*[:.]?\s*([\d.-]+)/i],
  'recipient.issueDate': [/\bdata\s+de\s+emiss[aã]o\s*[:.]?\s*([\d./-]+)/i],
  'taxesAndTotals.icmsTaxBase': [
    /\bbase\s+de\s+c[aá]lculo\s+(?:do\s+)?ICMS(?!\s+ST)\s*[:.]?\s*([\d.,]+)/i,
  ],
  'taxesAndTotals.icmsAmount': [/\bvalor\s+(?:do\s+)?ICMS(?!\s+ST)\s*[:.]?\s*([\d.,]+)/i],
  'taxesAndTotals.icmsStTaxBase': [
    /\bbase\s+de\s+c[aá]lculo\s+(?:do\s+)?ICMS\s+ST\s*[:.]?\s*([\d.,]+)/i,
  ],
  'taxesAndTotals.icmsStAmount': [/\bvalor\s+(?:do\s+)?ICMS\s+ST\s*[:.]?\s*([\d.,]+)/i],
  'taxesAndTotals.productsAmount': [/\bvalor\s+(?:total\s+)?dos\s+produtos\s*[:.]?\s*([\d.,]+)/i],
  'taxesAndTotals.freightAmount': [/\bvalor\s+do\s+frete\s*[:.]?\s*([\d.,]+)/i],
  'taxesAndTotals.insuranceAmount': [/\bvalor\s+do\s+seguro\s*[:.]?\s*([\d.,]+)/i],
  'taxesAndTotals.discountAmount': [/\bvalor\s+(?:do\s+)?desconto\s*[:.]?\s*([\d.,]+)/i],
  'taxesAndTotals.otherExpenses': [/\b(?:outras\s+)?despesas\s+acess[oó]rias\s*[:.]?\s*([\d.,]+)/i],
  'taxesAndTotals.ipiAmount': [/\bvalor\s+(?:do\s+)?IPI\s*[:.]?\s*([\d.,]+)/i],
  'taxesAndTotals.totalAmount': [
    /\bvalor\s+total\s+da\s+nota\s*[:.]?\s*([\d.,]+)/i,
    /\bvalor\s+total\s+da\s+NF-e?\s*[:.]?\s*([\d.,]+)/i,
  ],
  'carrier.companyName': [/\b(?:nome\s*[-/]?\s*)?raz[aã]o\s+social\s*[:.]?\s*([^\n]+)/i],
  'carrier.taxId': [/\bCNPJ\s*[-/]?\s*CPF\s*[:.]?\s*([\d./-]+)/i],
  'carrier.freightResponsibility': [/\bfrete\s+por\s+conta\s*[:.]?\s*([^\n]+)/i],
  'carrier.vehiclePlate': [/\bplaca\s+(?:do\s+)?ve[ií]culo\s*[:.]?\s*([A-Z0-9-]+)/i],
  'carrier.address': [/\bendere[cç]o\s*[:.]?\s*(.+)/i],
  'carrier.city': [/\bmunic[ií]pio\s*[:.]?\s*([^\n,;]+)/i],
  'carrier.state': [/\bUF\s*[:.]?\s*([A-Z]{2})\b/i],
  'carrier.quantity': [/\bquantidade\s*[:.]?\s*([\d.,]+)/i],
  'carrier.packageType': [/\besp[eé]cie\s*[:.]?\s*([^\n]+)/i],
  'carrier.brand': [/\bmarca\s*[:.]?\s*([^\n]+)/i],
  'carrier.numbering': [/\bnumera[cç][aã]o\s*[:.]?\s*([^\n]+)/i],
  'carrier.grossWeight': [/\bpeso\s+bruto\s*[:.]?\s*([\d.,]+)/i],
  'carrier.netWeight': [/\bpeso\s+l[ií]quido\s*[:.]?\s*([\d.,]+)/i],
};

function normalizedText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[\t\f]+/g, ' ')
    .replace(/ {2,}/g, ' ');
}

function findValue(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const value = pattern.exec(text)?.[1]?.trim().replace(/\s+/g, ' ');

    if (value) {
      return value;
    }
  }

  return null;
}

function textForField(text: string, path: FieldPath): string {
  if (path.startsWith('issuer.')) {
    return text.split(/\b(?:DANFE|DESTINAT[AÁ]RIO\s*[-/]?\s*REMETENTE)\b/i, 1)[0] ?? text;
  }

  if (path.startsWith('recipient.')) {
    return (
      text.match(
        /DESTINAT[AÁ]RIO\s*[-/]?\s*REMETENTE([\s\S]*?)(?=FATURA|C[ÁA]LCULO\s+DO\s+IMPOSTO|TRANSPORTADOR|DADOS\s+DOS\s+PRODUTOS|$)/i,
      )?.[1] ?? ''
    );
  }

  if (path.startsWith('carrier.')) {
    return (
      text.match(/TRANSPORTADOR([\s\S]*?)(?=DADOS\s+DOS\s+PRODUTOS|DADOS\s+ADICIONAIS|$)/i)?.[1] ??
      ''
    );
  }

  if (path.startsWith('taxesAndTotals.')) {
    return (
      text.match(
        /C[ÁA]LCULO\s+DO\s+IMPOSTO([\s\S]*?)(?=TRANSPORTADOR|DADOS\s+DOS\s+PRODUTOS|$)/i,
      )?.[1] ?? ''
    );
  }

  return text;
}

function extractIssuerName(text: string): string | null {
  const issuerSection =
    text.split(/\b(?:DANFE|DESTINAT[AÁ]RIO\s*[-/]?\s*REMETENTE)\b/i, 1)[0] ?? '';
  const lines = issuerSection.split('\n').map((line) => line.trim());

  return lines.find((line) => /^[A-ZÀ-Ü][A-ZÀ-Ü0-9 .&'-]{4,}$/.test(line)) ?? null;
}

function extractProducts(text: string): IInvoiceProduct[] {
  const section = text.match(
    /DADOS\s+DOS\s+PRODUTOS\s*[-/]?\s*SERVI[CÇ]OS([\s\S]*?)(?:C[ÁA]LCULO\s+DO\s+(?:IMPOSTO|ISS)|DADOS\s+ADICIONAIS|INFORMA[CÇ][ÕO]ES\s+COMPLEMENTARES|$)/i,
  )?.[1];

  if (!section) {
    return [];
  }

  const rows: IInvoiceProduct[] = [];
  const rowPattern =
    /^\s*([\w.-]{1,14})\s+(.+?)\s+(\d{4,8})\s+(\d{2,3})\s+(\d{4})\s+([\w.-]{1,8})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)((?:\s+[\d.,]+)*)\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(section)) !== null) {
    const taxValues = match[10]?.trim().split(/\s+/).filter(Boolean) ?? [];

    rows.push({
      code: match[1] ?? null,
      description: match[2]?.trim() ?? null,
      ncm: match[3] ?? null,
      cst: match[4] ?? null,
      cfop: match[5] ?? null,
      unit: match[6] ?? null,
      quantity: match[7] ?? null,
      unitPrice: match[8] ?? null,
      totalAmount: match[9] ?? null,
      icmsTaxBase: taxValues[0] ?? null,
      icmsAmount: taxValues[1] ?? null,
      ipiAmount: taxValues[2] ?? null,
      icmsRate: taxValues[3] ?? null,
      ipiRate: taxValues[4] ?? null,
    });
  }

  return rows;
}

function extractAdditionalInformation(text: string): string | null {
  const value = text.match(
    /(?:DADOS\s+ADICIONAIS|INFORMA[CÇ][ÕO]ES\s+COMPLEMENTARES)\s*[:\n]+\s*([\s\S]*?)(?:RESERVADO\s+AO\s+FISCO|$)/i,
  )?.[1];

  return value?.trim().replace(/\s+/g, ' ') || null;
}

export function extractInvoice(ocrText: string): IInvoiceExtraction | null {
  const text = normalizedText(ocrText);

  if (
    !/\bDANFE\b/i.test(text) ||
    !/NOTA\s+FISCAL\s+ELETR[ÔO]NICA|CHAVE\s+DE\s+ACESSO/i.test(text)
  ) {
    return null;
  }

  const fields: IInvoiceFields = {
    identification: {
      number: null,
      series: null,
      accessKey: null,
      operationNature: null,
      authorizationProtocol: null,
      issueDate: null,
      departureArrivalDate: null,
    },
    issuer: {
      companyName: extractIssuerName(text),
      taxId: null,
      stateTaxId: null,
      address: null,
      city: null,
      state: null,
      postalCode: null,
      phone: null,
    },
    recipient: {
      companyName: null,
      taxId: null,
      stateTaxId: null,
      address: null,
      city: null,
      state: null,
      postalCode: null,
      issueDate: null,
    },
    billing: {
      invoice: findValue(text, [/\bFATURA\s*[:.]?\s*([^\n]+)/i]),
      installments: [...text.matchAll(/\b(?:duplicata|dup\.)\s*[:#.]?\s*([\w./-]+)/gi)].map(
        (match) => match[1] ?? '',
      ),
      paymentMethod: findValue(text, [
        /\b(?:forma|meio)\s+de\s+pagamento\s*[:.]?\s*([^\n]+)/i,
        /\bpagamento\s*[:.]?\s*([^\n]+)/i,
      ]),
    },
    taxesAndTotals: {
      icmsTaxBase: null,
      icmsAmount: null,
      icmsStTaxBase: null,
      icmsStAmount: null,
      productsAmount: null,
      freightAmount: null,
      insuranceAmount: null,
      discountAmount: null,
      otherExpenses: null,
      ipiAmount: null,
      totalAmount: null,
    },
    carrier: {
      companyName: null,
      taxId: null,
      freightResponsibility: null,
      vehiclePlate: null,
      address: null,
      city: null,
      state: null,
      quantity: null,
      packageType: null,
      brand: null,
      numbering: null,
      grossWeight: null,
      netWeight: null,
    },
    products: extractProducts(text),
    additionalInformation: extractAdditionalInformation(text),
  };

  for (const [path, patterns] of Object.entries(FIELD_LABELS) as [FieldPath, RegExp[]][]) {
    const [section, key] = path.split('.') as [keyof IInvoiceFields, string];
    const value = findValue(textForField(text, path), patterns);

    (fields[section] as unknown as Record<string, string | null>)[key] = value;
  }

  const warnings: string[] = [];

  for (const [sectionName, section] of Object.entries(fields)) {
    if (Array.isArray(section)) {
      if (section.length === 0) {
        warnings.push('products: no product rows were recognized in OCR');
      } else {
        section.forEach((product, index) => {
          for (const [key, value] of Object.entries(product)) {
            if (value === null) {
              warnings.push(`products[${index}].${key}: field was not recognized in OCR`);
            }
          }
        });
      }
      continue;
    }

    if (section === null) {
      warnings.push(`${sectionName}: field was not recognized in OCR`);
    } else if (typeof section === 'object') {
      for (const [key, value] of Object.entries(section)) {
        if (value === null || (Array.isArray(value) && value.length === 0)) {
          warnings.push(`${sectionName}.${key}: field was not recognized in OCR`);
        }
      }
    }
  }

  return { documentType: 'danfe', fields, warnings };
}
