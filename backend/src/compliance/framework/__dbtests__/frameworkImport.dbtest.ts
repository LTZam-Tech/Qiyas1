// C13: framework and crosswalk imports are bounded and write their links in a few batched statements.
import { Client } from 'pg';
import { ComplianceError, ServiceContext } from '../../core/context';
import { connectTestDb, resetSchema } from '../../db/__dbtests__/testDb';
import { World, buildWorld } from '../../work/__dbtests__/world';
import sample from '../samples/dga-v5.0-sample.json';
import { CROSSWALK_LIMITS, importCrosswalk } from '../crosswalk';
import { INSERT_CHUNK_ROWS, activateFramework, importFramework } from '../frameworkService';

let db: Client;
let w: World;

beforeAll(async () => {
  db = await connectTestDb();
  await resetSchema(db);
});
afterAll(async () => db?.end());
beforeEach(async () => {
  await db.query('BEGIN');
  w = await buildWorld(db);
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

/** The same context, with every statement whose text contains `needle` counted. */
function counting(ctx: ServiceContext, needle: string): { ctx: ServiceContext; count: () => number } {
  let n = 0;
  const inner = ctx.db;
  return {
    ctx: { ...ctx, db: { query: (text: string, params?: unknown[]) => { if (text.includes(needle)) n += 1; return inner.query(text, params); } } },
    count: () => n,
  };
}

const T = { ar: 'نص', en: 'text' };
/** One standard with `requirements` top-level requirements and `proofItems` proof items linked to all of them. */
const bigFile = (version: string, requirements: number, proofItems: number) => ({
  format: 'qiyas-framework/1', issuer: 'TEST', documentCode: 'TEST-BIG', version, publishedOn: '2026-01-01', title: T,
  perspectives: [{ code: 'P1', name: T, axes: [{ code: 'A1', name: T, standards: [{
    code: 'S1', title: T,
    requirements: Array.from({ length: requirements }, (_, i) => ({ code: `S1-R${i + 1}`, text: T })),
    proofItems: Array.from({ length: proofItems }, (_, i) => ({ code: `S1-E${i + 1}`, description: T })),
  }] }] }],
});

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

describe('framework import limits (C13)', () => {
  it('importFramework writes links in batched statements', async () => {
    // 120 requirements x 100 proof items = 12,000 links: 3 statements of at most 5,000 rows, not 12,000
    const { ctx, count } = counting(await w.ctx('alaa'), 'qiyas.requirement_proof_items');
    const out = await importFramework(ctx, bigFile('1.0', 120, 100));
    expect(out.stats.links).toBe(12_000);
    expect(count()).toBe(Math.ceil(12_000 / INSERT_CHUNK_ROWS));
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM qiyas.requirement_proof_items l
       JOIN qiyas.proof_items e ON e.id = l.proof_item_id JOIN qiyas.standards s ON s.id = e.standard_id
       JOIN qiyas.axes a ON a.id = s.axis_id JOIN qiyas.perspectives p ON p.id = a.perspective_id
      WHERE p.framework_version_id = $1`, [out.frameworkVersionId]);
    expect(rows[0].n).toBe(12_000);
  });

  it('an oversized framework fails validation and writes no version row', async () => {
    // 400 x 200 = 80,000 links, over linksPerFile
    const message = await fails('validation', async () => importFramework(await w.ctx('alaa'), bigFile('2.0', 400, 200)));
    expect(message).toContain('50000');
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM qiyas.framework_versions WHERE document_code = 'TEST-BIG'`);
    expect(rows[0].n).toBe(0);
  });

  it('a crosswalk with a duplicated target is a validation error, not a 409', async () => {
    await importOlderVersion();
    const alaa = await w.ctx('alaa');
    const message = await fails('validation', () => importCrosswalk(alaa, crosswalk([{ from: '5.1.1-R1', to: ['5.1.1-R1', '5.1.1-R1'], relation: 'split' }])));
    expect(message).toContain('more than once');
    // positive control: the same entry with one target imports, and the batched insert writes it
    expect(await importCrosswalk(alaa, crosswalk([{ from: '5.1.1-R1', to: ['5.1.1-R1'], relation: 'moved' }]))).toEqual({ mapped: 1, removed: 0, links: 1 });
    expect((await db.query('SELECT relation FROM qiyas.crosswalk')).rows).toEqual([{ relation: 'moved' }]);
  });

  it('more than 50 targets per crosswalk entry is rejected', async () => {
    await importOlderVersion();
    const alaa = await w.ctx('alaa');
    const targets = Array.from({ length: CROSSWALK_LIMITS.targetsPerEntry + 1 }, (_, i) => `5.1.1-R${i + 1}`);
    const message = await fails('validation', () => importCrosswalk(alaa, crosswalk([{ from: '5.1.1-R1', to: targets, relation: 'split' }])));
    expect(message).toContain(`At most ${CROSSWALK_LIMITS.targetsPerEntry} targets`);
  });
});
