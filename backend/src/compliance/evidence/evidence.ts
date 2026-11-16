/**
 * Evidence: upload, link, submit, withdraw (BR-EVD-01..09, D3, D5).
 *
 * An artifact lives in its cycle's bank; each upload is a new version.
 * A version is linked to requirements (and optionally a proof item); each
 * link is reviewed and posted on its own. Uploading never submits.
 */
import path from 'path';
import { ComplianceError, Db, ServiceContext, audit, fromTransition, mustOne, one, requirePermission } from '../core/context';
import { addBusinessDays } from '../domain/calendar';
import { ReviewStatus, reviewMachine } from '../domain/stateMachines';
import { TaskRow, closeOpenPauses, getTask, moveTask, taskActors } from '../work/tasks';
import { EvidenceStorage, VirusScanner, sha256Hex } from './storage';
import { recomputeRequirement } from './readiness';

export interface EvidenceDeps {
  storage: EvidenceStorage;
  scanner: VirusScanner;
}

export const DEFAULT_REVIEW_DAYS = 5;
const WORKABLE = ['assigned', 'in_progress', 'rework_required', 'submitted'];
const DEFAULT_FILE_RULES = { maxFileMb: 50, allowed: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'csv', 'zip'] };

/** The task owner works on evidence; a consultant can too, on any task (D3). */
function evidenceRole(ctx: ServiceContext, task: TaskRow): 'owner' | 'QC' {
  if (task.current_owner_id === ctx.actor.userId) return 'owner';
  if (taskActors(ctx, task).includes('QC')) return 'QC';
  throw new ComplianceError('forbidden', 'Only the task owner or a consultant can work on its evidence');
}

export async function fileRules(db: Db): Promise<typeof DEFAULT_FILE_RULES> {
  const row = await one(db, 'SELECT file_rules FROM qiyas.org_settings LIMIT 1');
  return { ...DEFAULT_FILE_RULES, ...(row?.file_rules ?? {}) };
}

export interface UploadInput {
  taskId: string;
  /** Omit to create a new artifact; set to add a new version. */
  artifactId?: string;
  title?: string;
  kind?: 'file' | 'screenshot' | 'report' | 'data_export' | 'link' | 'other';
  description?: string;
  file?: { content: Buffer; filename: string; mimeType?: string };
  externalUrl?: string;
  documentDate?: string;
  approvingAuthority?: string;
  pageReferences?: Record<string, string>;
}

export interface UploadResult {
  artifactId: string;
  versionId: string;
  versionNo: number;
  scanStatus: 'clean' | 'infected' | 'error';
}

export async function uploadEvidence(ctx: ServiceContext, deps: EvidenceDeps, input: UploadInput): Promise<UploadResult> {
  const { db } = ctx;
  const task = await getTask(db, input.taskId, true);
  const role = evidenceRole(ctx, task);
  requirePermission(ctx, 'evidence.upload', { departmentId: task.department_id, ownerIds: [task.current_owner_id] });
  if (!WORKABLE.includes(task.execution_status)) throw new ComplianceError('conflict', `Evidence cannot be added to a ${task.execution_status} task`);
  if (!input.file && !input.externalUrl) throw new ComplianceError('validation', 'Attach a file or give a link');
  if (input.externalUrl && !/^https?:\/\//i.test(input.externalUrl)) throw new ComplianceError('validation', 'Links must start with http:// or https://');

  const bank = await mustOne(db, 'bank', 'SELECT id, status FROM qiyas.evidence_banks WHERE cycle_id = $1', [task.cycle_id]);
  if (bank.status !== 'open') throw new ComplianceError('conflict', 'The evidence bank of this cycle is read-only');

  let sha: string | null = null;
  let scan: UploadResult['scanStatus'] = 'clean';
  if (input.file) {
    const rules = await fileRules(db);
    const ext = path.extname(input.file.filename).slice(1).toLowerCase();
    if (!rules.allowed.includes(ext)) throw new ComplianceError('validation', `Files of type .${ext || '?'} are not allowed`);
    if (input.file.content.length > rules.maxFileMb * 1024 * 1024) throw new ComplianceError('validation', `Files must be at most ${rules.maxFileMb} MB`);
    if (input.file.content.length === 0) throw new ComplianceError('validation', 'The file is empty');
    sha = sha256Hex(input.file.content);
    // BR-EVD-09: the same content already in this cycle's bank
    const dup = await one(db, `SELECT a.id, a.title FROM qiyas.artifact_versions v JOIN qiyas.artifacts a ON a.id = v.artifact_id
       WHERE a.bank_id = $1 AND v.sha256 = $2 AND v.scan_status <> 'infected' LIMIT 1`, [bank.id, sha]);
    if (dup) throw new ComplianceError('conflict', 'This file already exists in the evidence bank; contact your evidence reviewer if you need to reuse it');
    scan = await deps.scanner.scan(input.file.content, input.file.filename);
  }

  let artifactId = input.artifactId;
  if (artifactId) {
    const a = await mustOne(db, 'artifact', 'SELECT bank_id, owner_id, department_id FROM qiyas.artifacts WHERE id = $1 FOR UPDATE', [artifactId]);
    if (a.bank_id !== bank.id) throw new ComplianceError('validation', 'The artifact belongs to another cycle');
    // Check the referenced artifact's scope; task access must not authorize foreign artifact versioning.
    requirePermission(ctx, 'evidence.view', { departmentId: a.department_id, ownerIds: [a.owner_id] });
  } else {
    if (!input.title?.trim()) throw new ComplianceError('validation', 'Give the evidence a title');
    const a = await mustOne(db, 'artifact', `INSERT INTO qiyas.artifacts (bank_id, owner_id, department_id, title, kind, description, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [bank.id, ctx.actor.userId, task.department_id, input.title.trim(), input.kind ?? (input.externalUrl ? 'link' : 'file'), input.description ?? null, ctx.now]);
    artifactId = a.id as string;
  }

  // Infected files are never written to evidence storage (quarantine record only).
  const stored = input.file && scan === 'clean' ? await deps.storage.put(input.file.content) : null;
  const storageKey = input.file ? stored?.key ?? `quarantine/${sha}` : null;
  const versionNo = Number((await one(db, 'SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM qiyas.artifact_versions WHERE artifact_id = $1', [artifactId]))!.n);
  const v = await mustOne(db, 'version', `INSERT INTO qiyas.artifact_versions
      (artifact_id, version_no, storage_key, sha256, size_bytes, mime_type, original_filename, external_url, scan_status,
       document_date, approving_authority, page_references, uploaded_by, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
  [artifactId, versionNo, storageKey, sha, input.file?.content.length ?? null, input.file?.mimeType ?? null, input.file?.filename ?? null,
    input.externalUrl ?? null, scan, input.documentDate ?? null, input.approvingAuthority ?? null,
    input.pageReferences ? JSON.stringify(input.pageReferences) : null, ctx.actor.userId, ctx.now]);

  if (role === 'owner' && task.execution_status === 'assigned') await moveTask(ctx, task, 'start', ['SYSTEM']);
  await audit(ctx, { action: scan === 'infected' ? 'evidence.quarantined' : 'evidence.uploaded', entityType: 'artifact_version', entityId: v.id,
    after: { artifactId, versionNo, taskId: task.id, filename: input.file?.filename, url: input.externalUrl, scan } });
  return { artifactId: artifactId!, versionId: v.id, versionNo, scanStatus: scan };
}

export interface LinkInput {
  taskId: string;
  cycleRequirementId: string;
  proofItemId?: string | null;
}

/** Maps an uploaded version to one requirement of the task (BR-EVD-04). */
export async function linkEvidence(ctx: ServiceContext, versionId: string, input: LinkInput): Promise<string> {
  const { db } = ctx;
  const task = await getTask(db, input.taskId, true);
  evidenceRole(ctx, task);
  requirePermission(ctx, 'evidence.link', { departmentId: task.department_id, ownerIds: [task.current_owner_id] });
  if (!WORKABLE.includes(task.execution_status)) throw new ComplianceError('conflict', `Evidence cannot be linked on a ${task.execution_status} task`);
  const v = await mustOne(db, 'version', `SELECT v.scan_status, b.cycle_id, a.department_id, a.owner_id FROM qiyas.artifact_versions v
     JOIN qiyas.artifacts a ON a.id = v.artifact_id JOIN qiyas.evidence_banks b ON b.id = a.bank_id WHERE v.id = $1`, [versionId]);
  requirePermission(ctx, 'evidence.view', { departmentId: v.department_id, ownerIds: [v.owner_id] });
  if (v.scan_status === 'infected') throw new ComplianceError('conflict', 'This file was quarantined by the virus scan and cannot be used');
  if (v.cycle_id !== task.cycle_id) throw new ComplianceError('validation', 'The evidence belongs to another cycle');
  await mustOne(db, 'requirement of this task', 'SELECT 1 FROM qiyas.task_requirements WHERE task_id = $1 AND cycle_requirement_id = $2', [task.id, input.cycleRequirementId]);
  if (input.proofItemId) {
    await mustOne(db, 'proof item of this requirement', `SELECT 1 FROM qiyas.requirement_proof_items rp
       JOIN qiyas.cycle_requirements cr ON cr.requirement_id = rp.requirement_id
      WHERE cr.id = $1 AND rp.proof_item_id = $2`, [input.cycleRequirementId, input.proofItemId]);
  }
  try {
    const l = await mustOne(db, 'link', `INSERT INTO qiyas.evidence_links (artifact_version_id, cycle_requirement_id, proof_item_id, task_id, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [versionId, input.cycleRequirementId, input.proofItemId ?? null, task.id, ctx.actor.userId, ctx.now]);
    await audit(ctx, { action: 'evidence.linked', entityType: 'evidence_link', entityId: l.id, after: { versionId, ...input } });
    return l.id;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new ComplianceError('conflict', 'This evidence is already linked to that requirement');
    throw e;
  }
}

async function setReview(ctx: ServiceContext, linkId: string, from: ReviewStatus, event: Parameters<typeof reviewMachine.next>[1], actors: Parameters<typeof reviewMachine.next>[2], reason?: string): Promise<ReviewStatus> {
  let next: ReviewStatus;
  try {
    next = reviewMachine.next(from, event, actors, reason);
  } catch (e) {
    return fromTransition(e);
  }
  await ctx.db.query('UPDATE qiyas.evidence_links SET review_status = $2 WHERE id = $1', [linkId, next]);
  return next;
}

/** Submits draft links for review (BR-EVD-06). Pauses the task deadline while waiting (D5). */
export async function submitEvidence(ctx: ServiceContext, taskId: string, linkIds?: string[], reviewDays = DEFAULT_REVIEW_DAYS): Promise<number> {
  const { db } = ctx;
  const task = await getTask(db, taskId, true);
  const role = evidenceRole(ctx, task);
  requirePermission(ctx, 'evidence.submit', { departmentId: task.department_id, ownerIds: [task.current_owner_id] });
  const { rows } = await db.query(`SELECT l.id, l.cycle_requirement_id, v.scan_status FROM qiyas.evidence_links l JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id
     WHERE l.task_id = $1 AND l.review_status = 'draft' ${linkIds ? 'AND l.id = ANY($2::uuid[])' : ''} FOR UPDATE OF l`, linkIds ? [taskId, linkIds] : [taskId]);
  if (rows.length === 0) throw new ComplianceError('validation', 'There is no draft evidence to submit');
  if (linkIds && rows.length !== new Set(linkIds).size) throw new ComplianceError('validation', 'Some links are not draft evidence of this task');
  if (rows.some((r) => r.scan_status !== 'clean')) throw new ComplianceError('conflict', 'Wait for the virus scan to finish before submitting');

  const actors = role === 'QC' ? ['QC' as const] : taskActors(ctx, task);
  const due = addBusinessDays(ctx.now, reviewDays, ctx.calendar);
  for (const r of rows) {
    await setReview(ctx, r.id, 'draft', 'submit', actors);
    await db.query('UPDATE qiyas.evidence_links SET submitted_by = $2, submitted_at = $3, review_due_at = $4 WHERE id = $1', [r.id, ctx.actor.userId, ctx.now, due]);
  }

  for (const id of new Set<string>(rows.map((r) => r.cycle_requirement_id))) await recomputeRequirement(db, id);

  if (task.execution_status === 'assigned') await moveTask(ctx, task, 'start', ['SYSTEM']);
  if (task.execution_status === 'in_progress') await moveTask(ctx, task, 'submit', ['SYSTEM']);
  else if (task.execution_status === 'rework_required') await moveTask(ctx, task, 'resubmit', ['SYSTEM']);
  await db.query(`INSERT INTO qiyas.deadline_pauses (task_id, reason, paused_at)
     SELECT $1, 'awaiting_review', $2 WHERE NOT EXISTS
       (SELECT 1 FROM qiyas.deadline_pauses WHERE task_id = $1 AND reason = 'awaiting_review' AND resumed_at IS NULL)`, [taskId, ctx.now]);
  await audit(ctx, { action: 'evidence.submitted', entityType: 'task', entityId: taskId, after: { links: rows.map((r) => r.id), reviewDueAt: due } });
  return rows.length;
}

/** Withdraws a draft or not-yet-claimed link. Returns the task to work when nothing is left under review. */
export async function withdrawEvidence(ctx: ServiceContext, linkId: string): Promise<void> {
  const { db } = ctx;
  const link = await mustOne(db, 'link', 'SELECT * FROM qiyas.evidence_links WHERE id = $1 FOR UPDATE', [linkId]);
  const task = await getTask(db, link.task_id, true);
  const role = evidenceRole(ctx, task);
  requirePermission(ctx, 'evidence.withdraw', { departmentId: task.department_id, ownerIds: [task.current_owner_id] });
  const actors = role === 'QC' ? ['QC' as const] : taskActors(ctx, task);
  await setReview(ctx, linkId, link.review_status, link.review_status === 'draft' ? 'remove' : 'withdraw', actors);
  await recomputeRequirement(db, link.cycle_requirement_id);
  if (task.execution_status === 'submitted' && !(await hasPendingReview(db, task.id))) {
    await moveTask(ctx, task, 'withdraw_all', ['SYSTEM']);
    await closeOpenPauses(db, task.id, ctx.now, 'awaiting_review');
  }
  await audit(ctx, { action: 'evidence.withdrawn', entityType: 'evidence_link', entityId: linkId, before: { status: link.review_status } });
}

export async function hasPendingReview(db: Db, taskId: string): Promise<boolean> {
  return Boolean(await one(db, `SELECT 1 FROM qiyas.evidence_links WHERE task_id = $1 AND review_status IN ('submitted', 'under_review') LIMIT 1`, [taskId]));
}
