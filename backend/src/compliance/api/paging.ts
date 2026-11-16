/**
 * Pagination for list endpoints. A list is paged when the request carries ?page=…
 * (1-based) and optionally ?pageSize=… (10 by default, at most 100); the response is
 * then { items, total, page, pageSize }. Without ?page the endpoint returns the full
 * array as before, so existing callers keep working.
 */
import { z } from 'zod';
import type { Db } from '../core/context';

export interface PageRequest { page: number; pageSize: number }
export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }
/** A whole list without a page request, one page with it. */
export type ListOf<T, P extends PageRequest | null> = P extends PageRequest ? Paged<T> : T[];

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

const schema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

/** Reads ?page and ?pageSize; null when the caller did not ask for a page. */
export function pageFromQuery(query: unknown): PageRequest | null {
  const q = schema.safeParse(query);
  if (!q.success || q.data.page === undefined) return null;
  return { page: q.data.page, pageSize: q.data.pageSize ?? DEFAULT_PAGE_SIZE };
}

/**
 * Runs a list query either whole or as one page. `inner` is the SELECT without ORDER BY;
 * `orderBy` uses the inner query's output column names. The total comes from the same
 * query (window count), so items and total always agree.
 */
export async function listQuery<T = any, P extends PageRequest | null = null>(db: Db, inner: string, orderBy: string, params: unknown[], page: P): Promise<ListOf<T, P>> {
  if (!page) {
    const { rows } = await db.query(`SELECT x.* FROM (${inner}) x ORDER BY ${orderBy}`, params);
    return rows as ListOf<T, P>;
  }
  const p = [...params, page.pageSize, (page.page - 1) * page.pageSize];
  const { rows } = await db.query(
    `SELECT x.*, count(*) OVER() AS __total FROM (${inner}) x ORDER BY ${orderBy} LIMIT $${p.length - 1} OFFSET $${p.length}`, p);
  let total = rows.length ? Number(rows[0].__total) : 0;
  if (!rows.length && page.page > 1) {
    // past the last page: report the real total so the screen can step back
    total = Number((await db.query(`SELECT count(*) AS n FROM (${inner}) x`, params)).rows[0].n);
  }
  return { items: rows.map(({ __total, ...r }) => r) as T[], total, page: page.page, pageSize: page.pageSize } as ListOf<T, P>;
}

/** Applies an async transform to the items of a list or page. */
export async function mapList<T, U, P extends PageRequest | null>(list: ListOf<T, P>, fn: (row: T) => Promise<U> | U): Promise<ListOf<U, P>> {
  if (Array.isArray(list)) return (await Promise.all(list.map(fn))) as ListOf<U, P>;
  const pg = list as Paged<T>;
  return { ...pg, items: await Promise.all(pg.items.map(fn)) } as ListOf<U, P>;
}
