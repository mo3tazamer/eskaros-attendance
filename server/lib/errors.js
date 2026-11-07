/**
 * An error that is safe to show to the client. Anything else is treated as an
 * internal error and hidden behind a generic message.
 */
export class AppError extends Error {
  constructor(message, status = 400, code = 'bad_request') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new AppError(message, 400, 'bad_request');
export const unauthorized = (message = 'يجب تسجيل الدخول أولًا') =>
  new AppError(message, 401, 'unauthorized');
export const forbidden = (message = 'لا تملك صلاحية لهذا الإجراء') =>
  new AppError(message, 403, 'forbidden');
export const notFound = (message = 'العنصر غير موجود') =>
  new AppError(message, 404, 'not_found');
export const conflict = (message) => new AppError(message, 409, 'conflict');
