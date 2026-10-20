import { extractShippingManifest } from './ShippingManifestExtractor';

export interface IShippingListFiscalNote {
  fiscalNote: string | null;
  realWt: string | null;
  cubicWt: string | null;
  Vol: string | null;
}

export interface IShippingListExtraction {
  type: 'shippingList';
  pageNumber: number;
  shipname: string | null;
  shipment: string | null;
  dn: { number: string | null };
  data: IShippingListFiscalNote[];
}

function extractDnNumber(ocrText: string): string | null {
  const explicitNumber = ocrText.match(/\bDN\s*(?:[:#-]\s*)?([\d./-]+)/i)?.[1];
  const tableNumber = ocrText.match(/\bDN\s+CITY\s+STATE\s+ROUTE\s*\n\s*(\S+)/i)?.[1];

  return explicitNumber ?? tableNumber ?? null;
}

export function extractRomaneio(
  ocrText: string,
  pageNumber: number,
): IShippingListExtraction | null {
  const extraction = extractShippingManifest(ocrText);

  if (!extraction) {
    return null;
  }

  return {
    type: 'shippingList',
    pageNumber,
    shipname: extraction.fields.shipment.shipName,
    shipment: extraction.fields.shipment.number,
    dn: { number: extractDnNumber(ocrText) },
    data: extraction.fields.boxes.map((box) => ({
      fiscalNote: box.invoiceNumber,
      realWt: box.weight,
      cubicWt: box.cubicWeight,
      Vol: box.volume,
    })),
  };
}
