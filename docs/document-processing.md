# Document processing

## API

`POST /shipments/extract` accepts exactly one PDF in the `file` field of `multipart/form-data`, up to 25 MiB. Both the `.pdf` extension and PDF signature are checked.

The response uses `docExtracts`. Recognized Romaneios are returned as `shippingList` records with `pageNumber`, `shipname`, `shipment`, `dn`, and each Fiscal Note row in `data`. Pages not recognized as a Romaneio include their page number and OCR text. Extracted values and OCR text retain the source document's language; API names and messages are English.

## OCR

- PDF pages are rendered locally to PNG with the `pdf-to-img` package and sent to Google Cloud Vision `images:annotate` in batches of at most 16 images using `DOCUMENT_TEXT_DETECTION`.
- Set `GOOGLE_API_CLOUD_VISION_SECRET` to the Cloud Vision API key. The key is sent only to Google and is never returned by the API.
- For local parser diagnosis, set `GOOGLE_VISION_DEBUG_OCR=true` to log each page's recognized text to the API process output. This is disabled by default. OCR text may contain personal and fiscal data; use this only in a controlled local environment and remove captured logs after analysis.
- Uploaded PDFs and rendered images stay in a request-scoped temporary directory, which is removed after processing. Documents and results are not persisted.

## Local setup

Set `GOOGLE_API_CLOUD_VISION_SECRET` in the process environment or `.env`, run `pnpm dev`, and send one `file` part containing a PDF to `http://localhost:3333/shipments/extract`. The development command loads `.env` automatically. Set `GOOGLE_VISION_DEBUG_OCR=true` in the same environment to inspect the OCR text page by page.

The API extracts fields with layout-specific parsers. Better OCR text can improve extraction, but it does not guarantee that a document layout or every field will be recognized.
