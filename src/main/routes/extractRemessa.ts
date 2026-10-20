import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { extractDanfe } from '@application/documents/DanfeExtractor';
import type { IDocumentProcessor } from '@application/documents/DocumentProcessor';
import { ErrorCode } from '@application/errors/ErrorCode';
import fastifyMultipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';

import { OcrmypdfDocumentProcessor } from '../../infrastructure/documents/OcrmypdfDocumentProcessor';

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const PDF_SIGNATURE = Buffer.from('%PDF-');
const MALFORMED_MULTIPART_MESSAGE = 'Malformed multipart request';
const MISSING_FILES_MESSAGE = "At least one PDF file is required in the 'files' field";
const INVALID_PDF_MESSAGE = "The 'files' field must contain PDF files";
const TOO_MANY_FILES_MESSAGE = 'A maximum of 10 PDF files is allowed';
const PROCESSING_FAILURE_REASON = 'Document could not be processed';
const VALIDATION_ERROR = Symbol('validation-error');

interface IExtractRemessaOptions {
  processDocument?: (filePath: string, workDirectory: string) => Promise<string>;
  cleanupTemporaryDirectory?: (directory: string) => Promise<void>;
  temporaryDirectoryRoot?: string;
  maxFileSizeBytes?: number;
}

interface IUploadedFile {
  fileName: string;
  filePath: string;
  failureReason?: string;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
}

function isMultipartValidationError(error: unknown): boolean {
  const code = errorCode(error);

  return (
    code?.startsWith('FST_INVALID_MULTIPART') === true ||
    code?.startsWith('FST_PARTS_LIMIT') === true ||
    code?.startsWith('FST_FILES_LIMIT') === true ||
    code?.startsWith('FST_FIELDS_LIMIT') === true ||
    code?.startsWith('FST_PROTO_VIOLATION') === true ||
    code?.startsWith('FST_MP_PREMATURE_CLOSE') === true ||
    code?.startsWith('FST_INVALID_JSON_FIELD') === true
  );
}

async function hasPdfSignature(filePath: string): Promise<boolean> {
  const file = await open(filePath, 'r');
  const header = Buffer.alloc(PDF_SIGNATURE.length);

  try {
    const { bytesRead } = await file.read(header, 0, header.length, 0);

    return bytesRead === PDF_SIGNATURE.length && header.equals(PDF_SIGNATURE);
  } finally {
    await file.close();
  }
}

export function registerExtractRemessaRoute(
  app: FastifyInstance,
  options: IExtractRemessaOptions = {},
) {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES;
  const documentProcessor: IDocumentProcessor = options.processDocument
    ? { process: options.processDocument }
    : new OcrmypdfDocumentProcessor();
  const cleanupTemporaryDirectory =
    options.cleanupTemporaryDirectory ??
    ((directory: string) => rm(directory, { recursive: true, force: true }));

  app.register(fastifyMultipart, {
    preservePath: true,
    throwFileSizeLimit: false,
    limits: {
      fields: MAX_FILES,
      files: MAX_FILES + 1,
      fileSize: maxFileSizeBytes,
      parts: MAX_FILES * 2 + 1,
    },
  });

  app.post('/remessas/extrair', async (request, reply) => {
    let workDirectory: string | undefined;
    let statusCode = 200;
    let responseBody: unknown;
    let validationMessage = MALFORMED_MULTIPART_MESSAGE;

    try {
      const temporaryDirectoryRoot = options.temporaryDirectoryRoot ?? tmpdir();
      await mkdir(temporaryDirectoryRoot, { recursive: true });
      workDirectory = await mkdtemp(join(temporaryDirectoryRoot, 'data-lens-remessa-'));

      const uploadedFiles: IUploadedFile[] = [];
      let invalidField = false;
      let tooManyFiles = false;

      const parts = request.parts({
        limits: {
          fields: MAX_FILES,
          files: MAX_FILES + 1,
          fileSize: maxFileSizeBytes,
          parts: MAX_FILES * 2 + 1,
        },
      });
      const iterator = parts[Symbol.asyncIterator]();

      while (true) {
        let nextPart: Awaited<ReturnType<typeof iterator.next>>;

        try {
          nextPart = await iterator.next();
        } catch (error) {
          if (errorCode(error) === 'FST_FILES_LIMIT') {
            validationMessage = TOO_MANY_FILES_MESSAGE;
            throw VALIDATION_ERROR;
          }

          if (isMultipartValidationError(error) || errorCode(error) === undefined) {
            throw VALIDATION_ERROR;
          }

          throw error;
        }

        if (nextPart.done) {
          break;
        }

        const part = nextPart.value;

        if (part.type === 'field') {
          invalidField = true;
          continue;
        }

        const fileIndex = uploadedFiles.length + 1;
        const filePath = join(workDirectory, `upload-${fileIndex}.pdf`);
        const fileName = part.filename;
        const uploadedFile: IUploadedFile = { fileName, filePath };
        uploadedFiles.push(uploadedFile);

        try {
          await pipeline(part.file, createWriteStream(filePath, { flags: 'wx' }));
        } catch (error) {
          if (errorCode(error) === 'FST_REQ_FILE_TOO_LARGE') {
            uploadedFile.failureReason = 'File exceeds the maximum size limit';
            continue;
          }

          throw error;
        }

        if (part.fieldname !== 'files') {
          invalidField = true;
        }

        if (fileIndex > MAX_FILES) {
          tooManyFiles = true;
        }

        if (
          extname(basename(fileName)).toLowerCase() !== '.pdf' ||
          !(await hasPdfSignature(filePath))
        ) {
          invalidField = true;
        }

        if (part.file.truncated) {
          uploadedFile.failureReason = 'File exceeds the maximum size limit';
        }
      }

      if (uploadedFiles.length === 0) {
        validationMessage = MISSING_FILES_MESSAGE;
        throw VALIDATION_ERROR;
      }

      if (tooManyFiles) {
        validationMessage = TOO_MANY_FILES_MESSAGE;
        throw VALIDATION_ERROR;
      }

      if (invalidField) {
        validationMessage = INVALID_PDF_MESSAGE;
        throw VALIDATION_ERROR;
      }

      const documents = [];

      for (const file of uploadedFiles) {
        if (file.failureReason) {
          documents.push({
            fileName: file.fileName,
            status: 'failed',
            reason: file.failureReason,
          });
          continue;
        }

        try {
          const ocrText = await documentProcessor.process(file.filePath, workDirectory);
          const extraction = extractDanfe(ocrText);

          documents.push(
            extraction
              ? {
                  fileName: file.fileName,
                  documentType: extraction.documentType,
                  status: 'success',
                  fields: extraction.fields,
                  ocrText,
                  warnings: extraction.warnings,
                }
              : {
                  fileName: file.fileName,
                  status: 'unrecognized',
                  ocrText,
                },
          );
        } catch {
          documents.push({
            fileName: file.fileName,
            status: 'failed',
            reason: PROCESSING_FAILURE_REASON,
          });
        }
      }

      responseBody = { documents };
    } catch (error) {
      if (error === VALIDATION_ERROR || isMultipartValidationError(error)) {
        statusCode = 400;
        responseBody = {
          error: {
            code: ErrorCode.VALIDATION,
            message: validationMessage,
          },
        };
      } else {
        statusCode = 500;
        responseBody = {
          error: {
            code: ErrorCode.INTERNAL_SERVER_ERROR,
            message: 'Internal Server Error',
          },
        };
      }
    } finally {
      if (workDirectory) {
        try {
          await cleanupTemporaryDirectory(workDirectory);
        } catch {
          statusCode = 500;
          responseBody = {
            error: {
              code: ErrorCode.INTERNAL_SERVER_ERROR,
              message: 'Internal Server Error',
            },
          };
        }
      }
    }

    return reply.status(statusCode).send(responseBody);
  });
}
