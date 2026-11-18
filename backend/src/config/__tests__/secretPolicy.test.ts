/**
 * C4: the production config accepted the shipped CHANGE-ME placeholder as the JWT signing secret.
 * These tests reproduce the template values and the code defaults, and assert that production
 * refuses them; positive controls use crypto.randomBytes(48) values.
 */
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { assertProductionSecrets, checkSecret, productionSecretProblems, SecretPolicyConfig } from '../secretPolicy';

// The real parser, even if a test below mocks the module.
const { parse } = jest.requireActual<typeof import('dotenv')>('dotenv');

const REPO = path.resolve(__dirname, '../../../..');
const HS: SecretPolicyConfig = { jwt: { algorithm: 'HS256' } };
const strong = () => randomBytes(48).toString('base64');

/** A production environment that passes the policy. */
const goodEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: strong(),
  POSTGRES_PASSWORD: strong(),
  REDIS_PASSWORD: strong(),
  MINIO_ROOT_USER: 'qiyas-storage',
  MINIO_ROOT_PASSWORD: strong(),
});

const errorOf = (fn: () => void): Error => {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error('expected a throw');
};

describe('secretPolicy (C4)', () => {
  it('rejects every secret in deploy/.env.example under production', () => {
    const env = { ...parse(readFileSync(path.join(REPO, 'deploy/.env.example'))), NODE_ENV: 'production' };
    const err = errorOf(() => assertProductionSecrets(env, HS));
    expect(err.message).toContain('JWT_ACCESS_SECRET');
    for (const name of ['POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'MINIO_ROOT_PASSWORD']) expect(err.message).toContain(name);
  });

  it('rejects every secret in .env.production.example', () => {
    const env = { ...parse(readFileSync(path.join(REPO, '.env.production.example'))), NODE_ENV: 'production' };
    const problems = productionSecretProblems(env, HS);
    for (const name of ['JWT_ACCESS_SECRET', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'MINIO_ROOT_PASSWORD']) {
      expect(problems.some((p) => p.startsWith(name))).toBe(true);
    }
  });

  it('rejects the baseline template placeholders (CHANGE-ME, CHANGE_ME_USE_STRONG_PASSWORD, CHANGE_ME_GENERATE_WITH_openssl_rand_hex_64)', () => {
    for (const v of ['CHANGE-ME', 'CHANGE_ME_USE_STRONG_PASSWORD', 'CHANGE_ME_GENERATE_WITH_openssl_rand_hex_64']) {
      expect(checkSecret('X', v, { minLength: 0 })).toBe('X is a template placeholder');
    }
    expect(productionSecretProblems({ ...goodEnv(), MINIO_ROOT_USER: 'minioadmin' }, HS)).toContain('MINIO_ROOT_USER must not be the default minioadmin');
  });

  it('rejects the code defaults change-this-secret-in-production, change_me, minioadmin', () => {
    expect(productionSecretProblems({ ...goodEnv(), JWT_ACCESS_SECRET: 'change-this-secret-in-production' }, HS))
      .toContain('JWT_ACCESS_SECRET is a template placeholder');
    expect(productionSecretProblems({ ...goodEnv(), POSTGRES_PASSWORD: 'change_me' }, HS))
      .toContain('POSTGRES_PASSWORD is a template placeholder');
    expect(productionSecretProblems({ ...goodEnv(), MINIO_ROOT_PASSWORD: 'minioadmin' }, HS))
      .toContain('MINIO_ROOT_PASSWORD is a template placeholder');
    expect(productionSecretProblems({ ...goodEnv(), JWT_ACCESS_SECRET: 'qiyas-dev-only-secret' }, HS))
      .toContain('JWT_ACCESS_SECRET is a template placeholder');
  });

  it('rejects a 31-character JWT secret', () => {
    const env = { ...goodEnv(), JWT_ACCESS_SECRET: strong().slice(0, 31) };
    expect(productionSecretProblems(env, HS)).toContain('JWT_ACCESS_SECRET is shorter than 32 characters');
    // positive control: 32 characters pass
    expect(productionSecretProblems({ ...env, JWT_ACCESS_SECRET: strong().slice(0, 32) }, HS)).toEqual([]);
  });

  it('rejects a 15-character datastore password', () => {
    expect(productionSecretProblems({ ...goodEnv(), POSTGRES_PASSWORD: strong().slice(0, 15) }, HS))
      .toContain('POSTGRES_PASSWORD is shorter than 16 characters');
  });

  it('rejects a low-diversity 64-character secret', () => {
    const env = { ...goodEnv(), JWT_ACCESS_SECRET: 'ab'.repeat(32) };
    expect(productionSecretProblems(env, HS)).toContain('JWT_ACCESS_SECRET is too repetitive (fewer than 10 distinct characters)');
  });

  it('rejects a JWT secret reused as POSTGRES_PASSWORD', () => {
    const env = goodEnv();
    env.POSTGRES_PASSWORD = env.JWT_ACCESS_SECRET;
    expect(productionSecretProblems(env, HS)).toContain('JWT_ACCESS_SECRET must not equal POSTGRES_PASSWORD');
  });

  it('checks JWT_REFRESH_SECRET only when set, and it must differ from the access secret', () => {
    expect(productionSecretProblems(goodEnv(), HS)).toEqual([]); // not required (D-C4-2)
    expect(productionSecretProblems({ ...goodEnv(), JWT_REFRESH_SECRET: 'CHANGE-ME' }, HS)).toContain('JWT_REFRESH_SECRET is a template placeholder');
    const env = goodEnv();
    env.JWT_REFRESH_SECRET = env.JWT_ACCESS_SECRET;
    expect(productionSecretProblems(env, HS)).toContain('JWT_ACCESS_SECRET must not equal JWT_REFRESH_SECRET');
  });

  it('requires REDIS_PASSWORD in production', () => {
    const env = goodEnv();
    delete env.REDIS_PASSWORD;
    expect(productionSecretProblems(env, HS)).toContain('REDIS_PASSWORD is missing');
    expect(productionSecretProblems({ ...env, REDIS_PASSWORD: '' }, HS)).toContain('REDIS_PASSWORD is missing');
  });

  it('checks the SMTP password for placeholders only when SMTP_USER is set', () => {
    expect(productionSecretProblems({ ...goodEnv(), SMTP_PASSWORD: 'CHANGE-ME' }, HS)).toEqual([]);
    expect(productionSecretProblems({ ...goodEnv(), SMTP_USER: 'relay', SMTP_PASSWORD: 'CHANGE-ME' }, HS))
      .toContain('SMTP_PASSWORD is a template placeholder');
    expect(productionSecretProblems({ ...goodEnv(), SMTP_USER: 'relay', SMTP_PASSWORD: strong() }, HS)).toEqual([]);
  });

  it('accepts crypto.randomBytes(48) values', () => {
    expect(productionSecretProblems(goodEnv(), HS)).toEqual([]);
    expect(() => assertProductionSecrets(goodEnv(), HS)).not.toThrow();
  });

  it('RS256 skips HS strength but requires both keys', () => {
    const env = { ...goodEnv(), JWT_ACCESS_SECRET: undefined };
    expect(productionSecretProblems(env, { jwt: { algorithm: 'RS256', accessPrivateKey: 'priv', accessPublicKey: 'pub' } })).toEqual([]);
    expect(productionSecretProblems(env, { jwt: { algorithm: 'RS256', accessPrivateKey: 'priv' } }))
      .toContain('JWT_ACCESS_PRIVATE_KEY and JWT_ACCESS_PUBLIC_KEY are required when using RS256');
    // the datastore rules still apply under RS256
    expect(productionSecretProblems({ ...env, POSTGRES_PASSWORD: 'CHANGE-ME' }, { jwt: { algorithm: 'RS256', accessPrivateKey: 'priv', accessPublicKey: 'pub' } }))
      .toContain('POSTGRES_PASSWORD is a template placeholder');
  });

  it('error messages never contain the secret value', () => {
    const values = {
      JWT_ACCESS_SECRET: 'Zq9!xT2#short',            // too short
      POSTGRES_PASSWORD: 'aaaaaaaaaaaaaaaaaaaaaaaa',  // too repetitive
      REDIS_PASSWORD: 'my-CHANGE-ME-redis-pass',     // placeholder
      MINIO_ROOT_PASSWORD: 'Zq9!xT2#short',           // too short
      SMTP_USER: 'relay',
      SMTP_PASSWORD: 'smtp-secret-value-xyz',         // placeholder
    };
    const err = errorOf(() => assertProductionSecrets({ ...goodEnv(), ...values }, HS));
    for (const [name, v] of Object.entries(values)) {
      if (name === 'SMTP_USER') continue;
      expect(err.message).not.toContain(v);
    }
  });
});

describe('config/index.ts (C4 integration)', () => {
  const saved = process.env;
  afterEach(() => { process.env = saved; });

  /** Imports config/index.ts in isolation with `env`; dotenv is mocked so a local backend/.env cannot leak in. */
  const importConfig = (env: NodeJS.ProcessEnv) => {
    process.env = env;
    jest.isolateModules(() => {
      jest.doMock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() }, config: jest.fn() }));
      require('../index');
    });
  };

  const hosts = {
    POSTGRES_HOST: 'db', POSTGRES_PORT: '5432', POSTGRES_DB: 'qiyas', POSTGRES_USER: 'qiyas',
    REDIS_HOST: 'redis', REDIS_PORT: '6379', MINIO_ENDPOINT: 'minio', MINIO_PORT: '9000',
  };
  // The values deploy/.env.example shipped at baseline 80ae855.
  const baselineTemplate = {
    POSTGRES_PASSWORD: 'CHANGE-ME', REDIS_PASSWORD: 'CHANGE-ME', MINIO_ROOT_USER: 'qiyas-storage', MINIO_ROOT_PASSWORD: 'CHANGE-ME',
    JWT_ACCESS_SECRET: 'CHANGE-ME', JWT_REFRESH_SECRET: 'CHANGE-ME',
  };

  it('config/index.ts throws at import under NODE_ENV=production with template values', () => {
    expect(() => importConfig({ NODE_ENV: 'production', ...hosts, ...baselineTemplate })).toThrow(/JWT_ACCESS_SECRET is a template placeholder/);
  });

  it('config/index.ts imports under NODE_ENV=production with strong values (positive control)', () => {
    expect(() => importConfig({ ...goodEnv(), ...hosts })).not.toThrow();
  });

  it('development mode performs no secret checks', () => {
    expect(() => importConfig({ NODE_ENV: 'development', ...baselineTemplate })).not.toThrow();
    expect(() => importConfig({ NODE_ENV: 'development' })).not.toThrow();
  });
});
