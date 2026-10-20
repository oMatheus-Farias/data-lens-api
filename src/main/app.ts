import { ApplicationError } from '@application/errors/application/ApplicationError';
import { ErrorCode } from '@application/errors/ErrorCode';
import { HttpError } from '@application/errors/http/HttpError';
import { fastifyCors } from '@fastify/cors';
import { fastify, type FastifyError } from 'fastify';
import { ZodError } from 'zod';

import { registerExtractRemessaRoute } from './routes/extractRemessa';
import { fastifyErrorResponse } from './utils/fastifyErrorResponse';

interface IBuildAppOptions {
  processDocument?: (filePath: string, workDirectory: string) => Promise<string>;
  cleanupTemporaryDirectory?: (directory: string) => Promise<void>;
  temporaryDirectoryRoot?: string;
  maxFileSizeBytes?: number;
}

export function buildApp(options: IBuildAppOptions = {}) {
  const app = fastify();

  app.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  app.get('/', async () => {
    return { status: 'ok' };
  });

  registerExtractRemessaRoute(app, options);

  app.setErrorHandler((error, _, reply) => {
    if (error instanceof ZodError) {
      return fastifyErrorResponse({
        reply,
        statusCode: 400,
        code: ErrorCode.VALIDATION,
        message: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    if ((error as FastifyError).code === 'FST_ERR_VALIDATION') {
      return fastifyErrorResponse({
        reply,
        statusCode: 400,
        code: ErrorCode.VALIDATION,
        message:
          (error as FastifyError).validation?.map((issue) => ({
            field: issue.instancePath.substring(1),
            message: issue.message,
          })) || 'Validation Error',
      });
    }

    if (error instanceof HttpError) {
      return fastifyErrorResponse({
        reply,
        ...error,
      });
    }

    if (error instanceof ApplicationError) {
      return fastifyErrorResponse({
        reply,
        statusCode: error.statusCode ?? 400,
        code: error.code,
        message: error.message,
      });
    }

    if ((error as FastifyError).code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
      return fastifyErrorResponse({
        reply,
        statusCode: 400,
        code: ErrorCode.VALIDATION,
        message: [
          {
            field: 'body',
            message: 'Malformed JSON body',
          },
        ],
      });
    }

    // eslint-disable-next-line no-console
    console.error(error);

    return fastifyErrorResponse({
      reply,
      statusCode: 500,
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Internal Server Error',
    });
  });

  return app;
}

export const app = buildApp();
