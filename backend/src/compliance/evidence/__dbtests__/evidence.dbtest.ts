import { Client } from 'pg';
import { toHttpError } from '../../api/http';
import { ComplianceError } from '../../core/context';
import { connectTestDb, resetSchema } from '../../db/__dbtests__/testDb';
import { createCycle, setApplicability, transitionCycle } from '../../framework/frameworkService';
import { assignTask, getTask, taskDeadline } from '../../work/tasks';
import { World, at, buildWorld } from '../../work/__dbtests__/world';
import { canSee, versionResource } from '../access';
import { EvidenceDeps, linkEvidence, submitEvidence, uploadEvidence, withdrawEvidence } from '../evidence';
import { acceptEvidence, claimEvidence, rejectEvidence, releaseEvidence, revokeEvidence } from '../review';
import { DevScanner, EICAR_TEST_STRING, InMemoryStorage } from '../storage';
import { createPackage, markNotPosted, markPosted, reuseEvidence, searchBank } from '../submission';
import { addSuggestions, carryOver, useSuggestion } from '../suggestions';

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

  // ---- security remediation B4 (C5): a closed cycle is read-only until an administrator reopens it
  const close = async () => transitionCycle(await w.ctx('alaa'), w.cycleId, 'close', 'Submitted to DGA');
  const reopen = async () => transitionCycle(await w.ctx('tariq'), w.cycleId, 'reopen', 'Late DGA correction');
  const countOf = async (table: string) => (await db.query(`SELECT count(*)::int AS n FROM qiyas.${table}`)).rows[0].n;
  /** Runs a statement in a savepoint; returns the database error, or undefined when it succeeds. */
  async function dbError(text: string, params: unknown[] = []): Promise<{ code?: string } | undefined> {
    await db.query('SAVEPOINT s');
    try {
      await db.query(text, params);
      await db.query('RELEASE SAVEPOINT s');
      return undefined;
    } catch (e) {
      await db.query('ROLLBACK TO SAVEPOINT s');
      return e as { code?: string };
    }
  }
  const acceptedLink = async (text: string) => {
    const ahmad = await w.ctx('ahmad');
    const { linkId } = await aliSubmits(await aliTask(), text);
    await claimEvidence(ahmad, linkId);
    await acceptEvidence(ahmad, linkId);
    return linkId;
  };

  it('a closed cycle refuses new links and submissions', async () => {
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const a = await uploadEvidence(ali, deps, { taskId, title: 'Strategy', file: pdf('strategy C5') });
    const draft = await linkEvidence(ali, a.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId });
    const b = await uploadEvidence(ali, deps, { taskId, title: 'Annex', file: pdf('annex C5') });
    await addSuggestions(await w.ctx('alaa'), b.versionId, [w.requirementId], 'folder_import', { note: 'test' });
    const sg = (await db.query(`SELECT id FROM qiyas.link_suggestions WHERE artifact_version_id = $1 AND status = 'open'`, [b.versionId])).rows[0];
    const before = await readiness();
    await close();

    await fails('conflict', () => linkEvidence(ali, b.versionId, { taskId, cycleRequirementId: w.requirementId }));
    await fails('conflict', async () => linkEvidence(await w.ctx('alaa'), b.versionId, { taskId, cycleRequirementId: w.requirementId })); // a consultant too
    await fails('conflict', () => useSuggestion(ali, sg.id, taskId));
    await fails('conflict', () => submitEvidence(ali, taskId));
    await fails('conflict', () => withdrawEvidence(ali, draft));
    expect(await linksOf(b.versionId)).toBe(0);
    expect((await link(draft)).review_status).toBe('draft');
    expect(await readiness()).toEqual(before);
  });

  it('a closed cycle refuses claim, accept, reject and revoke, and readiness is unchanged', async () => {
    const ahmad = await w.ctx('ahmad');
    const accepted = await acceptedLink('plan A');
    const waiting = (await aliSubmits(await aliTask(), 'plan B')).linkId;
    const claimed = (await aliSubmits(await aliTask(), 'plan C')).linkId;
    await claimEvidence(ahmad, claimed);
    const before = await readiness();
    const decisions = await countOf('review_decisions');
    await close();

    await fails('conflict', () => claimEvidence(ahmad, waiting));
    await fails('conflict', () => acceptEvidence(ahmad, claimed, 'ok'));
    await fails('conflict', () => rejectEvidence(ahmad, claimed, 'Not the signed version'));
    await fails('conflict', () => releaseEvidence(ahmad, claimed));
    await fails('conflict', () => revokeEvidence(ahmad, accepted, 'Changed my mind'));
    // D-C5-2 (b): links in flight are frozen as they were at closing
    expect([(await link(accepted)).review_status, (await link(waiting)).review_status, (await link(claimed)).review_status])
      .toEqual(['accepted', 'submitted', 'under_review']);
    expect(await readiness()).toEqual(before);
    expect(await countOf('review_decisions')).toBe(decisions);
  });

  it('a closed cycle refuses posting, unposting and packages', async () => {
    const yousef = await w.ctx('yousef');
    const notPosted = await acceptedLink('plan A');
    const posted = await acceptedLink('plan B');
    await markPosted(yousef, [posted], { dgaReference: 'DGA-1' });
    const before = await readiness();
    const events = await countOf('submission_events');
    await close();

    await fails('conflict', () => markPosted(yousef, [notPosted], { dgaReference: 'DGA-2' }));
    await fails('conflict', () => markNotPosted(yousef, posted, 'Posted by mistake'));
    await fails('conflict', () => createPackage(yousef, w.cycleId, 'Standard 5.1.1', [notPosted]));
    expect([(await link(notPosted)).submission_status, (await link(posted)).submission_status]).toEqual(['not_posted', 'posted']);
    expect(await countOf('submission_events')).toBe(events);
    expect(await countOf('submission_packages')).toBe(0);
    expect(await readiness()).toEqual(before);
  });

  it('the database refuses a direct evidence_links insert or update on a closed cycle (SQLSTATE 55000)', async () => {
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const a = await uploadEvidence(ali, deps, { taskId, title: 'Strategy', file: pdf('strategy C5') });
    const b = await uploadEvidence(ali, deps, { taskId, title: 'Annex', file: pdf('annex C5') });
    const draft = await linkEvidence(ali, a.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId });
    const pkg = (await db.query(`INSERT INTO qiyas.submission_packages (cycle_id, prepared_by, title) VALUES ($1, $2, 'open package') RETURNING id`,
      [w.cycleId, w.users.yousef])).rows[0].id; // allowed while the cycle is active
    await close();

    const insertLink = await dbError(`INSERT INTO qiyas.evidence_links (artifact_version_id, cycle_requirement_id, task_id, created_by) VALUES ($1, $2, $3, $4)`,
      [b.versionId, w.requirementId, taskId, w.users.ali]);
    expect(insertLink?.code).toBe('55000');
    expect(toHttpError(insertLink).status).toBe(409);
    expect((await dbError(`UPDATE qiyas.evidence_links SET review_status = 'accepted' WHERE id = $1`, [draft]))?.code).toBe('55000');
    expect((await dbError(`UPDATE qiyas.cycle_requirements SET readiness = 'ready', readiness_pct = 100 WHERE id = $1`, [w.requirementId]))?.code).toBe('55000');
    expect((await dbError(`INSERT INTO qiyas.review_decisions (evidence_link_id, reviewer_id, decision) VALUES ($1, $2, 'accept')`, [draft, w.users.ahmad]))?.code).toBe('55000');
    expect((await dbError(`INSERT INTO qiyas.submission_events (evidence_link_id, from_status, to_status, actor_id) VALUES ($1, 'not_posted', 'posted', $2)`,
      [draft, w.users.yousef]))?.code).toBe('55000');
    expect((await dbError(`INSERT INTO qiyas.submission_packages (cycle_id, prepared_by, title) VALUES ($1, $2, 'late')`, [w.cycleId, w.users.yousef]))?.code).toBe('55000');
    expect((await dbError(`INSERT INTO qiyas.submission_package_items (package_id, evidence_link_id, sort_order) VALUES ($1, $2, 1)`, [pkg, draft]))?.code).toBe('55000');
    expect((await link(draft)).review_status).toBe('draft');

    // positive control: the same writes pass once an administrator reopens the cycle
    await reopen();
    expect(await dbError(`UPDATE qiyas.cycle_requirements SET readiness = readiness WHERE id = $1`, [w.requirementId])).toBeUndefined();
    expect(await dbError(`UPDATE qiyas.evidence_links SET proof_item_id = proof_item_id WHERE id = $1`, [draft])).toBeUndefined();
    // an archived cycle stays read-only for good
    await close();
    await transitionCycle(await w.ctx('tariq'), w.cycleId, 'archive');
    expect((await dbError(`UPDATE qiyas.cycle_requirements SET readiness = readiness WHERE id = $1`, [w.requirementId]))?.code).toBe('55000');
    expect(await fails('conflict', () => linkEvidence(ali, b.versionId, { taskId, cycleRequirementId: w.requirementId }))).toContain('archived');
  });

  it('closing, reopening and archiving work with links in flight; carry-over from the closed cycle and readiness of an open cycle still work', async () => {
    await acceptedLink('plan A');
    const inFlight = (await aliSubmits(await aliTask(), 'plan B')).linkId;
    await close();
    await reopen();
    await close();
    expect((await link(inFlight)).review_status).toBe('submitted');

    const alaa = await w.ctx('alaa');
    const next = await createCycle(alaa, { frameworkVersionId: w.frameworkVersionId, year: 2027, name: 'Qiyas 2027', startsOn: '2027-01-01', endsOn: '2027-12-31' });
    expect(await carryOver(alaa, next.cycleId, w.cycleId)).toMatchObject({ carried: 1, suggestions: 1 });
    const nextReq = (await db.query('SELECT id FROM qiyas.cycle_requirements WHERE cycle_id = $1', [next.cycleId])).rows[0].id;
    await setApplicability(alaa, nextReq, false, 'Exempted by decree 123'); // readiness recompute in an open cycle
    expect((await db.query('SELECT readiness FROM qiyas.cycle_requirements WHERE id = $1', [nextReq])).rows[0].readiness).toBe('not_applicable');
    await fails('conflict', () => setApplicability(alaa, w.requirementId, false, 'Exempted by decree 123')); // the closed cycle stays frozen

    await transitionCycle(await w.ctx('tariq'), w.cycleId, 'archive');
    expect((await db.query('SELECT status FROM qiyas.measurement_cycles WHERE id = $1', [w.cycleId])).rows[0].status).toBe('archived');
  });

  it('after an administrator reopens with a reason, linking and review work again', async () => {
    const taskId = await aliTask();
    const { linkId } = await aliSubmits(taskId, 'plan A');
    const ali = await w.ctx('ali');
    const ahmad = await w.ctx('ahmad');
    const annex = await uploadEvidence(ali, deps, { taskId, title: 'Annex', file: pdf('annex C5') });
    await close();
    await fails('conflict', () => linkEvidence(ali, annex.versionId, { taskId, cycleRequirementId: w.requirementId }));
    await fails('conflict', () => claimEvidence(ahmad, linkId));
    await fails('forbidden', async () => transitionCycle(await w.ctx('alaa'), w.cycleId, 'reopen', 'Late DGA correction'));
    await fails('validation', async () => transitionCycle(await w.ctx('tariq'), w.cycleId, 'reopen'));

    await reopen();
    const annexLink = await linkEvidence(ali, annex.versionId, { taskId, cycleRequirementId: w.requirementId });
    expect((await link(annexLink)).review_status).toBe('draft');
    const before = await readiness();
    await claimEvidence(ahmad, linkId);
    await acceptEvidence(ahmad, linkId);
    expect((await link(linkId)).review_status).toBe('accepted');
    expect(await readiness()).not.toEqual(before);
    await markPosted(await w.ctx('yousef'), [linkId], { dgaReference: 'DGA-1' });
    expect((await link(linkId)).submission_status).toBe('posted');
  });
});

// ------------------------------------------------------------------ security remediation B3

/** Khalid (DM HR) assigns an HR task to Huda; Huda uploads a confidential HR file to it. */
async function hudaUploads(text = 'HR confidential salaries') {
  const hrTask = await w.publishedTask('hr');
  await assignTask(await w.ctx('khalid'), hrTask, w.users.huda);
  const up = await uploadEvidence(await w.ctx('huda'), deps, { taskId: hrTask, title: 'HR-CONFIDENTIAL disciplinary case file', file: pdf(text) });
  return { hrTask, ...up };
}
const linksOf = async (versionId: string) => (await db.query('SELECT count(*)::int AS n FROM qiyas.evidence_links WHERE artifact_version_id = $1', [versionId])).rows[0].n;
const versionsOf = async (artifactId: string) => (await db.query('SELECT count(*)::int AS n FROM qiyas.artifact_versions WHERE artifact_id = $1', [artifactId])).rows[0].n;

describe('evidence object binding (C3)', () => {
  it('an IT employee cannot link an HR version to his own task', async () => {
    const hr = await hudaUploads();
    const taskId = await aliTask();
    await fails('forbidden', async () => linkEvidence(await w.ctx('ali'), hr.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId }));
    expect(await linksOf(hr.versionId)).toBe(0);
    expect(canSee(await w.ctx('ali'), 'evidence.download', await versionResource(db, hr.versionId))).toBe(false);
  });

  it('an IT employee cannot add a version to an HR artifact', async () => {
    const hr = await hudaUploads();
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const notVisible = await fails('not_found', () => uploadEvidence(ali, deps, { taskId, artifactId: hr.artifactId, file: pdf('replaced') }));
    expect(await versionsOf(hr.artifactId)).toBe(1);
    // "another cycle" gives the very same answer, so the ID cannot be probed
    const own = await uploadEvidence(ali, deps, { taskId, title: 'Strategy', file: pdf('own') });
    const alaa = await w.ctx('alaa');
    const next = await createCycle(alaa, { frameworkVersionId: w.frameworkVersionId, year: 2027, name: 'Qiyas 2027', startsOn: '2027-01-01', endsOn: '2027-12-31' });
    const copy = await reuseEvidence(alaa, own.versionId, next.cycleId);
    const otherCycle = await fails('not_found', () => uploadEvidence(ali, deps, { taskId, artifactId: copy.artifactId, file: pdf('other cycle') }));
    expect(otherCycle).toBe(notVisible);
  });

  it('a withdrawn link no longer grants download ownership', async () => {
    const hr = await hudaUploads();
    const taskId = await aliTask();
    // a consultant links the HR file to Ali's task: Ali may open it while the link is active
    const linkId = await linkEvidence(await w.ctx('alaa'), hr.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId });
    const ali = await w.ctx('ali');
    expect(canSee(ali, 'evidence.download', await versionResource(db, hr.versionId))).toBe(true);
    await withdrawEvidence(ali, linkId);
    expect((await link(linkId)).review_status).toBe('withdrawn');
    expect(canSee(ali, 'evidence.download', await versionResource(db, hr.versionId))).toBe(false);
  });

  it('D-C3-2: an employee cannot link a colleague draft; the department manager can', async () => {
    const taskId = await aliTask();
    const up = await uploadEvidence(await w.ctx('ali'), deps, { taskId, title: 'Strategy', file: pdf('ali draft') });
    const saraTask = await w.publishedTask();
    await assignTask(await w.ctx('mona'), saraTask, w.users.sara);
    await fails('forbidden', async () => linkEvidence(await w.ctx('sara'), up.versionId, { taskId: saraTask, cycleRequirementId: w.requirementId }));
    const monaTask = await w.publishedTask();
    const mona = await w.ctx('mona');
    await assignTask(mona, monaTask, w.users.mona);
    expect(await linkEvidence(mona, up.versionId, { taskId: monaTask, cycleRequirementId: w.requirementId })).toBeTruthy();
  });

  // ---- positive controls
  it('a suggested carry-over or imported version can still be used on the owner task', async () => {
    const hr = await hudaUploads('carried-over HR policy');
    const taskId = await aliTask();
    await addSuggestions(await w.ctx('alaa'), hr.versionId, [w.requirementId], 'carry_over', { note: 'test' });
    const sg = (await db.query(`SELECT id FROM qiyas.link_suggestions WHERE artifact_version_id = $1 AND status = 'open'`, [hr.versionId])).rows[0];
    const linkId = await useSuggestion(await w.ctx('ali'), sg.id, taskId);
    expect((await link(linkId)).task_id).toBe(taskId);
    expect((await db.query('SELECT status FROM qiyas.link_suggestions WHERE id = $1', [sg.id])).rows[0].status).toBe('linked');
  });

  it('a consultant may link any department version', async () => {
    const hr = await hudaUploads();
    const taskId = await aliTask();
    expect(await linkEvidence(await w.ctx('ahmad'), hr.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId })).toBeTruthy();
    expect(await linksOf(hr.versionId)).toBe(1);
  });

  it('the owner links his own upload, and adds a version to his own artifact', async () => {
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const up = await uploadEvidence(ali, deps, { taskId, title: 'Strategy', file: pdf('own v1') });
    expect(await linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId, proofItemId })).toBeTruthy();
    expect((await uploadEvidence(ali, deps, { taskId, artifactId: up.artifactId, file: pdf('own v2') })).versionNo).toBe(2);
  });
});

describe('duplicate message (C16)', () => {
  it('a duplicate from another department is refused without naming it', async () => {
    const hr = await hudaUploads('same bytes');
    const taskId = await aliTask();
    const msg = await fails('conflict', async () => uploadEvidence(await w.ctx('ali'), deps, { taskId, title: 'Copy', file: pdf('same bytes') }));
    expect(msg).toContain('already in the evidence bank');
    expect(msg).not.toContain('HR-CONFIDENTIAL');
    expect(msg).not.toContain(hr.artifactId);
  });

  it('a colleague duplicate in the same department is not named to an employee (own scope)', async () => {
    const taskId = await aliTask();
    const up = await uploadEvidence(await w.ctx('ali'), deps, { taskId, title: 'Ali strategy', file: pdf('colleague bytes') });
    const saraTask = await w.publishedTask();
    await assignTask(await w.ctx('mona'), saraTask, w.users.sara);
    const msg = await fails('conflict', async () => uploadEvidence(await w.ctx('sara'), deps, { taskId: saraTask, title: 'Copy', file: pdf('colleague bytes') }));
    expect(msg).not.toContain('Ali strategy');
    expect(msg).not.toContain(up.artifactId);
  });

  // ---- positive controls
  it('the user own duplicate still names his own artifact', async () => {
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const up = await uploadEvidence(ali, deps, { taskId, title: 'Strategy', file: pdf('mine') });
    const msg = await fails('conflict', () => uploadEvidence(ali, deps, { taskId, title: 'Copy', file: pdf('mine') }));
    expect(msg).toContain('"Strategy"');
    expect(msg).toContain(up.artifactId);
  });

  it('a consultant sees the detailed duplicate message', async () => {
    const hr = await hudaUploads('central bytes');
    const taskId = await aliTask();
    const msg = await fails('conflict', async () => uploadEvidence(await w.ctx('alaa'), deps, { taskId, title: 'Copy', file: pdf('central bytes') }));
    expect(msg).toContain('HR-CONFIDENTIAL disciplinary case file');
    expect(msg).toContain(hr.artifactId);
  });

  it('D-C16-2: a department manager sees same-department duplicate titles', async () => {
    const taskId = await aliTask();
    const up = await uploadEvidence(await w.ctx('ali'), deps, { taskId, title: 'Ali strategy', file: pdf('dept bytes') });
    const monaTask = await w.publishedTask();
    const mona = await w.ctx('mona');
    await assignTask(mona, monaTask, w.users.mona);
    const msg = await fails('conflict', () => uploadEvidence(mona, deps, { taskId: monaTask, title: 'Copy', file: pdf('dept bytes') }));
    expect(msg).toContain('"Ali strategy"');
    expect(msg).toContain(up.artifactId);
  });
});
