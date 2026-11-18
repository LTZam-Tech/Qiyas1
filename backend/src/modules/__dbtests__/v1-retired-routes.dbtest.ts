/**
 * Security remediation B2, Option A (D-G1-0): the unused v1 routers and the static /api/v1/uploads
 * mount are retired. Each removed path must now be a 404, with /api/v1/auth and /api/v2 (which
 * relies on the v1 access token) still working as positive controls.
 * Covers C1, C2 (static mount, multer temp files), C8 and NC3 (submissions lists), C18 (reviews),
 * N9 (PUT /tasks/:id), N8 (PUT /submissions/:id/status), NC1 and NC2 (submission create/download).
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { PASSWORD, V1World, buildV1World } from './v1World';

let w: V1World;
const SECRET = 'marker-evidence-bytes-for-tests'; // gitleaks:allow (dummy marker, not a credential)
const storedName = '1700000000000-board-minutes.pdf';
const multerTemp = '0123456789abcdef0123456789abcdef';

beforeAll(async () => {
  w = await buildV1World();
  // Files exactly where v1 put them: <cwd>/uploads/evidence/<Date.now()>-<name>, and a multer temp file.
  fs.mkdirSync(path.join(w.cwd, 'uploads', 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(w.cwd, 'uploads', 'evidence', storedName), SECRET);
  fs.writeFileSync(path.join(w.cwd, 'uploads', multerTemp), SECRET);
});
afterAll(async () => w?.close());

const bearer = (user: Parameters<V1World['token']>[0]) => `Bearer ${w.token(user)}`;

const expectNotFound = (res: { status: number; text: string; body: any }) => {
  expect(res.status).toBe(404);
  expect(res.text).not.toContain(SECRET);
  expect(res.body?.error?.type).toBe('https://errors.platform.sa/not-found');
};

describe('retired /api/v1/uploads static mount (C1, C2)', () => {
  it('anonymous GET /api/v1/uploads/evidence/<stored name> does not return the evidence bytes', async () => {
    expectNotFound(await w.http().get(`/api/v1/uploads/evidence/${storedName}`));
  });

  it('a multer temp file is not served', async () => {
    expectNotFound(await w.http().get(`/api/v1/uploads/${multerTemp}`));
  });

  it('a signed-in user cannot fetch it either', async () => {
    expectNotFound(await w.http().get(`/api/v1/uploads/evidence/${storedName}`).set('Authorization', bearer('admin')));
  });
});

describe('retired v1 routers return 404 to a signed-in caller', () => {
  it('GET /api/v1/submissions (C8)', async () => {
    expectNotFound(await w.http().get('/api/v1/submissions').set('Authorization', bearer('e2')));
  });

  it('GET /api/v1/submissions/files (NC3)', async () => {
    expectNotFound(await w.http().get('/api/v1/submissions/files').set('Authorization', bearer('e2')));
  });

  it('GET /api/v1/reviews (C18)', async () => {
    expectNotFound(await w.http().get('/api/v1/reviews').set('Authorization', bearer('e2')));
  });

  it('PUT /api/v1/tasks/:id as the assignee (N9) leaves the task unchanged', async () => {
    const res = await w.http().put(`/api/v1/tasks/${w.tasks.t1}`).set('Authorization', bearer('e1')).send({ status: 'approved' });
    expectNotFound(res);
    const { rows } = await w.query('SELECT status FROM tasks WHERE id = $1', [w.tasks.t1]);
    expect(rows[0].status).toBe('assigned');
  });

  it('PUT /api/v1/submissions/:id/status as the dean (N8)', async () => {
    const res = await w.http().put(`/api/v1/submissions/${randomUUID()}/status`).set('Authorization', bearer('dean')).send({ status: 'approved' });
    expectNotFound(res);
  });

  it('POST /api/v1/submissions (C2, NC1) and the file download (NC2)', async () => {
    const post = await w.http().post('/api/v1/submissions').set('Authorization', bearer('r'))
      .field('taskId', w.tasks.t2).attach('files', Buffer.from('%PDF-1.4 test'), 'x.pdf');
    expect(post.status).toBe(404);
    const { rows } = await w.query('SELECT status FROM tasks WHERE id = $1', [w.tasks.t2]);
    expect(rows[0].status).toBe('assigned');
    expectNotFound(await w.http().get(`/api/v1/submissions/${randomUUID()}/files/${randomUUID()}/download`).set('Authorization', bearer('r')));
  });

  it.each([
    '/api/v1/users', '/api/v1/perspectives', '/api/v1/axes', '/api/v1/standards', '/api/v1/tasks',
    '/api/v1/tasks/my-tasks', '/api/v1/departments', '/api/v1/dashboard/summary', '/api/v1/notifications',
  ])('GET %s', async (url) => {
    expectNotFound(await w.http().get(url).set('Authorization', bearer('admin')));
  });

  it('POST /api/v1/reports/generate', async () => {
    expectNotFound(await w.http().post('/api/v1/reports/generate').set('Authorization', bearer('admin')).send({}));
  });
});

describe('positive controls', () => {
  it('/api/v1/auth/login and /api/v1/auth/me still work', async () => {
    const login = await w.login(w.users.e1.email, PASSWORD);
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken as string;
    expect(token).toEqual(expect.any(String));

    const me = await w.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(w.users.e1.email);
  });

  it('a v2 route still accepts a v1 token', async () => {
    const login = await w.login(w.users.e2.email, PASSWORD);
    const res = await w.http().get('/api/v2/me').set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(w.users.e2.id);
  });

  it('a v2 route without a token is still refused', async () => {
    const res = await w.http().get('/api/v2/me');
    expect(res.status).toBe(401);
  });
});

describe('CSRF protection (csurf; CodeQL js/missing-token-validation)', () => {
  it('a state-changing request without the CSRF token is refused with 403', async () => {
    const res = await request(w.app).post('/api/v1/auth/login').set('X-Forwarded-For', '10.250.0.1')
      .send({ email: w.users.e1.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.type).toBe('https://errors.platform.sa/csrf');
    expect(res.body.data).toBeUndefined();
  });

  it('a token that does not match the secret cookie is refused', async () => {
    const issued = await request(w.app).get('/api/v1/auth/csrf').set('X-Forwarded-For', '10.250.0.2');
    const secret = ([] as string[]).concat(issued.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('_csrf='))!;
    const res = await request(w.app).post('/api/v1/auth/login').set('X-Forwarded-For', '10.250.0.2')
      .set('Cookie', secret).set('x-csrf-token', 'forged-token').send({ email: w.users.e1.email, password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('positive control: GET /api/v1/auth/csrf issues a token that lets the same browser sign in', async () => {
    const issued = await request(w.app).get('/api/v1/auth/csrf').set('X-Forwarded-For', '10.250.0.3');
    expect(issued.status).toBe(200);
    const cookies = ([] as string[]).concat(issued.headers['set-cookie'] ?? []);
    const secret = cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('_csrf='))!;
    expect(cookies.find((c) => c.startsWith('_csrf='))).toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith('csrfToken='))).toMatch(/SameSite=Strict/i);
    const res = await request(w.app).post('/api/v1/auth/login').set('X-Forwarded-For', '10.250.0.3')
      .set('Cookie', secret).set('x-csrf-token', issued.body.data.csrfToken).send({ email: w.users.e1.email, password: PASSWORD });
    expect(res.status).toBe(200);
  });
});

describe('requests without a body (Express 5 leaves req.body undefined; app.ts restores {})', () => {
  // Both handlers read req.body.refreshToken when there is no refreshToken cookie.
  it('refresh without a body or refresh cookie is a 400 validation error, not a 500', async () => {
    const res = await w.http().post('/api/v1/auth/refresh');
    expect(res.status).toBe(400);
  });
  it('logout without a body or refresh cookie succeeds, not a 500', async () => {
    const res = await w.http().post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
  });
});
