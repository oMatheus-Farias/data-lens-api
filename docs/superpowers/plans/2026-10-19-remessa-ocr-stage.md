# Per-file OCR for scanned remessas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement issue #2 as a synchronous multipart endpoint that returns ordered OCR results for each scanned PDF while isolating per-file failures.

**Architecture:** Add a Fastify multipart route with an injectable OCR processor, request-scoped temporary storage, PDF validation, and safe response mapping. The production processor invokes local OCRmyPDF with Tesseract; HTTP tests replace it so they do not require OCR binaries.

**Tech Stack:** TypeScript, Fastify 5, `@fastify/multipart`, Node.js `node:test`, `tsx`, OCRmyPDF, Tesseract.

**Spec:** `docs/superpowers/specs/2026-10-19-remessa-ocr-stage-design.md` and GitHub issue #2.

## Global Constraints

- Endpoint: `POST /remessas/extrair` with repeated `files` multipart parts.
- Maximum: 10 PDFs per request and 25 MiB per file.
- Preserve upload order and original filenames in the response.
- OCR runs locally with `por+eng`, deskewing, and sidecar text output.
- Successful OCR without classification returns `unrecognized` and complete `ocrText`.
- Per-file processing errors return `failed` with a safe reason and do not stop other files.
- Missing files, malformed multipart, excess file count, and non-PDF content return HTTP 400.
- Remove uploaded files and OCR intermediates after success or failure; do not persist document data.
- Never return temporary paths or raw subprocess diagnostics.
- Keep personal document values out of source, fixtures, logs, and commits.

## Review Focus

- A filename containing path separators must never affect the temporary path; test that paths use generated names.
- A truncated file at 25 MiB must become a per-file `failed` result and processing must continue; test with a test-configurable byte limit and a separate default-limit assertion.
- A malformed multipart body must return a safe HTTP 400 and clean the request directory; assert both response and cleanup.
- A processor rejection containing a temporary path or stderr must not leak into the response; assert the public reason is sanitized.
- Any failure after temporary directory creation must remove all request files; assert cleanup after processor failure.

---

### Task 1: Establish HTTP contract tests

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/main/routes/extractRemessa.test.ts`
- Modify: `src/main/app.ts`

**Interfaces:**

- The app exposes a factory that accepts an OCR processor and optional test temporary root.
- The processor accepts a generated PDF path and returns OCR text.

- [x] Add `@fastify/multipart` and a `node --import=tsx --test` script using Node's built-in test runner.
- [x] Write HTTP tests for multiple files, upload order, `unrecognized` OCR text, isolated processing failure, missing files, malformed multipart, non-PDF content, and the 10-file limit.
- [x] Run the focused test command and confirm it fails because the route/factory is not implemented.
- [x] Add only the app factory and route contract needed to pass the tests, keeping OCR injected.
- [x] Run the focused test command and confirm it passes.

### Task 2: Enforce upload limits and temporary-file lifecycle

**Files:**

- Create: `src/main/routes/extractRemessa.ts`
- Create: `src/main/routes/extractRemessa.test.ts` (extend)
- Create: `src/main/utils/temporaryDirectory.ts` if a focused helper is needed

**Interfaces:**

- Route accepts repeated `files` parts and processes validated files sequentially.
- Temporary paths are generated independently of client filenames.

- [x] Add a test for per-file size overflow using a test-configurable byte limit, asserting a safe `failed` result and continuation.
- [x] Run the focused test and confirm it fails for the missing size behavior.
- [x] Add streamed upload handling, PDF signature validation, file-count checks, ordered processing, and `finally` cleanup.
- [x] Add tests that request-scoped files are removed after success, size failure, and malformed multipart.
- [x] Run the focused tests and confirm all route boundary behavior passes.

### Task 3: Add the local OCRmyPDF processor

**Files:**

- Create: `src/application/documents/DocumentProcessor.ts`
- Create: `src/infrastructure/documents/OcrmypdfDocumentProcessor.ts`
- Create: `src/infrastructure/documents/OcrmypdfDocumentProcessor.test.ts` if needed for command/error mapping
- Modify: `src/main/app.ts`

**Interfaces:**

- `DocumentProcessor` exposes `process(pdfPath: string, workDirectory: string): Promise<string>`.
- The production implementation writes OCR output PDF and sidecar text only inside the request directory and returns the sidecar contents.

- [x] Write a focused test around an injected subprocess runner for the OCR arguments and sanitized operational failure mapping.
- [x] Run the test and confirm it fails before adding the processor.
- [x] Invoke OCRmyPDF without a shell, with Portuguese and English, `--deskew`, and `--sidecar` paths inside the work directory.
- [x] Ensure subprocess output and temporary paths are never included in client-facing reasons.
- [x] Wire the production processor as the app factory default while retaining test injection.
- [x] Run the processor and HTTP tests.

### Task 4: Verify the issue acceptance criteria

**Files:**

- Modify: `src/main/routes/extractRemessa.test.ts`

- [x] Add a 25 MiB limit boundary test with no personal document content.
- [x] Run all repository tests and typecheck.
- [x] Run lint/format checks available in the project.
- [x] Check the diff and status to confirm the supplied PDFs and unrelated files are not staged or changed.
- [ ] Run real-PDF end-to-end OCR validation. Blocked in this environment because `ocrmypdf` and `tesseract` are not installed; install them with the `por` and `eng` language data to complete this check.
