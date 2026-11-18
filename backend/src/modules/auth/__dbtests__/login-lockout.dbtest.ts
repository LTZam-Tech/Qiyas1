/**
 * C6 (security remediation B2): the lockout counter starts fresh when a lock expires, and attempts
 * during an active lock neither count nor extend it. Expiry is simulated by moving locked_until into
 * the past. Threshold and duration are the configured 5 attempts / 15 minutes (D-C6-2).
 */
import { PASSWORD, V1World, buildV1World } from '../../__dbtests__/v1World';

const THRESHOLD = 5;
let w: V1World;
let seq = 0;

beforeAll(async () => {
  w = await buildV1World();
});
afterAll(async () => w?.close());

/** A fresh active employee with the shared test password. */
async function victim(): Promise<{ id: string; email: string }> {
  seq += 1;
  const email = `lockout-${seq}@v1.test`;
  const { rows } = await w.query(
    `INSERT INTO users (name, email, password_hash, is_active)
     SELECT $1, $1, password_hash, TRUE FROM users WHERE id = $2 RETURNING id`,
    [email, w.users.e1.id],
  );
  await w.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'employee'`, [rows[0].id]);
  return { id: rows[0].id, email };
}

const state = async (id: string) =>
  (await w.query(
    `SELECT failed_login_attempts AS attempts, locked_until, (locked_until IS NOT NULL AND locked_until > NOW()) AS locked
     FROM users WHERE id = $1`, [id])).rows[0];

const fail = async (email: string, times: number) => {
  for (let i = 0; i < times; i += 1) {
    const res = await w.login(email, 'wrong-password');
    expect(res.status).toBe(401);
  }
};

const expireLock = (id: string) => w.query(`UPDATE users SET locked_until = NOW() - interval '1 minute' WHERE id = $1`, [id]);

describe('v1 login lockout (C6)', () => {
  it('threshold consecutive failures still lock', async () => {
    const v = await victim();
    await fail(v.email, THRESHOLD - 1);
    expect((await state(v.id)).locked).toBe(false);
    await fail(v.email, 1);
    expect((await state(v.id)).locked).toBe(true);
    // the correct password does not get in while the lock is active
    const res = await w.login(v.email, PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.data).toBeUndefined();
  });

  it('after lock expiry one wrong password does not re-lock', async () => {
    const v = await victim();
    await fail(v.email, THRESHOLD);
    expect((await state(v.id)).locked).toBe(true);
    await expireLock(v.id);

    await fail(v.email, 1);
    const s = await state(v.id);
    expect(s.locked).toBe(false);
    expect(s.attempts).toBe(1);
    // positive control: the owner still gets in
    const ok = await w.login(v.email, PASSWORD);
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
  });

  it('after lock expiry, threshold-1 wrong passwords then the correct one succeed', async () => {
    const v = await victim();
    await fail(v.email, THRESHOLD);
    await expireLock(v.id);

    await fail(v.email, THRESHOLD - 1);
    expect((await state(v.id)).locked).toBe(false);
    const ok = await w.login(v.email, PASSWORD);
    expect(ok.status).toBe(200);
    expect(await state(v.id)).toMatchObject({ attempts: 0, locked: false, locked_until: null });
  });

  it('after lock expiry, a full threshold of new failures locks again', async () => {
    const v = await victim();
    await fail(v.email, THRESHOLD);
    await expireLock(v.id);
    await fail(v.email, THRESHOLD);
    expect((await state(v.id)).locked).toBe(true);
  });

  it('wrong attempts during an active lock do not extend it', async () => {
    const v = await victim();
    await fail(v.email, THRESHOLD);
    // pin the lock to a known end so any extension is visible
    await w.query(`UPDATE users SET locked_until = date_trunc('second', NOW()) + interval '5 minutes' WHERE id = $1`, [v.id]);
    const before = await state(v.id);

    await fail(v.email, 3);
    const after = await state(v.id);
    expect(after.locked).toBe(true);
    expect(new Date(after.locked_until).getTime()).toBe(new Date(before.locked_until).getTime());
    expect(after.attempts).toBe(before.attempts);
  });

  it('a successful login resets the counter', async () => {
    const v = await victim();
    await fail(v.email, THRESHOLD - 2);
    expect((await state(v.id)).attempts).toBe(THRESHOLD - 2);

    const ok = await w.login(v.email, PASSWORD);
    expect(ok.status).toBe(200);
    expect((await state(v.id)).attempts).toBe(0);

    // a fresh allowance: threshold-1 more failures do not lock
    await fail(v.email, THRESHOLD - 1);
    expect((await state(v.id)).locked).toBe(false);
  });
});
