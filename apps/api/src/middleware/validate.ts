import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../domain/errors/app-error.js';

export function validateBody<T extends ZodTypeAny>(schema: T) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      throw AppError.validation('Invalid request body', result.error.flatten());
    }
    request.body = result.data;
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      throw AppError.validation('Invalid query parameters', result.error.flatten());
    }
    (request as { query: unknown }).query = result.data;
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      throw AppError.validation('Invalid path parameters', result.error.flatten());
    }
    (request as { params: unknown }).params = result.data;
  };
}
