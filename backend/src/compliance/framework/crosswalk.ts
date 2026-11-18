/**
 * Crosswalk between two framework versions (BR-FW-05, BNK-5).
 *
 * A crosswalk file maps every top-level requirement of the old version to the
 * requirement(s) of the new version that ask for the same evidence. It only
 * ever SUGGESTS where old evidence may go; a person confirms every link.
 */
import { z } from 'zod';
import { ComplianceError, Db, ServiceContext, audit, mustOne, one, requirePermission } from '../core/context';
import { FRAMEWORK_LIMITS } from './frameworkFile';
import { INSERT_CHUNK_ROWS } from './frameworkService';

export const CROSSWALK_FORMAT = 'qiyas-crosswalk/1';
/** 'removed' is never stored; the others match the crosswalk_relation_check of migration 005. */
export const CROSSWALK_RELATIONS = ['same', 'changed', 'split', 'merged', 'moved', 'removed'] as const;

/** Caps of a crosswalk file (C13); the requirement and text caps are shared with the framework file. */
export const CROSSWALK_LIMITS = {
  targetsPerEntry: 50,
  entries: FRAMEWORK_LIMITS.requirementsPerFile,
  standards: FRAMEWORK_LIMITS.standardsPerFile,
  links: FRAMEWORK_LIMITS.linksPerFile,
} as const;

const cwCode = z.string().min(1).max(40);
const header = z.string().min(1).max(FRAMEWORK_LIMITS.header);
const version = z.object({ issuer: header, documentCode: header, version: header });
const note = z.object({ ar: z.string().max(FRAMEWORK_LIMITS.text), en: z.string().max(FRAMEWORK_LIMITS.text) }).partial().optional();
const entry = z.object({
  from: cwCode,
  to: z.array(cwCode).max(CROSSWALK_LIMITS.targetsPerEntry, `At most ${CROSSWALK_LIMITS.targetsPerEntry} targets per entry`),
  relation: z.enum(CROSSWALK_RELATIONS),
  note,
});

export const crosswalkFileSchema = z.object({
  format: z.literal(CROSSWALK_FORMAT),
  from: version,
  to: version,
  /** Standard-level summary, for people; requirements carry the mapping that is used. */
  standards: z.array(entry).max(CROSSWALK_LIMITS.standards, `At most ${CROSSWALK_LIMITS.standards} standard entries`),
  requirements: z.array(entry).max(CROSSWALK_LIMITS.entries, `At most ${CROSSWALK_LIMITS.entries} requirement entries`),
}).superRefine((f, c) => {
  let links = 0;
  f.requirements.forEach((r, i) => {
    if (r.relation === 'removed' && r.to.length) c.addIssue({ code: 'custom', path: ['requirements', i, 'to'], message: 'A removed requirement maps to nothing' });
    if (r.relation !== 'removed' && !r.to.length) c.addIssue({ code: 'custom', path: ['requirements', i, 'to'], message: 'Give at least one target or mark it removed' });
    // the same target twice would insert the same crosswalk row twice (primary-key violation)
    if (new Set(r.to).size < r.to.length) c.addIssue({ code: 'custom', path: ['requirements', i, 'to'], message: `Requirement ${r.from} lists the same target more than once` });
    links += r.to.length;
  });
  if (links > CROSSWALK_LIMITS.links) c.addIssue({ code: 'custom', path: ['requirements'], message: `At most ${CROSSWALK_LIMITS.links} links per crosswalk` });
});
export type CrosswalkFile = z.infer<typeof crosswalkFileSchema>;

async function frameworkId(db: Db, v: z.infer<typeof version>): Promise<string> {
  const row = await one(db, 'SELECT id FROM qiyas.framework_versions WHERE issuer = $1 AND document_code = $2 AND version = $3', [v.issuer, v.documentCode, v.version]);
  if (!row) throw new ComplianceError('validation', `Import version ${v.version} of ${v.documentCode} before its crosswalk`);
  return row.id;
}

/** Top-level requirements of a version, by code. */
async function requirementIds(db: Db, frameworkVersionId: string): Promise<Map<string, string>> {
  const { rows } = await db.query(`SELECT r.id, r.code FROM qiyas.requirements r JOIN qiyas.standards s ON s.id = r.standard_id
     JOIN qiyas.axes a ON a.id = s.axis_id JOIN qiyas.perspectives p ON p.id = a.perspective_id
    WHERE p.framework_version_id = $1 AND r.parent_requirement_id IS NULL`, [frameworkVersionId]);
  return new Map(rows.map((r) => [r.code as string, r.id as string]));
}

/** Imports (or replaces) the crosswalk between two imported versions. */
export async function importCrosswalk(ctx: ServiceContext, input: unknown): Promise<{ mapped: number; removed: number; links: number }> {
  requirePermission(ctx, 'framework.crosswalk');
  const parsed = crosswalkFileSchema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new ComplianceError('validation', `Crosswalk file is invalid: ${i.path.join('.')} ${i.message}`);
  }
  const f = parsed.data;
  const { db } = ctx;
  const fromId = await frameworkId(db, f.from);
  const toId = await frameworkId(db, f.to);
  if (fromId === toId) throw new ComplianceError('validation', 'A crosswalk links two different versions');
  const fromReq = await requirementIds(db, fromId);
  const toReq = await requirementIds(db, toId);

  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const r of f.requirements) {
    if (!fromReq.has(r.from)) unknown.push(`${f.from.version}:${r.from}`);
    if (seen.has(r.from)) throw new ComplianceError('validation', `Requirement ${r.from} is listed twice`);
    seen.add(r.from);
    for (const t of r.to) if (!toReq.has(t)) unknown.push(`${f.to.version}:${t}`);
  }
  if (unknown.length) throw new ComplianceError('validation', `Unknown requirement codes: ${unknown.slice(0, 10).join(', ')}${unknown.length > 10 ? ` (+${unknown.length - 10})` : ''}`);
  const missing = [...fromReq.keys()].filter((c) => !seen.has(c));
  if (missing.length) throw new ComplianceError('validation', `Every requirement of ${f.from.version} needs an entry (missing ${missing.slice(0, 10).join(', ')})`);

  await db.query(`DELETE FROM qiyas.crosswalk WHERE from_requirement_id = ANY($1::uuid[]) AND to_requirement_id = ANY($2::uuid[])`,
    [[...fromReq.values()], [...toReq.values()]]);
  const rows: Array<[string | undefined, string | undefined, string]> = [];
  for (const r of f.requirements) {
    if (r.relation === 'removed') continue;
    for (const t of r.to) rows.push([fromReq.get(r.from), toReq.get(t), r.relation]);
  }
  // one statement per INSERT_CHUNK_ROWS links, not one per link (C13)
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_ROWS) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_ROWS);
    await db.query(`INSERT INTO qiyas.crosswalk (from_requirement_id, to_requirement_id, relation, created_by, created_at)
       SELECT x.f, x.t, x.rel, $4::uuid, $5::timestamptz FROM unnest($1::uuid[], $2::uuid[], $3::text[]) AS x(f, t, rel)`,
    [chunk.map((c) => c[0]), chunk.map((c) => c[1]), chunk.map((c) => c[2]), ctx.actor.userId, ctx.now]);
  }
  const links = rows.length;
  await db.query(`INSERT INTO qiyas.crosswalk_sets (from_framework_version_id, to_framework_version_id, source_file, imported_by, imported_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (from_framework_version_id, to_framework_version_id) DO UPDATE SET source_file = EXCLUDED.source_file, imported_by = EXCLUDED.imported_by, imported_at = EXCLUDED.imported_at`,
  [fromId, toId, JSON.stringify(input), ctx.actor.userId, ctx.now]);
  const removed = f.requirements.filter((r) => r.relation === 'removed').length;
  await audit(ctx, { action: 'framework.crosswalk_imported', entityType: 'framework_version', entityId: toId,
    after: { from: f.from.version, to: f.to.version, mapped: f.requirements.length - removed, removed, links } });
  return { mapped: f.requirements.length - removed, removed, links };
}

export interface CrosswalkTarget {
  cycleRequirementId: string;
  requirementCode: string;
  relation: string;
}

/**
 * Where evidence of a requirement (by id, any version) may go in a cycle:
 * the same requirement when the cycle uses the same version, otherwise the
 * crosswalk targets in the cycle's version.
 */
export async function targetsInCycle(db: Db, requirementId: string, cycleId: string): Promise<CrosswalkTarget[]> {
  await mustOne(db, 'cycle', 'SELECT 1 FROM qiyas.measurement_cycles WHERE id = $1', [cycleId]);
  const { rows } = await db.query(
    `SELECT cr.id AS "cycleRequirementId", r.code AS "requirementCode", 'same' AS relation
       FROM qiyas.cycle_requirements cr JOIN qiyas.requirements r ON r.id = cr.requirement_id
      WHERE cr.cycle_id = $1 AND cr.requirement_id = $2
     UNION ALL
     SELECT cr.id, r.code, x.relation
       FROM qiyas.crosswalk x
       JOIN qiyas.requirements r ON r.id = x.to_requirement_id
       JOIN qiyas.cycle_requirements cr ON cr.requirement_id = r.id AND cr.cycle_id = $1
      WHERE x.from_requirement_id = $2
     ORDER BY 2`,
    [cycleId, requirementId]);
  return rows;
}
