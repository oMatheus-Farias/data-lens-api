# Document processing

## API

`POST /shipments/extract` accepts repeated `files` fields in `multipart/form-data`. A batch may contain up to 10 files, each up to 25 MiB. Supported formats are PDF, PNG, JPG, and JPEG. File extensions and signatures are checked before processing. Files are processed in upload order.

Each response item includes `fileName` and a `status` (`success`, `unrecognized`, or `failed`). OCR text is included when available. Recognized shipping manifests and DANFEs also include structured `fields` and `warnings`. Extracted values and OCR text retain the source document's language; API names and messages are English.

## OCR

- PDFs use local OCRmyPDF and Tesseract.
- PNG, JPG, and JPEG files use Tesseract.js.
- Both OCR paths use Portuguese and English (`por+eng`) and pass recognized text to the same document extractors.
- Tesseract.js downloads and caches language data by default. `TESSERACT_LANG_PATH` can point to a local directory containing uncompressed `eng.traineddata` and `por.traineddata` files.
- Uploads and intermediate files stay in a request-scoped temporary directory, which is removed after processing. Documents and results are not persisted or sent to an external OCR service.

## Local setup

Run `pnpm dev` and send a multipart request to `http://localhost:3333/shipments/extract`. Add one or more `files` parts and select each file in the HTTP client. The first Tesseract.js recognition downloads the language data unless `TESSERACT_LANG_PATH` is set.

The API extracts fields with layout-specific parsers. Better OCR text can improve extraction, but it does not guarantee that a document layout or every field will be recognized.
