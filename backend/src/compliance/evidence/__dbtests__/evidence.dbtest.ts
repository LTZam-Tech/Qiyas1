import { Client } from 'pg';
import { ComplianceError } from '../../core/context';
import { connectTestDb, resetSchema } from '../../db/__dbtests__/testDb';
import { createCycle, transitionCycle } from '../../framework/frameworkService';
import { assignTask, getTask, taskDeadline } from '../../work/tasks';
import { World, at, buildWorld } from '../../work/__dbtests__/world';
import { EvidenceDeps, linkEvidence, submitEvidence, uploadEvidence, withdrawEvidence } from '../evidence';
import { acceptEvidence, claimEvidence, rejectEvidence, releaseEvidence, revokeEvidence } from '../review';
import { DevScanner, EICAR_TEST_STRING, InMemoryStorage } from '../storage';
import { createPackage, markNotPosted, markPosted, reuseEvidence, searchBank } from '../submission';

let db: Client;
let w: World;
let deps: EvidenceDeps;
let proofItemId: string;

beforeAll(async () => {
  db = await connectTestDb();
  await resetSchema(db);
});
afterAll(async () => db?.end());
beforeEach(async () => {
  await db.query('BEGIN');
  w = await buildWorld(db);
  deps = { storage: new InMemoryStorage(), scanner: new DevScanner() };
  proofItemId = (await db.query(`SELECT id FROM qiyas.proof_items WHERE code = '5.1.1-E1'`)).rows[0].id;
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

const pdf = (text: string) => ({ content: Buffer.from(`%PDF ${text}`), filename: 'plan.pdf', mimeType: 'application/pdf' });

async function aliTask() {
  const taskId = await w.publishedTask();
  await assignTask(await w.ctx('mona'), taskId, w.users.ali);
  return taskId;
}

/** Ali uploads, links to 5.1.1-R1 / E1 and submits. */
async function aliSubmits(taskId: string, text = 'approved strategic plan') {
  const ali = await w.ctx('ali');
  const up = await uploadEvidence(ali, deps, { taskId, title: 'Digital transformation strategy', file: pdf(text) });
  const linkId = await linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId });
  await submitEvidence(ali, taskId);
  return { ...up, linkId };
}

const readiness = async () => (await db.query('SELECT readiness, readiness_pct FROM qiyas.cycle_requirements WHERE id = $1', [w.requirementId])).rows[0];
const link = async (id: string) => (await db.query('SELECT * FROM qiyas.evidence_links WHERE id = $1', [id])).rows[0];

describe('upload and link', () => {
  it('the owner uploads a version; the task starts; uploading alone does not count (BR-CMP-01)', async () => {
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const up = await uploadEvidence(ali, deps, { taskId, title: 'Strategy', file: pdf('v1') });
    expect([up.versionNo, up.scanStatus]).toEqual([1, 'clean']);
    expect((await getTask(db, taskId)).execution_status).toBe('in_progress');
    await linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId });
    expect((await readiness()).readiness).toBe('not_started');
  });

  it('enforces file rules, duplicates and ownership', async () => {
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    await fails('validation', () => uploadEvidence(ali, deps, { taskId, title: 'x', file: { content: Buffer.from('x'), filename: 'run.exe' } }));
    await fails('validation', () => uploadEvidence(ali, deps, { taskId, title: 'x', file: { content: Buffer.alloc(0), filename: 'a.pdf' } }));
    await uploadEvidence(ali, deps, { taskId, title: 'Strategy', file: pdf('same') });
    expect(await fails('conflict', () => uploadEvidence(ali, deps, { taskId, title: 'Copy', file: pdf('same') }))).toContain('already in the evidence bank');
    await fails('forbidden', async () => uploadEvidence(await w.ctx('sara'), deps, { taskId, title: 'x', file: pdf('other') }));
  });

  it('D3: a consultant attaches evidence to any task like an employee', async () => {
    const taskId = await aliTask();
    const up = await uploadEvidence(await w.ctx('alaa'), deps, { taskId, title: 'Central policy', file: pdf('central') });
    expect(up.scanStatus).toBe('clean');
  });

  it('BR-EVD-08: infected files are quarantined and cannot be linked', async () => {
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const up = await uploadEvidence(ali, deps, { taskId, title: 'Bad', file: { content: Buffer.from(EICAR_TEST_STRING), filename: 'a.pdf' } });
    expect(up.scanStatus).toBe('infected');
    expect((deps.storage as InMemoryStorage).size).toBe(0);
    await fails('conflict', () => linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId }));
  });

  it('link evidence is accepted as a URL; a proof item must belong to the requirement', async () => {
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const up = await uploadEvidence(ali, deps, { taskId, title: 'Published strategy page', externalUrl: 'https://example.gov.sa/strategy' });
    await fails('validation', () => uploadEvidence(ali, deps, { taskId, title: 'bad', externalUrl: 'ftp://x' }));
    await fails('not_found', () => linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId: w.requirementId }));
    await linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId });
    await fails('conflict', () => linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId }));
  });
});

describe('submission for review (D5)', () => {
  it('submitting pauses the deadline and marks the requirement in progress', async () => {
    const taskId = await aliTask();
    const { linkId } = await aliSubmits(taskId);
    expect((await getTask(db, taskId)).execution_status).toBe('submitted');
    expect((await taskDeadline(await w.ctx('ali', at(2026, 12, 1)), await getTask(db, taskId))).isPaused).toBe(true);
    expect((await link(linkId)).review_due_at).not.toBeNull();
    expect((await readiness()).readiness).toBe('in_progress');
  });

  it('withdrawing the only submitted item returns the task to work and resumes the deadline', async () => {
    const taskId = await aliTask();
    const { linkId } = await aliSubmits(taskId);
    await withdrawEvidence(await w.ctx('ali'), linkId);
    expect((await getTask(db, taskId)).execution_status).toBe('in_progress');
    expect((await taskDeadline(await w.ctx('ali'), await getTask(db, taskId))).isPaused).toBe(false);
  });
});

describe('review (D9, BR-REV)', () => {
  it('accepting covers the proof item, completes the task and enters the DGA queue as not posted', async () => {
    const taskId = await aliTask();
    const { linkId } = await aliSubmits(taskId);
    await fails('forbidden', async () => claimEvidence(await w.ctx('mona'), linkId));
    const ahmad = await w.ctx('ahmad');
    await claimEvidence(ahmad, linkId);
    await fails('conflict', async () => claimEvidence(await w.ctx('alaa'), linkId));
    await fails('forbidden', async () => acceptEvidence(await w.ctx('alaa'), linkId));
    await acceptEvidence(ahmad, linkId, 'Signed and dated in cycle');
    expect(await readiness()).toEqual({ readiness: 'ready', readiness_pct: '100.0' });
    expect((await link(linkId)).submission_status).toBe('not_posted');
    const t = await getTask(db, taskId);
    expect(t.execution_status).toBe('completed');
    expect((await taskDeadline(await w.ctx('ali'), t)).isPaused).toBe(false);
  });

  it('D9: Alaa never reviews what Alaa uploaded; Ahmad does', async () => {
    const taskId = await aliTask();
    const alaa = await w.ctx('alaa');
    const up = await uploadEvidence(alaa, deps, { taskId, title: 'Central policy', file: pdf('central') });
    const linkId = await linkEvidence(alaa, up.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId });
    await submitEvidence(alaa, taskId);
    expect(await fails('forbidden', () => claimEvidence(alaa, linkId))).toContain('another consultant');
    await claimEvidence(await w.ctx('ahmad'), linkId);
    // and the database itself refuses a self-review decision
    await db.query('SAVEPOINT s');
    await expect(db.query(`INSERT INTO qiyas.review_decisions (evidence_link_id, reviewer_id, decision) VALUES ($1, $2, 'accept')`, [linkId, w.users.alaa]))
      .rejects.toThrow('nobody reviews evidence they uploaded');
    await db.query('ROLLBACK TO SAVEPOINT s');
  });

  it('rejection needs 10 characters, sends the task back to the manager and resumes the deadline', async () => {
    const taskId = await aliTask();
    const { linkId } = await aliSubmits(taskId);
    const ahmad = await w.ctx('ahmad');
    await claimEvidence(ahmad, linkId);
    await fails('validation', () => rejectEvidence(ahmad, linkId, 'unsigned'));
    await rejectEvidence(ahmad, linkId, 'The plan is not signed by the governor');
    const t = await getTask(db, taskId);
    expect([t.execution_status, t.current_owner_id, t.original_assignee_id]).toEqual(['rework_required', w.users.mona, w.users.ali]);
    expect((await taskDeadline(await w.ctx('mona'), t)).isPaused).toBe(false);
    const decision = await db.query('SELECT decision, comment FROM qiyas.review_decisions WHERE evidence_link_id = $1', [linkId]);
    expect(decision.rows[0]).toEqual({ decision: 'reject', comment: 'The plan is not signed by the governor' });
  });

  it('rework: a new version is reviewed again; acceptance supersedes the older accepted version', async () => {
    const taskId = await aliTask();
    const first = await aliSubmits(taskId, 'v1');
    const ahmad = await w.ctx('ahmad');
    await claimEvidence(ahmad, first.linkId);
    await acceptEvidence(ahmad, first.linkId);
    // the consultant later asks for the updated edition: reopened through revoke + new version on another task
    const taskId2 = await w.publishedTask();
    const mona = await w.ctx('mona');
    await assignTask(mona, taskId2, w.users.mona);
    const v2 = await uploadEvidence(mona, deps, { taskId: taskId2, artifactId: first.artifactId, file: pdf('v2') });
    expect(v2.versionNo).toBe(2);
    const l2 = await linkEvidence(mona, v2.versionId, { taskId: taskId2, cycleRequirementId: w.requirementId, proofItemId });
    await submitEvidence(mona, taskId2);
    await claimEvidence(ahmad, l2);
    await acceptEvidence(ahmad, l2);
    expect((await link(first.linkId)).review_status).toBe('superseded');
    expect((await readiness()).readiness).toBe('ready');
  });

  it('releasing a claim puts it back in the shared queue', async () => {
    const taskId = await aliTask();
    const { linkId } = await aliSubmits(taskId);
    await claimEvidence(await w.ctx('ahmad'), linkId);
    await fails('forbidden', async () => releaseEvidence(await w.ctx('alaa'), linkId));
    await releaseEvidence(await w.ctx('ahmad'), linkId);
    await claimEvidence(await w.ctx('alaa'), linkId);
  });

  it('revoking an acceptance needs a reason and makes the requirement not ready again', async () => {
    const taskId = await aliTask();
    const { linkId } = await aliSubmits(taskId);
    const ahmad = await w.ctx('ahmad');
    await claimEvidence(ahmad, linkId);
    await acceptEvidence(ahmad, linkId);
    await fails('validation', () => revokeEvidence(ahmad, linkId, ''));
    await revokeEvidence(ahmad, linkId, 'Plan expired');
    expect((await readiness()).readiness).toBe('in_progress');
  });
});

describe('DGA submission (two statuses)', () => {
  async function accepted() {
    const taskId = await aliTask();
    const { linkId } = await aliSubmits(taskId);
    const ahmad = await w.ctx('ahmad');
    await claimEvidence(ahmad, linkId);
    await acceptEvidence(ahmad, linkId);
    return linkId;
  }

  it('only the submission officer posts, only accepted evidence, and reverting needs a reason', async () => {
    const linkId = await accepted();
    await fails('forbidden', async () => markPosted(await w.ctx('alaa'), [linkId]));
    const yousef = await w.ctx('yousef');
    await markPosted(yousef, [linkId], { dgaReference: 'QIYAS-2026-0042' });
    const l = await link(linkId);
    expect([l.submission_status, l.posted_by, l.dga_reference]).toEqual(['posted', w.users.yousef, 'QIYAS-2026-0042']);
    await fails('validation', () => markNotPosted(yousef, linkId, ''));
    await markNotPosted(yousef, linkId, 'Posted under the wrong standard');
    const events = await db.query('SELECT from_status, to_status FROM qiyas.submission_events WHERE evidence_link_id = $1 ORDER BY at, from_status DESC', [linkId]);
    expect(events.rows.length).toBe(2);
  });

  it('evidence that is not accepted cannot be posted or packaged', async () => {
    const taskId = await aliTask();
    const { linkId } = await aliSubmits(taskId);
    await fails('conflict', async () => markPosted(await w.ctx('yousef'), [linkId]));
    await fails('conflict', async () => createPackage(await w.ctx('yousef'), w.cycleId, 'Standard 5.1.1', [linkId]));
  });

  it('packages hold accepted evidence in order', async () => {
    const linkId = await accepted();
    const id = await createPackage(await w.ctx('yousef'), w.cycleId, 'Standard 5.1.1', [linkId]);
    const { rows } = await db.query('SELECT sort_order FROM qiyas.submission_package_items WHERE package_id = $1', [id]);
    expect(rows).toEqual([{ sort_order: 1 }]);
  });
});

describe('evidence banks (BR-BNK)', () => {
  it('a closed cycle\'s bank is read-only', async () => {
    const taskId = await aliTask();
    await transitionCycle(await w.ctx('alaa'), w.cycleId, 'close');
    await fails('conflict', async () => uploadEvidence(await w.ctx('ali'), deps, { taskId, title: 'late', file: pdf('late') }));
  });

  it('reuse copies an accepted version into a new cycle with its source; it is not accepted there', async () => {
    const taskId = await aliTask();
    const { versionId, linkId } = await aliSubmits(taskId);
    const ahmad = await w.ctx('ahmad');
    await claimEvidence(ahmad, linkId);
    await acceptEvidence(ahmad, linkId);

    const alaa = await w.ctx('alaa');
    const hits = await searchBank(alaa, { cycleId: w.cycleId, text: 'strategy', acceptedOnly: true });
    expect(hits.map((h) => h.versionId)).toEqual([versionId]);
    const next = await createCycle(alaa, { frameworkVersionId: w.frameworkVersionId, year: 2027, name: 'Qiyas 2027', startsOn: '2027-01-01', endsOn: '2027-12-31' });
    await fails('validation', () => reuseEvidence(alaa, versionId, w.cycleId));
    const reused = await reuseEvidence(alaa, versionId, next.cycleId);
    const art = await db.query(`SELECT a.source_artifact_version_id, a.bank_id, v.storage_key, v.uploaded_by,
        (SELECT storage_key FROM qiyas.artifact_versions WHERE id = $2) AS source_key
       FROM qiyas.artifacts a JOIN qiyas.artifact_versions v ON v.artifact_id = a.id WHERE a.id = $1`, [reused.artifactId, versionId]);
    expect(art.rows[0].source_artifact_version_id).toBe(versionId);
    expect(art.rows[0].bank_id).toBe(next.bankId);
    expect(art.rows[0].storage_key).toBe(art.rows[0].source_key); // same stored object, no copy
    const links = await db.query('SELECT count(*)::int AS n FROM qiyas.evidence_links WHERE artifact_version_id = $1', [reused.versionId]);
    expect(links.rows[0].n).toBe(0); // starts unlinked: must be linked and reviewed in 2027
    await fails('forbidden', async () => reuseEvidence(await w.ctx('ali'), versionId, next.cycleId));
  });
});
