import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ApiErrorDto } from '@winou/shared';
import type { FastifyReply } from 'fastify';
import { AppError } from './errors';

const STATUS_CODES: Record<number, string> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
};

/** Uniform error body. Never leaks stack traces or SQL details. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let body: ApiErrorDto;

    if (isZodError(exception)) {
      body = {
        statusCode: 400,
        error: 'Bad Request',
        code: 'validation',
        issues: exception.issues.map((i) => ({ path: i.path.join('.'), code: i.message })),
      };
    } else if (exception instanceof AppError) {
      body = { statusCode: exception.getStatus(), error: exception.name, code: exception.code };
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      body = { statusCode: status, error: exception.name, code: STATUS_CODES[status] ?? 'error' };
    } else if (isFastifyError(exception)) {
      const status = exception.statusCode;
      body = { statusCode: status, error: 'Request Error', code: STATUS_CODES[status] ?? 'bad_request' };
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      body = { statusCode: 500, error: 'Internal Server Error', code: 'generic' };
    }
    void reply.status(body.statusCode).send(body);
  }
}

function isFastifyError(e: unknown): e is { statusCode: number } {
  return typeof e === 'object' && e !== null && typeof (e as any).statusCode === 'number' && (e as any).statusCode < 500;
}

/** Duck-typed so it works even if several copies of zod are installed. */
function isZodError(e: unknown): e is { issues: { path: (string | number)[]; message: string }[] } {
  return typeof e === 'object' && e !== null && (e as any).name === 'ZodError' && Array.isArray((e as any).issues);
}
