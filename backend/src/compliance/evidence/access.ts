/**
 * Who may see a piece of evidence (C3, C15, C16).
 *
 * One rule for every place that touches evidence by ID: the server builds the
 * resource context from the stored rows and evaluates `can()` on it. Links that
 * were withdrawn or rejected no longer make anyone an owner (D-C3-3), so a link
 * can never create view rights by itself.
 */
import { Db, ServiceContext, one } from '../core/context';
import { Permission, ResourceContext, can } from '../domain/permissions';

export interface EvidenceResource extends ResourceContext {
  departmentId: string | null;
  ownerIds: string[];
  isAccepted: boolean;
}

/** Link statuses that still give the task owner a claim on the evidence. */
const INACTIVE_LINK = `('withdrawn', 'rejected')`;

/**
 * Resource context of one version: the artifact's department; owners are the
 * uploader, the current owners of tasks with an active link to it, and the
 * current owners of tasks it is openly suggested for (BNK-5). Undefined when
 * the version does not exist.
 */
export async function versionResource(db: Db, versionId: string): Promise<EvidenceResource | undefined> {
  const row = await one(db, `SELECT a.department_id, v.uploaded_by,
      EXISTS (SELECT 1 FROM qiyas.evidence_links l WHERE l.artifact_version_id = v.id AND l.review_status = 'accepted') AS accepted,
      COALESCE((SELECT array_agg(DISTINCT o) FROM (
          SELECT t.current_owner_id AS o FROM qiyas.evidence_links l JOIN qiyas.tasks t ON t.id = l.task_id
           WHERE l.artifact_version_id = v.id AND l.review_status NOT IN ${INACTIVE_LINK}
          UNION -- owners of tasks the file is suggested for may open it before linking it (BNK-5)
          SELECT t.current_owner_id FROM qiyas.link_suggestions sg
            JOIN qiyas.task_requirements tr ON tr.cycle_requirement_id = sg.cycle_requirement_id
            JOIN qiyas.tasks t ON t.id = tr.task_id
           WHERE sg.artifact_version_id = v.id AND sg.status = 'open') x), '{}') AS owners
     FROM qiyas.artifact_versions v JOIN qiyas.artifacts a ON a.id = v.artifact_id WHERE v.id = $1`, [versionId]);
  if (!row) return undefined;
  return { departmentId: row.department_id, ownerIds: [row.uploaded_by, ...row.owners], isAccepted: row.accepted };
}

/**
 * Resource context of a whole artifact: the union of its versions (and the
 * artifact's creator). Undefined when the artifact does not exist.
 */
export async function artifactResource(db: Db, artifactId: string): Promise<(EvidenceResource & { bankId: string }) | undefined> {
  const row = await one(db, `SELECT a.bank_id, a.department_id, a.owner_id,
      EXISTS (SELECT 1 FROM qiyas.evidence_links l JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id
               WHERE v.artifact_id = a.id AND l.review_status = 'accepted') AS accepted,
      COALESCE((SELECT array_agg(DISTINCT o) FROM (
          SELECT v.uploaded_by AS o FROM qiyas.artifact_versions v WHERE v.artifact_id = a.id
          UNION
          SELECT t.current_owner_id FROM qiyas.artifact_versions v JOIN qiyas.evidence_links l ON l.artifact_version_id = v.id
            JOIN qiyas.tasks t ON t.id = l.task_id
           WHERE v.artifact_id = a.id AND l.review_status NOT IN ${INACTIVE_LINK}
          UNION
          SELECT t.current_owner_id FROM qiyas.artifact_versions v JOIN qiyas.link_suggestions sg ON sg.artifact_version_id = v.id
            JOIN qiyas.task_requirements tr ON tr.cycle_requirement_id = sg.cycle_requirement_id
            JOIN qiyas.tasks t ON t.id = tr.task_id
           WHERE v.artifact_id = a.id AND sg.status = 'open') x), '{}') AS owners
     FROM qiyas.artifacts a WHERE a.id = $1`, [artifactId]);
  if (!row) return undefined;
  return { bankId: row.bank_id, departmentId: row.department_id, ownerIds: [row.owner_id, ...row.owners], isAccepted: row.accepted };
}

/**
 * Resource context of one evidence link row shown in task detail: the
 * artifact's department (or the task's, for central evidence without one),
 * the uploader and the current task owner, accepted per link.
 */
export function evidenceResourceFor(row: { artifact_department_id: string | null; uploaded_by: string; review_status: string },
  task: { department_id: string; current_owner_id: string }): EvidenceResource {
  return {
    departmentId: row.artifact_department_id ?? task.department_id,
    ownerIds: [row.uploaded_by, task.current_owner_id],
    isAccepted: row.review_status === 'accepted',
  };
}

export function canSee(ctx: ServiceContext, permission: Permission, resource: ResourceContext | undefined): boolean {
  return Boolean(resource) && can(ctx.actor.effective, ctx.actor.userId, permission, resource);
}

/** The caller holds the Qiyas Consultant role (organization-wide). */
export function isConsultant(ctx: ServiceContext): boolean {
  return ctx.actor.grants.some((g) => g.role === 'QC');
}
