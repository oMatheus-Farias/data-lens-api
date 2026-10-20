export interface IShippingManifestBox {
  reference: string | null;
  code: string | null;
  invoiceNumber: string | null;
  weight: string | null;
  cubicWeight: string | null;
  volume: string | null;
}

export interface IShippingManifestFields {
  shipment: {
    number: string | null;
    date: string | null;
    country: string | null;
    shipName: string | null;
    operator: string | null;
    paymentMethod: string | null;
  };
  carrier: {
    companyName: string | null;
    identifier: string | null;
    taxId: string | null;
    driver: string | null;
    vehiclePlate: string | null;
  };
  route: {
    origin: string | null;
    destination: string | null;
    state: string | null;
    code: string | null;
  };
  closing: {
    dateTime: string | null;
    responsible: string | null;
  };
  packages: {
    packaging: string | null;
    quantity: string | null;
    weight: string | null;
    volume: string | null;
  };
  totals: {
    invoiceCount: string | null;
    boxCount: string | null;
    weight: string | null;
    cubicWeight: string | null;
    volume: string | null;
  };
  boxes: IShippingManifestBox[];
}

export interface IShippingManifestExtraction {
  documentType: 'shipping_manifest';
  fields: IShippingManifestFields;
  warnings: string[];
}

type ScalarFieldPath =
  | `shipment.${keyof IShippingManifestFields['shipment']}`
  | `carrier.${keyof IShippingManifestFields['carrier']}`
  | `route.${keyof IShippingManifestFields['route']}`
  | `closing.${keyof IShippingManifestFields['closing']}`
  | `packages.${keyof IShippingManifestFields['packages']}`
  | `totals.${keyof IShippingManifestFields['totals']}`;

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

function extractRoute(
  text: string,
): Pick<IShippingManifestFields['route'], 'origin' | 'destination'> {
  const inlineRoute = findValue(text, [
    /\b(?:ROTA|ROUTE)\s*[-:]\s*([^\n]+)/i,
    /\bROTA\s+([^\n]+)/i,
  ]);
  const routeParts = inlineRoute?.match(/^(.+?)\s*(?:->|→|\bPARA\b|\bTO\b|\s[-–]\s)\s*(.+)$/i);

  return {
    origin:
      findValue(text, [/\b(?:ORIGEM|ORIGIN)\s*[-:]\s*([^\n|;]+)/i]) ??
      routeParts?.[1]?.trim() ??
      null,
    destination:
      findValue(text, [/\b(?:DESTINO|DESTINATION)\s*[-:]\s*([^\n|;]+)/i]) ??
      routeParts?.[2]?.trim() ??
      null,
  };
}

function parseEnglishBoxRow(line: string): IShippingManifestBox | null {
  const columns = line.trim().split(/\s+/);

  if (
    columns.length < 3 ||
    columns.length > 6 ||
    !/^(?:NF(?:-?E)?\s*[:#-]?\s*)?[\d./-]+$/i.test(columns[2] ?? '')
  ) {
    return null;
  }

  return {
    reference: columns[0] ?? null,
    code: columns[1] ?? null,
    invoiceNumber: columns[2] ?? null,
    weight: columns[3] ?? null,
    cubicWeight: columns[4] ?? null,
    volume: columns[5] ?? null,
  };
}

function parseDelimitedBoxRow(line: string): IShippingManifestBox | null {
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
    reference: reference,
    code: values.length >= 4 ? (values[0] ?? null) : null,
    invoiceNumber: values[noteIndex]?.replace(/^NF(?:-?E)?\s*[:#-]?\s*/i, '') ?? null,
    weight: weight,
    cubicWeight: null,
    volume,
  };
}

function extractBoxes(text: string): IShippingManifestBox[] {
  const section = text.match(
    /(?:^|\n)\s*(?:BOX\s+NUMBER[^\n]*|CAIXAS?(?:\s*\/\s*VOLUMES?)?|VOLUMES?(?:\s*\/\s*PACOTES?)?|PACOTES?)\s*\n([\s\S]*?)(?=\n\s*TOTAL(?:\s|$)|$)/i,
  )?.[1];

  if (!section) {
    return extractColumnOrientedBoxes(text);
  }

  const rows: IShippingManifestBox[] = [];

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

  return rows.length > 0 ? rows : extractColumnOrientedBoxes(text);
}

const COLUMN_HEADERS = [
  /^BOX\s+NUMBER\b/i,
  /^CITY\b/i,
  /^BOX\s+CODE\b/i,
  /^FISCAL\s+NOTE\b/i,
  /^TOTAL\b/i,
  /^STATE\b/i,
  /^ROUTE\b/i,
  /^REAL\s+WT\b/i,
  /^CUBIC\s+WT\b/i,
  /^VOL\s*\(/i,
  /^PAGE\s+NUMBER\b/i,
];

function columnValues(text: string, header: RegExp): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => header.test(line.trim()));

  if (start < 0) {
    return [];
  }

  const inlineValue = lines[start]
    ?.trim()
    .replace(header, '')
    .replace(/^\s*[:.]?\s*/, '');
  const values = inlineValue ? [inlineValue] : [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (COLUMN_HEADERS.some((candidate) => candidate.test(line))) {
      break;
    }
    if (line) {
      values.push(line);
    }
  }

  return values;
}

function extractColumnOrientedBoxes(text: string): IShippingManifestBox[] {
  if (!/^\s*BOX\s+NUMBER\b/im.test(text)) {
    return [];
  }

  const fiscalNotes = columnValues(text, /^FISCAL\s+NOTE\b/i).filter((value) =>
    /^\d+(?:[./-]\d+)*$/.test(value),
  );
  if (fiscalNotes.length === 0) {
    return [];
  }

  const references = columnValues(text, /^BOX\s+NUMBER\b/i);
  const codes = columnValues(text, /^BOX\s+CODE\b/i);
  const weights = columnValues(text, /^REAL\s+WT\s*\(\s*KG\s*\)/i).filter((value) =>
    /^[\d.,]+$/.test(value),
  );
  const cubicWeights = columnValues(text, /^CUBIC\s+WT\s*\(\s*KG\s*\)/i).filter((value) =>
    /^[\d.,]+$/.test(value),
  );
  const volumes = columnValues(text, /^VOL\s*\(/i).filter((value) => /^[\d.,]+$/.test(value));

  return fiscalNotes.map((invoiceNumber, index) => ({
    reference: references[index] ?? null,
    code: codes[index] ?? null,
    invoiceNumber,
    weight: weights[index] ?? null,
    cubicWeight: cubicWeights[index] ?? null,
    volume: volumes[index] ?? null,
  }));
}

function extractEnglishRoute(
  text: string,
): Pick<IShippingManifestFields['route'], 'origin' | 'state' | 'code'> {
  const routeTable = text.match(
    /\bDN\s+CITY\s+STATE\s+ROUTE\s*\n([\s\S]*?)(?=\n\s*BOX\s+NUMBER\b|$)/i,
  )?.[1];
  const routeRow = routeTable?.match(/^\s*\S+\s+(.+?)\s+([A-Z]{2})\s+([A-Z0-9-]+)\s*$/im);

  return {
    origin: routeRow?.[1] ?? null,
    state: routeRow?.[2] ?? null,
    code: routeRow?.[3] ?? null,
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
    'shipment.number': findValue(text, [
      /\b(?:N[ÚU]MERO\s+(?:DA\s+)?)?REMESSA\s*[-:#]?\s*([\w./-]+)/i,
      /\bSHIPMENT\s*[-:#]?\s*([\w./-]+)/i,
    ]),
    'shipment.date': findValue(text, [
      /\bDATA(?:\s+DA)?\s+REMESSA\s*[-:]?\s*([\d./-]+)/i,
      /^\s*DATA\s*[-:]\s*([\d./-]+)/im,
    ]),
    'shipment.country': findValue(text, [/\bCOUNTRY\s*[-:]?\s*([A-Z]{2,3})\b/i]),
    'shipment.shipName': findValue(text, [
      /\bSHIPNAME\s*[-:]?\s*(.+?)(?=\s+\b(?:SHIPMENT|OPERATOR|PAYMENT\s+OPTION|CARRIER)\b|[|\n]|$)/i,
    ]),
    'shipment.operator': findValue(text, [
      /\bOPERATOR\s*[-:]?\s*(.+?)(?=\s+\b(?:PAYMENT\s+OPTION|CARRIER|SHIPMENT)\b|[|\n]|$)/i,
    ]),
    'shipment.paymentMethod': findValue(text, [
      /\bPAYMENT\s+OPTION\s*[-:]?\s*(.+?)(?=\s+\b(?:CARRIER|SHIPMENT|OPERATOR)\b|[|\n]|$)/i,
    ]),
    'carrier.companyName': carrierParts?.[2] ?? carrier,
    'carrier.identifier': carrierParts?.[1] ?? null,
    'carrier.taxId': findValue(text, [
      /\bCNPJ\s*[-/]?\s*CPF\s*[-:]?\s*([\d./-]+)/i,
      /\bCNPJ\s*[-:]?\s*([\d./-]+)/i,
    ]),
    'carrier.driver': findValue(text, [/\bMOTORISTA\s*[-:]\s*([^\n|;]+)/i]),
    'carrier.vehiclePlate': findValue(text, [
      /\bPLACA(?:\s+DO\s+VE[IÍ]CULO)?\s*[-:]\s*([A-Z0-9-]+)/i,
    ]),
    'route.origin':
      findValue(text, [/\b(?:ORIGEM|ORIGIN)\s*[-:]\s*([^\n|;]+)/i]) ??
      englishRoute.origin ??
      route.origin,
    'route.destination':
      findValue(text, [/\b(?:DESTINO|DESTINATION)\s*[-:]\s*([^\n|;]+)/i]) ?? route.destination,
    'route.state': englishRoute.state,
    'route.code': englishRoute.code,
    'closing.dateTime': closing,
    'closing.responsible': findValue(text, [
      /\b(?:RESPONS[ÁA]VEL|CONFERENTE)\s*[-:]\s*([^\n|;]+)/i,
    ]),
    'packages.packaging': findValue(packagingSection, [
      /\b(CARDBOARD\s+BOX|BOX|CAIXA|CAIXAS|VOLUME|PACOTE)\s+\d+\b/i,
    ]),
    'packages.quantity': findValue(text, [
      /\b(?:QUANTIDADE\s+DE\s+)?VOLUMES?\s*[-:]?\s*(\d+)\b/i,
      /\b(?:CARDBOARD\s+BOX|BOX|PACKAGING)\s+(\d+)\b/i,
    ]),
    'packages.weight': findValue(text, [
      /\bPESO\s+(?:BRUTO\s+)?(?:TOTAL|DOS\s+VOLUMES)\s*[-:]?\s*([\d.,]+(?:\s*(?:KG|G))?)/i,
    ]),
    'packages.volume': findValue(text, [
      /\b(?:VOLUME\s+TOTAL|VOLUMETRIA\s+TOTAL)\s*[-:]?\s*([\d.,]+(?:\s*(?:M[³3]|L))?)/i,
    ]),
    'totals.invoiceCount': findValue(text, [
      /\bTOTAL\s+DE\s+(?:NOTAS|NOTAS\s+FISCAIS|NF-?ES?)\s*[-:]?\s*(\d+)\b/i,
      /\bQUANTIDADE\s+DE\s+NOTAS\s+FISCAIS\s*[-:]?\s*(\d+)\b/i,
    ]),
    'totals.boxCount': findValue(packagingSection, [
      /\bTOTAL\s*[-:]?\s*(\d+)\b/i,
      /\bTOTAL\s+DE\s+CAIXAS?\s*[-:]?\s*(\d+)\b/i,
      /\bQUANTIDADE\s+DE\s+CAIXAS?\s*[-:]?\s*(\d+)\b/i,
    ]),
    'totals.weight':
      tableTotalValues?.[1] ??
      findValue(text, [/\bPESO\s+(?:BRUTO\s+)?TOTAL\s*[-:]?\s*([\d.,]+(?:\s*(?:KG|G))?)/i]),
    'totals.cubicWeight': tableTotalValues?.[2] ?? null,
    'totals.volume':
      tableTotalValues?.[3] ??
      findValue(text, [/\bVOLUME\s+TOTAL\s*[-:]?\s*([\d.,]+(?:\s*(?:M[³3]|L))?)/i]),
  };
}

function createFields(
  values: IScalarFields,
  boxes: IShippingManifestBox[],
): IShippingManifestFields {
  return {
    shipment: {
      number: values['shipment.number'],
      date: values['shipment.date'],
      country: values['shipment.country'],
      shipName: values['shipment.shipName'],
      operator: values['shipment.operator'],
      paymentMethod: values['shipment.paymentMethod'],
    },
    carrier: {
      companyName: values['carrier.companyName'],
      identifier: values['carrier.identifier'],
      taxId: values['carrier.taxId'],
      driver: values['carrier.driver'],
      vehiclePlate: values['carrier.vehiclePlate'],
    },
    route: {
      origin: values['route.origin'],
      destination: values['route.destination'],
      state: values['route.state'],
      code: values['route.code'],
    },
    closing: {
      dateTime: values['closing.dateTime'],
      responsible: values['closing.responsible'],
    },
    packages: {
      packaging: values['packages.packaging'],
      quantity: values['packages.quantity'],
      weight: values['packages.weight'],
      volume: values['packages.volume'],
    },
    totals: {
      invoiceCount: values['totals.invoiceCount'],
      boxCount: values['totals.boxCount'],
      weight: values['totals.weight'],
      cubicWeight: values['totals.cubicWeight'],
      volume: values['totals.volume'],
    },
    boxes,
  };
}

export function extractShippingManifest(ocrText: string): IShippingManifestExtraction | null {
  const text = normalizedText(ocrText);
  const firstNonemptyLine = text.split('\n').find((line) => line.trim()) ?? '';
  const hasPortugueseManifestHeading = /^\s*ROMANEIO\b/i.test(firstNonemptyLine);
  const hasEnglishManifestHeading = /^\s*(?:NEW\s+)?SHIPPING\s+LIST\b/i.test(firstNonemptyLine);
  const hasEnglishManifestMarkers =
    /\bSHIPPING\s+LIST\b/i.test(text) &&
    /\bSHIPMENT\b/i.test(text) &&
    /\bCARRIER\b/i.test(text) &&
    /\bBOX\b/i.test(text);

  if (!hasPortugueseManifestHeading && !hasEnglishManifestHeading && !hasEnglishManifestMarkers) {
    return null;
  }

  const boxes = extractBoxes(text);
  const values = valuesForFields(text);
  const fields = createFields(values, boxes);
  const warnings: string[] = Object.entries(values)
    .filter(([, value]) => value === null)
    .map(([path]) => `${path}: field was not recognized in OCR`);

  boxes.forEach((box, index) => {
    for (const [field, value] of Object.entries(box)) {
      if (value === null) {
        warnings.push(`boxes[${index}].${field}: field was not recognized in OCR`);
      }
    }
  });

  if (boxes.length === 0) {
    warnings.push('boxes: no package rows were recognized in OCR');
  }

  return { documentType: 'shipping_manifest', fields, warnings };
}
