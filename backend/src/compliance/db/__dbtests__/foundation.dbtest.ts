import { Client } from 'pg';
import { loadMigrations, migrate } from '../migrate';
import { seedRbac } from '../seedRbac';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_CODES } from '../../domain/permissions';
import { connectTestDb, createUser, expectDbError, resetSchema, roleId } from './testDb';

let db: Client;

beforeAll(async () => {
  db = await connectTestDb();
  await resetSchema(db);
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query('BEGIN');
});

afterEach(async () => {
  await db.query('ROLLBACK');
});

describe('foundation migration on real PostgreSQL', () => {
  it('creates the qiyas schema and records the migration', async () => {
    const { rows } = await db.query('SELECT name FROM qiyas.schema_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(loadMigrations().map((m) => m.name));
    const tables = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'qiyas'`);
    const names = tables.rows.map((r) => r.table_name);
    for (const t of ['departments', 'department_members', 'groups', 'roles', 'role_grants', 'framework_versions', 'requirements', 'proof_items', 'measurement_cycles', 'cycle_requirements', 'evidence_banks', 'audit_log']) {
      expect(names).toContain(t);
    }
  });

  it('running migrations and the seed again changes nothing', async () => {
    expect(await migrate(db)).toEqual([]);
    await seedRbac(db);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM qiyas.roles');
    expect(rows[0].n).toBe(ROLE_CODES.length);
  });

  it('seeds the permission catalogue and the role matrix', async () => {
    const perms = await db.query('SELECT count(*)::int AS n FROM qiyas.permissions');
    expect(perms.rows[0].n).toBe(PERMISSIONS.length);
    const dm = await db.query(`SELECT p.code, rp.scope FROM qiyas.role_permissions rp
      JOIN qiyas.roles r ON r.id = rp.role_id JOIN qiyas.permissions p ON p.id = rp.permission_id WHERE r.code = 'DM'`);
    expect(Object.fromEntries(dm.rows.map((r) => [r.code, r.scope]))).toEqual(DEFAULT_ROLE_PERMISSIONS.DM);
    const scoped = await db.query(`SELECT code FROM qiyas.roles WHERE department_scoped ORDER BY code`);
    expect(scoped.rows.map((r) => r.code)).toEqual(['DM', 'EMP']);
  });
});

describe('organization rules enforced by the database', () => {
  async function department(code: string): Promise<string> {
    const { rows } = await db.query(`INSERT INTO qiyas.departments (code, name_ar, name_en) VALUES ($1, $1, $1) RETURNING id`, [code]);
    return rows[0].id;
  }

  it('BR-ADM-02: one current manager per department', async () => {
    const it = await department('IT');
    const [a, b] = [await createUser(db, 'Mona'), await createUser(db, 'Fahad')];
    await db.query(`INSERT INTO qiyas.department_members (department_id, user_id, membership) VALUES ($1, $2, 'manager')`, [it, a]);
    const msg = await expectDbError(db, `INSERT INTO qiyas.department_members (department_id, user_id, membership) VALUES ($1, $2, 'manager')`, [it, b]);
    expect(msg).toContain('ux_department_one_manager');
    // a former manager (valid_to set) does not block the new one
    await db.query(`UPDATE qiyas.department_members SET valid_to = CURRENT_DATE WHERE user_id = $1`, [a]);
    await db.query(`INSERT INTO qiyas.department_members (department_id, user_id, membership) VALUES ($1, $2, 'manager')`, [it, b]);
  });

  it('D3: the same person can never be Consultant and Submission Officer', async () => {
    const alaa = await createUser(db, 'Alaa');
    await db.query('INSERT INTO qiyas.role_grants (role_id, user_id) VALUES ($1, $2)', [await roleId(db, 'QC'), alaa]);
    const msg = await expectDbError(db, 'INSERT INTO qiyas.role_grants (role_id, user_id) VALUES ($1, $2)', [await roleId(db, 'DSO'), alaa]);
    expect(msg).toContain('cannot be held by the same person');
  });

  it('roles are allowed for different people: Alaa and Ahmad consultants, Yousef and Jan officers (D9)', async () => {
    for (const [name, role] of [['Alaa', 'QC'], ['Ahmad', 'QC'], ['Yousef', 'DSO'], ['Jan', 'DSO']]) {
      await db.query('INSERT INTO qiyas.role_grants (role_id, user_id) VALUES ($1, $2)', [await roleId(db, role), await createUser(db, name)]);
    }
    const { rows } = await db.query(`SELECT r.code, count(*)::int AS n FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id GROUP BY r.code ORDER BY r.code`);
    expect(rows).toEqual([{ code: 'DSO', n: 2 }, { code: 'QC', n: 2 }]);
  });

  it('manager and employee roles need a department; organization roles must not have one', async () => {
    const u = await createUser(db, 'Sara');
    const it = await department('IT2');
    expect(await expectDbError(db, 'INSERT INTO qiyas.role_grants (role_id, user_id) VALUES ($1, $2)', [await roleId(db, 'DM'), u])).toContain('must be granted for a department');
    expect(await expectDbError(db, 'INSERT INTO qiyas.role_grants (role_id, user_id, department_id) VALUES ($1, $2, $3)', [await roleId(db, 'QC'), u, it])).toContain('organization-wide');
    await db.query('INSERT INTO qiyas.role_grants (role_id, user_id, department_id) VALUES ($1, $2, $3)', [await roleId(db, 'DM'), u, it]);
  });

  it('a revoked Consultant role does not block becoming a Submission Officer', async () => {
    const u = await createUser(db, 'Omar');
    await db.query('INSERT INTO qiyas.role_grants (role_id, user_id, revoked_at) VALUES ($1, $2, NOW())', [await roleId(db, 'QC'), u]);
    await db.query('INSERT INTO qiyas.role_grants (role_id, user_id) VALUES ($1, $2)', [await roleId(db, 'DSO'), u]);
  });

  it('the same active grant cannot be given twice', async () => {
    const u = await createUser(db, 'Huda');
    const qc = await roleId(db, 'QC');
    await db.query('INSERT INTO qiyas.role_grants (role_id, user_id) VALUES ($1, $2)', [qc, u]);
    expect(await expectDbError(db, 'INSERT INTO qiyas.role_grants (role_id, user_id) VALUES ($1, $2)', [qc, u])).toContain('ux_role_grant_active');
  });
});

describe('framework and cycles', () => {
  async function framework(status = 'draft'): Promise<string> {
    const { rows } = await db.query(
      `INSERT INTO qiyas.framework_versions (issuer, document_code, version, published_on, title_ar, title_en, status, source_file)
       VALUES ('DGA', 'DGA-1-2-1-111', $1, '2026-04-01', 'المعايير', 'Standards', $2, '{}') RETURNING id`,
      [`v-${Math.random()}`, status],
    );
    return rows[0].id;
  }

  it('BR-FW-02: a framework version in use cannot be edited', async () => {
    const id = await framework('active');
    expect(await expectDbError(db, `UPDATE qiyas.framework_versions SET source_file = '{"x":1}' WHERE id = $1`, [id])).toContain('cannot be changed');
    await db.query(`UPDATE qiyas.framework_versions SET status = 'retired' WHERE id = $1`, [id]);
  });

  it('marking a requirement not applicable needs a reason', async () => {
    const fw = await framework();
    const p = await db.query(`INSERT INTO qiyas.perspectives (framework_version_id, code, sort_order, name_ar, name_en) VALUES ($1, 'P1', 1, 'م', 'P') RETURNING id`, [fw]);
    const a = await db.query(`INSERT INTO qiyas.axes (perspective_id, code, sort_order, name_ar, name_en) VALUES ($1, '5.1', 1, 'م', 'A') RETURNING id`, [p.rows[0].id]);
    const s = await db.query(`INSERT INTO qiyas.standards (axis_id, code, sort_order, title_ar, title_en) VALUES ($1, '5.1.1', 1, 'م', 'S') RETURNING id`, [a.rows[0].id]);
    const r = await db.query(`INSERT INTO qiyas.requirements (standard_id, code, kind, sort_order, text_ar, text_en) VALUES ($1, 'R1', 'single', 1, 'م', 'R') RETURNING id`, [s.rows[0].id]);
    const c = await db.query(`INSERT INTO qiyas.measurement_cycles (framework_version_id, year, name, starts_on, ends_on) VALUES ($1, 2026, 'Qiyas 2026 / v5.0', '2026-01-01', '2026-12-31') RETURNING id`, [fw]);
    expect(await expectDbError(db, `INSERT INTO qiyas.cycle_requirements (cycle_id, requirement_id, is_applicable) VALUES ($1, $2, FALSE)`, [c.rows[0].id, r.rows[0].id])).toContain('check');
    await db.query(`INSERT INTO qiyas.cycle_requirements (cycle_id, requirement_id, is_applicable, not_applicable_reason) VALUES ($1, $2, FALSE, 'Exempted by decree 123')`, [c.rows[0].id, r.rows[0].id]);
  });

  it('BR-BNK-01: one evidence bank per cycle', async () => {
    const fw = await framework();
    const c = await db.query(`INSERT INTO qiyas.measurement_cycles (framework_version_id, year, name, starts_on, ends_on) VALUES ($1, 2027, 'Qiyas 2027', '2027-01-01', '2027-12-31') RETURNING id`, [fw]);
    await db.query(`INSERT INTO qiyas.evidence_banks (cycle_id, name) VALUES ($1, 'Evidence Bank – Qiyas 2027')`, [c.rows[0].id]);
    expect(await expectDbError(db, `INSERT INTO qiyas.evidence_banks (cycle_id, name) VALUES ($1, 'second')`, [c.rows[0].id])).toContain('duplicate key');
  });
});

describe('audit log', () => {
  it('BR-AUD-02: append-only, even for the database owner', async () => {
    const { rows } = await db.query(`INSERT INTO qiyas.audit_log (action, entity_type, entity_id) VALUES ('test', 'task', 't1') RETURNING id`);
    expect(await expectDbError(db, `UPDATE qiyas.audit_log SET action = 'x' WHERE id = $1`, [rows[0].id])).toContain('append-only');
    expect(await expectDbError(db, `DELETE FROM qiyas.audit_log WHERE id = $1`, [rows[0].id])).toContain('append-only');
    expect(await expectDbError(db, `TRUNCATE qiyas.audit_log`)).toContain('append-only');
  });
});
