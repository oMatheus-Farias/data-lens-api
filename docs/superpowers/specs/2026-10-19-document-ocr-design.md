# Data extraction from scanned PDFs

## Objective

Add a synchronous flow to the Data Lens API that accepts a batch of scanned PDFs and returns the recognized data for each file as structured JSON in a single response. This stage validates document reading; it does not store files or results and does not reconcile data across documents.

## Observed scope

The three supplied PDFs are single-page scans without a useful text layer. They represent two layouts:

- **Romaneio**: batch, carrier, route, closing, package, and total data; a box table with invoice references, weights, and package counts.
- **DANFE**: NF-e identification, issuer and recipient, addresses, dates, billing and payment, taxes and totals, carrier and packages, products, and additional information.

Initial extraction covers the visible fields in these two layouts and preserves product and box rows as lists. It does not promise to interpret arbitrary PDFs or fiscal layouts. The complete OCR text is returned to support review and future mapping improvements.

## HTTP interface

- `POST /remessas/extrair`
- `Content-Type: multipart/form-data`
- Repeated `files` fields contain the PDFs in the batch.
- A single request processes files sequentially and returns one result item per file.
- Proposed initial limit: up to 10 PDFs and 25 MiB per file. When possible, inputs that exceed these limits are reported as failures for the corresponding file; multipart errors that prevent the request from being read return an HTTP validation error.

Proposed response format:

```json
{
  "status": "completed",
  "documents": [
    {
      "fileName": "document.pdf",
      "documentType": "danfe",
      "status": "success",
      "fields": {
        "identificacao": {},
        "emitente": {},
        "destinatario": {},
        "produtos": [],
        "totais": {}
      },
      "ocrText": "...",
      "warnings": []
    }
  ]
}
```

`documentType` can be `romaneio`, `danfe`, or `null`. An unrecognized type returns `status: "unrecognized"`, OCR text, and a warning. A file that cannot be processed returns `status: "failed"` and a client-safe reason. Per-file failures do not interrupt the remaining files; the batch status is `partial` when any file fails or has an unrecognized type. Known fields that were not recognized are `null`; tables remain lists. Warnings identify missing or uncertain fields. The response does not include per-field confidence scores in this stage.

## Architecture and flow

1. A Fastify handler consumes all multipart files with the official `@fastify/multipart` plugin, validating count, size, extension, and PDF signature.
2. Each file is written to a request-specific temporary directory using an application-generated name. The original name is retained only to identify the file in the response.
3. The processor runs OCRmyPDF locally with Tesseract, the `por+eng` languages, deskewing, and a sidecar text file (`--sidecar`) to obtain OCR text. The expected inputs are scanned documents; sidecar extraction suits these files, which have no existing text layer.
4. A deterministic classifier identifies the two layouts from text markers. Type-specific parsers convert the text into grouped fields and table rows. Extraction is best-effort and does not invent values; uncertainties and gaps produce warnings.
5. Results are assembled in the order files were received. The temporary directory is removed in a `finally` block, including when OCR fails.

Processing remains synchronous and sequential to limit CPU and memory use. The handler does not send PDFs to third parties or store results in a database, permanent disk, or queue.

## Errors and limits

- A request without files or with invalid multipart data returns HTTP 400.
- An invalid or corrupt PDF, an oversized file, or an OCR failure produces a `failed` result for that file while preserving other results when possible.
- A readable document outside the known layouts produces `unrecognized`, with raw OCR text and a warning.
- Internal errors do not expose temporary paths or raw subprocess output.
- The application requires `ocrmypdf`, `tesseract`, and the `por` and `eng` language data to be installed. Missing tools must produce a clear operational error.

## Validation

- Handler tests cover a successful batch, partial failure, a non-PDF file, and temporary-file cleanup.
- Parser tests use representative OCR text for both layouts and verify fields, lists, nulls, and warnings.
- End-to-end validation submits the three supplied PDFs and checks classification, OCR text, and field structure without logging personal data.

## Decisions and limitations

- Local OCRmyPDF and Tesseract were chosen to keep documents in the API environment; an external OCR service was considered and is outside the scope.
- The structured JSON is specific to the two known layouts, while `ocrText` preserves recognized content for manual review.
- The current development environment does not have `ocrmypdf`, `tesseract`, or `pdftotext` on `PATH`; processing the real PDFs will depend on installing the first two tools and their language data.
