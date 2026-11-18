/**
 * HTTP plumbing for the Phase 1 API (/api/v2).
 *
 * Every request runs in one database transaction: the business change and its
 * audit record commit together or not at all (BR-AUD-06). Errors are mapped to
 * clear HTTP responses; database internals are never leaked.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, ZodType } from 'zod';
import { ComplianceError, Db, ServiceContext, buildContext } from '../core/context';

export interface PoolLike {
  connect(): Promise<Db & { release(err?: unknown): void }>;
}

export interface AuthedRequest extends Request {
  user?: { id: string };
}

export interface ApiOptions {
  pool: PoolLike;
  clock?: () => Date;
}

export interface ErrorBody {
  success: false;
  error: { code: string; message: string; issues?: Array<{ path: string; message: string }> };
}

export function toHttpError(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof ComplianceError) return { status: err.status, body: { success: false, error: { code: err.code, message: err.message } } };
  if (err instanceof ZodError) {
    return {
      status: 422,
      body: { success: false, error: { code: 'validation', message: 'The request is not valid', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } },
    };
  }
  const pg = err as { code?: string; message?: string };
  if (pg?.code === '23505') return { status: 409, body: { success: false, error: { code: 'conflict', message: 'This already exists' } } };
  // C5: migration 007 guard_cycle_writable (closed or archived measurement cycle)
  if (pg?.code === '55000') return { status: 409, body: { success: false, error: { code: 'conflict', message: 'The cycle is closed; ask the administrator to reopen it' } } };
  if (pg?.code === '23514' || pg?.code === '23503' || pg?.code === '22P02') {
    return { status: 422, body: { success: false, error: { code: 'validation', message: 'The request breaks a data rule' } } };
  }
  return { status: 500, body: { success: false, error: { code: 'internal', message: 'Something went wrong' } } };
}

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

/** Returned by a handler to send a file instead of JSON. */
export class FileResponse {
  constructor(public readonly content: Buffer, public readonly filename: string, public readonly mimeType?: string | null) {}
}

export type Handler = (ctx: ServiceContext, req: AuthedRequest) => Promise<unknown>;

/** Wraps a handler in a transaction with the caller's ServiceContext. */
export function route(opts: ApiOptions, handler: Handler, successStatus = 200): RequestHandler {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: { code: 'unauthenticated', message: 'Sign in first' } });
      return;
    }
    let client: Awaited<ReturnType<PoolLike['connect']>> | undefined;
    try {
      client = await opts.pool.connect();
      await client.query('BEGIN');
      const ctx = await buildContext(client, req.user.id, opts.clock?.() ?? new Date());
      const data = await handler(ctx, req);
      await client.query('COMMIT');
      if (res.headersSent) return;
      if (data instanceof FileResponse) {
        res.status(200)
          .type(data.mimeType || 'application/octet-stream')
          .set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(data.filename)}`)
          .set('X-Content-Type-Options', 'nosniff')
          .send(data.content);
        return;
      }
      res.status(successStatus).json({ success: true, data: data ?? null });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      const { status, body } = toHttpError(err);
      if (status === 500) next(err);
      else res.status(status).json(body);
    } finally {
      client?.release();
    }
  };
}
