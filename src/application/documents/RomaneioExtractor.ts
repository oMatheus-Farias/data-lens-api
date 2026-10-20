export interface IRomaneioBox {
  referencia: string | null;
  codigo: string | null;
  notaFiscal: string | null;
  peso: string | null;
  pesoCubico: string | null;
  volume: string | null;
}

export interface IRomaneioFields {
  remessa: {
    numero: string | null;
    data: string | null;
    pais: string | null;
    nomeNavio: string | null;
    operador: string | null;
    formaPagamento: string | null;
  };
  transportadora: {
    razaoSocial: string | null;
    identificador: string | null;
    cnpjCpf: string | null;
    motorista: string | null;
    placaVeiculo: string | null;
  };
  rota: {
    origem: string | null;
    destino: string | null;
    estado: string | null;
    codigo: string | null;
  };
  fechamento: {
    dataHora: string | null;
    responsavel: string | null;
  };
  volumes: {
    embalagem: string | null;
    quantidade: string | null;
    peso: string | null;
    volume: string | null;
  };
  totais: {
    quantidadeNotas: string | null;
    quantidadeCaixas: string | null;
    peso: string | null;
    pesoCubico: string | null;
    volume: string | null;
  };
  caixas: IRomaneioBox[];
}

export interface IRomaneioExtraction {
  documentType: 'romaneio';
  fields: IRomaneioFields;
  warnings: string[];
}

type ScalarFieldPath =
  | `remessa.${keyof IRomaneioFields['remessa']}`
  | `transportadora.${keyof IRomaneioFields['transportadora']}`
  | `rota.${keyof IRomaneioFields['rota']}`
  | `fechamento.${keyof IRomaneioFields['fechamento']}`
  | `volumes.${keyof IRomaneioFields['volumes']}`
  | `totais.${keyof IRomaneioFields['totais']}`;

type ScalarValue = string | null;
type IScalarFields = Record<ScalarFieldPath, ScalarValue>;

function normalizedText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[\t\f]+/g, ' ')
    .replace(/[ \u00a0]{2,}/g, ' ');
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

function extractRoute(text: string): Pick<IRomaneioFields['rota'], 'origem' | 'destino'> {
  const inlineRoute = findValue(text, [
    /\b(?:ROTA|ROUTE)\s*[-:]\s*([^\n]+)/i,
    /\bROTA\s+([^\n]+)/i,
  ]);
  const routeParts = inlineRoute?.match(/^(.+?)\s*(?:->|→|\bPARA\b|\bTO\b|\s[-–]\s)\s*(.+)$/i);

  return {
    origem:
      findValue(text, [/\b(?:ORIGEM|ORIGIN)\s*[-:]\s*([^\n|;]+)/i]) ??
      routeParts?.[1]?.trim() ??
      null,
    destino:
      findValue(text, [/\b(?:DESTINO|DESTINATION)\s*[-:]\s*([^\n|;]+)/i]) ??
      routeParts?.[2]?.trim() ??
      null,
  };
}

function parseEnglishBoxRow(line: string): IRomaneioBox | null {
  const match = line.match(/^\s*(\S+)\s+(\S+)\s+(\S+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/);

  if (!match) {
    return null;
  }

  return {
    referencia: match[1] ?? null,
    codigo: match[2] ?? null,
    notaFiscal: match[3] ?? null,
    peso: match[4] ?? null,
    pesoCubico: match[5] ?? null,
    volume: match[6] ?? null,
  };
}

function parseDelimitedBoxRow(line: string): IRomaneioBox | null {
  const columns = line
    .split(/\s*[|;\t]\s*|\s{2,}/)
    .map((column) => column.trim())
    .filter(Boolean);

  if (columns.length < 2) {
    return null;
  }

  const [reference, ...values] = columns;

  if (!reference || !/[\dA-Z]/i.test(reference)) {
    return null;
  }

  const invoiceIndex = values.findIndex((value) =>
    /^(?:NF(?:-?E)?\s*[:#-]?\s*)?[\d./-]+$/i.test(value),
  );
  const weightIndex = values.findIndex((value) => /(?:KG|G|PESO|WT)/i.test(value));
  const volumeIndex = values.findIndex((value) => /(?:M[³3]|LITRO|VOLUME|VOL)/i.test(value));
  const noteIndex = invoiceIndex >= 0 ? invoiceIndex : 0;
  const weight = weightIndex >= 0 ? (values[weightIndex] ?? null) : (values.at(-2) ?? null);
  const volume = volumeIndex >= 0 ? (values[volumeIndex] ?? null) : (values.at(-1) ?? null);

  return {
    referencia: reference,
    codigo: values.length >= 4 ? (values[0] ?? null) : null,
    notaFiscal: values[noteIndex]?.replace(/^NF(?:-?E)?\s*[:#-]?\s*/i, '') ?? null,
    peso: weight,
    pesoCubico: null,
    volume,
  };
}

function extractBoxes(text: string): IRomaneioBox[] {
  const section = text.match(
    /(?:^|\n)\s*(?:BOX\s+NUMBER[^\n]*|CAIXAS?(?:\s*\/\s*VOLUMES?)?|VOLUMES?(?:\s*\/\s*PACOTES?)?|PACOTES?)\s*\n([\s\S]*?)(?=\n\s*TOTAL(?:\s|$)|$)/i,
  )?.[1];

  if (!section) {
    return [];
  }

  const rows: IRomaneioBox[] = [];

  for (const line of section.split('\n')) {
    if (
      !line.trim() ||
      /REFER[ÊE]NCIA|NOTA\s+FISCAL|FISCAL\s+NOTE|PESO|(?:REAL|CUBIC)\s+WT|BOX\s+(?:NUMBER|CODE)|VOLUME|\bVOL\s*\(/i.test(
        line,
      )
    ) {
      continue;
    }

    const row = parseEnglishBoxRow(line) ?? parseDelimitedBoxRow(line);

    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

function extractEnglishRoute(
  text: string,
): Pick<IRomaneioFields['rota'], 'origem' | 'estado' | 'codigo'> {
  const routeTable = text.match(
    /\bDN\s+CITY\s+STATE\s+ROUTE\s*\n([\s\S]*?)(?=\n\s*BOX\s+NUMBER\b|$)/i,
  )?.[1];
  const routeRow = routeTable?.match(/^\s*\S+\s+(.+?)\s+([A-Z]{2})\s+([A-Z0-9-]+)\s*$/im);

  return {
    origem: routeRow?.[1] ?? null,
    estado: routeRow?.[2] ?? null,
    codigo: routeRow?.[3] ?? null,
  };
}

function valuesForFields(text: string): IScalarFields {
  const route = extractRoute(text);
  const englishRoute = extractEnglishRoute(text);
  const englishCarrier = findValue(text, [/\bCARRIER\s*[-:]?\s*([^\n|;]+)/i]);
  const carrier =
    findValue(text, [
      /\bTRANSPORTADORA\s*[-:]\s*([^\n|;]+)/i,
      /\bRAZ[ÃA]O\s+SOCIAL\s*[-:]\s*([^\n|;]+)/i,
    ]) ?? englishCarrier;
  const carrierParts = englishCarrier?.match(/^([\w-]+)\s+(.+)$/);
  const packagingSection =
    text.match(/\bPACKAGING\b[\s\S]*?(?=\bDN\b|\bBOX\s+NUMBER\b|$)/i)?.[0] ?? '';
  const tableTotalValues = text.match(/\bTOTAL\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/im);
  const closing = findValue(text, [
    /\b(?:CLOSURE\s+DATE|DATA\s+(?:DE\s+)?FECHAMENTO|FECHAMENTO)\s*[-:]\s*([^\n]+)/i,
  ]);

  return {
    'remessa.numero': findValue(text, [
      /\b(?:N[ÚU]MERO\s+(?:DA\s+)?)?REMESSA\s*[-:#]?\s*([\w./-]+)/i,
      /\bSHIPMENT\s*[-:#]?\s*([\w./-]+)/i,
    ]),
    'remessa.data': findValue(text, [
      /\bDATA(?:\s+DA)?\s+REMESSA\s*[-:]?\s*([\d./-]+)/i,
      /^\s*DATA\s*[-:]\s*([\d./-]+)/im,
    ]),
    'remessa.pais': findValue(text, [/\bCOUNTRY\s*[-:]?\s*([A-Z]{2,3})\b/i]),
    'remessa.nomeNavio': findValue(text, [
      /\bSHIPNAME\s*[-:]?\s*(.+?)(?=\s+\b(?:SHIPMENT|OPERATOR|PAYMENT\s+OPTION|CARRIER)\b|[|\n]|$)/i,
    ]),
    'remessa.operador': findValue(text, [
      /\bOPERATOR\s*[-:]?\s*(.+?)(?=\s+\b(?:PAYMENT\s+OPTION|CARRIER|SHIPMENT)\b|[|\n]|$)/i,
    ]),
    'remessa.formaPagamento': findValue(text, [
      /\bPAYMENT\s+OPTION\s*[-:]?\s*(.+?)(?=\s+\b(?:CARRIER|SHIPMENT|OPERATOR)\b|[|\n]|$)/i,
    ]),
    'transportadora.razaoSocial': carrierParts?.[2] ?? carrier,
    'transportadora.identificador': carrierParts?.[1] ?? null,
    'transportadora.cnpjCpf': findValue(text, [
      /\bCNPJ\s*[-/]?\s*CPF\s*[-:]?\s*([\d./-]+)/i,
      /\bCNPJ\s*[-:]?\s*([\d./-]+)/i,
    ]),
    'transportadora.motorista': findValue(text, [/\bMOTORISTA\s*[-:]\s*([^\n|;]+)/i]),
    'transportadora.placaVeiculo': findValue(text, [
      /\bPLACA(?:\s+DO\s+VE[IÍ]CULO)?\s*[-:]\s*([A-Z0-9-]+)/i,
    ]),
    'rota.origem':
      findValue(text, [/\b(?:ORIGEM|ORIGIN)\s*[-:]\s*([^\n|;]+)/i]) ??
      englishRoute.origem ??
      route.origem,
    'rota.destino':
      findValue(text, [/\b(?:DESTINO|DESTINATION)\s*[-:]\s*([^\n|;]+)/i]) ?? route.destino,
    'rota.estado': englishRoute.estado,
    'rota.codigo': englishRoute.codigo,
    'fechamento.dataHora': closing,
    'fechamento.responsavel': findValue(text, [
      /\b(?:RESPONS[ÁA]VEL|CONFERENTE)\s*[-:]\s*([^\n|;]+)/i,
    ]),
    'volumes.embalagem': findValue(packagingSection, [
      /\b(CARDBOARD\s+BOX|BOX|CAIXA|CAIXAS|VOLUME|PACOTE)\s+\d+\b/i,
    ]),
    'volumes.quantidade': findValue(text, [
      /\b(?:QUANTIDADE\s+DE\s+)?VOLUMES?\s*[-:]?\s*(\d+)\b/i,
      /\b(?:CARDBOARD\s+BOX|BOX|PACKAGING)\s+(\d+)\b/i,
    ]),
    'volumes.peso': findValue(text, [
      /\bPESO\s+(?:BRUTO\s+)?(?:TOTAL|DOS\s+VOLUMES)\s*[-:]?\s*([\d.,]+(?:\s*(?:KG|G))?)/i,
    ]),
    'volumes.volume': findValue(text, [
      /\b(?:VOLUME\s+TOTAL|VOLUMETRIA\s+TOTAL)\s*[-:]?\s*([\d.,]+(?:\s*(?:M[³3]|L))?)/i,
    ]),
    'totais.quantidadeNotas': findValue(text, [
      /\bTOTAL\s+DE\s+(?:NOTAS|NOTAS\s+FISCAIS|NF-?ES?)\s*[-:]?\s*(\d+)\b/i,
      /\bQUANTIDADE\s+DE\s+NOTAS\s+FISCAIS\s*[-:]?\s*(\d+)\b/i,
    ]),
    'totais.quantidadeCaixas': findValue(packagingSection, [
      /\bTOTAL\s*[-:]?\s*(\d+)\b/i,
      /\bTOTAL\s+DE\s+CAIXAS?\s*[-:]?\s*(\d+)\b/i,
      /\bQUANTIDADE\s+DE\s+CAIXAS?\s*[-:]?\s*(\d+)\b/i,
    ]),
    'totais.peso':
      tableTotalValues?.[1] ??
      findValue(text, [/\bPESO\s+(?:BRUTO\s+)?TOTAL\s*[-:]?\s*([\d.,]+(?:\s*(?:KG|G))?)/i]),
    'totais.pesoCubico': tableTotalValues?.[2] ?? null,
    'totais.volume':
      tableTotalValues?.[3] ??
      findValue(text, [/\bVOLUME\s+TOTAL\s*[-:]?\s*([\d.,]+(?:\s*(?:M[³3]|L))?)/i]),
  };
}

function createFields(values: IScalarFields, boxes: IRomaneioBox[]): IRomaneioFields {
  return {
    remessa: {
      numero: values['remessa.numero'],
      data: values['remessa.data'],
      pais: values['remessa.pais'],
      nomeNavio: values['remessa.nomeNavio'],
      operador: values['remessa.operador'],
      formaPagamento: values['remessa.formaPagamento'],
    },
    transportadora: {
      razaoSocial: values['transportadora.razaoSocial'],
      identificador: values['transportadora.identificador'],
      cnpjCpf: values['transportadora.cnpjCpf'],
      motorista: values['transportadora.motorista'],
      placaVeiculo: values['transportadora.placaVeiculo'],
    },
    rota: {
      origem: values['rota.origem'],
      destino: values['rota.destino'],
      estado: values['rota.estado'],
      codigo: values['rota.codigo'],
    },
    fechamento: {
      dataHora: values['fechamento.dataHora'],
      responsavel: values['fechamento.responsavel'],
    },
    volumes: {
      embalagem: values['volumes.embalagem'],
      quantidade: values['volumes.quantidade'],
      peso: values['volumes.peso'],
      volume: values['volumes.volume'],
    },
    totais: {
      quantidadeNotas: values['totais.quantidadeNotas'],
      quantidadeCaixas: values['totais.quantidadeCaixas'],
      peso: values['totais.peso'],
      pesoCubico: values['totais.pesoCubico'],
      volume: values['totais.volume'],
    },
    caixas: boxes,
  };
}

export function extractRomaneio(ocrText: string): IRomaneioExtraction | null {
  const text = normalizedText(ocrText);
  const firstNonemptyLine = text.split('\n').find((line) => line.trim()) ?? '';
  const isPortugueseRomaneio = /^\s*ROMANEIO\b/i.test(firstNonemptyLine);
  const isEnglishShippingList =
    /\bSHIPPING\s+LIST\b/i.test(text) &&
    /\bSHIPMENT\b/i.test(text) &&
    /\bCARRIER\b/i.test(text) &&
    /\bBOX\b/i.test(text);

  if (!isPortugueseRomaneio && !isEnglishShippingList) {
    return null;
  }

  const boxes = extractBoxes(text);
  const values = valuesForFields(text);
  const fields = createFields(values, boxes);
  const warnings: string[] = Object.entries(values)
    .filter(([, value]) => value === null)
    .map(([path]) => `${path}: campo não reconhecido no OCR`);

  boxes.forEach((box, index) => {
    for (const [field, value] of Object.entries(box)) {
      if (value === null) {
        warnings.push(`caixas[${index}].${field}: campo não reconhecido no OCR`);
      }
    }
  });

  if (boxes.length === 0) {
    warnings.push('caixas: nenhuma linha de caixa reconhecida no OCR');
  }

  return { documentType: 'romaneio', fields, warnings };
}
