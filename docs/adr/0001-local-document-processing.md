# Local processing of scanned documents

The API processes scanned PDFs with local OCRmyPDF and images with Tesseract.js, using Portuguese and English language data. Layout-specific parsers extract structured fields from the recognized text without translating document values. The synchronous flow stores uploads and intermediate files only in request-scoped temporary directories and removes them after processing. External OCR services and persistent document storage are out of scope.
