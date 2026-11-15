/**
 * Folder import: brings an evidence folder (as organized for the DGA portal)
 * into a cycle's bank in one go (BNK-7).
 *
 * Every file becomes a bank artifact owned by the importer. The requirement is
 * read from the path: a "5.3.2.7" in a folder or file name is requirement R7 of
 * standard 5.3.2; a bare "5.3.2" means the standard as a whole. The importer
 * never links anything: each file gets SUGGESTIONS that the task owner
 * confirms, and the result is reviewed like any upload (by another consultant
 * than the importer, D9). Names may follow another framework version; they are
 * then translated through the crosswalk.
 */
import path from 'path';
import { ComplianceError, Db, ServiceContext, audit, mustOne, one, requirePermission } from '../core/context';
import { targetsInCycle } from '../framework/crosswalk';
import { EvidenceDeps, fileRules } from './evidence';
import { sha256Hex } from './storage';
import { addSuggestions } from './suggestions';

const IGNORED_NAMES = new Set(['thumbs.db', 'desktop.ini', '.ds_store']);
const IGNORED_EXT = new Set(['lnk', 'tmp', 'ini', 'db', 'url']);

/** Files the import never takes (system and shortcut files). */
export function isIgnoredFile(relativePath: string): boolean {
  const base = path.posix.basename(relativePath.replace(/\\/g, '/')).toLowerCase();
  return base.startsWith('.') || base.startsWith('~$') || IGNORED_NAMES.has(base) || IGNORED_EXT.has(path.extname(base).slice(1));
}

export interface DetectedCode {
  code: string;
  level: 'requirement' | 'standard' | 'axis';
}

/**
 * The most specific code in a path. Later segments win over earlier ones, and
 * within a segment a requirement code (4 numbers) wins over a standard code (3).
 */
export function detectCode(relativePath: string): DetectedCode | null {
  const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  const last = segments.length - 1;
  let best: DetectedCode | null = null;
  const rank = { axis: 1, standard: 2, requirement: 3 } as const;
  segments.forEach((seg, i) => {
    // strip up to two extensions ("5.6.1.1.pptx.pdf"); an extension starts with a letter, so code digits stay
    const name = i === last ? seg.replace(/(\.[A-Za-z][A-Za-z0-9]{0,4}){1,2}$/, '') : seg;
    for (const m of name.matchAll(/(?<![\d.])(\d{1,2}(?:\.\d{1,2}){1,3})(?![\d.]*\d)/g)) {
      const parts = m[1].split('.');
      // DGA codes never contain 0 or a leading zero; this keeps out times ("10.09.40") and versions ("V2.0")
      if (parts.some((p) => p.startsWith('0'))) continue;
      const level = parts.length >= 4 ? 'requirement' : parts.length === 3 ? 'standard' : 'axis';
      const code = parts.slice(0, 4).join('.');
      if (!best || rank[level] >= rank[best.level]) best = { code, level };
    }
  });
  return best;
}

function kindFor(ext: string): 'file' | 'screenshot' | 'data_export' {
  if (['png', 'jpg', 'jpeg'].includes(ext)) return 'screenshot';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'data_export';
  return 'file';
}

export async function startImport(ctx: ServiceContext, cycleId: string, input: { label: string; codesFrameworkVersionId?: string }): Promise<string> {
  requirePermission(ctx, 'bank.import');
  const cycle = await mustOne(ctx.db, 'cycle', `SELECT c.framework_version_id, b.status AS bank_status FROM qiyas.measurement_cycles c
     JOIN qiyas.evidence_banks b ON b.cycle_id = c.id WHERE c.id = $1`, [cycleId]);
  if (cycle.bank_status !== 'open') throw new ComplianceError('conflict', 'The evidence bank of this cycle is read-only');
  const codesFv = input.codesFrameworkVersionId ?? cycle.framework_version_id;
  if (codesFv !== cycle.framework_version_id) {
    await mustOne(ctx.db, 'framework', 'SELECT 1 FROM qiyas.framework_versions WHERE id = $1', [codesFv]);
    const set = await one(ctx.db, 'SELECT 1 FROM qiyas.crosswalk_sets WHERE from_framework_version_id = $1 AND to_framework_version_id = $2', [codesFv, cycle.framework_version_id]);
    if (!set) throw new ComplianceError('conflict', 'No crosswalk is loaded from that framework version to the one this cycle uses');
  }
  if (!input.label.trim()) throw new ComplianceError('validation', 'Give the import a name');
  const b = await mustOne(ctx.db, 'import', `INSERT INTO qiyas.import_batches (cycle_id, label, codes_framework_version_id, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`, [cycleId, input.label.trim(), codesFv, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'bank.import_started', entityType: 'import_batch', entityId: b.id, after: { cycleId, label: input.label } });
  return b.id;
}

/** Requirements (in the batch's cycle) a detected code points to. */
async function resolveTargets(db: Db, batch: { cycle_id: string; codes_framework_version_id: string }, d: DetectedCode): Promise<string[]> {
  if (d.level === 'axis') return [];
  const [a, b, c, n] = d.code.split('.');
  const standard = `${a}.${b}.${c}`;
  const { rows: reqs } = await db.query(`SELECT r.id FROM qiyas.requirements r JOIN qiyas.standards s ON s.id = r.standard_id
     JOIN qiyas.axes x ON x.id = s.axis_id JOIN qiyas.perspectives p ON p.id = x.perspective_id
    WHERE p.framework_version_id = $1 AND s.code = $2 AND r.parent_requirement_id IS NULL
      AND ($3::text IS NULL OR r.code = $3)`,
  [batch.codes_framework_version_id, standard, d.level === 'requirement' ? `${standard}-R${Number(n)}` : null]);
  const out = new Set<string>();
  for (const r of reqs) for (const t of await targetsInCycle(db, r.id, batch.cycle_id)) out.add(t.cycleRequirementId);
  return [...out];
}

export interface ImportedFile {
  relativePath: string;
  content: Buffer;
  mimeType?: string;
}

export interface ImportItemResult {
  itemId: string;
  outcome: 'suggested' | 'unmatched' | 'duplicate' | 'skipped' | 'rejected' | 'quarantined';
  detectedCode: string | null;
  suggestions: number;
  message: string | null;
}

export async function importFile(ctx: ServiceContext, deps: EvidenceDeps, batchId: string, file: ImportedFile): Promise<ImportItemResult> {
  requirePermission(ctx, 'bank.import');
  const { db } = ctx;
  const batch = await mustOne(db, 'import', `SELECT ib.*, b.id AS bank_id, b.status AS bank_status FROM qiyas.import_batches ib
     JOIN qiyas.evidence_banks b ON b.cycle_id = ib.cycle_id WHERE ib.id = $1`, [batchId]);
  if (batch.created_by !== ctx.actor.userId) throw new ComplianceError('forbidden', 'Only the person who started this import can add files to it');
  if (batch.status !== 'open') throw new ComplianceError('conflict', 'This import is finished; start a new one');
  if (batch.bank_status !== 'open') throw new ComplianceError('conflict', 'The evidence bank of this cycle is read-only');
  const relativePath = file.relativePath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!relativePath || relativePath.split('/').includes('..')) throw new ComplianceError('validation', 'Invalid file path');

  const prev = await one(db, 'SELECT id, outcome, detected_code, suggestions, message FROM qiyas.import_items WHERE batch_id = $1 AND relative_path = $2', [batchId, relativePath]);
  if (prev) return { itemId: prev.id, outcome: prev.outcome, detectedCode: prev.detected_code, suggestions: prev.suggestions, message: prev.message };

  const record = async (outcome: ImportItemResult['outcome'], detectedCode: string | null, versionId: string | null, suggestions: number, message: string | null): Promise<ImportItemResult> => {
    const row = await mustOne(db, 'item', `INSERT INTO qiyas.import_items (batch_id, relative_path, size_bytes, detected_code, outcome, artifact_version_id, suggestions, message, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [batchId, relativePath, file.content.length, detectedCode, outcome, versionId, suggestions, message, ctx.now]);
    return { itemId: row.id, outcome, detectedCode, suggestions, message };
  };

  const filename = path.posix.basename(relativePath);
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (isIgnoredFile(relativePath)) return record('skipped', null, null, 0, 'System or shortcut file');
  const rules = await fileRules(db);
  if (!rules.allowed.includes(ext)) return record('rejected', null, null, 0, `Files of type .${ext || '?'} are not allowed`);
  if (file.content.length === 0) return record('rejected', null, null, 0, 'The file is empty');
  if (file.content.length > rules.maxFileMb * 1024 * 1024) return record('rejected', null, null, 0, `Files must be at most ${rules.maxFileMb} MB`);

  const detected = detectCode(relativePath);
  const targets = detected ? await resolveTargets(db, batch, detected) : [];
  const sha = sha256Hex(file.content);
  const dup = await one(db, `SELECT v.id FROM qiyas.artifact_versions v JOIN qiyas.artifacts a ON a.id = v.artifact_id
     WHERE a.bank_id = $1 AND v.sha256 = $2 AND v.scan_status = 'clean' ORDER BY v.uploaded_at LIMIT 1`, [batch.bank_id, sha]);
  const detail = { batchId, path: relativePath, code: detected?.code ?? null };

  if (dup) {
    const n = targets.length ? await addSuggestions(ctx, dup.id, targets, 'folder_import', detail) : 0;
    return record('duplicate', detected?.code ?? null, dup.id, n, 'The same file is already in the evidence bank');
  }

  const scan = await deps.scanner.scan(file.content, filename);
  const artifact = await mustOne(db, 'artifact', `INSERT INTO qiyas.artifacts (bank_id, owner_id, department_id, title, kind, description, created_at)
     VALUES ($1, $2, NULL, $3, $4, $5, $6) RETURNING id`,
  [batch.bank_id, ctx.actor.userId, filename.replace(/\.[^.]+$/, '').trim() || filename, kindFor(ext), relativePath, ctx.now]);
  const stored = scan === 'clean' ? await deps.storage.put(file.content) : null;
  const v = await mustOne(db, 'version', `INSERT INTO qiyas.artifact_versions
      (artifact_id, version_no, storage_key, sha256, size_bytes, mime_type, original_filename, scan_status, uploaded_by, uploaded_at)
     VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
  [artifact.id, stored?.key ?? `quarantine/${sha}`, sha, file.content.length, file.mimeType ?? null, filename, scan, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: scan === 'infected' ? 'evidence.quarantined' : 'evidence.imported', entityType: 'artifact_version', entityId: v.id,
    after: { artifactId: artifact.id, batchId, path: relativePath, scan } });
  if (scan !== 'clean') return record('quarantined', detected?.code ?? null, v.id, 0, scan === 'infected' ? 'Rejected by the virus scan' : 'The virus scan failed');

  if (!targets.length) {
    const why = !detected ? 'No standard code in the folder or file name'
      : detected.level === 'axis' ? `Only the axis (${detected.code}) is known; link it from a task`
        : `${detected.code} does not match a requirement of this cycle`;
    return record('unmatched', detected?.code ?? null, v.id, 0, why);
  }
  const n = await addSuggestions(ctx, v.id, targets, 'folder_import', detail);
  return record('suggested', detected!.code, v.id, n, null);
}

async function batchTotals(db: Db, batchId: string) {
  const { rows } = await db.query(`SELECT outcome, count(*)::int AS n, COALESCE(sum(suggestions), 0)::int AS s FROM qiyas.import_items WHERE batch_id = $1 GROUP BY outcome`, [batchId]);
  const totals: Record<string, number> = { files: 0, suggestions: 0 };
  for (const r of rows) { totals[r.outcome] = r.n; totals.files += r.n; totals.suggestions += r.s; }
  return totals;
}

export async function finishImport(ctx: ServiceContext, batchId: string) {
  requirePermission(ctx, 'bank.import');
  const batch = await mustOne(ctx.db, 'import', 'SELECT created_by, status FROM qiyas.import_batches WHERE id = $1 FOR UPDATE', [batchId]);
  if (batch.created_by !== ctx.actor.userId) throw new ComplianceError('forbidden', 'Only the person who started this import can finish it');
  const totals = await batchTotals(ctx.db, batchId);
  if (batch.status === 'open') {
    await ctx.db.query(`UPDATE qiyas.import_batches SET status = 'finished', finished_at = $2 WHERE id = $1`, [batchId, ctx.now]);
    await audit(ctx, { action: 'bank.import_finished', entityType: 'import_batch', entityId: batchId, after: totals });
  }
  return totals;
}

export async function listImports(ctx: ServiceContext, cycleId: string) {
  requirePermission(ctx, 'bank.import');
  const { rows } = await ctx.db.query(`SELECT ib.id, ib.label, ib.status, ib.created_at, ib.finished_at, u.name AS created_by_name, fv.version AS codes_version,
       (SELECT json_object_agg(outcome, n) FROM (SELECT outcome, count(*)::int AS n FROM qiyas.import_items WHERE batch_id = ib.id GROUP BY outcome) t) AS totals
     FROM qiyas.import_batches ib JOIN public.users u ON u.id = ib.created_by JOIN qiyas.framework_versions fv ON fv.id = ib.codes_framework_version_id
    WHERE ib.cycle_id = $1 ORDER BY ib.created_at DESC`, [cycleId]);
  return rows;
}

export async function importDetail(ctx: ServiceContext, batchId: string) {
  requirePermission(ctx, 'bank.import');
  const batch = await mustOne(ctx.db, 'import', 'SELECT id, cycle_id, label, status, created_at, finished_at FROM qiyas.import_batches WHERE id = $1', [batchId]);
  const { rows: items } = await ctx.db.query(`SELECT i.id, i.relative_path, i.size_bytes, i.detected_code, i.outcome, i.suggestions, i.message, i.artifact_version_id
     FROM qiyas.import_items i WHERE i.batch_id = $1 ORDER BY i.outcome <> 'unmatched', i.relative_path`, [batchId]);
  return { ...batch, totals: await batchTotals(ctx.db, batchId), items };
}
