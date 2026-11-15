/**
 * First administrator of a new installation (docs/phase1/09 §4 "first run").
 *
 *   node dist/compliance/cli/createAdmin.js --email admin@entity.gov.sa --name "System Administrator" [--name-ar "مدير النظام"]
 *
 * The password comes from QIYAS_ADMIN_PASSWORD; without it a random one is
 * generated and printed once. An existing user keeps their password and is
 * only granted the System Administrator role (ADM). Run after the server has
 * started once (it applies the migrations).
 */
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Client } from 'pg';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email) || !name) {
    console.error('Usage: createAdmin --email <email> --name <name> [--name-ar <arabic name>]');
    process.exit(2);
  }
  const db = new Client({
    host: process.env.POSTGRES_HOST || 'localhost', port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await db.connect();
  try {
    await db.query('BEGIN');
    const existing = (await db.query('SELECT id FROM public.users WHERE lower(email) = $1', [email])).rows[0];
    let userId: string = existing?.id;
    let generated: string | null = null;
    if (!existing) {
      const password = process.env.QIYAS_ADMIN_PASSWORD || (generated = randomBytes(15).toString('base64url'));
      if (password.length < 12) throw new Error('QIYAS_ADMIN_PASSWORD must be at least 12 characters');
      const hash = await bcrypt.hash(password, 12);
      userId = (await db.query('INSERT INTO public.users (email, name, name_ar, password_hash) VALUES ($1, $2, $3, $4) RETURNING id', [email, name, arg('name-ar') ?? null, hash])).rows[0].id;
    }
    const granted = await db.query(`INSERT INTO qiyas.role_grants (role_id, user_id, department_id)
       SELECT r.id, $1, NULL FROM qiyas.roles r WHERE r.code = 'ADM'
         AND NOT EXISTS (SELECT 1 FROM qiyas.role_grants g WHERE g.user_id = $1 AND g.role_id = r.id AND g.revoked_at IS NULL)
       RETURNING id`, [userId]);
    await db.query(`INSERT INTO qiyas.audit_log (actor_id, action, entity_type, entity_id, after_value)
       VALUES (NULL, 'admin.first_administrator', 'user', $1, $2)`, [userId, JSON.stringify({ email, created: !existing, granted: granted.rows.length > 0 })]);
    await db.query('COMMIT');
    console.log(existing ? `User ${email} exists; ${granted.rows.length ? 'granted' : 'already has'} the System Administrator role.` : `Created ${email} with the System Administrator role.`);
    if (generated) console.log(`Temporary password (shown once, change it after signing in): ${generated}`);
  } catch (e) {
    await db.query('ROLLBACK').catch(() => undefined);
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

void main();
