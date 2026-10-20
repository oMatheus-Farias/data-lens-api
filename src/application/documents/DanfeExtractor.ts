export interface IDanfeProduct {
  codigo: string | null;
  descricao: string | null;
  ncm: string | null;
  cst: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: string | null;
  valorUnitario: string | null;
  valorTotal: string | null;
  baseCalculoIcms: string | null;
  valorIcms: string | null;
  valorIpi: string | null;
  aliquotaIcms: string | null;
  aliquotaIpi: string | null;
}

export interface IDanfeFields {
  identificacao: {
    numero: string | null;
    serie: string | null;
    chaveAcesso: string | null;
    naturezaOperacao: string | null;
    protocoloAutorizacao: string | null;
    dataEmissao: string | null;
    dataSaidaEntrada: string | null;
  };
  emitente: {
    razaoSocial: string | null;
    cnpj: string | null;
    inscricaoEstadual: string | null;
    endereco: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
    telefone: string | null;
  };
  destinatario: {
    razaoSocial: string | null;
    cnpjCpf: string | null;
    inscricaoEstadual: string | null;
    endereco: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
    dataEmissao: string | null;
  };
  faturamento: {
    fatura: string | null;
    duplicatas: string[];
    formaPagamento: string | null;
  };
  tributosETotais: {
    baseCalculoIcms: string | null;
    valorIcms: string | null;
    baseCalculoIcmsSt: string | null;
    valorIcmsSt: string | null;
    valorProdutos: string | null;
    valorFrete: string | null;
    valorSeguro: string | null;
    valorDesconto: string | null;
    outrasDespesas: string | null;
    valorIpi: string | null;
    valorTotal: string | null;
  };
  transportador: {
    razaoSocial: string | null;
    cnpjCpf: string | null;
    fretePorConta: string | null;
    placaVeiculo: string | null;
    endereco: string | null;
    municipio: string | null;
    uf: string | null;
    quantidade: string | null;
    especie: string | null;
    marca: string | null;
    numeracao: string | null;
    pesoBruto: string | null;
    pesoLiquido: string | null;
  };
  produtos: IDanfeProduct[];
  informacoesAdicionais: string | null;
}

export interface IDanfeExtraction {
  documentType: 'danfe';
  fields: IDanfeFields;
  warnings: string[];
}

type FieldPath =
  | `identificacao.${keyof IDanfeFields['identificacao']}`
  | `emitente.${Exclude<keyof IDanfeFields['emitente'], 'razaoSocial'>}`
  | `destinatario.${keyof IDanfeFields['destinatario']}`
  | `tributosETotais.${keyof IDanfeFields['tributosETotais']}`
  | `transportador.${keyof IDanfeFields['transportador']}`;

const FIELD_LABELS: Record<FieldPath, RegExp[]> = {
  'identificacao.numero': [
    /\b(?:n[úu]mero|n[ºo.]?\s*da\s*nota|n[ºo.]?\s*\/)\s*[:.]?\s*([\d./-]+)/i,
  ],
  'identificacao.serie': [/\bs[ée]rie\s*[:.]?\s*([\w./-]+)/i],
  'identificacao.chaveAcesso': [/\bchave\s+de\s+acesso\s*[:.]?\s*([\d\s]{30,})/i],
  'identificacao.naturezaOperacao': [/\bnatureza\s+da\s+opera[cç][aã]o\s*[:.]?\s*(.+)/i],
  'identificacao.protocoloAutorizacao': [
    /\bprotocolo\s+de\s+autoriza[cç][aã]o(?:\s+de\s+uso)?\s*[:.]?\s*([\d./-]+)/i,
  ],
  'identificacao.dataEmissao': [/\bdata\s+de\s+emiss[aã]o\s*[:.]?\s*([\d./-]+)/i],
  'identificacao.dataSaidaEntrada': [
    /\bdata\s+(?:de\s+)?sa[ií]da\s*[-/]?\s*entrada\s*[:.]?\s*([\d./-]+)/i,
  ],
  'emitente.cnpj': [/\bCNPJ\s*[-/]?\s*CPF\s*[:.]?\s*([\d./-]+)/i, /\bCNPJ\s*[:.]?\s*([\d./-]+)/i],
  'emitente.inscricaoEstadual': [/\binscri[cç][aã]o\s+estadual\s*[:.]?\s*([\w./-]+)/i],
  'emitente.endereco': [/\b(?:logradouro|endere[cç]o)\s*[:.]?\s*(.+)/i],
  'emitente.municipio': [/\bmunic[ií]pio\s*[:.]?\s*([^\n,;]+)/i],
  'emitente.uf': [/\bUF\s*[:.]?\s*([A-Z]{2})\b/i],
  'emitente.cep': [/\bCEP\s*[:.]?\s*([\d.-]+)/i],
  'emitente.telefone': [/\b(?:fone|telefone)\s*[:.]?\s*([\d()\s-]{8,})/i],
  'destinatario.razaoSocial': [/\b(?:nome\s*[-/]?\s*)?raz[aã]o\s+social\s*[:.]?\s*([^\n]+)/i],
  'destinatario.cnpjCpf': [
    /\bCNPJ\s*[-/]?\s*CPF\s*[:.]?\s*([\d./-]+)/i,
    /\bCPF\s*[:.]?\s*([\d./-]+)/i,
  ],
  'destinatario.inscricaoEstadual': [/\bIE\s*[:.]?\s*([\w./-]+)/i],
  'destinatario.endereco': [/\bendere[cç]o\s*[:.]?\s*(.+)/i],
  'destinatario.municipio': [/\bmunic[ií]pio\s*[:.]?\s*([^\n,;]+)/i],
  'destinatario.uf': [/\bUF\s*[:.]?\s*([A-Z]{2})\b/i],
  'destinatario.cep': [/\bCEP\s*[:.]?\s*([\d.-]+)/i],
  'destinatario.dataEmissao': [/\bdata\s+de\s+emiss[aã]o\s*[:.]?\s*([\d./-]+)/i],
  'tributosETotais.baseCalculoIcms': [
    /\bbase\s+de\s+c[aá]lculo\s+(?:do\s+)?ICMS(?!\s+ST)\s*[:.]?\s*([\d.,]+)/i,
  ],
  'tributosETotais.valorIcms': [/\bvalor\s+(?:do\s+)?ICMS(?!\s+ST)\s*[:.]?\s*([\d.,]+)/i],
  'tributosETotais.baseCalculoIcmsSt': [
    /\bbase\s+de\s+c[aá]lculo\s+(?:do\s+)?ICMS\s+ST\s*[:.]?\s*([\d.,]+)/i,
  ],
  'tributosETotais.valorIcmsSt': [/\bvalor\s+(?:do\s+)?ICMS\s+ST\s*[:.]?\s*([\d.,]+)/i],
  'tributosETotais.valorProdutos': [/\bvalor\s+(?:total\s+)?dos\s+produtos\s*[:.]?\s*([\d.,]+)/i],
  'tributosETotais.valorFrete': [/\bvalor\s+do\s+frete\s*[:.]?\s*([\d.,]+)/i],
  'tributosETotais.valorSeguro': [/\bvalor\s+do\s+seguro\s*[:.]?\s*([\d.,]+)/i],
  'tributosETotais.valorDesconto': [/\bvalor\s+(?:do\s+)?desconto\s*[:.]?\s*([\d.,]+)/i],
  'tributosETotais.outrasDespesas': [
    /\b(?:outras\s+)?despesas\s+acess[oó]rias\s*[:.]?\s*([\d.,]+)/i,
  ],
  'tributosETotais.valorIpi': [/\bvalor\s+(?:do\s+)?IPI\s*[:.]?\s*([\d.,]+)/i],
  'tributosETotais.valorTotal': [
    /\bvalor\s+total\s+da\s+nota\s*[:.]?\s*([\d.,]+)/i,
    /\bvalor\s+total\s+da\s+NF-e?\s*[:.]?\s*([\d.,]+)/i,
  ],
  'transportador.razaoSocial': [/\b(?:nome\s*[-/]?\s*)?raz[aã]o\s+social\s*[:.]?\s*([^\n]+)/i],
  'transportador.cnpjCpf': [/\bCNPJ\s*[-/]?\s*CPF\s*[:.]?\s*([\d./-]+)/i],
  'transportador.fretePorConta': [/\bfrete\s+por\s+conta\s*[:.]?\s*([^\n]+)/i],
  'transportador.placaVeiculo': [/\bplaca\s+(?:do\s+)?ve[ií]culo\s*[:.]?\s*([A-Z0-9-]+)/i],
  'transportador.endereco': [/\bendere[cç]o\s*[:.]?\s*(.+)/i],
  'transportador.municipio': [/\bmunic[ií]pio\s*[:.]?\s*([^\n,;]+)/i],
  'transportador.uf': [/\bUF\s*[:.]?\s*([A-Z]{2})\b/i],
  'transportador.quantidade': [/\bquantidade\s*[:.]?\s*([\d.,]+)/i],
  'transportador.especie': [/\besp[eé]cie\s*[:.]?\s*([^\n]+)/i],
  'transportador.marca': [/\bmarca\s*[:.]?\s*([^\n]+)/i],
  'transportador.numeracao': [/\bnumera[cç][aã]o\s*[:.]?\s*([^\n]+)/i],
  'transportador.pesoBruto': [/\bpeso\s+bruto\s*[:.]?\s*([\d.,]+)/i],
  'transportador.pesoLiquido': [/\bpeso\s+l[ií]quido\s*[:.]?\s*([\d.,]+)/i],
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
  if (path.startsWith('emitente.')) {
    return text.split(/\b(?:DANFE|DESTINAT[AÁ]RIO\s*[-/]?\s*REMETENTE)\b/i, 1)[0] ?? text;
  }

  if (path.startsWith('destinatario.')) {
    return (
      text.match(
        /DESTINAT[AÁ]RIO\s*[-/]?\s*REMETENTE([\s\S]*?)(?=FATURA|C[ÁA]LCULO\s+DO\s+IMPOSTO|TRANSPORTADOR|DADOS\s+DOS\s+PRODUTOS|$)/i,
      )?.[1] ?? ''
    );
  }

  if (path.startsWith('transportador.')) {
    return (
      text.match(/TRANSPORTADOR([\s\S]*?)(?=DADOS\s+DOS\s+PRODUTOS|DADOS\s+ADICIONAIS|$)/i)?.[1] ??
      ''
    );
  }

  if (path.startsWith('tributosETotais.')) {
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

function extractProducts(text: string): IDanfeProduct[] {
  const section = text.match(
    /DADOS\s+DOS\s+PRODUTOS\s*[-/]?\s*SERVI[CÇ]OS([\s\S]*?)(?:C[ÁA]LCULO\s+DO\s+(?:IMPOSTO|ISS)|DADOS\s+ADICIONAIS|INFORMA[CÇ][ÕO]ES\s+COMPLEMENTARES|$)/i,
  )?.[1];

  if (!section) {
    return [];
  }

  const rows: IDanfeProduct[] = [];
  const rowPattern =
    /^\s*([\w.-]{1,14})\s+(.+?)\s+(\d{4,8})\s+(\d{2,3})\s+(\d{4})\s+([\w.-]{1,8})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)((?:\s+[\d.,]+)*)\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(section)) !== null) {
    const taxValues = match[10]?.trim().split(/\s+/).filter(Boolean) ?? [];

    rows.push({
      codigo: match[1] ?? null,
      descricao: match[2]?.trim() ?? null,
      ncm: match[3] ?? null,
      cst: match[4] ?? null,
      cfop: match[5] ?? null,
      unidade: match[6] ?? null,
      quantidade: match[7] ?? null,
      valorUnitario: match[8] ?? null,
      valorTotal: match[9] ?? null,
      baseCalculoIcms: taxValues[0] ?? null,
      valorIcms: taxValues[1] ?? null,
      valorIpi: taxValues[2] ?? null,
      aliquotaIcms: taxValues[3] ?? null,
      aliquotaIpi: taxValues[4] ?? null,
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

export function extractDanfe(ocrText: string): IDanfeExtraction | null {
  const text = normalizedText(ocrText);

  if (
    !/\bDANFE\b/i.test(text) ||
    !/NOTA\s+FISCAL\s+ELETR[ÔO]NICA|CHAVE\s+DE\s+ACESSO/i.test(text)
  ) {
    return null;
  }

  const fields: IDanfeFields = {
    identificacao: {
      numero: null,
      serie: null,
      chaveAcesso: null,
      naturezaOperacao: null,
      protocoloAutorizacao: null,
      dataEmissao: null,
      dataSaidaEntrada: null,
    },
    emitente: {
      razaoSocial: extractIssuerName(text),
      cnpj: null,
      inscricaoEstadual: null,
      endereco: null,
      municipio: null,
      uf: null,
      cep: null,
      telefone: null,
    },
    destinatario: {
      razaoSocial: null,
      cnpjCpf: null,
      inscricaoEstadual: null,
      endereco: null,
      municipio: null,
      uf: null,
      cep: null,
      dataEmissao: null,
    },
    faturamento: {
      fatura: findValue(text, [/\bFATURA\s*[:.]?\s*([^\n]+)/i]),
      duplicatas: [...text.matchAll(/\b(?:duplicata|dup\.)\s*[:#.]?\s*([\w./-]+)/gi)].map(
        (match) => match[1] ?? '',
      ),
      formaPagamento: findValue(text, [
        /\b(?:forma|meio)\s+de\s+pagamento\s*[:.]?\s*([^\n]+)/i,
        /\bpagamento\s*[:.]?\s*([^\n]+)/i,
      ]),
    },
    tributosETotais: {
      baseCalculoIcms: null,
      valorIcms: null,
      baseCalculoIcmsSt: null,
      valorIcmsSt: null,
      valorProdutos: null,
      valorFrete: null,
      valorSeguro: null,
      valorDesconto: null,
      outrasDespesas: null,
      valorIpi: null,
      valorTotal: null,
    },
    transportador: {
      razaoSocial: null,
      cnpjCpf: null,
      fretePorConta: null,
      placaVeiculo: null,
      endereco: null,
      municipio: null,
      uf: null,
      quantidade: null,
      especie: null,
      marca: null,
      numeracao: null,
      pesoBruto: null,
      pesoLiquido: null,
    },
    produtos: extractProducts(text),
    informacoesAdicionais: extractAdditionalInformation(text),
  };

  for (const [path, patterns] of Object.entries(FIELD_LABELS) as [FieldPath, RegExp[]][]) {
    const [section, key] = path.split('.') as [keyof IDanfeFields, string];
    const value = findValue(textForField(text, path), patterns);

    (fields[section] as unknown as Record<string, string | null>)[key] = value;
  }

  const warnings: string[] = [];

  for (const [sectionName, section] of Object.entries(fields)) {
    if (Array.isArray(section)) {
      if (section.length === 0) {
        warnings.push('produtos: nenhuma linha de produto reconhecida');
      } else {
        section.forEach((product, index) => {
          for (const [key, value] of Object.entries(product)) {
            if (value === null) {
              warnings.push(`produtos[${index}].${key}: campo não reconhecido no OCR`);
            }
          }
        });
      }
      continue;
    }

    if (section === null) {
      warnings.push(`${sectionName}: campo não reconhecido no OCR`);
    } else if (typeof section === 'object') {
      for (const [key, value] of Object.entries(section)) {
        if (value === null || (Array.isArray(value) && value.length === 0)) {
          warnings.push(`${sectionName}.${key}: campo não reconhecido no OCR`);
        }
      }
    }
  }

  return { documentType: 'danfe', fields, warnings };
}
