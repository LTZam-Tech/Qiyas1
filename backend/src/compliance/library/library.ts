/**
 * Regulations library: laws, decisions, circulars, DGA controls, policies and guides,
 * linked to the standards that cite them or share their topic.
 *
 * Three origins:
 *   catalogue — shipped metadata (dga-library.json); the release never ships the documents,
 *               each client uploads its own copy of the file
 *   citation  — created from the "related laws, decisions and circulars" of every imported
 *               standard, so any framework version (and any future one) is covered
 *   client    — documents the client adds itself
 */
import path from 'path';
import { z } from 'zod';
import { ComplianceError, Db, ServiceContext, audit, mustOne, requirePermission } from '../core/context';
import { EvidenceDeps, fileRules } from '../evidence/evidence';
import { sha256Hex } from '../evidence/storage';
import catalogueFile from './dga-library.json';
import { ListOf, PageRequest, listQuery } from '../api/paging';
import { FRAMEWORK_LIMITS } from '../framework/frameworkFile';

export const LIBRARY_KINDS = ['law', 'regulation', 'royal_decree', 'royal_order', 'decision', 'circular', 'directive',
  'controls', 'policy', 'guide', 'framework', 'user_guide', 'report', 'presentation', 'other'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

const text = z.object({ ar: z.string().trim().min(1), en: z.string().trim().min(1), ur: z.string().trim().min(1).optional() });
const catalogueSchema = z.object({
  format: z.literal('qiyas-library/1'),
  documents: z.array(z.object({
    code: z.string().regex(/^[a-z0-9.-]+$/),
    kind: z.enum(LIBRARY_KINDS),
    issuer: z.object({ ar: z.string(), en: z.string() }).optional(),
    version: z.string().optional(),
    issuedOn: z.string().optional(),
    title: text,
    description: z.object({ ar: z.string(), en: z.string() }).partial().optional(),
    /** Framework version → axis or standard codes on the same topic. */
    related: z.record(z.string(), z.array(z.string())).optional(),
    /** Phrases that name the document; a standard whose text contains one cites it. */
    mentions: z.array(z.string().min(4)).optional(),
    /** Topic phrases; a standard whose text contains one is related. */
    topics: z.array(z.string().min(4)).optional(),
  })),
});
export type LibraryCatalogue = z.infer<typeof catalogueSchema>;
export const SHIPPED_CATALOGUE: LibraryCatalogue = catalogueSchema.parse(catalogueFile);

// ------------------------------------------------------------------ citations

export interface Citation {
  code: string;
  kind: LibraryKind;
  titleAr: string;
  titleEn: string;
  issuedOn: string;
  /** The clause or paragraph cited, as written. */
  detail: string | null;
}

/** Longest reference text parseCitation reads (same as FRAMEWORK_LIMITS.reference). */
export const MAX_CITATION_CHARS = 2000;

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));

function citationKind(prefix: string): LibraryKind {
  if (/^تعميم/.test(prefix)) return 'circular';
  if (/^قرار/.test(prefix)) return 'decision';
  if (/^الأمر السامي|^أمر سامي/.test(prefix)) return 'royal_order';
  if (/^المرسوم الملكي|^مرسوم ملكي/.test(prefix)) return 'royal_decree';
  if (/^نظام/.test(prefix)) return 'law';
  if (/^توجيه/.test(prefix)) return 'directive';
  return 'other';
}

/** Small, stable hash for codes (FNV-1a). */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

/**
 * Reads one entry of a standard's "related laws, decisions and circulars", e.g.
 * "تعميم الديوان الملكي رقم (6262) وتاريخ 26/1/1445هـ، البند (19)."
 * Returns null when the entry names no numbered instrument.
 */
export function parseCitation(ref: { ar?: string; en?: string }): Citation | null {
  // C14: no real reference comes close; longer text is never parsed (it also neutralises rows already stored)
  if ((ref.ar ?? '').length > MAX_CITATION_CHARS || (ref.en ?? '').length > MAX_CITATION_CHARS) return null;
  const ar = westernDigits((ref.ar ?? '').replace(/\s+/g, ' ').trim());
  // whitespace is collapsed above, so \s? matches what \s* did; the prefix and the number are bounded (C14)
  const m = ar.match(/^(.{0,300}?)\s?(?:الصادرة?\s)?(?:رقم|برقم|رقـم)\s?\(([^)]{1,60})\)\s?(?:و?بتاريخ|وتاريخ|وتاريـخ)\s?(\d{1,2})\s?\/\s?(\d{1,2})\s?\/\s?(\d{4})\s?هـ?/);
  if (!m) return null;
  const prefix = m[1].replace(/\s+الصادر(ة)?$/, '').trim();
  if (!prefix) return null;
  const number = m[2].replace(/\s+/g, ' ').trim();
  const date = `${Number(m[3])}/${Number(m[4])}/${m[5]}هـ`;
  const kind = citationKind(prefix);
  const rest = trimTrailingDotsAndSpaces(ar.slice(m[0].length).replace(/^[\s،,.]+/, ''));
  const en = (ref.en ?? '').replace(/\s+/g, ' ').trim();
  const em = en.match(/^(.{0,300}?\bNo\.\s?\([^)]{1,60}\)\s?dated\s?[\d/]+\s?H?)/i);
  return {
    code: `cite-${kind}-${number.replace(/[^0-9A-Za-zء-ي]+/g, '-')}-${m[5]}-${shortHash(prefix.replace(/[\sً-ْ]/g, ''))}`,
    kind,
    titleAr: `${prefix} رقم (${number}) وتاريخ ${date}`,
    titleEn: em ? em[1].replace(/\s*H$/i, 'H') : `${prefix} No. (${number}) dated ${date}`,
    issuedOn: date,
    detail: rest || null,
  };
}

/** Same as .replace(/[.\s]+$/, '') without the regex, which is quadratic on a long run of dots followed by a letter. */
function trimTrailingDotsAndSpaces(s: string): string {
  let end = s.length;
  while (end > 0 && (s[end - 1] === '.' || /\s/.test(s[end - 1]))) end -= 1;
  return s.slice(0, end);
}

// ------------------------------------------------------------------ sync

interface StandardRow { id: string; code: string; axis_code: string; version: string; references: Array<{ ar?: string; en?: string }> | null; body: string }

/**
 * Brings the catalogue and citation documents and their links in line with the
 * shipped catalogue and the imported frameworks. Idempotent; never touches
 * uploaded files or client documents. Runs at startup and after a framework import.
 */
export async function syncLibrary(db: Db, catalogue: LibraryCatalogue = SHIPPED_CATALOGUE): Promise<{ documents: number; links: number }> {
  const upsert = async (d: { code: string; kind: string; origin: string; issuer: string | null; version: string | null; issuedOn: string | null; ar: string; en: string; ur: string | null; description: unknown }) => {
    const row = await mustOne(db, 'library document', `INSERT INTO qiyas.library_documents (code, kind, origin, issuer, version, issued_on, title_ar, title_en, title_ur, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (code) DO UPDATE SET kind = EXCLUDED.kind, issuer = EXCLUDED.issuer, version = EXCLUDED.version, issued_on = EXCLUDED.issued_on,
         title_ar = EXCLUDED.title_ar, title_en = EXCLUDED.title_en, title_ur = COALESCE(EXCLUDED.title_ur, qiyas.library_documents.title_ur),
         description = EXCLUDED.description, updated_at = NOW()
       WHERE qiyas.library_documents.origin = EXCLUDED.origin
       RETURNING id`,
    [d.code, d.kind, d.origin, d.issuer, d.version, d.issuedOn, d.ar, d.en, d.ur, d.description ? JSON.stringify(d.description) : null]);
    return row.id as string;
  };

  const standards = (await db.query(
    `SELECT s.id, s.code, a.code AS axis_code, fv.version, s."references",
            concat_ws(' ', s.title_ar, s.goal->>'ar',
              (SELECT string_agg(r.text_ar, ' ') FROM qiyas.requirements r WHERE r.standard_id = s.id),
              (SELECT string_agg(e.description_ar, ' ') FROM qiyas.proof_items e WHERE e.standard_id = s.id),
              s."references"::text) AS body
       FROM qiyas.standards s JOIN qiyas.axes a ON a.id = s.axis_id JOIN qiyas.perspectives p ON p.id = a.perspective_id
       JOIN qiyas.framework_versions fv ON fv.id = p.framework_version_id`)).rows as StandardRow[];

  const links = new Map<string, { documentId: string; standardId: string; relation: 'cited' | 'related'; detail: string | null }>();
  const addLink = (documentId: string, standardId: string, relation: 'cited' | 'related', detail: string | null = null) => {
    const key = `${documentId}|${standardId}`;
    const prev = links.get(key);
    if (!prev || (prev.relation === 'related' && relation === 'cited')) links.set(key, { documentId, standardId, relation, detail });
    else if (prev.relation === 'cited' && relation === 'cited' && detail && prev.detail !== detail) prev.detail = [prev.detail, detail].filter(Boolean).join('؛ ');
  };

  for (const d of catalogue.documents) {
    const documentId = await upsert({ code: d.code, kind: d.kind, origin: 'catalogue', issuer: d.issuer ? `${d.issuer.ar} | ${d.issuer.en}` : null,
      version: d.version ?? null, issuedOn: d.issuedOn ?? null, ar: d.title.ar, en: d.title.en, ur: d.title.ur ?? null, description: d.description ?? null });
    for (const s of standards) {
      const related = d.related?.[s.version] ?? [];
      if (related.includes(s.code) || related.includes(s.axis_code)) addLink(documentId, s.id, 'related');
      if (d.mentions?.some((m) => s.body.includes(m))) addLink(documentId, s.id, 'cited');
      else if (d.topics?.some((m) => s.body.includes(m))) addLink(documentId, s.id, 'related');
    }
  }

  const citationIds = new Map<string, string>();
  for (const s of standards) {
    // C14: at most referencesPerStandard references per standard, also for rows stored before the file caps
    const refs = Array.isArray(s.references) ? s.references.slice(0, FRAMEWORK_LIMITS.referencesPerStandard) : [];
    for (const ref of refs) {
      const c = parseCitation(ref);
      if (!c) continue;
      let documentId = citationIds.get(c.code);
      if (!documentId) {
        documentId = await upsert({ code: c.code, kind: c.kind, origin: 'citation', issuer: null, version: null, issuedOn: c.issuedOn,
          ar: c.titleAr, en: c.titleEn, ur: null, description: null });
        citationIds.set(c.code, documentId);
      }
      addLink(documentId, s.id, 'cited', c.detail);
    }
  }

  await db.query(`DELETE FROM qiyas.library_document_standards
     WHERE document_id IN (SELECT id FROM qiyas.library_documents WHERE origin IN ('catalogue', 'citation'))`);
  for (const l of links.values()) {
    await db.query('INSERT INTO qiyas.library_document_standards (document_id, standard_id, relation, detail) VALUES ($1, $2, $3, $4)',
      [l.documentId, l.standardId, l.relation, l.detail]);
  }
  return { documents: catalogue.documents.length + citationIds.size, links: links.size };
}

// ------------------------------------------------------------------ read

export interface LibraryQuery {
  text?: string;
  kind?: LibraryKind;
  standardId?: string;
  frameworkVersionId?: string;
}

export async function listLibrary<P extends PageRequest | null = null>(ctx: ServiceContext, q: LibraryQuery = {}, page: P = null as P): Promise<ListOf<any, P>> {
  requirePermission(ctx, 'library.view');
  return listQuery(ctx.db,
    `SELECT d.id, d.code, d.kind, d.origin, d.issuer, d.version, d.issued_on, d.title_ar, d.title_en, d.title_ur, d.description,
            d.storage_key IS NOT NULL AS has_file, d.original_filename, d.size_bytes, d.external_url,
            COALESCE(json_agg(json_build_object('standardId', s.id, 'code', s.code, 'relation', l.relation, 'detail', l.detail, 'version', fv.version)
                       ORDER BY fv.version DESC, s.code) FILTER (WHERE s.id IS NOT NULL AND ($4::uuid IS NULL OR fv.id = $4)), '[]') AS standards
       FROM qiyas.library_documents d
       LEFT JOIN qiyas.library_document_standards l ON l.document_id = d.id
       LEFT JOIN qiyas.standards s ON s.id = l.standard_id
       LEFT JOIN qiyas.axes a ON a.id = s.axis_id LEFT JOIN qiyas.perspectives p ON p.id = a.perspective_id
       LEFT JOIN qiyas.framework_versions fv ON fv.id = p.framework_version_id
      WHERE d.is_active
        AND ($1::text IS NULL OR d.title_ar ILIKE '%' || $1 || '%' OR d.title_en ILIKE '%' || $1 || '%' OR d.issued_on ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR d.kind = $2)
        AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM qiyas.library_document_standards x WHERE x.document_id = d.id AND x.standard_id = $3))
      GROUP BY d.id`,
    `CASE origin WHEN 'client' THEN 0 WHEN 'catalogue' THEN 1 ELSE 2 END,
     array_position(ARRAY['law','regulation','royal_decree','royal_order','decision','controls','policy','framework','guide','circular','directive','user_guide','report','presentation','other']::text[], kind),
     title_ar, id`,
    [q.text?.trim() || null, q.kind ?? null, q.standardId ?? null, q.frameworkVersionId ?? null], page);
}

// ------------------------------------------------------------------ write

const LIBRARY_FILE_TYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

/** Attaches the client's copy of a document (replaces any earlier copy). */
export async function uploadLibraryFile(ctx: ServiceContext, deps: EvidenceDeps, documentId: string, file: { content: Buffer; filename: string; mimeType?: string }) {
  requirePermission(ctx, 'library.manage');
  const doc = await mustOne(ctx.db, 'library document', 'SELECT id, code FROM qiyas.library_documents WHERE id = $1 FOR UPDATE', [documentId]);
  const ext = path.extname(file.filename).slice(1).toLowerCase();
  if (!LIBRARY_FILE_TYPES.includes(ext)) throw new ComplianceError('validation', `Library files must be one of: ${LIBRARY_FILE_TYPES.join(', ')}`);
  const rules = await fileRules(ctx.db);
  if (file.content.length === 0) throw new ComplianceError('validation', 'The file is empty');
  if (file.content.length > rules.maxFileMb * 1024 * 1024) throw new ComplianceError('validation', `Files must be at most ${rules.maxFileMb} MB`);
  const scan = await deps.scanner.scan(file.content, file.filename);
  if (scan !== 'clean') throw new ComplianceError('conflict', scan === 'infected' ? 'The virus scan rejected this file' : 'The virus scan failed; try again');
  const stored = await deps.storage.put(file.content);
  await ctx.db.query(`UPDATE qiyas.library_documents SET storage_key = $2, sha256 = $3, size_bytes = $4, mime_type = $5, original_filename = $6,
      file_uploaded_by = $7, file_uploaded_at = $8, updated_at = $8 WHERE id = $1`,
  [documentId, stored.key, sha256Hex(file.content), file.content.length, file.mimeType ?? null, file.filename, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'library.file_uploaded', entityType: 'library_document', entityId: documentId, after: { code: doc.code, filename: file.filename, size: file.content.length } });
  return { documentId, sizeBytes: file.content.length };
}

export async function libraryFile(ctx: ServiceContext, documentId: string) {
  requirePermission(ctx, 'library.view');
  const d = await mustOne(ctx.db, 'library document', 'SELECT storage_key, original_filename, mime_type FROM qiyas.library_documents WHERE id = $1 AND is_active', [documentId]);
  if (!d.storage_key) throw new ComplianceError('not_found', 'No file has been uploaded for this document yet');
  return { key: d.storage_key as string, filename: (d.original_filename as string) ?? 'document.pdf', mimeType: d.mime_type as string | null };
}

export interface NewLibraryDocument {
  kind: LibraryKind;
  titleAr: string;
  titleEn: string;
  issuer?: string;
  version?: string;
  issuedOn?: string;
  externalUrl?: string;
  /** Standard codes of the given framework version. */
  standardCodes?: string[];
  frameworkVersionId?: string;
}

/** Standard codes one client document may be linked to in one request. */
export const MAX_LINKED_STANDARD_CODES = 500;

export async function addLibraryDocument(ctx: ServiceContext, input: NewLibraryDocument): Promise<string> {
  requirePermission(ctx, 'library.manage');
  if (input.externalUrl && !/^https?:\/\//i.test(input.externalUrl)) throw new ComplianceError('validation', 'Links must start with http:// or https://');
  const code = `client-${shortHash(`${input.titleAr}|${ctx.now.toISOString()}`)}`;
  const d = await mustOne(ctx.db, 'library document', `INSERT INTO qiyas.library_documents
      (code, kind, origin, issuer, version, issued_on, title_ar, title_en, external_url, created_by, created_at, updated_at)
     VALUES ($1, $2, 'client', $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
  [code, input.kind, input.issuer ?? null, input.version ?? null, input.issuedOn ?? null, input.titleAr.trim(), input.titleEn.trim(), input.externalUrl ?? null, ctx.actor.userId, ctx.now]);
  if (input.standardCodes?.length) {
    if (input.standardCodes.length > MAX_LINKED_STANDARD_CODES) throw new ComplianceError('validation', `Link at most ${MAX_LINKED_STANDARD_CODES} standards at once`);
    if (!input.frameworkVersionId) throw new ComplianceError('validation', 'Choose the framework version of the standard codes');
    const { rows } = await ctx.db.query(`SELECT s.id, s.code FROM qiyas.standards s JOIN qiyas.axes a ON a.id = s.axis_id
       JOIN qiyas.perspectives p ON p.id = a.perspective_id WHERE p.framework_version_id = $1 AND s.code = ANY($2)`, [input.frameworkVersionId, input.standardCodes]);
    const missing = input.standardCodes.filter((c) => !rows.some((r) => r.code === c));
    if (missing.length) throw new ComplianceError('validation', `Unknown standard codes: ${missing.join(', ')}`);
    for (const r of rows) await ctx.db.query(`INSERT INTO qiyas.library_document_standards (document_id, standard_id, relation) VALUES ($1, $2, 'related')`, [d.id, r.id]);
  }
  await audit(ctx, { action: 'library.document_added', entityType: 'library_document', entityId: d.id, after: input });
  return d.id;
}
