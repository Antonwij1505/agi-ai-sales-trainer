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

  // Body-parser rejections are CLIENT errors. Reporting them as 500 hides a bad
  // request as a server fault, which makes debugging and alerting both wrong.
  const e = err as { type?: string; status?: number; statusCode?: number; message?: string };
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Payload terlalu besar (maksimal 1 MB).' });
    return;
  }
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON tidak valid pada body permintaan.' });
    return;
  }
  if (e?.type === 'charset.unsupported' || e?.type === 'encoding.unsupported') {
    res.status(415).json({ error: 'Encoding body tidak didukung.' });
    return;
  }
  // Multer's own size guard.
  if (e?.message === 'File too large' || (e as { code?: string })?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File audio terlalu besar (maksimal 15 MB).' });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: message });
}
