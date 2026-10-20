import type { IDanfeExtraction } from './DanfeExtractor';
import type { IShippingListExtraction } from './RomaneioExtractor';

export interface IRomaneioDanfeMatch {
  status: 'matched' | 'unmatched' | 'ambiguous';
  fiscalNote: string | null;
  romaneioPageNumber: number;
  romaneioRowNumber: number;
  danfePageNumber: number | null;
  candidatePageNumbers: number[];
}

function normalizedIdentifier(identifier: string | null): string | null {
  const normalized = identifier
    ?.trim()
    .replace(/[\s./-]/g, '')
    .toUpperCase();

  return normalized || null;
}

export function matchRomaneioDanfe(
  romaneios: readonly IShippingListExtraction[],
  danfes: readonly IDanfeExtraction[],
): IRomaneioDanfeMatch[] {
  return romaneios.flatMap((romaneio) =>
    romaneio.data.map((row, index) => {
      const fiscalNote = normalizedIdentifier(row.fiscalNote);
      const candidates = fiscalNote
        ? danfes.filter((danfe) => {
            const invoiceNumber = normalizedIdentifier(danfe.invoice_number);
            const invoiceAndSeries =
              invoiceNumber && danfe.series
                ? normalizedIdentifier(`${danfe.invoice_number ?? ''}${danfe.series}`)
                : null;

            return invoiceNumber === fiscalNote || invoiceAndSeries === fiscalNote;
          })
        : [];
      const candidatePageNumbers = candidates.map((danfe) => danfe.pageNumber);
      const base = {
        fiscalNote: row.fiscalNote,
        romaneioPageNumber: romaneio.pageNumber,
        romaneioRowNumber: index + 1,
      };

      if (candidates.length === 1) {
        return {
          ...base,
          status: 'matched' as const,
          danfePageNumber: candidates[0]?.pageNumber ?? null,
          candidatePageNumbers: [],
        };
      }

      if (candidates.length > 1) {
        return {
          ...base,
          status: 'ambiguous' as const,
          danfePageNumber: null,
          candidatePageNumbers,
        };
      }

      return {
        ...base,
        status: 'unmatched' as const,
        danfePageNumber: null,
        candidatePageNumbers: [],
      };
    }),
  );
}
