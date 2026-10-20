# Local processing of scanned documents

To validate extraction from sample romaneios and DANFEs without sending fiscal documents to an external service, the API will run OCRmyPDF with Tesseract locally, using Portuguese and English, and apply layout-based structured extraction to the recognized text. The synchronous flow keeps documents only in temporary files, which are removed after the response. Cloud OCR and persistence are outside this stage.
