/**
 * Email delivery (N-1, N-2): in the recipient's language, retried up to 3
 * times with growing waits, then left as "dead" for the administrator.
 * In-app notifications are never affected by email failures.
 */
import { Db, one } from '../core/context';
import { EventCode, Language, render } from './catalogue';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  language: Language;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

export const MAX_EMAIL_ATTEMPTS = 3;
/** 1, 4, 16 minutes. */
export const retryDelayMs = (attempt: number) => 4 ** (attempt - 1) * 60_000;

export interface EmailRunReport {
  sent: number;
  failed: number;
  dead: number;
}

export async function sendPendingEmails(db: Db, mailer: Mailer, now: Date, batchSize = 50): Promise<EmailRunReport> {
  const org = await one(db, 'SELECT default_language FROM qiyas.org_settings LIMIT 1');
  const { rows } = await db.query(
    `SELECT n.id, n.event_code, n.payload, n.email_attempts, u.email, p.language
       FROM qiyas.notifications n JOIN public.users u ON u.id = n.user_id
       LEFT JOIN qiyas.user_preferences p ON p.user_id = n.user_id
      WHERE n.email_status IN ('pending', 'failed') AND n.email_next_attempt_at <= $1
      ORDER BY n.email_next_attempt_at LIMIT $2 FOR UPDATE OF n SKIP LOCKED`, [now, batchSize]);
  const report: EmailRunReport = { sent: 0, failed: 0, dead: 0 };
  for (const n of rows) {
    const language: Language = n.language ?? org?.default_language ?? 'ar';
    const { title, reason } = render(n.event_code as EventCode, language, n.payload ?? {});
    try {
      await mailer.send({ to: n.email, subject: title, text: reason ? `${title}\n\n${reason}` : title, language });
      await db.query(`UPDATE qiyas.notifications SET email_status = 'sent', email_attempts = email_attempts + 1, email_last_error = NULL WHERE id = $1`, [n.id]);
      report.sent += 1;
    } catch (err) {
      const attempts = n.email_attempts + 1;
      const dead = attempts >= MAX_EMAIL_ATTEMPTS;
      await db.query(`UPDATE qiyas.notifications SET email_status = $2, email_attempts = $3, email_next_attempt_at = $4, email_last_error = $5 WHERE id = $1`,
        [n.id, dead ? 'dead' : 'failed', attempts, dead ? null : new Date(now.getTime() + retryDelayMs(attempts)), String((err as Error).message ?? err).slice(0, 500)]);
      if (dead) report.dead += 1;
      else report.failed += 1;
    }
  }
  return report;
}
