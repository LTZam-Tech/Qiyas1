import { Client } from 'pg';
import { ComplianceError } from '../../core/context';
import { connectTestDb, resetSchema } from '../../db/__dbtests__/testDb';
import { DevScanner, EICAR_TEST_STRING, InMemoryStorage } from '../../evidence/storage';
import { loadShippedData } from '../../framework/shipped';
import { World, buildWorld } from '../../work/__dbtests__/world';
import { logoFile, publicBranding, removeLogo, setLogo } from '../branding';
import { grantRole, saveOrgSettings } from '../admin';
import { createUser, roleId } from '../../db/__dbtests__/testDb';

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
