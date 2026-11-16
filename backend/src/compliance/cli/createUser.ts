/**
 * Users and roles from the command line, until the administration screens can create accounts.
 *
 * One user with one role:
 *   node dist/compliance/cli/createUser.js --email sara@entity.gov.sa --name "Sara" [--name-ar "سارة"] \
 *        --role EMP --department IT [--department-name-ar "تقنية المعلومات" --department-name-en "Information Technology"]
 *   Roles: QC (Qiyas consultant), DM (department manager), EMP (employee), DSO (DGA submission officer),
 *          EXE (executive viewer), ADM (system administrator). DM and EMP need --department (its code;
 *          it is created when the names are given). Password from QIYAS_USER_PASSWORD, else generated
 *          and printed once. An existing user keeps their password and gains the role.
 *
 * A full set of test accounts, one per role (test installations only):
 *   node dist/compliance/cli/createUser.js --test-users --domain test.example.com --confirm-test
 *   Creates departments IT and HR and nine accounts (two consultants, so one can review the other's
 *   uploads; managers and employees in both departments). Passwords are generated and printed once.
 */
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Client } from 'pg';
import { GrantError, ROLE_CODES, RoleCode, validateGrant } from '../domain/permissions';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

interface NewUser { email: string; name: string; nameAr?: string; role: RoleCode; department?: { code: string; nameAr?: string; nameEn?: string; manager?: boolean } }

async function ensureDepartment(db: Client, d: NonNullable<NewUser['department']>): Promise<string> {
  const found = (await db.query('SELECT id FROM qiyas.departments WHERE code = $1', [d.code])).rows[0];
  if (found) return found.id;
  if (!d.nameAr || !d.nameEn) throw new Error(`Department ${d.code} does not exist; give --department-name-ar and --department-name-en to create it`);
  return (await db.query('INSERT INTO qiyas.departments (code, name_ar, name_en) VALUES ($1, $2, $3) RETURNING id', [d.code, d.nameAr, d.nameEn])).rows[0].id;
}

/** Creates the user if needed and grants the role. Returns the generated password, if any. */
async function createUser(db: Client, u: NewUser, password?: string): Promise<{ password: string | null }> {
  const email = u.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error(`Invalid email: ${u.email}`);
  const scoped = u.role === 'DM' || u.role === 'EMP';
  if (scoped && !u.department) throw new Error(`${u.role} needs --department`);
  const departmentId = u.department ? await ensureDepartment(db, u.department) : null;

  let user = (await db.query('SELECT id FROM public.users WHERE lower(email) = $1', [email])).rows[0];
  let generated: string | null = null;
  if (!user) {
    const pw = password || (generated = randomBytes(12).toString('base64url'));
    if (pw.length < 12) throw new Error('Passwords must be at least 12 characters');
    user = (await db.query('INSERT INTO public.users (email, name, name_ar, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, u.name, u.nameAr ?? null, await bcrypt.hash(pw, 12)])).rows[0];
  }
  const existing = (await db.query(`SELECT r.code AS role, g.department_id AS "departmentId" FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id
     WHERE g.user_id = $1 AND g.revoked_at IS NULL`, [user.id])).rows;
  const grant = { role: u.role, departmentId: scoped ? departmentId : null };
  try {
    validateGrant(existing, grant);
    await db.query(`INSERT INTO qiyas.role_grants (role_id, user_id, department_id) SELECT id, $2, $3 FROM qiyas.roles WHERE code = $1`, [u.role, user.id, grant.departmentId]);
  } catch (e) {
    if (!(e instanceof GrantError && e.code === 'duplicate')) throw e;
  }
  if (scoped && departmentId) {
    const member = (await db.query('SELECT 1 FROM qiyas.department_members WHERE department_id = $1 AND user_id = $2 AND valid_to IS NULL', [departmentId, user.id])).rows[0];
    if (!member) {
      const wantsManager = u.role === 'DM';
      const hasManager = (await db.query(`SELECT 1 FROM qiyas.department_members WHERE department_id = $1 AND membership = 'manager' AND valid_to IS NULL`, [departmentId])).rows[0];
      await db.query('INSERT INTO qiyas.department_members (department_id, user_id, membership) VALUES ($1, $2, $3)',
        [departmentId, user.id, wantsManager && !hasManager ? 'manager' : 'member']);
    }
  }
  await db.query(`INSERT INTO qiyas.audit_log (actor_id, action, entity_type, entity_id, after_value) VALUES (NULL, 'admin.user_created_cli', 'user', $1, $2)`,
    [user.id, JSON.stringify({ email, role: u.role, department: u.department?.code ?? null })]);
  return { password: generated };
}

const TEST_DEPARTMENTS = [
  { code: 'IT', nameAr: 'إدارة تقنية المعلومات', nameEn: 'Information Technology' },
  { code: 'HR', nameAr: 'إدارة الموارد البشرية', nameEn: 'Human Resources' },
];
const testUsers = (domain: string): NewUser[] => [
  { email: `consultant1@${domain}`, name: 'Consultant One', nameAr: 'المستشار الأول', role: 'QC' },
  { email: `consultant2@${domain}`, name: 'Consultant Two', nameAr: 'المستشار الثاني', role: 'QC' },
  { email: `submission@${domain}`, name: 'Submission Officer', nameAr: 'مسؤول الرفع', role: 'DSO' },
  { email: `executive@${domain}`, name: 'Executive', nameAr: 'الإدارة العليا', role: 'EXE' },
  { email: `it.manager@${domain}`, name: 'IT Manager', nameAr: 'مدير تقنية المعلومات', role: 'DM', department: TEST_DEPARTMENTS[0] },
  { email: `it.employee@${domain}`, name: 'IT Employee', nameAr: 'موظف تقنية المعلومات', role: 'EMP', department: TEST_DEPARTMENTS[0] },
  { email: `hr.manager@${domain}`, name: 'HR Manager', nameAr: 'مدير الموارد البشرية', role: 'DM', department: TEST_DEPARTMENTS[1] },
  { email: `hr.employee@${domain}`, name: 'HR Employee', nameAr: 'موظف الموارد البشرية', role: 'EMP', department: TEST_DEPARTMENTS[1] },
  { email: `admin@${domain}`, name: 'Test Administrator', nameAr: 'مدير النظام (اختبار)', role: 'ADM' },
];

async function main() {
  const db = new Client({
    host: process.env.POSTGRES_HOST || 'localhost', port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  const usage = () => {
    console.error('Usage: createUser --email <email> --name <name> --role QC|DM|EMP|DSO|EXE|ADM [--department CODE] [--name-ar ...]\n'
      + '   or: createUser --test-users --domain <domain> --confirm-test');
    process.exit(2);
  };
  let users: NewUser[];
  if (flag('test-users')) {
    const domain = arg('domain');
    if (!domain || !flag('confirm-test')) usage();
    users = testUsers(domain!);
  } else {
    const role = arg('role')?.toUpperCase() as RoleCode | undefined;
    if (!arg('email') || !arg('name') || !role || !ROLE_CODES.includes(role)) usage();
    const dept = arg('department');
    users = [{ email: arg('email')!, name: arg('name')!, nameAr: arg('name-ar'), role: role!,
      department: dept ? { code: dept, nameAr: arg('department-name-ar'), nameEn: arg('department-name-en') } : undefined }];
  }
  await db.connect();
  try {
    await db.query('BEGIN');
    const rows: Array<{ email: string; role: string; department: string; password: string }> = [];
    for (const u of users) {
      const r = await createUser(db, u, users.length === 1 ? process.env.QIYAS_USER_PASSWORD : undefined);
      rows.push({ email: u.email.toLowerCase(), role: u.role, department: u.department?.code ?? '', password: r.password ?? '(unchanged / as set)' });
    }
    await db.query('COMMIT');
    console.log('Accounts (passwords are shown once; store them safely):');
    for (const r of rows) console.log(`  ${r.role.padEnd(4)} ${r.department.padEnd(3)} ${r.email.padEnd(36)} ${r.password}`);
  } catch (e) {
    await db.query('ROLLBACK').catch(() => undefined);
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

void main();
