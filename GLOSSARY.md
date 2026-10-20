# Data Lens API

This context receives batches of scanned documents and returns recognized data for review.

## Documents

**Batch**:
A set of PDFs submitted together for processing and returned in a single response.

**Romaneio**:
A document that links a shipment to boxes, packages, and invoices.
_Avoid_: shipping list

**DANFE**:
The printed auxiliary document for a Brazilian electronic invoice (NF-e), containing tax identification, parties, amounts, and products.
_Avoid_: invoice (when referring to the auxiliary document)

**Scanned document**:
A document received as a PDF whose page contains an image and requires optical character recognition to be read.
_Avoid_: native PDF

**OCR text**:
Text recognized from the pages of a scanned document.
_Avoid_: original text
