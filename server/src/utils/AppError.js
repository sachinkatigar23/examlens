// An error we throw on purpose; the error handler turns it into { error: { code, message } }.
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
