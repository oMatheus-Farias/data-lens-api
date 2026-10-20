export interface IDocumentProcessor {
  process(pdfPath: string, workDirectory: string): Promise<string>;
}
