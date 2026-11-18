/**
 * Turns audit records into notifications (event catalogue, docs/phase1/07 §4).
 *
 * Every service already writes an audit record in the same transaction as
 * its change, so notifications are derived from the audit log instead of
 * being wired into each service. The dispatcher keeps its position in
 * qiyas.notification_cursor and each notification's dedupe key contains the
 * audit id, so running it twice never duplicates anything.
 */
import { Db, one } from '../core/context';
import { EventCode } from './catalogue';
import { Recipient, notify, people, taskInfo, usersWithRole } from './notify';

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_value: any;
  after_value: any;
  reason: string | null;
}

type Send = (event: EventCode, recipients: Recipient[], payload?: Record<string, unknown>) => Promise<unknown>;

async function linkInfo(db: Db, linkId: string) {
  return one(db, `SELECT l.task_id, l.submitted_by, l.submission_status, a.title, v.uploaded_by
     FROM qiyas.evidence_links l JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id
     JOIN qiyas.artifacts a ON a.id = v.artifact_id WHERE l.id = $1`, [linkId]);
}

async function handle(db: Db, a: AuditRow, send: Send): Promise<void> {
  const after = a.after_value ?? {};
  const before = a.before_value ?? {};
  const qcs = async (mandatory = false) => people(await usersWithRole(db, 'QC'), mandatory);
  const reason = a.reason ?? undefined;

  switch (a.action) {
    case 'assignment.published': {
      const t = await taskInfo(db, after.taskId);
      if (t) await send('assignment.published', people([t.managerId], true), { title: t.title, taskId: t.id });
      return;
    }
    case 'task.assign':
    case 'task.self_assign':
    case 'task.reassign': {
      if (!after.owner) return; // status-only record
      const t = await taskInfo(db, a.entity_id);
      if (!t) return;
      await send('task.assigned', people([after.owner], a.action !== 'task.self_assign'), { title: t.title });
      if (before.owner && before.owner !== after.owner && a.action === 'task.reassign') {
        await send('task.reassigned_away', people([before.owner]), { title: t.title });
      }
      return;
    }
    case 'task.escalated.manual':
    case 'task.escalated.automatic': {
      const t = await taskInfo(db, a.entity_id);
      if (!t) return;
      if (after.selfEscalation) {
        await send('task.escalated_to_self', people([after.owner], true), { title: t.title, reason });
      } else {
        await send('task.escalated', people([after.owner], true), { title: t.title, reason });
        await send('task.escalated_from_you', people([before.owner]), { title: t.title, reason });
      }
      if (a.action === 'task.escalated.automatic') await send('task.overdue', people([t.consultantId]), { title: t.title });
      return;
    }
    case 'task.escalation_blocked': {
      // C17, D-C17-2: an overdue task stays where it is because no active manager exists
      const t = await taskInfo(db, a.entity_id);
      if (t) await send('task.escalation_blocked', [...(await qcs(true)), ...people(await usersWithRole(db, 'ADM'), true)], { title: t.title, reason });
      return;
    }
    case 'task.all_covered': {
      const t = await taskInfo(db, a.entity_id);
      if (t) await send('task.completed', people([t.managerId, t.originalAssigneeId, t.consultantId]), { title: t.title });
      return;
    }
    case 'task.cancel': {
      const t = await taskInfo(db, a.entity_id);
      if (t) await send('task.cancelled', people([t.ownerId, t.managerId]), { title: t.title, reason });
      return;
    }
    case 'clarification.requested': {
      const c = await one(db, 'SELECT task_id, requester_role FROM qiyas.clarifications WHERE id = $1', [a.entity_id]);
      const t = c && (await taskInfo(db, c.task_id));
      if (!t) return;
      await send('clarification.requested', [...(await qcs(true)), ...people(c.requester_role === 'EMP' ? [t.managerId] : [])], { title: t.title });
      return;
    }
    case 'clarification.answered': {
      const c = await one(db, 'SELECT task_id, requested_by FROM qiyas.clarifications WHERE id = $1', [a.entity_id]);
      const t = c && (await taskInfo(db, c.task_id));
      if (!t) return;
      await send('clarification.answered', people([c.requested_by], true), { title: t.title });
      if (after.answeredByRole === 'DM') await send('clarification.answered_by_manager', people([t.consultantId]), { title: t.title });
      return;
    }
    case 'extension.asked':
    case 'extension.requested':
    case 'extension.ask_declined':
    case 'extension.rejected': {
      const e = await one(db, `SELECT e.task_id, e.requested_by, p.requested_by AS asked_by FROM qiyas.extension_requests e
         LEFT JOIN qiyas.extension_requests p ON p.id = e.parent_request_id WHERE e.id = $1`, [a.entity_id]);
      const t = e && (await taskInfo(db, e.task_id));
      if (!t) return;
      if (a.action === 'extension.asked') await send('extension.asked', people([t.managerId], true), { title: t.title });
      if (a.action === 'extension.requested') await send('extension.requested', await qcs(true), { title: t.title });
      if (a.action === 'extension.ask_declined') await send('extension.ask_declined', people([e.requested_by], true), { title: t.title, reason });
      if (a.action === 'extension.rejected') await send('extension.rejected', [...people([e.requested_by], true), ...people([e.asked_by])], { title: t.title, reason });
      return;
    }
    case 'extension.approved': {
      const t = await taskInfo(db, a.entity_id);
      const date = after.extensionDueAt ? String(after.extensionDueAt).slice(0, 10) : '';
      if (t) await send('extension.approved', [...people([t.managerId], true), ...people([t.ownerId])], { title: t.title, date });
      return;
    }
    case 'evidence.submitted': {
      const t = await taskInfo(db, a.entity_id);
      if (t) await send('evidence.submitted', await qcs(), { title: t.title });
      return;
    }
    case 'evidence.quarantined': {
      const v = await one(db, 'SELECT uploaded_by, original_filename FROM qiyas.artifact_versions WHERE id = $1', [a.entity_id]);
      if (v) await send('evidence.quarantined', [...people([v.uploaded_by], true), ...people(await usersWithRole(db, 'ADM'))], { title: v.original_filename });
      return;
    }
    case 'review.accepted': {
      const l = await linkInfo(db, a.entity_id);
      const t = l?.task_id ? await taskInfo(db, l.task_id) : undefined;
      if (!l) return;
      await send('evidence.accepted', people([l.submitted_by, t?.managerId]), { title: l.title });
      await send('submission.ready', people(await usersWithRole(db, 'DSO')), { title: l.title });
      return;
    }
    case 'review.rejected': {
      const l = await linkInfo(db, a.entity_id);
      const t = l?.task_id ? await taskInfo(db, l.task_id) : undefined;
      if (!l) return;
      if (t) await send('task.returned_for_rework', people([t.managerId], true), { title: t.title, reason });
      await send('evidence.rejected', people([l.submitted_by]), { title: l.title, reason });
      return;
    }
    case 'review.revoked':
    case 'review.superseded': {
      const l = await linkInfo(db, a.entity_id);
      if (!l || l.submission_status !== 'posted') return;
      const t = l.task_id ? await taskInfo(db, l.task_id) : undefined;
      await send('submission.posted_changed', [...people(await usersWithRole(db, 'DSO'), true), ...people([t?.consultantId])], { title: l.title, reason });
      return;
    }
    case 'cycle.open':
    case 'cycle.close': {
      const c = await one(db, 'SELECT name FROM qiyas.measurement_cycles WHERE id = $1', [a.entity_id]);
      const roles: Array<'QC' | 'DSO' | 'EXE' | 'DM'> = a.action === 'cycle.open' ? ['QC', 'DSO', 'EXE', 'DM'] : ['QC', 'DSO', 'EXE'];
      const ids = (await Promise.all(roles.map((r) => usersWithRole(db, r)))).flat();
      await send(a.action === 'cycle.open' ? 'cycle.opened' : 'cycle.closed', people(ids), { title: c?.name });
      return;
    }
    default:
  }
}

/** Processes audit records after the cursor. Call inside a transaction. Returns notifications created. */
export async function dispatchAuditEvents(db: Db, now: Date, batchSize = 500): Promise<number> {
  const cursor = await one(db, 'SELECT last_audit_id FROM qiyas.notification_cursor FOR UPDATE');
  const { rows } = await db.query(`SELECT id, actor_id, action, entity_type, entity_id, before_value, after_value, reason
     FROM qiyas.audit_log WHERE id > $1 ORDER BY id LIMIT $2`, [cursor?.last_audit_id ?? 0, batchSize]);
  let created = 0;
  for (const a of rows as AuditRow[]) {
    const send: Send = async (event, recipients, payload) => {
      created += await notify(db, {
        event, recipients, payload, entityType: a.entity_type, entityId: a.entity_id,
        dedupeBase: `audit:${a.id}:${event}`, actorId: a.actor_id, now,
      });
    };
    await handle(db, a, send);
  }
  if (rows.length) await db.query('UPDATE qiyas.notification_cursor SET last_audit_id = $1', [rows[rows.length - 1].id]);
  return created;
}

