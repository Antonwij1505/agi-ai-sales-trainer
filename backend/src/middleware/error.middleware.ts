import type { Request, Response, NextFunction } from 'express';

/** HTTP error carrying a status code, serialised by `errorHandler`. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, `Not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: message });
}
