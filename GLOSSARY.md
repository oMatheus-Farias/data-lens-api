# Data Lens API

This context receives batches of scanned documents and returns recognized data for review.

## Documents

**Batch**:
A single scanned PDF submitted for processing, with each page treated as a document unit and returned in one response.

**Romaneio**:
A document headed “New Shipping List” that identifies a shipment and lists its fiscal notes, weights, and volumes. It relates to DANFEs through the invoice number in each fiscal note row.
_Avoid_: shipping list (as a generic domain term; “New Shipping List” is the printed document title)

**DANFE**:
The printed auxiliary document for a Brazilian electronic invoice (NF-e), containing tax identification, parties, amounts, and products.
_Avoid_: invoice (when referring to the auxiliary document)

**Scanned document**:
A PDF or image that requires optical character recognition to be read.
_Avoid_: native PDF

**OCR text**:
Text recognized from a scanned document.
_Avoid_: original text
