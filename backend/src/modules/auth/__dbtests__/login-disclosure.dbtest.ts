/**
 * C7 (security remediation B2): before the password is proven, the v1 login gives the same answer for
 * an unknown email, a wrong password, a locked account and an inactive account (D-C7-1: 401
 * "Invalid credentials"). Locked or inactive status is reported only after a correct password
 * (D-C7-2), and a lock is a 401 (D-C7-3).
 */
import { PASSWORD, V1World, buildV1World } from '../../__dbtests__/v1World';

const THRESHOLD = 5;
let w: V1World;
let seq = 0;

beforeAll(async () => {
  w = await buildV1World();
});
afterAll(async () => w?.close());

async function account(opts: { active?: boolean; locked?: boolean } = {}): Promise<{ id: string; email: string }> {
  seq += 1;
  const email = `disclosure-${seq}@v1.test`;
  const { rows } = await w.query(
    `INSERT INTO users (name, email, password_hash, is_active, locked_until)
     SELECT $1, $1, password_hash, $3, CASE WHEN $4::boolean THEN NOW() + interval '10 minutes' END
     FROM users WHERE id = $2 RETURNING id`,
    [email, w.users.e1.id, opts.active ?? true, opts.locked ?? false],
  );
  await w.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'employee'`, [rows[0].id]);
  return { id: rows[0].id, email };
}

const unknownEmail = () => {
  seq += 1;
  return `nobody-${seq}@v1.test`;
};

/** What a caller can tell apart: the status and the whole body. */
const shape = (res: { status: number; body: unknown }) => ({ status: res.status, body: res.body });

describe('v1 login account-state disclosure (C7)', () => {
  it('unknown, wrong-password, inactive and locked accounts with a wrong password return identical status and body', async () => {
    const active = await account();
    const inactive = await account({ active: false });
    const locked = await account({ locked: true });

    const unknown = shape(await w.login(unknownEmail(), 'wrong-password'));
    expect(unknown.status).toBe(401);
    expect(unknown.body).toMatchObject({ success: false, error: { status: 401, detail: 'Invalid credentials' } });

    expect(shape(await w.login(active.email, 'wrong-password'))).toEqual(unknown);
    expect(shape(await w.login(inactive.email, 'wrong-password'))).toEqual(unknown);
    expect(shape(await w.login(locked.email, 'wrong-password'))).toEqual(unknown);
  });

  it('the 6th attempt on an existing email matches the 6th on an unknown email', async () => {
    const existing = await account();
    const unknown = unknownEmail();
    for (let i = 0; i < THRESHOLD; i += 1) {
      await w.login(existing.email, 'wrong-password');
      await w.login(unknown, 'wrong-password');
    }
    const sixthExisting = shape(await w.login(existing.email, 'wrong-password'));
    const sixthUnknown = shape(await w.login(unknown, 'wrong-password'));
    expect(sixthExisting).toEqual(sixthUnknown);
    expect(sixthExisting.status).toBe(401);
    expect(JSON.stringify(sixthExisting.body)).not.toMatch(/lock/i);
  });

  it('an inactive account with a wrong password never says "not active"', async () => {
    const inactive = await account({ active: false });
    const res = await w.login(inactive.email, 'wrong-password');
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/not active|inactive/i);
  });

  it('a locked account with the correct password returns 401 account-locked and no token', async () => {
    const locked = await account({ locked: true });
    const res = await w.login(locked.email, PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.error.type).toMatch(/\/account-locked$/);
    expect(res.body.data).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('an inactive account with the correct password returns 401 account-inactive and no token', async () => {
    const inactive = await account({ active: false });
    const res = await w.login(inactive.email, PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.error.type).toMatch(/\/account-inactive$/);
    expect(res.body.data).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('positive control: an active account with the correct password signs in', async () => {
    const active = await account();
    const res = await w.login(active.email, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(active.email);
  });
});
