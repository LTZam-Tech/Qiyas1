/**
 * C7 (security remediation B2): the v1 login does the same bcrypt work for an unknown email as for a
 * known one, and C6: a failure during an active lock is not counted.
 */
jest.mock('bcrypt', () => ({
  __esModule: true,
  default: {
    hashSync: jest.fn(() => '$2b$12$dummy-hash-for-unknown-emails'),
    hash: jest.fn(async () => '$2b$12$hash'),
    compare: jest.fn(async () => false),
  },
}));
jest.mock('@/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('@/config', () => ({
  __esModule: true,
  default: {
    env: 'test',
    security: { bcryptRounds: 12, maxLoginAttempts: 5, lockoutDurationMinutes: 15 },
    jwt: { algorithm: 'HS256', accessSecret: 'unit-test-only-secret-0123456789abcdef', accessExpiresIn: '15m' },
  },
}));
jest.mock('@/utils/logger', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import bcrypt from 'bcrypt';
import db from '@/db';
import authService from '../auth.service';

const compare = bcrypt.compare as unknown as jest.Mock;
const query = db.query as unknown as jest.Mock;
const DUMMY = '$2b$12$dummy-hash-for-unknown-emails';

beforeEach(() => {
  compare.mockReset().mockResolvedValue(false);
  query.mockReset();
});

describe('AuthService.login (C7)', () => {
  it('bcrypt.compare runs for unknown emails', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(authService.login('nobody@v1.test', 'some-password', '127.0.0.1')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid credentials',
    });
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith('some-password', DUMMY);
    // nothing is counted for an account that does not exist
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('positive control: a known email is compared against its stored hash and the failure is counted', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'e1@v1.test', password_hash: '$2b$12$stored', is_active: true, failed_login_attempts: 0, locked_until: null, role: 'employee' }] })
      .mockResolvedValueOnce({ rows: [{ failed_login_attempts: 1, locked_until: null }] });

    await expect(authService.login('e1@v1.test', 'wrong', '127.0.0.1')).rejects.toMatchObject({ statusCode: 401, message: 'Invalid credentials' });
    expect(compare).toHaveBeenCalledWith('wrong', '$2b$12$stored');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toMatch(/UPDATE users SET/);
  });

  it('bcrypt.compare runs before an inactive account is reported, and a wrong password stays generic', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'u2', email: 'gone@v1.test', password_hash: '$2b$12$stored', is_active: false, failed_login_attempts: 0, locked_until: null, role: 'employee' }] })
      .mockResolvedValueOnce({ rows: [{ failed_login_attempts: 1, locked_until: null }] });

    await expect(authService.login('gone@v1.test', 'wrong', '127.0.0.1')).rejects.toMatchObject({ statusCode: 401, message: 'Invalid credentials' });
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('a wrong password during an active lock is generic and not counted (C6)', async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    query.mockResolvedValueOnce({ rows: [{ id: 'u3', email: 'locked@v1.test', password_hash: '$2b$12$stored', is_active: true, failed_login_attempts: 0, locked_until: lockedUntil, role: 'employee' }] });

    await expect(authService.login('locked@v1.test', 'wrong', '127.0.0.1')).rejects.toMatchObject({ statusCode: 401, message: 'Invalid credentials' });
    expect(compare).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('a correct password on a locked account is a 401 ACCOUNT_LOCKED', async () => {
    compare.mockResolvedValue(true);
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    query.mockResolvedValueOnce({ rows: [{ id: 'u4', email: 'locked2@v1.test', password_hash: '$2b$12$stored', is_active: true, failed_login_attempts: 0, locked_until: lockedUntil, role: 'employee' }] });

    await expect(authService.login('locked2@v1.test', 'right', '127.0.0.1')).rejects.toMatchObject({ statusCode: 401, errorCode: 'ACCOUNT_LOCKED' });
  });
});
