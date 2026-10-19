import type { ErrorCode } from '@application/errors/ErrorCode';
import type { FastifyReply } from 'fastify';

interface IFastifyErrorResponseParams {
  reply: FastifyReply;
  statusCode: number;
  code: ErrorCode;
  message: any;
}

export function fastifyErrorResponse({
  reply,
  statusCode,
  code,
  message,
}: IFastifyErrorResponseParams) {
  return reply?.status(statusCode).send({
    error: {
      code,
      message,
    },
  });
}
