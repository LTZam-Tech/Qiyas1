/**
 * Deadline scheduler (BR-NTF-01..03, docs/phase1/07 §1–§3, N-6).
 *
 * Run every few minutes inside a transaction. Each run:
 *   1. escalates overdue tasks automatically (threshold from the policy)
 *   2. sends reminders before, and notices after, every role's deadline
 *   3. turns new audit records into notifications
 * Every notification carries a dedupe key, so a run after a restart never
 * repeats a reminder.
 */
import { Db } from '../core/context';
import { WorkCalendar, addBusinessDays, businessMsBetween } from '../domain/calendar';
import { runAutomaticEscalations } from '../work/escalations';
import { TaskRow, taskDeadline } from '../work/tasks';
import { EventCode } from './catalogue';
import { dispatchAuditEvents } from './dispatcher';
import { Recipient, groupMembers, notify, people, taskInfo, usersWithRole } from './notify';

const DAY = 24 * 60 * 60 * 1000;

// C5, D-C5-3: a closed or archived cycle is frozen, so its timers send nothing
const OPEN_CYCLE_STATUSES = "('planning', 'active')";
const taskInOpenCycle = (taskId: string) => `${taskId} IN (SELECT t.id FROM qiyas.tasks t JOIN qiyas.measurement_cycles c ON c.id = t.cycle_id
  WHERE c.status IN ${OPEN_CYCLE_STATUSES})`;
const requirementInOpenCycle = (cycleRequirementId: string) => `${cycleRequirementId} IN (SELECT cr.id FROM qiyas.cycle_requirements cr
  JOIN qiyas.measurement_cycles c ON c.id = cr.cycle_id WHERE c.status IN ${OPEN_CYCLE_STATUSES})`;

export interface Policy {
  timer_kind: string;
  duration_business_days: number | null;
  reminder_days: number[];
  escalation_after_business_days: number;
  repeat_every_business_days: number | null;
  oversight_group_code: string | null;
  is_active: boolean;
}

export interface SchedulerContext {
  db: Db;
  now: Date;
  calendar: WorkCalendar;
}

export interface SchedulerReport {
  escalations: number;
  reminders: number;
  overdue: number;
  notifications: number;
}

async function loadPolicies(db: Db): Promise<Map<string, Policy>> {
  const { rows } = await db.query('SELECT * FROM qiyas.sla_policies');
  return new Map(rows.map((r) => [r.timer_kind, r]));
}

/** The reminder threshold just reached (smallest offset ≥ remaining working days), if any. */
export function reminderReached(remainingBusinessMs: number, offsets: number[]): number | null {
  const reached = offsets.filter((o) => remainingBusinessMs <= o * DAY);
  return reached.length ? Math.min(...reached) : null;
}

export async function runScheduler(ctx: SchedulerContext): Promise<SchedulerReport> {
  const { db, now, calendar } = ctx;
  const policies = await loadPolicies(db);
  const report: SchedulerReport = { escalations: 0, reminders: 0, overdue: 0, notifications: 0 };
  const iso = (d: Date) => d.toISOString();
  const send = async (event: EventCode, recipients: Recipient[], dedupeBase: string, entityType: string, entityId: string, payload: Record<string, unknown>) => {
    const n = await notify(db, { event, recipients, dedupeBase, entityType, entityId, payload, now });
    report.notifications += n;
    return n;
  };
  const oversight = async (p?: Policy) => people(await groupMembers(db, p?.oversight_group_code));

  /** Before the due date: one reminder per offset; after it: one overdue notice per due date. */
  const timer = async (opts: {
    policy?: Policy; key: string; due: Date; entityType: string; entityId: string; payload: Record<string, unknown>;
    reminder: [EventCode, Recipient[]] | null; overdue: [EventCode, Recipient[]] | null;
  }) => {
    if (opts.policy && !opts.policy.is_active) return;
    const payload = { ...opts.payload, date: iso(opts.due).slice(0, 10) };
    if (now < opts.due) {
      const offset = opts.reminder ? reminderReached(businessMsBetween(now, opts.due, calendar), opts.policy?.reminder_days ?? []) : null;
      if (offset !== null && opts.reminder && (await send(opts.reminder[0], opts.reminder[1], `rem:${opts.key}:${iso(opts.due)}:${offset}`, opts.entityType, opts.entityId, payload))) report.reminders += 1;
    } else if (opts.overdue && (await send(opts.overdue[0], opts.overdue[1], `due:${opts.key}:${iso(opts.due)}`, opts.entityType, opts.entityId, payload))) {
      report.overdue += 1;
    }
  };

  // 1. automatic escalation of executors' tasks
  const impl = policies.get('implementation');
  if (impl?.is_active !== false) {
    report.escalations = (await runAutomaticEscalations(ctx, impl?.escalation_after_business_days ?? 0)).length;
  }

  // 2a. implementation deadlines (paused deadlines send nothing)
  const tasks = (await db.query(`SELECT * FROM qiyas.tasks WHERE execution_status IN ('assigned', 'in_progress', 'rework_required') AND ${taskInOpenCycle('id')}`)).rows as TaskRow[];
  for (const task of tasks) {
    const d = await taskDeadline(ctx, task);
    if (d.isPaused) continue;
    const t = await taskInfo(db, task.id);
    if (!t) continue;
    await timer({
      policy: impl, key: `impl:${task.id}`, due: d.currentDueAt, entityType: 'task', entityId: task.id, payload: { title: t.title },
      reminder: ['task.deadline_reminder', people([t.ownerId])],
      overdue: ['task.overdue', [...people([t.ownerId], true), ...people([t.managerId])]],
    });
    // D2: a manager-owned task that stays overdue reminds the manager periodically
    if (d.isOverdue && t.ownerId === t.managerId && impl?.repeat_every_business_days) {
      const n = Math.floor(businessMsBetween(d.currentDueAt, now, calendar) / (impl.repeat_every_business_days * DAY));
      if (n >= 1 && (await send('task.overdue_reminder', people([t.managerId], true), `repeat:${task.id}:${iso(d.currentDueAt)}:${n}`, 'task', task.id, { title: t.title }))) report.overdue += 1;
    }
  }

  // 2b. manager action: distributing the assignment inside the department
  const waiting = (await db.query(`SELECT id, manager_due_at FROM qiyas.tasks WHERE execution_status = 'awaiting_assignment' AND ${taskInOpenCycle('id')}`)).rows;
  for (const w of waiting) {
    const t = await taskInfo(db, w.id);
    if (!t) continue;
    await timer({
      policy: policies.get('manager_assignment'), key: `mgr:${w.id}`, due: new Date(w.manager_due_at), entityType: 'task', entityId: w.id, payload: { title: t.title },
      reminder: ['task.deadline_reminder', people([t.managerId])],
      overdue: ['task.manager_action_overdue', [...people([t.consultantId], true), ...people([t.managerId])]],
    });
  }

  // 2c. consultants answering clarifications
  const clarPolicy = policies.get('clarification_response');
  const clar = (await db.query(`SELECT id, task_id, response_due_at FROM qiyas.clarifications WHERE status = 'open' AND ${taskInOpenCycle('task_id')}`)).rows;
  for (const c of clar) {
    const t = await taskInfo(db, c.task_id);
    if (!t) continue;
    const qcs = people(await usersWithRole(db, 'QC'));
    await timer({
      policy: clarPolicy, key: `clar:${c.id}`, due: new Date(c.response_due_at), entityType: 'clarification', entityId: c.id, payload: { title: t.title },
      reminder: ['clarification.reminder', qcs],
      overdue: ['clarification.overdue', [...people(await usersWithRole(db, 'QC'), true), ...(await oversight(clarPolicy))]],
    });
  }

  // 2d. consultants deciding extension requests
  const extPolicy = policies.get('extension_decision');
  const ext = (await db.query(`SELECT id, task_id, decision_due_at FROM qiyas.extension_requests WHERE level = 'formal' AND status = 'pending' AND decision_due_at IS NOT NULL
     AND ${taskInOpenCycle('task_id')}`)).rows;
  for (const e of ext) {
    const t = await taskInfo(db, e.task_id);
    if (!t) continue;
    await timer({
      policy: extPolicy, key: `ext:${e.id}`, due: new Date(e.decision_due_at), entityType: 'extension_request', entityId: e.id, payload: { title: t.title },
      reminder: null,
      overdue: ['extension.decision_overdue', [...people(await usersWithRole(db, 'QC'), true), ...(await oversight(extPolicy))]],
    });
  }

  // 2e. consultants reviewing evidence
  const revPolicy = policies.get('review');
  const links = (await db.query(`SELECT l.id, l.review_due_at, l.claimed_by, a.title FROM qiyas.evidence_links l
     JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id JOIN qiyas.artifacts a ON a.id = v.artifact_id
     WHERE l.review_status IN ('submitted', 'under_review') AND l.review_due_at IS NOT NULL AND ${requirementInOpenCycle('l.cycle_requirement_id')}`)).rows;
  for (const l of links) {
    const reviewers = l.claimed_by ? [l.claimed_by] : await usersWithRole(db, 'QC');
    await timer({
      policy: revPolicy, key: `rev:${l.id}`, due: new Date(l.review_due_at), entityType: 'evidence_link', entityId: l.id, payload: { title: l.title },
      reminder: ['evidence.review_reminder', people(reviewers)],
      overdue: ['evidence.review_overdue', [...people(reviewers, true), ...(await oversight(revPolicy))]],
    });
  }

  // 2f. submission officers posting accepted evidence
  const postPolicy = policies.get('posting');
  if (postPolicy?.duration_business_days != null) {
    const accepted = (await db.query(`SELECT l.id, a.title,
         (SELECT max(d.at) FROM qiyas.review_decisions d WHERE d.evidence_link_id = l.id AND d.decision = 'accept') AS accepted_at
       FROM qiyas.evidence_links l JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id JOIN qiyas.artifacts a ON a.id = v.artifact_id
       WHERE l.review_status = 'accepted' AND l.submission_status = 'not_posted' AND ${requirementInOpenCycle('l.cycle_requirement_id')}`)).rows;
    const officers = await usersWithRole(db, 'DSO');
    for (const l of accepted) {
      if (!l.accepted_at) continue;
      const due = addBusinessDays(new Date(l.accepted_at), postPolicy.duration_business_days, calendar);
      await timer({
        policy: postPolicy, key: `post:${l.id}`, due, entityType: 'evidence_link', entityId: l.id, payload: { title: l.title },
        reminder: ['submission.reminder', people(officers)],
        overdue: ['submission.overdue', [...people(officers, true), ...(await oversight(postPolicy))]],
      });
    }
  }

  // 3. event notifications from the audit log (including this run's escalations)
  report.notifications += await dispatchAuditEvents(db, now);
  return report;
}
