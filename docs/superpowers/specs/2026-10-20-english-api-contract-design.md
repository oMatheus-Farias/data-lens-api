# English API Contract Design

## Goal

Make the Data Lens API, its source code, and its maintained technical documentation use English while preserving document-derived values exactly as OCR reads them.

## Scope

- Replace `POST /remessas/extrair` with `POST /shipments/extract`; do not retain a Portuguese route alias.
- Keep the multipart field name `files` and the response envelope `documents`.
- Expose English names for every response property, including field groups, field names, warning paths, status values, and failure reasons.
- Use `shipping_manifest` for the English document type and retain `danfe` as the official Brazilian document acronym.
- Rename Portuguese source modules, types, functions, and tests to English equivalents.
- Write maintained technical documentation in English.
- Keep OCR input text and all extracted values unchanged. Portuguese vocabulary remains in OCR matching rules and fixtures that represent source documents.

## Proposed response shape

```json
{
  "documents": [
    {
      "fileName": "manifest.pdf",
      "documentType": "shipping_manifest",
      "status": "success",
      "fields": {
        "shipment": {},
        "carrier": {},
        "route": {},
        "closing": {},
        "packages": {},
        "totals": {},
        "boxes": []
      },
      "ocrText": "...",
      "warnings": []
    }
  ]
}
```

The invoice parser keeps its current semantic groups as `identification`, `issuer`, `recipient`, `billing`, `taxesAndTotals`, `carrier`, `products`, and `additionalInformation`. All nested keys use English camelCase. `status` remains one of `success`, `unrecognized`, or `failed`. The unknown type remains `null`. Error messages and warning text are English; values inside extracted fields and `ocrText` are not translated or normalized.

## Compatibility

This is an intentional breaking API change. Clients must change the request URL and Portuguese JSON key references. There is no compatibility alias because the public endpoint surface must be English.

## Validation

- Add failing contract tests for the English route, response keys, document type values, status values, and English warnings/errors.
- Verify the old Portuguese route is not registered.
- Keep fixtures containing Portuguese document labels and values; assert that extracted values and raw OCR text remain byte-for-byte unchanged.
- Run the unit and HTTP suites, typecheck, lint, formatting, and the supplied PDF end-to-end flow.
- Confirm no Portuguese route, response property, user-facing message, source identifier, or maintained documentation remains; Portuguese OCR patterns and source-document fixtures are expected exceptions.

## Accepted design

The endpoint is `POST /shipments/extract`. Application-owned names and messages use English. Original-language content is confined to text read from the scanned documents and the recognition patterns/fixtures required to process it.
