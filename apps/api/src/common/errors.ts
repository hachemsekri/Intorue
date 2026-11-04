import { HttpException } from '@nestjs/common';

/** HTTP error with a stable machine code that clients translate (see packages/i18n errors.*). */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
  ) {
    super({ statusCode: status, code }, status);
  }
}

export const NotFound = () => new AppError(404, 'not_found');
export const Forbidden = () => new AppError(403, 'forbidden');
export const Unauthorized = () => new AppError(401, 'unauthorized');
export const Conflict = (code: string) => new AppError(409, code);
export const BadRequest = (code: string) => new AppError(400, code);
