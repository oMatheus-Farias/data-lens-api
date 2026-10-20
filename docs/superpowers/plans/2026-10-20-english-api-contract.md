# English API Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the API contract, source code, and maintained technical documentation English while preserving OCR text and extracted values as read.

**Architecture:** Keep the existing Fastify request flow and deterministic parsers. Translate and rename the public route/schema and application-owned identifiers; leave Portuguese OCR patterns and document fixtures intact.

**Tech Stack:** TypeScript, Fastify, Node test runner, OCRmyPDF, Tesseract.

**Spec:** `docs/superpowers/specs/2026-10-20-english-api-contract-design.md`

## Global Constraints

- Route: `POST /shipments/extract`; do not register the Portuguese route.
- Multipart field: `files`.
- Document types: `shipping_manifest`, `danfe`, or `null`.
- Status: `success`, `unrecognized`, or `failed`.
- Application-owned response keys, warnings, errors, identifiers, filenames, and maintained docs use English.
- OCR source text, source document field labels, and extracted values remain unchanged.
- Preserve upload order, size/count validation, per-file failure handling, and temporary file cleanup.
- No new runtime dependencies.

## Review Focus

- Portuguese endpoint is absent while the English route accepts the same batch request; pin in Task 1.
- DANFE and shipping manifest response keys remain distinct and complete; pin in Tasks 2 and 3.
- Extracted names, dates, numeric strings, and `ocrText` remain exactly as recognized; pin in each parser's HTTP tests.
- All generated warning paths and API errors are English; pin in Tasks 2 and 3.
- Failed and unrecognized files still preserve filenames and do not stop later files; pin in Task 1.

## File Map

- `src/main/routes/extractShipments.ts`: English route and request flow.
- `src/main/routes/extractShipments.test.ts`: HTTP contract coverage.
- `src/application/documents/ShippingManifestExtractor.ts`: English types and output keys; Portuguese OCR patterns stay.
- `src/application/documents/ShippingManifestExtractor.test.ts`: parser coverage with original-language fixtures.
- `src/application/documents/InvoiceExtractor.ts`: English invoice field keys and parser symbols; retain `DANFE` as the source document acronym and in OCR detection.
- `src/main/app.ts`: register the renamed English route module.
- `src/main/server.ts`, `src/main/app.ts`, `src/infrastructure/documents/OcrmypdfDocumentProcessor.ts`, error classes, and config: translate any application-owned names/messages found during implementation.
- `docs/adr/0001-local-document-processing.md`: English ADR.
- `docs/superpowers/specs/2026-10-19-shipment-ocr-stage-design.md`: English stage specification with the updated route.
- `docs/superpowers/plans/2026-10-19-shipment-ocr-stage.md`: English implementation history with the updated route and validation status.
- `docs/superpowers/specs/2026-10-19-document-ocr-design.md`: update route, schema, examples, and dependency notes to current implementation.
- `GLOSSARY.md`: retain established Brazilian domain terms, with English definitions.

### Task 1: Rename the HTTP endpoint and route module

**Files:**

- Modify: `src/main/routes/extractShipments.ts`
- Modify: `src/main/routes/extractShipments.test.ts`
- Modify: `src/main/app.ts`

- [x] **Step 1: Add a failing HTTP test for `POST /shipments/extract`**

Use the existing multipart helper and verify one successful response. Add a second assertion that `POST /remessas/extrair` returns 404.

- [x] **Step 2: Run the focused test and confirm the new path fails**

Run: `node --import=tsx --test src/main/routes/extractShipments.test.ts`
Expected: the English path is currently 404.

- [x] **Step 3: Rename the route module, update registration and validation names**

Change the route to `/shipments/extract`. Preserve the `files` field and current size, count, cleanup, and failure behavior. Translate remaining validation/failure messages to English.

- [x] **Step 4: Run the focused HTTP tests**

Run: `node --import=tsx --test src/main/routes/extractShipments.test.ts`
Expected: PASS, including rejection of the Portuguese route.

### Task 2: Translate the shipping-manifest output schema

**Files:**

- Modify: `src/application/documents/ShippingManifestExtractor.ts`
- Modify: `src/application/documents/ShippingManifestExtractor.test.ts`
- Modify: `src/main/routes/extractShipments.ts`
- Modify: `src/main/routes/extractShipments.test.ts`

- [x] **Step 1: Write failing parser and HTTP assertions for the English schema**

Assert `documentType: "shipping_manifest"`, English groups (`shipment`, `carrier`, `route`, `closing`, `packages`, `totals`, `boxes`), English nested keys, and English warnings. Keep Portuguese OCR fixture strings and assert their extracted values are unchanged.

- [x] **Step 2: Run the focused tests and confirm the expected contract failures**

Run: `node --import=tsx --test src/application/documents/ShippingManifestExtractor.test.ts src/main/routes/extractShipments.test.ts`
Expected: FAIL because the extractor and route still expose Portuguese names.

- [x] **Step 3: Translate shipping-manifest types, symbols, keys, and warning text**

Rename the parser export to `extractShippingManifest`. Keep matching expressions for Portuguese and English source labels. Translate only application-owned names and warning strings.

- [x] **Step 4: Run the focused tests**

Run: `node --import=tsx --test src/application/documents/ShippingManifestExtractor.test.ts src/main/routes/extractShipments.test.ts`
Expected: PASS; OCR source and parsed value strings remain unchanged.

### Task 3: Translate the DANFE output schema and application errors

**Files:**

- Modify: `src/application/documents/InvoiceExtractor.ts`
- Modify: `src/main/routes/extractShipments.ts`
- Modify: `src/main/routes/extractShipments.test.ts`
- Modify: relevant error response and processing code found in `src/application/errors/` and `src/main/utils/`

- [x] **Step 1: Add failing assertions for English invoice keys, type, warnings, and failure text**

Assert `documentType: "danfe"`, English groups (`identification`, `issuer`, `recipient`, `billing`, `taxesAndTotals`, `carrier`, `products`, `additionalInformation`), English nested keys, and English warnings. Assert representative Portuguese document values and OCR text remain unchanged.

- [x] **Step 2: Run the focused tests to confirm contract failures**

Run: `node --import=tsx --test src/main/routes/extractShipments.test.ts`
Expected: FAIL on Portuguese response keys and warning paths.

- [x] **Step 3: Translate DANFE output keys and application-owned error text**

Use English keys such as `companyName`, `taxId`, `stateTaxId`, `city`, `state`, `postalCode`, `issueDate`, `paymentMethod`, and `additionalInformation`. Keep Portuguese source-label patterns and the official `DANFE` document acronym.

- [x] **Step 4: Run all parser and HTTP tests**

Run: `node --import=tsx --test`
Expected: PASS with original OCR values intact.

### Task 4: Translate remaining application names and maintained documentation

**Files:**

- Modify/rename: `src/`, `docs/adr/`, `docs/superpowers/specs/`, `docs/superpowers/plans/`, and `GLOSSARY.md`

- [x] **Step 1: Search for Portuguese application-owned identifiers and prose**

Run targeted `rg` searches for Portuguese route fragments, response keys, generated warning text, user-facing errors, source identifiers, and document text in maintained docs. Exempt OCR patterns and fixture source content.

- [x] **Step 2: Rename remaining Portuguese modules and symbols and translate maintained docs**

Keep file and identifier renames minimal and update all import links. Translate the ADR, stage spec, stage plan, and current API design documentation. Keep established Brazilian document names in the glossary with English definitions.

- [x] **Step 3: Run test, typecheck, lint, and formatting checks**

Run: `node --import=tsx --test`, `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint src`, and `./node_modules/.bin/prettier --check src docs GLOSSARY.md`.
Expected: all commands pass.

- [x] **Step 4: Run the real PDF HTTP/OCR flow**

POST all three supplied PDFs to `/shipments/extract`. Confirm the shipping manifest is classified, both DANFEs retain their previously observed result, filenames and OCR text are present, and JSON keys/type values are English.

### Task 5: Review and commit the migration on `main`

**Files:**

- Review all changed application, test, and documentation files.

- [x] **Step 1: Search for leftover Portuguese application contract values**

Run targeted `rg` searches. Confirm only OCR patterns and source document fixtures contain Portuguese content.

- [x] **Step 2: Inspect the final diff and run `git diff --check`**

Confirm no supplied PDF is staged and the only public route is `/shipments/extract`.

- [x] **Step 3: Commit directly on `main`**

Use a conventional commit message describing the English API contract migration.

- [x] **Step 4: Confirm branch and worktree state**

Run `git status --short --branch` and `git log -1 --oneline`.
