import { Client } from 'pg';
import { ComplianceError, departmentManager, loadActor } from '../../core/context';
import { connectTestDb, resetSchema } from '../../db/__dbtests__/testDb';
import { linkEvidence, submitEvidence, uploadEvidence } from '../../evidence/evidence';
import { claimEvidence } from '../../evidence/review';
import { DevScanner, EICAR_TEST_STRING, InMemoryStorage } from '../../evidence/storage';
import { assignTask } from '../../work/tasks';
import { loadShippedData } from '../../framework/shipped';
import { World, buildWorld } from '../../work/__dbtests__/world';
import { logoFile, publicBranding, removeLogo, setLogo } from '../branding';
import { addDepartmentMember, grantRole, listUsers, saveOrgSettings, setDepartmentManager, setGroupMembers } from '../admin';
import { createUser, deactivateUser, reactivateUser, roleId } from '../../db/__dbtests__/testDb';

let db: Client;
let w: World;
const deps = () => ({ storage: new InMemoryStorage(), scanner: new DevScanner() });

beforeAll(async () => {
  db = await connectTestDb();
  await resetSchema(db);
});
afterAll(async () => db?.end());
beforeEach(async () => { await db.query('BEGIN'); });
afterEach(async () => db.query('ROLLBACK'));

async function fails(code: string, fn: () => Promise<unknown>) {
  await db.query('SAVEPOINT f');
  try { await fn(); } catch (e) {
    await db.query('ROLLBACK TO SAVEPOINT f');
    if (e instanceof ComplianceError) return expect(e.code).toBe(code);
    throw e;
  }
  throw new Error(`expected a ${code} error`);
}

describe('shipped DGA data (docs 09 §4)', () => {
  it('loads v4.0, v5.0 and their crosswalk once, active, as the system', async () => {
    const first = await loadShippedData(db);
    expect(first).toEqual({ frameworks: ['DGA-1-2-1-111 v4.0', 'DGA-1-2-1-111 v5.0'], crosswalks: ['4.0 → 5.0'] });
    expect(await loadShippedData(db)).toEqual({ frameworks: [], crosswalks: [] });
    const { rows } = await db.query(`SELECT version, status, imported_by FROM qiyas.framework_versions ORDER BY version`);
    expect(rows).toEqual([{ version: '4.0', status: 'active', imported_by: null }, { version: '5.0', status: 'active', imported_by: null }]);
    expect((await db.query('SELECT count(*)::int AS n FROM qiyas.crosswalk')).rows[0].n).toBeGreaterThan(300);
    expect((await db.query(`SELECT count(*)::int AS n FROM qiyas.audit_log WHERE action = 'framework.imported' AND actor_id IS NULL`)).rows[0].n).toBe(2);
  });
});

describe('client branding (docs 09 §7)', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('logo')]);

  it('names and logo come from settings; only administrators change them', async () => {
    w = await buildWorld(db);
    const d = deps();
    expect(await publicBranding(db)).toMatchObject({ nameAr: null, hasLogo: false });
    const tariq = await w.ctx('tariq');
    await fails('conflict', () => setLogo(tariq, d, { content: png, filename: 'logo.png' }));
    await saveOrgSettings(tariq, { nameAr: 'جهة حكومية', nameEn: 'Government Entity' });
    await fails('forbidden', async () => setLogo(await w.ctx('alaa'), d, { content: png, filename: 'logo.png' }));
    await fails('validation', () => setLogo(tariq, d, { content: Buffer.from('<svg/>'), filename: 'logo.svg' }));
    await fails('validation', () => setLogo(tariq, d, { content: Buffer.from('not an image'), filename: 'logo.png' }));
    await fails('conflict', () => setLogo(tariq, d, { content: Buffer.concat([png, Buffer.from(EICAR_TEST_STRING)]), filename: 'logo.png' }));
    await setLogo(tariq, d, { content: png, filename: 'logo.png' });
    expect(await publicBranding(db)).toMatchObject({ nameAr: 'جهة حكومية', nameEn: 'Government Entity', hasLogo: true });
    expect(await logoFile(db, d)).toEqual({ content: png, mimeType: 'image/png' });
    await removeLogo(tariq);
    expect(await logoFile(db, d)).toBeNull();
  });
});

// ------------------------------------------------------------------ security remediation B5 (C9)
describe('role grants and SoD-5 (C9)', () => {
  it('sequential QC then DSO is refused (control)', async () => {
    w = await buildWorld(db);
    const tariq = await w.ctx('tariq');
    const u = await createUser(db, 'Rami');
    await grantRole(tariq, u, 'QC');
    await fails('validation', () => grantRole(tariq, u, 'DSO'));
    // positive control: another person becomes a submission officer
    await grantRole(tariq, await createUser(db, 'Lina'), 'DSO');
  });

  it('a QC role held through a pre-existing group grant also blocks DSO in the service', async () => {
    w = await buildWorld(db);
    const tariq = await w.ctx('tariq');
    const u = await createUser(db, 'Badr');
    const g = (await db.query(`INSERT INTO qiyas.groups (code, name_ar, name_en) VALUES ('legacy_qc', 'q', 'q') RETURNING id`)).rows[0].id;
    await db.query('INSERT INTO qiyas.group_members (group_id, user_id) VALUES ($1, $2)', [g, u]);
    // as it could exist before migration 008 (trigger off inside this test transaction only)
    await db.query('ALTER TABLE qiyas.role_grants DISABLE TRIGGER trg_role_grant_check');
    await db.query('INSERT INTO qiyas.role_grants (role_id, group_id) VALUES ($1, $2)', [await roleId(db, 'QC'), g]);
    await db.query('ALTER TABLE qiyas.role_grants ENABLE TRIGGER trg_role_grant_check');
    await fails('validation', () => grantRole(tariq, u, 'DSO'));
    // positive control: a role that does not conflict is still granted
    await grantRole(tariq, u, 'EXE');
  });
});

// ------------------------------------------------------------------ security remediation B6 (C17, D-C17-1/3/5)
describe('account deactivation cascade (C17, migration 011)', () => {
  const activeGrants = async (userId: string) =>
    (await db.query(`SELECT r.code FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id WHERE g.user_id = $1 AND g.revoked_at IS NULL ORDER BY r.code`, [userId])).rows.map((r) => r.code);
  const groupsOf = async (userId: string) =>
    (await db.query('SELECT count(*)::int AS n FROM qiyas.group_members WHERE user_id = $1', [userId])).rows[0].n;
  const deactivationAudits = async (userId: string) =>
    (await db.query(`SELECT before_value, after_value FROM qiyas.audit_log WHERE action = 'user.deactivated' AND entity_id = $1`, [userId])).rows;
  const oversight = async (userId: string) =>
    db.query(`INSERT INTO qiyas.group_members (group_id, user_id) SELECT id, $1 FROM qiyas.groups WHERE code = 'compliance_oversight'`, [userId]);

  /** Ali submits evidence for review on an IT task; returns the link id. */
  async function submittedLink() {
    const taskId = await w.publishedTask();
    await assignTask(await w.ctx('mona'), taskId, w.users.ali);
    const ali = await w.ctx('ali');
    const up = await uploadEvidence(ali, deps(), { taskId, title: 'Strategy', file: { content: Buffer.from('%PDF plan'), filename: 'plan.pdf' } });
    const linkId = await linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId });
    await submitEvidence(ali, taskId);
    return linkId;
  }

  it('deactivating a user revokes v2 grants, group memberships and review claims', async () => {
    w = await buildWorld(db);
    await oversight(w.users.alaa);
    const linkId = await submittedLink();
    await claimEvidence(await w.ctx('alaa'), linkId);
    await deactivateUser(db, w.users.alaa); // updateUser status=inactive

    expect(await activeGrants(w.users.alaa)).toEqual([]);
    expect((await db.query(`SELECT revoked_by FROM qiyas.role_grants WHERE user_id = $1`, [w.users.alaa])).rows).toEqual([{ revoked_by: null }]);
    expect(await groupsOf(w.users.alaa)).toBe(0);
    const link = (await db.query('SELECT review_status, claimed_by FROM qiyas.evidence_links WHERE id = $1', [linkId])).rows[0];
    expect(link).toEqual({ review_status: 'submitted', claimed_by: null });
    const released = await db.query(`SELECT reason, actor_id FROM qiyas.audit_log WHERE action = 'review.released' AND entity_id = $1`, [linkId]);
    expect(released.rows).toEqual([{ reason: 'user deactivated', actor_id: null }]);
    const [a] = await deactivationAudits(w.users.alaa);
    expect(a.before_value.grants.map((g: { role: string }) => g.role)).toEqual(['QC']);
    expect(a.before_value.groups).toEqual(['compliance_oversight']);
    expect(a.after_value).toMatchObject({ isActive: false, deleted: false, releasedClaims: 1 });

    // positive controls: the other consultant keeps his role and can now claim the released link
    expect(await activeGrants(w.users.ahmad)).toEqual(['QC']);
    await claimEvidence(await w.ctx('ahmad'), linkId);
  });

  it('deleting a department manager revokes the DM role but leaves membership and tasks for the administrator (D-C17-2/3)', async () => {
    w = await buildWorld(db);
    const taskId = await w.publishedTask(); // owned by Mona, awaiting assignment
    await deactivateUser(db, w.users.mona, 'deleted'); // deleteUser
    expect(await activeGrants(w.users.mona)).toEqual([]);
    const m = await db.query(`SELECT membership FROM qiyas.department_members WHERE user_id = $1 AND valid_to IS NULL`, [w.users.mona]);
    expect(m.rows).toEqual([{ membership: 'manager' }]);
    expect((await db.query('SELECT current_owner_id FROM qiyas.tasks WHERE id = $1', [taskId])).rows[0].current_owner_id).toBe(w.users.mona);
    expect(await departmentManager(db, w.depts.it)).toBeUndefined(); // the services see no manager
    expect((await deactivationAudits(w.users.mona))[0].after_value).toMatchObject({ isActive: false, deleted: true });
    // the administrator sets a new manager
    const boss = await createUser(db, 'NewBoss');
    await setDepartmentManager(await w.ctx('tariq'), w.depts.it, boss);
    expect(await departmentManager(db, w.depts.it)).toBe(boss);
  });

  it('reactivating does not restore grants', async () => {
    w = await buildWorld(db);
    await oversight(w.users.alaa);
    await deactivateUser(db, w.users.alaa);
    await reactivateUser(db, w.users.alaa);
    expect(await activeGrants(w.users.alaa)).toEqual([]);
    expect(await groupsOf(w.users.alaa)).toBe(0);
    expect((await loadActor(db, w.users.alaa)).grants).toEqual([]);
    expect(await deactivationAudits(w.users.alaa)).toHaveLength(1); // reactivation is not a deactivation
    // the administrator grants again
    await grantRole(await w.ctx('tariq'), w.users.alaa, 'QC');
    expect(await activeGrants(w.users.alaa)).toEqual(['QC']);
  });

  it('control: updating the name (or re-saving status=active) changes nothing', async () => {
    w = await buildWorld(db);
    await oversight(w.users.alaa);
    await db.query(`UPDATE public.users SET name = 'Alaa Renamed' WHERE id = $1`, [w.users.alaa]);
    await db.query('UPDATE public.users SET name = $2, is_active = TRUE WHERE id = $1', [w.users.alaa, 'Alaa']); // v1 updateUser with status=active
    expect(await activeGrants(w.users.alaa)).toEqual(['QC']);
    expect(await groupsOf(w.users.alaa)).toBe(1);
    expect(await deactivationAudits(w.users.alaa)).toEqual([]);
  });

  it('grantRole refuses an inactive user, and so do the other admin assignments', async () => {
    w = await buildWorld(db);
    const tariq = await w.ctx('tariq');
    const u = await createUser(db, 'Former');
    await deactivateUser(db, u, 'inactive');
    await fails('validation', () => grantRole(tariq, u, 'EXE'));
    await fails('validation', () => addDepartmentMember(tariq, w.depts.hr, u));
    await fails('validation', () => setDepartmentManager(tariq, w.depts.hr, u));
    await fails('validation', () => setGroupMembers(tariq, 'compliance_oversight', [w.users.tariq, u]));
    const deleted = await createUser(db, 'Gone');
    await deactivateUser(db, deleted, 'deleted');
    await fails('validation', () => grantRole(tariq, deleted, 'EXE'));
    expect(await activeGrants(u)).toEqual([]);
    expect((await db.query('SELECT count(*)::int AS n FROM qiyas.department_members WHERE user_id = $1', [u])).rows[0].n).toBe(0);
    expect(await departmentManager(db, w.depts.hr)).toBe(w.users.khalid);
    // positive control: an active person is granted, added and listed as active
    const fresh = await createUser(db, 'Fresh');
    await grantRole(tariq, fresh, 'EXE');
    await addDepartmentMember(tariq, w.depts.hr, fresh);
    await setGroupMembers(tariq, 'compliance_oversight', [w.users.tariq, fresh]);
    const users = (await listUsers(tariq)) as Array<{ id: string; active: boolean }>;
    expect(users.find((x) => x.id === u)?.active).toBe(false);
    expect(users.find((x) => x.id === fresh)?.active).toBe(true);
  });
});
