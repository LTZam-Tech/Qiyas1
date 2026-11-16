/**
 * Wires Phase 1 into the running server:
 *   - applies the "qiyas" migrations and seeds the role matrix at startup
 *   - mounts the API at /api/v2 behind the existing login
 *   - runs the deadline scheduler and email sender every few minutes
 *
 * Environment:
 *   QIYAS_STORAGE                  "minio" (production) or "disk" (default; development)
 *   QIYAS_EVIDENCE_DIR             evidence folder when QIYAS_STORAGE=disk (default ./evidence-store)
 *   MINIO_ENDPOINT / MINIO_PORT / MINIO_USE_SSL / MINIO_ACCESS_KEY / MINIO_SECRET_KEY
 *                                  (MINIO_ROOT_USER / MINIO_ROOT_PASSWORD are accepted as the keys)
 *   QIYAS_MINIO_BUCKET             default qiyas-evidence;  QIYAS_MINIO_SSE=true asks MinIO to encrypt objects
 *   QIYAS_CLAMAV_HOST / QIYAS_CLAMAV_PORT   clamd for virus scanning (port 3310); required in production
 *   QIYAS_ALLOW_DEV_SCANNER=true   lets production start without ClamAV (test installations only)
 *   QIYAS_LOAD_SHIPPED_DATA        "off" skips loading the DGA frameworks shipped with the release
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
import { syncLibrary } from './library/library';
import { EvidenceDeps } from './evidence/evidence';
import { DevScanner, EvidenceStorage, LocalDiskStorage, VirusScanner } from './evidence/storage';
import { ClamAvScanner, MinioStorage } from './evidence/productionAdapters';
import { loadShippedData } from './framework/shipped';
import { logoFile, publicBranding } from './admin/branding';
import express from 'express';
import { Mailer, sendPendingEmails } from './notifications/mailer';
import { runScheduler } from './notifications/scheduler';

interface Log {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

export function evidenceDepsFromEnv(log: Log, env: NodeJS.ProcessEnv = process.env): EvidenceDeps {
  const production = env.NODE_ENV === 'production';
  let storage: EvidenceStorage;
  if (env.QIYAS_STORAGE === 'minio') {
    const accessKey = env.MINIO_ACCESS_KEY || env.MINIO_ROOT_USER;
    const secretKey = env.MINIO_SECRET_KEY || env.MINIO_ROOT_PASSWORD;
    if (!env.MINIO_ENDPOINT || !accessKey || !secretKey) throw new Error('QIYAS_STORAGE=minio needs MINIO_ENDPOINT and MinIO credentials');
    storage = new MinioStorage({
      endPoint: env.MINIO_ENDPOINT, port: Number(env.MINIO_PORT || 9000), useSSL: env.MINIO_USE_SSL === 'true',
      accessKey, secretKey, bucket: env.QIYAS_MINIO_BUCKET || 'qiyas-evidence', serverSideEncryption: env.QIYAS_MINIO_SSE === 'true',
    });
    log.info('Evidence storage: MinIO', { endPoint: env.MINIO_ENDPOINT, bucket: env.QIYAS_MINIO_BUCKET || 'qiyas-evidence' });
  } else {
    const dir = env.QIYAS_EVIDENCE_DIR || path.resolve(process.cwd(), 'evidence-store');
    if (production) log.warn('Evidence storage is a local folder; set QIYAS_STORAGE=minio for production', { dir });
    storage = new LocalDiskStorage(dir);
  }
  let scanner: VirusScanner;
  if (env.QIYAS_CLAMAV_HOST) {
    scanner = new ClamAvScanner({ host: env.QIYAS_CLAMAV_HOST, port: Number(env.QIYAS_CLAMAV_PORT || 3310) });
    log.info('Virus scanning: ClamAV', { host: env.QIYAS_CLAMAV_HOST });
  } else {
    if (production && env.QIYAS_ALLOW_DEV_SCANNER !== 'true') {
      throw new Error('Production needs ClamAV: set QIYAS_CLAMAV_HOST (or QIYAS_ALLOW_DEV_SCANNER=true for a test installation)');
    }
    log.warn('Virus scanning uses the development scanner (EICAR only); connect ClamAV before real use');
    scanner = new DevScanner();
  }
  return { storage, scanner };
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
    await client.query('BEGIN');
    try {
      // official DGA versions shipped with this release (new ones only), then the
      // regulations catalogue and the citations of every imported framework
      if (process.env.QIYAS_LOAD_SHIPPED_DATA !== 'off') await loadShippedData(client);
      await syncLibrary(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    }
    return ran;
  } finally {
    client.release();
  }
}

/** Routes open before sign-in: the login screen's branding, and component health for monitoring. */
export function createPublicRouter(pool: PoolLike, evidence: EvidenceDeps) {
  const r = express.Router();
  const withDb = async <T>(fn: (db: Awaited<ReturnType<PoolLike['connect']>>) => Promise<T>) => {
    const c = await pool.connect();
    try { return await fn(c); } finally { c.release(); }
  };
  r.get('/branding', async (_req, res) => {
    try { res.json({ success: true, data: await withDb(publicBranding) }); } catch { res.status(503).json({ success: false }); }
  });
  r.get('/branding/logo', async (_req, res) => {
    try {
      const logo = await withDb((db) => logoFile(db, evidence));
      if (!logo) { res.status(404).end(); return; }
      res.setHeader('Content-Type', logo.mimeType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(logo.content);
    } catch { res.status(503).end(); }
  });
  r.get('/health', async (_req, res) => {
    const check = async (fn: () => Promise<boolean>) => { try { return (await fn()) ? 'up' : 'down'; } catch { return 'down'; } };
    const storage = evidence.storage as EvidenceStorage & { ping?: () => Promise<boolean> };
    const scanner = evidence.scanner as VirusScanner & { ping?: () => Promise<boolean> };
    const components = {
      database: await check(() => withDb(async (db) => (await db.query('SELECT 1 AS ok')).rows[0].ok === 1)),
      storage: { kind: storage instanceof MinioStorage ? 'minio' : 'disk', status: await check(() => (storage.ping ? storage.ping() : storage.exists('health-check').then(() => true))) },
      scanner: { kind: scanner instanceof ClamAvScanner ? 'clamav' : 'development', status: await check(() => (scanner.ping ? scanner.ping() : Promise.resolve(true))) },
    };
    const ok = components.database === 'up' && components.storage.status === 'up' && components.scanner.status === 'up';
    res.status(ok ? 200 : 503).json({ status: ok ? 'healthy' : 'unhealthy', components, at: new Date().toISOString() });
  });
  return r;
}

export function mountComplianceApi(app: Application, pool: PoolLike, authenticate: RequestHandler, evidence: EvidenceDeps): void {
  app.use('/api/v2/public', createPublicRouter(pool, evidence));
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
