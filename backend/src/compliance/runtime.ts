/**
 * Wires Phase 1 into the running server:
 *   - applies the "qiyas" migrations and seeds the role matrix at startup
 *   - mounts the API at /api/v2 behind the existing login
 *   - runs the deadline scheduler and email sender every few minutes
 *
 * Environment:
 *   QIYAS_EVIDENCE_DIR             evidence files folder (default ./evidence-store)
 *   QIYAS_SCHEDULER                "off" disables the scheduler (e.g. on a second API node)
 *   QIYAS_SCHEDULER_INTERVAL_MS    default 300000 (5 minutes)
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM   email; without SMTP_HOST emails wait unsent
 */
import type { Application, RequestHandler } from 'express';
import nodemailer from 'nodemailer';
import path from 'path';
import { createComplianceRouter } from './api/router';
import { PoolLike } from './api/http';
import { loadCalendar } from './core/context';
import { migrate } from './db/migrate';
import { seedRbac } from './db/seedRbac';
import { EvidenceDeps } from './evidence/evidence';
import { DevScanner, LocalDiskStorage } from './evidence/storage';
import { Mailer, sendPendingEmails } from './notifications/mailer';
import { runScheduler } from './notifications/scheduler';

interface Log {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

export function evidenceDepsFromEnv(log: Log): EvidenceDeps {
  const dir = process.env.QIYAS_EVIDENCE_DIR || path.resolve(process.cwd(), 'evidence-store');
  if (process.env.NODE_ENV === 'production') {
    log.warn('Evidence virus scanning uses the development scanner; connect ClamAV before production use');
  }
  return { storage: new LocalDiskStorage(dir), scanner: new DevScanner() };
}

export function smtpMailerFromEnv(): Mailer | null {
  if (!process.env.SMTP_HOST) return null;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return {
    async send(email) {
      await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email.to, subject: email.subject, text: email.text });
    },
  };
}

export async function prepareComplianceDatabase(pool: PoolLike): Promise<string[]> {
  const client = await pool.connect();
  try {
    const ran = await migrate(client);
    await seedRbac(client);
    return ran;
  } finally {
    client.release();
  }
}

export function mountComplianceApi(app: Application, pool: PoolLike, authenticate: RequestHandler, evidence: EvidenceDeps): void {
  app.use('/api/v2', createComplianceRouter({ pool, authenticate, evidence }));
}

/** One scheduler pass in its own transaction. Exported for tests and manual runs. */
export async function runComplianceTick(pool: PoolLike, mailer: Mailer | null, now = new Date()) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = await runScheduler({ db: client, now, calendar: await loadCalendar(client) });
    const email = mailer ? await sendPendingEmails(client, mailer, now) : null;
    await client.query('COMMIT');
    return { ...report, email };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function startComplianceScheduler(pool: PoolLike, log: Log): () => void {
  if (process.env.QIYAS_SCHEDULER === 'off') {
    log.info('Qiyas scheduler disabled on this node');
    return () => undefined;
  }
  const mailer = smtpMailerFromEnv();
  if (!mailer) log.warn('SMTP_HOST is not set: notification emails will wait until it is configured');
  const interval = Number(process.env.QIYAS_SCHEDULER_INTERVAL_MS || 300_000);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runComplianceTick(pool, mailer);
      if (r.escalations || r.notifications) log.info('Qiyas scheduler', r);
    } catch (err) {
      log.error('Qiyas scheduler failed', err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, interval);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
