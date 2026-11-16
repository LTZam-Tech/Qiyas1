import { Client } from 'pg';
import { connectTestDb, resetSchema } from '../../db/__dbtests__/testDb';
import { listUsers } from '../../admin/admin';
import { listLibrary, syncLibrary } from '../../library/library';
import { World, buildWorld } from '../../work/__dbtests__/world';
import { pageFromQuery } from '../paging';
import { listTasks } from '../queries';

let db: Client;
let w: World;

beforeAll(async () => {
  db = await connectTestDb();
  await resetSchema(db);
});
afterAll(async () => db?.end());
beforeEach(async () => { await db.query('BEGIN'); w = await buildWorld(db); });
afterEach(async () => db.query('ROLLBACK'));

describe('pagination', () => {
  it('reads ?page and ?pageSize; no page means the whole list', () => {
    expect(pageFromQuery({})).toBeNull();
    expect(pageFromQuery({ page: '2' })).toEqual({ page: 2, pageSize: 10 });
    expect(pageFromQuery({ page: '1', pageSize: '25' })).toEqual({ page: 1, pageSize: 25 });
    expect(pageFromQuery({ page: '0' })).toBeNull();
    expect(pageFromQuery({ page: '1', pageSize: '500' })).toBeNull();
  });

  it('pages tasks with a total, in a stable order, and filters open tasks on the server', async () => {
    for (let i = 0; i < 12; i += 1) await w.publishedTask();
    const alaa = await w.ctx('alaa');
    const all = await listTasks(alaa, { cycleId: w.cycleId });
    expect(all).toHaveLength(12);
    const p1 = await listTasks(alaa, { cycleId: w.cycleId, open: true }, { page: 1, pageSize: 10 });
    const p2 = await listTasks(alaa, { cycleId: w.cycleId, open: true }, { page: 2, pageSize: 10 });
    expect([p1.total, p1.items.length, p2.items.length]).toEqual([12, 10, 2]);
    expect(new Set([...p1.items, ...p2.items].map((t) => t.id)).size).toBe(12);
    expect(p1.items[0].deadline).toBeDefined();
    const past = await listTasks(alaa, { cycleId: w.cycleId }, { page: 5, pageSize: 10 });
    expect([past.items.length, past.total]).toEqual([0, 12]);
  });

  it('pages the library and the user list with their filters', async () => {
    await syncLibrary(db);
    const alaa = await w.ctx('alaa');
    const all = await listLibrary(alaa);
    const page = await listLibrary(alaa, {}, { page: 2, pageSize: 10 });
    expect(page.total).toBe(all.length);
    expect(page.items.map((d) => d.id)).toEqual(all.slice(10, 20).map((d) => d.id));
    const users = await listUsers(await w.ctx('tariq'), { page: 1, pageSize: 3 }, 'a');
    expect(users.items).toHaveLength(3);
    expect(users.total).toBeGreaterThan(3);
  });
});
