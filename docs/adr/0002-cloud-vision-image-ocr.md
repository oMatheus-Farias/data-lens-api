# Cloud Vision OCR through page images

For synchronous validation with the available API key, the API renders each page of the uploaded PDF locally and sends the resulting images to Cloud Vision `images:annotate`. The PDF-specific Vision endpoint does not accept API keys, while image annotation does. Page rendering and OCR results remain request-scoped; no Cloud Storage bucket is needed.
