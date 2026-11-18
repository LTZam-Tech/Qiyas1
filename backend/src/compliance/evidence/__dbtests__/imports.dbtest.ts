import { Client } from 'pg';
import { ComplianceError } from '../../core/context';
import { connectTestDb, resetSchema } from '../../db/__dbtests__/testDb';
import sample from '../../framework/samples/dga-v5.0-sample.json';
import { importCrosswalk } from '../../framework/crosswalk';
import { activateFramework, createCycle, importFramework, transitionCycle } from '../../framework/frameworkService';
import { addLibraryDocument, listLibrary, syncLibrary, uploadLibraryFile } from '../../library/library';
import { assignTask } from '../../work/tasks';
import { World, buildWorld } from '../../work/__dbtests__/world';
import { EvidenceDeps, linkEvidence, submitEvidence, uploadEvidence } from '../evidence';
import { finishImport, importDetail, importFile, startImport } from '../folderImport';
import { acceptEvidence, claimEvidence } from '../review';
import { DevScanner, EICAR_TEST_STRING, InMemoryStorage } from '../storage';
import { carryOver, carryOverPreview, dismissSuggestion, taskSuggestions, useSuggestion } from '../suggestions';

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

async function fails(code: string, fn: () => Promise<unknown>): Promise<string> {
  await db.query('SAVEPOINT f');
  try {
    await fn();
  } catch (e) {
    await db.query('ROLLBACK TO SAVEPOINT f');
    if (e instanceof ComplianceError) {
      expect(e.code).toBe(code);
      return e.message;
    }
    throw e;
  }
  throw new Error(`expected a ${code} error`);
}

const file = (relativePath: string, text = relativePath) => ({ relativePath, content: Buffer.from(`%PDF ${text}`), mimeType: 'application/pdf' });

async function aliTask() {
  const taskId = await w.publishedTask();
  await assignTask(await w.ctx('mona'), taskId, w.users.ali);
  return taskId;
}

/** The sample framework again under another version number, for crosswalk tests. */
async function importOlderVersion() {
  const alaa = await w.ctx('alaa');
  const older = { ...JSON.parse(JSON.stringify(sample)), version: '4.0-sample', publishedOn: '2025-01-01' };
  const { frameworkVersionId } = await importFramework(alaa, older);
  await activateFramework(alaa, frameworkVersionId);
  return frameworkVersionId;
}

const crosswalk = (requirements: unknown[]) => ({
  format: 'qiyas-crosswalk/1',
  from: { issuer: 'DGA', documentCode: 'DGA-1-2-1-111', version: '4.0-sample' },
  to: { issuer: 'DGA', documentCode: 'DGA-1-2-1-111', version: '5.0-sample' },
  standards: [{ from: '5.1.1', to: ['5.1.1'], relation: 'same' }],
  requirements,
});

describe('folder import (BNK-7)', () => {
  it('puts files in the bank and suggests the requirement read from the path; nothing is linked', async () => {
    const alaa = await w.ctx('alaa');
    const batchId = await startImport(alaa, w.cycleId, { label: 'Qiyas 2026 folder' });
    const r1 = await importFile(alaa, deps, batchId, file('ملفات قياس 2026/5.1 التخطيط/5.1.1/5.1.1.1/الخطة الاستراتيجية.pdf'));
    expect(r1).toMatchObject({ outcome: 'suggested', detectedCode: '5.1.1.1', suggestions: 1 });
    expect((await importFile(alaa, deps, batchId, file('ملفات قياس 2026/5.1 التخطيط/5.1.1/محضر.pdf'))).outcome).toBe('suggested');
    expect((await importFile(alaa, deps, batchId, file('ملفات قياس 2026/5.1 التخطيط/5.1.1/5.1.1.7.pdf'))).outcome).toBe('unmatched');
    expect((await importFile(alaa, deps, batchId, file('ملفات قياس 2026/5.18 مشاركة المستفيد/لقطة.pdf'))).message).toContain('axis');
    expect((await importFile(alaa, deps, batchId, file('ملفات قياس 2026/.DS_Store'))).outcome).toBe('skipped');
    expect((await importFile(alaa, deps, batchId, { relativePath: '5.1/5.1.1/run.exe', content: Buffer.from('x') })).outcome).toBe('rejected');
    expect((await importFile(alaa, deps, batchId, { relativePath: '5.1/5.1.1/virus.pdf', content: Buffer.from(EICAR_TEST_STRING) })).outcome).toBe('quarantined');
    // same content under another name: no second artifact
    expect((await importFile(alaa, deps, batchId, file('نسخة/5.1.1.1.pdf', 'ملفات قياس 2026/5.1 التخطيط/5.1.1/5.1.1.1/الخطة الاستراتيجية.pdf'))).outcome).toBe('duplicate');
    // a retry of the same path returns the first result
    expect((await importFile(alaa, deps, batchId, file('ملفات قياس 2026/5.1 التخطيط/5.1.1/5.1.1.1/الخطة الاستراتيجية.pdf'))).itemId).toBe(r1.itemId);

    const totals = await finishImport(alaa, batchId);
    expect(totals).toMatchObject({ files: 8, suggested: 2, unmatched: 2, skipped: 1, rejected: 1, quarantined: 1, duplicate: 1 });
    expect((await importDetail(alaa, batchId)).items[0].outcome).toBe('unmatched');
    expect((await db.query(`SELECT count(*)::int AS n FROM qiyas.evidence_links`)).rows[0].n).toBe(0);
    await fails('conflict', () => importFile(alaa, deps, batchId, file('5.1.1.1/late.pdf')));
  });

  it('only consultants import, and only into an open bank', async () => {
    await fails('forbidden', async () => startImport(await w.ctx('ali'), w.cycleId, { label: 'x' }));
    const alaa = await w.ctx('alaa');
    const batchId = await startImport(alaa, w.cycleId, { label: 'x' });
    await fails('forbidden', async () => importFile(await w.ctx('ahmad'), deps, batchId, file('5.1.1.1/a.pdf')));
    await transitionCycle(alaa, w.cycleId, 'close', 'Cycle submitted to DGA');
    await fails('conflict', () => startImport(alaa, w.cycleId, { label: 'late' }));
  });

  it('the task owner confirms a suggestion; another consultant reviews it (D9)', async () => {
    const alaa = await w.ctx('alaa');
    const batchId = await startImport(alaa, w.cycleId, { label: 'folder' });
    await importFile(alaa, deps, batchId, file('5.1.1/5.1.1.1/plan.pdf'));
    await importFile(alaa, deps, batchId, file('5.1.1/5.1.1.1/old-plan.pdf'));
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const suggestions = await taskSuggestions(ali, taskId);
    expect(suggestions.map((s) => [s.requirement_code, s.proof_item_code, s.source])).toEqual([['5.1.1-R1', '5.1.1-E1', 'folder_import'], ['5.1.1-R1', '5.1.1-E1', 'folder_import']]);
    await fails('forbidden', async () => taskSuggestions(await w.ctx('huda'), taskId));

    const plan = suggestions.find((s) => s.title === 'plan')!;
    const linkId = await useSuggestion(ali, plan.id, taskId);
    expect((await db.query('SELECT execution_status FROM qiyas.tasks WHERE id = $1', [taskId])).rows[0].execution_status).toBe('in_progress');
    await dismissSuggestion(ali, suggestions.find((s) => s.title === 'old-plan')!.id, taskId);
    expect(await taskSuggestions(ali, taskId)).toEqual([]);
    await fails('conflict', () => useSuggestion(ali, plan.id, taskId));

    await submitEvidence(ali, taskId);
    // the importer counts as the uploader: another consultant reviews it
    expect(await fails('forbidden', () => claimEvidence(alaa, linkId))).toContain('another consultant');
    const ahmad = await w.ctx('ahmad');
    await claimEvidence(ahmad, linkId);
    await acceptEvidence(ahmad, linkId);
  });

  it('translates file names of an older version through the crosswalk', async () => {
    await importOlderVersion();
    const alaa = await w.ctx('alaa');
    const olderId = (await db.query(`SELECT id FROM qiyas.framework_versions WHERE version = '4.0-sample'`)).rows[0].id;
    await fails('conflict', () => startImport(alaa, w.cycleId, { label: 'v4 folder', codesFrameworkVersionId: olderId }));
    await importCrosswalk(alaa, crosswalk([{ from: '5.1.1-R1', to: ['5.1.1-R1'], relation: 'changed' }]));
    const batchId = await startImport(alaa, w.cycleId, { label: 'v4 folder', codesFrameworkVersionId: olderId });
    expect((await importFile(alaa, deps, batchId, file('2025/5.1.1.1.pdf'))).outcome).toBe('suggested');
  });
});

describe('crosswalk files (BR-FW-05)', () => {
  it('validates codes and completeness, then replaces the earlier crosswalk', async () => {
    await importOlderVersion();
    const alaa = await w.ctx('alaa');
    expect(await fails('validation', () => importCrosswalk(alaa, crosswalk([])))).toContain('needs an entry');
    expect(await fails('validation', () => importCrosswalk(alaa, crosswalk([{ from: '5.1.1-R1', to: ['5.9.9-R1'], relation: 'same' }])))).toContain('Unknown requirement codes');
    expect(await fails('validation', () => importCrosswalk(alaa, crosswalk([{ from: '5.1.1-R1', to: [], relation: 'same' }])))).toContain('at least one target');
    await fails('forbidden', async () => importCrosswalk(await w.ctx('tariq'), crosswalk([{ from: '5.1.1-R1', to: [], relation: 'removed' }])));
    expect(await importCrosswalk(alaa, crosswalk([{ from: '5.1.1-R1', to: ['5.1.1-R1'], relation: 'same' }]))).toEqual({ mapped: 1, removed: 0, links: 1 });
    expect(await importCrosswalk(alaa, crosswalk([{ from: '5.1.1-R1', to: [], relation: 'removed' }]))).toEqual({ mapped: 0, removed: 1, links: 0 });
    expect((await db.query('SELECT count(*)::int AS n FROM qiyas.crosswalk')).rows[0].n).toBe(0);
  });
});

describe('carry-over (BNK-5, BR-BNK-04)', () => {
  async function acceptedIn2026() {
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const up = await uploadEvidence(ali, deps, { taskId, title: 'Strategy', file: { content: Buffer.from('%PDF strategy'), filename: 'strategy.pdf' } });
    const linkId = await linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId });
    await submitEvidence(ali, taskId);
    const ahmad = await w.ctx('ahmad');
    await claimEvidence(ahmad, linkId);
    await acceptEvidence(ahmad, linkId);
    return up.versionId;
  }

  it('copies accepted evidence into the new cycle as suggestions, once', async () => {
    const versionId = await acceptedIn2026();
    const alaa = await w.ctx('alaa');
    const next = await createCycle(alaa, { frameworkVersionId: w.frameworkVersionId, year: 2027, name: 'Qiyas 2027', startsOn: '2027-01-01', endsOn: '2027-12-31' });
    const preview = await carryOverPreview(alaa, next.cycleId, w.cycleId);
    expect(preview.items).toEqual([expect.objectContaining({ versionId, from: ['5.1.1-R1'], to: [{ code: '5.1.1-R1', relation: 'same' }], alreadyCarried: false })]);
    expect(await carryOver(alaa, next.cycleId, w.cycleId)).toEqual({ carried: 1, skipped: 0, suggestions: 1, withoutTarget: 0 });
    expect(await carryOver(alaa, next.cycleId, w.cycleId)).toEqual({ carried: 0, skipped: 1, suggestions: 0, withoutTarget: 0 });
    // nothing is accepted in 2027 until it is reviewed there
    expect((await db.query(`SELECT readiness FROM qiyas.cycle_requirements WHERE cycle_id = $1`, [next.cycleId])).rows[0].readiness).toBe('not_started');
    await fails('forbidden', async () => carryOver(await w.ctx('mona'), next.cycleId, w.cycleId));
  });

  it('needs a crosswalk between different versions', async () => {
    await acceptedIn2026();
    const olderId = await importOlderVersion();
    const alaa = await w.ctx('alaa');
    const old = await createCycle(alaa, { frameworkVersionId: olderId, year: 2027, name: 'Other version', startsOn: '2027-01-01', endsOn: '2027-12-31' });
    expect(await fails('conflict', () => carryOver(alaa, old.cycleId, w.cycleId))).toContain('no crosswalk');
  });
});

describe('regulations library', () => {
  it('creates citation documents from standard references and links them', async () => {
    await db.query(`UPDATE qiyas.standards SET "references" = $1`, [JSON.stringify([
      { ar: 'تعميم الديوان الملكي رقم (6262) وتاريخ 26/1/1445هـ، البند (19).', en: 'Royal Court Circular No. (6262) dated 26/1/1445H, Clause (19).' },
      { ar: 'أفضل الممارسات.', en: 'Best practice.' },
    ])]);
    const out = await syncLibrary(db, { format: 'qiyas-library/1', documents: [
      { code: 'ctl-test', kind: 'controls', title: { ar: 'ضوابط تجريبية', en: 'Test controls' }, related: { '5.0-sample': ['5.1'] } },
    ] });
    expect(out).toEqual({ documents: 2, links: 2 });
    expect(await syncLibrary(db, { format: 'qiyas-library/1', documents: [] })).toEqual({ documents: 1, links: 1 });

    const ali = await w.ctx('ali');
    const docs = await listLibrary(ali, { text: '6262' });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ kind: 'circular', origin: 'citation', has_file: false });
    expect(docs[0].standards).toEqual([expect.objectContaining({ code: '5.1.1', relation: 'cited', detail: 'البند (19)' })]);
    await fails('forbidden', () => uploadLibraryFile(ali, deps, docs[0].id, { content: Buffer.from('%PDF x'), filename: 'c.pdf' }));
  });

  it('consultants upload the client copy and add their own documents', async () => {
    const alaa = await w.ctx('alaa');
    const id = await addLibraryDocument(alaa, { kind: 'policy', titleAr: 'سياسة أمن المعلومات', titleEn: 'Information security policy', standardCodes: ['5.1.1'], frameworkVersionId: w.frameworkVersionId });
    await fails('validation', () => uploadLibraryFile(alaa, deps, id, { content: Buffer.from('x'), filename: 'a.exe' }));
    await fails('conflict', () => uploadLibraryFile(alaa, deps, id, { content: Buffer.from(EICAR_TEST_STRING), filename: 'a.pdf' }));
    expect(await uploadLibraryFile(alaa, deps, id, { content: Buffer.from('%PDF policy'), filename: 'policy.pdf' })).toMatchObject({ sizeBytes: 11 });
    const [doc] = await listLibrary(await w.ctx('huda'), { kind: 'policy' });
    expect(doc).toMatchObject({ origin: 'client', has_file: true, original_filename: 'policy.pdf' });
    // client documents survive a catalogue sync
    await syncLibrary(db, { format: 'qiyas-library/1', documents: [] });
    expect((await listLibrary(alaa, { kind: 'policy' }))[0].standards).toHaveLength(1);
  });
});

describe('import and parse limits (C13, C14)', () => {
  const CIRCULAR = 'تعميم الديوان الملكي رقم (6262) وتاريخ 26/1/1445هـ، البند (19).';

  it('syncLibrary finishes in under 1 s when a stored standard holds a 64 KB pathological reference', async () => {
    // written straight to the table, bypassing the framework file validation, like a row stored before the caps
    await db.query(`UPDATE qiyas.standards SET "references" = $1`, [JSON.stringify([
      { ar: 'رقم ('.repeat(13_200), en: 'No. ('.repeat(13_200) },
      { ar: `${CIRCULAR}${'.'.repeat(50_000)}x` },
      { ar: CIRCULAR, en: 'Royal Court Circular No. (6262) dated 26/1/1445H, Clause (19).' },
    ])]);
    const started = Date.now();
    const out = await syncLibrary(db, { format: 'qiyas-library/1', documents: [] });
    expect(Date.now() - started).toBeLessThan(1000);
    // positive control: the normal reference still becomes a cited document
    expect(out).toEqual({ documents: 1, links: 1 });
  });

  it('syncLibrary reads at most 50 references per standard', async () => {
    await db.query(`UPDATE qiyas.standards SET "references" = $1`, [JSON.stringify(
      Array.from({ length: 60 }, (_, i) => ({ ar: `تعميم الديوان الملكي رقم (${1000 + i}) وتاريخ 26/1/1445هـ.` })),
    )]);
    expect(await syncLibrary(db, { format: 'qiyas-library/1', documents: [] })).toEqual({ documents: 50, links: 50 });
  });

  it('a folder import rejects a relative path longer than 1024 characters', async () => {
    const alaa = await w.ctx('alaa');
    const batchId = await startImport(alaa, w.cycleId, { label: 'long paths' });
    const long = `${'ملف/'.repeat(256)}5.1.1.pdf`;
    expect(long.length).toBeGreaterThan(1024);
    expect(await fails('validation', () => importFile(alaa, deps, batchId, file(long)))).toContain('1024');
    // positive control
    expect((await importFile(alaa, deps, batchId, file('5.1 التخطيط/5.1.1/5.1.1.1/خطة.pdf'))).outcome).toBe('suggested');
  });

  it('a library document links at most 500 standard codes at once', async () => {
    const alaa = await w.ctx('alaa');
    const codes = Array.from({ length: 501 }, (_, i) => `9.9.${i}`);
    expect(await fails('validation', () => addLibraryDocument(alaa, { kind: 'policy', titleAr: 'سياسة', titleEn: 'Policy', standardCodes: codes, frameworkVersionId: w.frameworkVersionId })))
      .toContain('at most 500');
  });
});
