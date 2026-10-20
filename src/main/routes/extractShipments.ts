import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { extractRomaneio } from '@application/documents/RomaneioExtractor';
import { ErrorCode } from '@application/errors/ErrorCode';
import fastifyMultipart from '@fastify/multipart';
import { env } from '@shared/config/env';
import type { FastifyInstance } from 'fastify';

import {
  CloudVisionDocumentProcessor,
  type IOcrPage,
} from '../../infrastructure/documents/CloudVisionDocumentProcessor';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 1;
const PDF_SIGNATURE = Buffer.from('%PDF-');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MALFORMED_MULTIPART_MESSAGE = 'Malformed multipart request';
const MISSING_FILES_MESSAGE = "Exactly one PDF is required in the 'file' field";
const INVALID_FILE_MESSAGE = "The 'file' field must contain one PDF file";
const TOO_MANY_FILES_MESSAGE = "Exactly one PDF is required in the 'file' field";
const PROCESSING_FAILURE_REASON = 'Document could not be processed';
const VALIDATION_ERROR = Symbol('validation-error');

interface IExtractShipmentsOptions {
  processDocument?: (filePath: string, workDirectory: string) => Promise<string | IOcrPage[]>;
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

async function hasSupportedSignature(filePath: string, fileExtension: string): Promise<boolean> {
  const file = await open(filePath, 'r');
  const signature =
    fileExtension === '.pdf'
      ? PDF_SIGNATURE
      : fileExtension === '.png'
        ? PNG_SIGNATURE
        : Buffer.from([0xff, 0xd8, 0xff]);
  const header = Buffer.alloc(signature.length);

  try {
    const { bytesRead } = await file.read(header, 0, header.length, 0);

    return bytesRead === signature.length && header.equals(signature);
  } finally {
    await file.close();
  }
}

export function registerExtractShipmentsRoute(
  app: FastifyInstance,
  options: IExtractShipmentsOptions = {},
) {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES;
  const documentProcessor = options.processDocument
    ? { process: options.processDocument }
    : new CloudVisionDocumentProcessor(env.GOOGLE_API_CLOUD_VISION_SECRET);
  const cleanupTemporaryDirectory =
    options.cleanupTemporaryDirectory ??
    ((directory: string) => rm(directory, { recursive: true, force: true }));

  app.register(fastifyMultipart, {
    preservePath: true,
    throwFileSizeLimit: false,
    limits: {
      fields: 1,
      files: 2,
      fileSize: maxFileSizeBytes,
      parts: 3,
    },
  });

  app.post('/shipments/extract', async (request, reply) => {
    let workDirectory: string | undefined;
    let statusCode = 200;
    let responseBody: unknown;
    let validationMessage = MALFORMED_MULTIPART_MESSAGE;

    try {
      const temporaryDirectoryRoot = options.temporaryDirectoryRoot ?? tmpdir();
      await mkdir(temporaryDirectoryRoot, { recursive: true });
      workDirectory = await mkdtemp(join(temporaryDirectoryRoot, 'data-lens-shipment-'));

      const uploadedFiles: IUploadedFile[] = [];
      let invalidField = false;
      let tooManyFiles = false;

      const parts = request.parts({
        limits: {
          fields: 1,
          files: 2,
          fileSize: maxFileSizeBytes,
          parts: 3,
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
        const fileName = part.filename;
        const fileExtension = extname(basename(fileName)).toLowerCase();
        const filePath = join(workDirectory, `upload-${fileIndex}${fileExtension}`);
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

        if (part.fieldname !== 'file') {
          invalidField = true;
        }

        if (fileIndex > MAX_FILES) {
          tooManyFiles = true;
        }

        if (fileExtension !== '.pdf' || !(await hasSupportedSignature(filePath, fileExtension))) {
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
        validationMessage = INVALID_FILE_MESSAGE;
        throw VALIDATION_ERROR;
      }

      const docExtracts = [];

      for (const file of uploadedFiles) {
        if (file.failureReason) {
          docExtracts.push({
            type: 'failed',
            fileName: file.fileName,
            status: 'failed',
            reason: file.failureReason,
          });
          continue;
        }

        try {
          const processingResult = await documentProcessor.process(file.filePath, workDirectory);
          const pages =
            typeof processingResult === 'string'
              ? [{ pageNumber: 1, ocrText: processingResult }]
              : processingResult;
          docExtracts.push(
            ...pages.map(
              (page) =>
                extractRomaneio(page.ocrText, page.pageNumber) ?? {
                  type: 'unrecognized',
                  pageNumber: page.pageNumber,
                  ocrText: page.ocrText,
                },
            ),
          );
        } catch {
          docExtracts.push({
            type: 'failed',
            fileName: file.fileName,
            status: 'failed',
            reason: PROCESSING_FAILURE_REASON,
          });
        }
      }

      responseBody = { docExtracts };
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
