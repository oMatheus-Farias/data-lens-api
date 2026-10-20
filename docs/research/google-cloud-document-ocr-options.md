# Google Cloud document OCR options

**Research date:** 2026-10-20  
**Scope:** Official Google Cloud documentation, assessed against this API's synchronous PDF upload flow and current Vision API key setup.

## Findings

### Cloud Vision does not return only a plain text string

Cloud Vision's `DOCUMENT_TEXT_DETECTION` response contains `fullTextAnnotation`, a hierarchy of pages, blocks, paragraphs, words, and symbols. These elements include bounding boxes; pages also carry page dimensions/resolution. `Block` can describe a logical region such as text, a picture, or a separator between columns. The API also retains the older `textAnnotations` output. The plain `ocrText` in `return-vision-text.md` is therefore a representation our integration selected, not the only Vision response format. The current ADR records the `images:annotate` approach, while application code should be checked to establish exactly which fields it retains. [Vision full-text annotations](https://docs.cloud.google.com/vision/docs/fulltext-annotations)

**Implication for field extraction:** a parser can use word/paragraph coordinates and neighboring regions instead of relying exclusively on the reading order of one flattened string. For fields such as recipient neighborhood, where labels and values occupy separate table cells, preserving bounding boxes is a promising deterministic improvement. It still requires handling OCR mistakes and layout variants.

### Sending PDFs directly to Vision is supported, with a different operational model

Vision supports PDF/TIFF OCR in two relevant ways:

- `files:annotate` is the online, synchronous small-file route. It accepts PDF bytes directly in `inputConfig.content` (with `mimeType: application/pdf`) and processes up to five selected pages per file. The official Node.js sample reads a local PDF and invokes `batchAnnotateFiles`; no Cloud Storage bucket is used in this route.
- `files:asyncBatchAnnotate` is the offline long-running route for PDF/TIFF document OCR. It accepts up to 2,000 pages and writes JSON result files into a Cloud Storage bucket. The input PDF/TIFF must also be in Cloud Storage.

Only the asynchronous route requires Cloud Storage. The synchronous direct-PDF route requires changing this service's Vision request shape and response parsing, but it can preserve the endpoint's synchronous contract. [Online small-batch file annotation](https://docs.cloud.google.com/vision/docs/file-small-batch) · [PDF/TIFF asynchronous OCR](https://docs.cloud.google.com/vision/docs/pdf) · [Synchronous local-file sample](https://docs.cloud.google.com/vision/docs/samples/vision-batch-annotate-files)

The direct PDF route **is a reasonable experiment for this API**: the supplied packet has four pages, within the five-page synchronous limit, and a single file request can remove local PDF-to-image rendering, temporary page images, and one OCR request per page. The supplied `DOCUMENTOS.pdf` is about 0.3 MB, so it fits comfortably in an inline request. However, Cloud Vision's JSON request limit is 10 MB, and base64 expands the PDF; this API currently allows files up to 25 MiB. Inline PDF submission therefore cannot cover every file the API currently accepts. For larger PDFs we would need to keep the image-rendering route as a fallback or temporarily stage the PDF in Cloud Storage for `files:annotate`. [Synchronous inline PDF example](https://docs.cloud.google.com/vision/docs/file-small-batch) · [Vision quotas and request limits](https://docs.cloud.google.com/vision/quotas)

There is a documentation inconsistency to account for: the small-batch guide and synchronous `files:annotate` reference/sample show local PDF content and `DOCUMENT_TEXT_DETECTION`, while the dedicated PDF/TIFF guide describes PDF OCR as asynchronous and Cloud Storage-backed. This makes the direct route viable according to the current small-batch endpoint documentation, but it should first be tested against the real project and credentials. It remains synchronous and returns per-page annotations. It does not itself improve business-field extraction; that improvement comes from preserving and consuming the structured OCR geometry. The direct route's REST reference lists OAuth scopes and official client-library samples use ADC, so do not assume the existing API-key secret will work. The asynchronous route explicitly rejects API keys and adds Cloud Storage plus operation polling. [Synchronous file annotation reference](https://docs.cloud.google.com/vision/docs/reference/rest/v1/files/annotate) · [Authentication sample](https://docs.cloud.google.com/vision/docs/samples/vision-batch-annotate-files) · [Async PDF/TIFF authentication/storage requirements](https://docs.cloud.google.com/vision/docs/pdf)

For a local direct-PDF prototype, select the existing project in Google Cloud Console, confirm billing, and ensure Cloud Vision API is enabled. The simplest local auth is ADC with the developer's Google account: install `gcloud`, then run `gcloud auth application-default login` and `gcloud auth application-default set-quota-project PROJECT_ID`. If Google reports a missing `serviceusage.services.use` permission, grant that developer Service Usage Consumer (`roles/serviceusage.serviceUsageConsumer`). This stores credentials locally; no credential needs to be sent in chat. For deployment, prefer an attached runtime service account/ADC identity. Avoid creating or sharing a long-lived JSON key unless no safer ADC option exists. No Cloud Storage bucket or bucket IAM is required for inline synchronous `files:annotate`. For `files:asyncBatchAnnotate`, additionally create a private GCS bucket, grant the service account input read and output write permissions, and implement LRO polling/output retrieval. The `files:annotate` REST reference lists OAuth scopes and official samples use ADC, while the existing app currently authenticates image requests with an API key; test the exact method before assuming that key can be reused. [Vision authentication](https://docs.cloud.google.com/vision/docs/authentication) · [Synchronous method auth scopes](https://docs.cloud.google.com/vision/docs/reference/rest/v1/files/annotate) · [Async PDF/TIFF permissions](https://docs.cloud.google.com/vision/docs/pdf)

### Quotas and billing

Vision bills per page for multipage PDFs, just as each submitted image counts as a page/image. The published price table lists `DOCUMENT_TEXT_DETECTION` at $1.50 per 1,000 units after the first 1,000 monthly free units in the listed tier; Cloud Storage and other Google Cloud resources can incur separate charges. Current Vision system limits include a 1 GB PDF maximum, five pages per `files:annotate`, and 2,000 pages per `files:asyncBatchAnnotate`. Verify prices and quotas again before a production decision because they can change. [Vision pricing](https://cloud.google.com/vision/pricing) · [Vision quotas and limits](https://docs.cloud.google.com/vision/quotas)

### Document AI is a more relevant product comparison for semantic extraction

Document AI exposes parsers that return structured document data, rather than only OCR. Its Form Parser extracts key/value pairs, tables, checkboxes, and generic entities. Its Invoice Parser extracts invoice header and line-item data such as invoice number, supplier, total, tax, dates, and line amounts. Document AI also offers Custom Extractor with a user-defined schema and Layout Parser for structured paragraphs, tables, lists, headers, and footers. Google positions Form Parser for forms and Invoice Parser for invoice-like documents; this API's mixed shipping-list plus DANFE packet is not guaranteed to map exactly to either built-in schema. A sample-based evaluation is needed before switching. [Document AI extraction overview](https://docs.cloud.google.com/document-ai/docs/extracting-overview) · [Processor list](https://docs.cloud.google.com/document-ai/docs/processors-list) · [Document AI sample outputs](https://docs.cloud.google.com/document-ai/docs/output)

The pricing page currently lists Form Parser at $30 per 1,000 pages (for the displayed tier), while Invoice Parser is priced per count, where one count covers up to ten pages; its displayed base price is $0.10 per count. This may cost more than Vision OCR plus local parsing, especially since Cloud Vision OCR has a 1,000-unit monthly free tier. Document AI is worth prototyping when field accuracy and layout robustness justify the increased service/schema setup and price. [Document AI pricing](https://cloud.google.com/products/document-ai/pricing)

## Recommendation for this repository

1. Prototype synchronous `files:annotate` on the four-page sample. This can eliminate local rendering and keep synchronous HTTP behavior, but first resolve auth for the exact method and validate payload/latency. No GCS setup is needed for this route.
2. Improve extraction by retaining `fullTextAnnotation` layout data—at least page/block/paragraph/word text and bounding boxes—alongside the flattened OCR text. Use geometry to associate labels with values in table cells and address rows, with regex as normalization/validation rather than the sole positional mechanism. Vision PDF responses can use normalized geometry, so normalize coordinates before sharing parser logic across image and PDF paths.
3. Evaluate Document AI against a representative, privacy-approved corpus of shipping lists and DANFEs. Compare exact-field accuracy, missing/wrong-value rates, latency, operational complexity, and per-document cost. Use custom extraction if built-in invoice/form schemas do not express the required shipment fields.
4. Keep an LLM as a later extraction candidate only behind schema validation and confidence/abstention behavior, and compare it against the layout-aware baseline. The official sources reviewed establish that Vision already returns layout coordinates; they do not establish that a general LLM will be more accurate or cheaper on this document set.

## Primary sources

- [Cloud Vision full-text annotations](https://docs.cloud.google.com/vision/docs/fulltext-annotations)
- [Cloud Vision online small-batch file annotation](https://docs.cloud.google.com/vision/docs/file-small-batch)
- [Cloud Vision PDF/TIFF OCR](https://docs.cloud.google.com/vision/docs/pdf)
- [Cloud Vision quotas and limits](https://docs.cloud.google.com/vision/quotas)
- [Cloud Vision pricing](https://cloud.google.com/vision/pricing)
- [Vision authentication](https://docs.cloud.google.com/vision/product-search/docs/auth)
- [Document AI extraction overview](https://docs.cloud.google.com/document-ai/docs/extracting-overview)
- [Document AI processor list](https://docs.cloud.google.com/document-ai/docs/processors-list)
- [Document AI sample outputs](https://docs.cloud.google.com/document-ai/docs/output)
- [Document AI pricing](https://cloud.google.com/products/document-ai/pricing)
