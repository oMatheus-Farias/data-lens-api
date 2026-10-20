# Structured extraction from scanned PDFs

## Objective

Accept a batch of scanned PDFs and return one structured result per file in a synchronous HTTP response. The API does not persist files or results and does not reconcile information across documents.

## Document layouts

The first stage supports two Brazilian document layouts:

- **Shipping manifest**: shipment, carrier, route, closing, package, and total fields, plus separate box rows.
- **DANFE**: invoice identification, issuer and recipient, billing, tax totals, carrier, products, and additional information.

Recognized field values and the complete `ocrText` remain exactly as read from the source documents. Application-owned API names, warning paths, and messages use English. OCR rules support Portuguese source labels and English labels where present.

## HTTP contract

- `POST /shipments/extract`
- `Content-Type: multipart/form-data`
- Repeat the `files` part for each PDF in the batch.
- Process files sequentially and return results in upload order.
- Allow up to 10 PDFs per request and 25 MiB per file.

Each item in `documents` includes the original `fileName`, `status`, and OCR text when available. Recognized documents also include `documentType`, structured `fields`, and `warnings`. Document type is `shipping_manifest`, `danfe`, or `null`; status is `success`, `unrecognized`, or `failed`. A failed file includes a safe English `reason`. One file's failure does not stop the remaining files.

Example shipping-manifest result:

```json
{
  "documents": [
    {
      "fileName": "manifest.pdf",
      "documentType": "shipping_manifest",
      "status": "success",
      "fields": {
        "shipment": { "number": "RM-123", "date": "19/10/2026" },
        "carrier": { "companyName": "Transportes Exemplo" },
        "route": { "origin": "São Paulo", "destination": "Campinas" },
        "closing": { "dateTime": "19/10/2026 08:30" },
        "packages": { "quantity": "2" },
        "totals": { "invoiceCount": "2" },
        "boxes": [{ "reference": "CX-001", "invoiceNumber": "12345" }]
      },
      "ocrText": "...",
      "warnings": []
    }
  ]
}
```

Invoice fields use the English groups `identification`, `issuer`, `recipient`, `billing`, `taxesAndTotals`, `carrier`, `products`, and `additionalInformation`. All nested property names are English camelCase. Missing recognized-layout fields are `null`; warnings use English text and English property paths. No extracted values are translated.

## Processing and storage

1. The Fastify route validates multipart data, file count, size, extension, and PDF signature.
2. Uploaded files are written under generated names to a request-scoped temporary directory; the original filename is retained for the response.
3. OCRmyPDF and Tesseract run locally with Portuguese and English language data and sidecar text output.
4. Deterministic layout parsers create grouped fields and table rows from the OCR text.
5. The response is returned in upload order and the request directory is removed in a `finally` path.

The service does not send documents to third parties, persist files/results, or return temporary paths or subprocess diagnostics.

## Validation and limitations

- Fastify injection tests cover multipart validation, multiple files, ordering, per-file failures, limits, cleanup, and English response contracts.
- Parser tests use representative OCR text in the language of each source layout and verify that values are preserved.
- The supplied PDF end-to-end flow recognizes the shipping manifest. The two supplied DANFEs currently return `unrecognized`; their OCR text remains available for further parser work.
- OCRmyPDF, Tesseract, and the `por` and `eng` language data must be installed on the runtime host.
