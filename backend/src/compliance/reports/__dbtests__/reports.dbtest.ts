import ExcelJS from 'exceljs';
import { Client } from 'pg';
import { ComplianceError } from '../../core/context';
import { connectTestDb, resetSchema } from '../../db/__dbtests__/testDb';
import { EvidenceDeps, linkEvidence, submitEvidence, uploadEvidence } from '../../evidence/evidence';
import { acceptEvidence, claimEvidence } from '../../evidence/review';
import { DevScanner, InMemoryStorage } from '../../evidence/storage';
import { assignTask } from '../../work/tasks';
import { escalateManually } from '../../work/escalations';
import { World, buildWorld } from '../../work/__dbtests__/world';
import { availableReports, generateReport } from '../reports';
import { reportToXlsx } from '../xlsx';

let db: Client;
let w: World;
let deps: EvidenceDeps;

beforeAll(async () => {
  db = await connectTestDb();
  await resetSchema(db);
});
afterAll(async () => db?.end());
beforeEach(async () => {
  await db.query('BEGIN');
  w = await buildWorld(db);
  deps = { storage: new InMemoryStorage(), scanner: new DevScanner() };
});
afterEach(async () => db.query('ROLLBACK'));

async function fails(code: string, fn: () => Promise<unknown>) {
  await db.query('SAVEPOINT f');
  try {
    await fn();
  } catch (e) {
    await db.query('ROLLBACK TO SAVEPOINT f');
    if (e instanceof ComplianceError) return expect(e.code).toBe(code);
    throw e;
  }
  throw new Error(`expected a ${code} error`);
}

/** Ali's task with one accepted, not yet posted piece of evidence, and one escalation. */
async function acceptedEvidence() {
  const taskId = await w.publishedTask();
  await assignTask(await w.ctx('mona'), taskId, w.users.ali);
  const ali = await w.ctx('ali');
  const up = await uploadEvidence(ali, deps, { taskId, title: 'Strategy', file: { content: Buffer.from('%PDF s'), filename: 'strategy.pdf' } });
  const proofItemId = (await db.query(`SELECT id FROM qiyas.proof_items WHERE code = '5.1.1-E1'`)).rows[0].id;
  const linkId = await linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId });
  await submitEvidence(ali, taskId);
  const ahmad = await w.ctx('ahmad');
  await claimEvidence(ahmad, linkId);
  await acceptEvidence(ahmad, linkId);
  return { taskId, linkId };
}

const run = async (user: Parameters<World['ctx']>[0], code: Parameters<typeof generateReport>[1], lang: 'ar' | 'en' | 'ur' = 'en', extra = {}) =>
  generateReport(await w.ctx(user), code, { cycleId: w.cycleId, ...extra }, lang);

describe('reports (docs 08 §6)', () => {
  it('lists the reports each role may run', async () => {
    const codes = async (u: Parameters<World['ctx']>[0]) => (await availableReports(await w.ctx(u), 'en')).map((r) => r.code);
    expect(await codes('alaa')).toEqual(['readiness', 'not-posted', 'evidence-register', 'department-performance', 'deadline-log', 'sla', 'requirement-dossier', 'audit-extract']);
    expect(await codes('yousef')).toEqual(['not-posted', 'evidence-register', 'requirement-dossier']);
    expect(await codes('mona')).toEqual(['department-performance']);
    expect(await codes('ali')).toEqual([]);
    expect(await codes('tariq')).toEqual(['audit-extract']);
    await fails('forbidden', () => run('ali', 'readiness'));
  });

  it('readiness: counts only accepted evidence, in the chosen language', async () => {
    await acceptedEvidence();
    const en = await run('alaa', 'readiness');
    expect(en.summary[0]).toMatchObject({ label: 'Readiness', value: 100, type: 'percent' });
    expect(en.sections.map((s) => s.key)).toEqual(['perspectives', 'axes', 'standards', 'requirements']);
    expect(en.sections[3].rows[0]).toMatchObject({ code: '5.1.1-R1', readiness: 'Ready', accepted: 1, posted: 0 });
    const ar = await run('alaa', 'readiness', 'ar');
    expect(ar.title).toBe('تقرير جاهزية الدورة');
    expect(ar.sections[3].rows[0].readiness).toBe('جاهز');
    expect((await run('alaa', 'readiness', 'ur')).sections[3].columns[0].label).toBe('کوڈ');
  });

  it('not-posted register and evidence register', async () => {
    await acceptedEvidence();
    const np = await run('yousef', 'not-posted');
    expect(np.sections[0].rows).toEqual([expect.objectContaining({ requirement: '5.1.1-R1', title: 'Strategy', owner: 'Ali', age: 0 })]);
    const reg = await run('alaa', 'evidence-register');
    expect(reg.sections[0].rows[0]).toMatchObject({ review: 'Accepted', decision: 'Accept', reviewer: 'Ahmad', submission: 'Not posted yet' });
  });

  it('the submission officer sees accepted evidence only', async () => {
    await acceptedEvidence();
    const taskId = await w.publishedTask('hr');
    await assignTask(await w.ctx('khalid'), taskId, w.users.huda);
    const huda = await w.ctx('huda');
    const up = await uploadEvidence(huda, deps, { taskId, title: 'Draft plan', file: { content: Buffer.from('%PDF d'), filename: 'd.pdf' } });
    await linkEvidence(huda, up.versionId, { taskId, cycleRequirementId: w.requirementId });
    expect((await run('alaa', 'evidence-register')).sections[0].rows).toHaveLength(2);
    const dso = await run('yousef', 'evidence-register');
    expect(dso.sections[0].rows.map((r) => r.title)).toEqual(['Strategy']);
    expect(dso.sections[0].note).toContain('accepted evidence only');
  });

  it('department performance: a manager sees their own department only', async () => {
    await acceptedEvidence();
    const open = await w.publishedTask();
    await assignTask(await w.ctx('mona'), open, w.users.sara);
    await escalateManually(await w.ctx('alaa'), open, 'Late for the steering committee');
    await w.publishedTask('hr');
    const all = await run('alaa', 'department-performance');
    expect(all.sections[0].rows.map((r) => r.department)).toEqual(['HR', 'IT', 'Total']);
    expect(all.sections[0].rows.find((r) => r.department === 'IT')).toMatchObject({ tasks: 2, completed: 1, onTime: 100, escalations: 1 });
    const mona = await run('mona', 'department-performance');
    expect(mona.sections[0].rows.map((r) => r.department)).toEqual(['IT', 'Total']);
    const log = await run('alaa', 'deadline-log');
    expect(log.sections.find((s) => s.key === 'escalations')!.rows).toEqual([expect.objectContaining({ kind: 'Manual', reason: 'Late for the steering committee' })]);
  });

  it('SLA, dossier and audit extract', async () => {
    const { linkId } = await acceptedEvidence();
    const sla = await run('alaa', 'sla');
    expect(sla.sections[0].rows).toEqual([expect.objectContaining({ person: 'Ahmad', count: 1, onTime: 100 })]);
    expect(sla.summary.find((s) => s.label === 'First-pass acceptance')!.value).toBe(100);
    await fails('validation', () => run('alaa', 'requirement-dossier'));
    const dossier = await run('yousef', 'requirement-dossier', 'en', { cycleRequirementId: w.requirementId });
    expect(dossier.subtitle).toMatch(/^5\.1\.1-R1 — /);
    expect(dossier.sections.find((s) => s.key === 'history')!.rows).toEqual([expect.objectContaining({ event: 'Accept', actor: 'Ahmad' })]);
    const extract = await run('tariq', 'audit-extract', 'en', { action: 'evidence.' });
    expect(extract.sections[0].rows.map((r) => r.action)).toContain('evidence.uploaded');
    expect(linkId).toBeTruthy();
    // every successful generation is audited (sla, dossier, extract)
    expect((await db.query(`SELECT count(*)::int AS n FROM qiyas.audit_log WHERE action = 'report.generated'`)).rows[0].n).toBe(3);
  });

  it('exports Excel with a cover sheet and one sheet per section, right to left in Arabic', async () => {
    await acceptedEvidence();
    const buf = await reportToXlsx(await run('alaa', 'readiness', 'ar'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['الملخص', 'حسب المنظور', 'حسب المحور', 'حسب المعيار', 'المتطلبات']);
    expect(wb.worksheets[0].views[0].rightToLeft).toBe(true);
    expect(wb.worksheets[0].getCell('A1').value).toBe('تقرير جاهزية الدورة');
    const req = wb.getWorksheet('المتطلبات')!;
    expect(req.getRow(3).getCell(1).value).toBe('5.1.1-R1');
  });
});
