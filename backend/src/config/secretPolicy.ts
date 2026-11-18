/**
 * Production secret policy (finding C4).
 *
 * Pure functions so they can be unit-tested without loading the config module.
 * Messages name the variable and the rule it broke; they NEVER contain the value.
 */

/** Template and code-default markers that must never reach production. */
export const PLACEHOLDER_RE = /change[-_]?me|change[-_]?this|generate[-_]?with|replace[-_]?me|minioadmin|password|secret|qiyas-dev-only-secret/i;

/** D-C4-1: minimum lengths and the repetitiveness threshold. */
export const JWT_MIN_LENGTH = 32;
export const DATASTORE_MIN_LENGTH = 16;
export const MIN_DISTINCT_CHARS = 10;

export interface SecretRule {
  minLength?: number;
}

/**
 * Returns why `value` is not an acceptable secret, or null when it is.
 * The returned text never contains the value itself.
 */
export function checkSecret(name: string, value: string | undefined, { minLength = 0 }: SecretRule = {}): string | null {
  if (value === undefined || value === '') return `${name} is missing`;
  if (PLACEHOLDER_RE.test(value)) return `${name} is a template placeholder`;
  if (value.length < minLength) return `${name} is shorter than ${minLength} characters`;
  if (new Set(value).size < MIN_DISTINCT_CHARS) return `${name} is too repetitive (fewer than ${MIN_DISTINCT_CHARS} distinct characters)`;
  return null;
}

export interface SecretPolicyConfig {
  jwt: {
    algorithm: 'HS256' | 'RS256';
    accessPrivateKey?: string;
    accessPublicKey?: string;
  };
}

const present = (v: string | undefined): v is string => v !== undefined && v !== '';

/** Lists every policy violation for a production environment (empty when the environment passes). */
export function productionSecretProblems(env: NodeJS.ProcessEnv, cfg: SecretPolicyConfig): string[] {
  const problems: string[] = [];
  const add = (p: string | null) => { if (p) problems.push(p); };

  // JWT signing key
  if (cfg.jwt.algorithm === 'RS256') {
    // HS strength checks do not apply to RS256; keep the existing presence check.
    if (!present(cfg.jwt.accessPrivateKey) || !present(cfg.jwt.accessPublicKey)) {
      problems.push('JWT_ACCESS_PRIVATE_KEY and JWT_ACCESS_PUBLIC_KEY are required when using RS256');
    }
  } else {
    add(checkSecret('JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET, { minLength: JWT_MIN_LENGTH }));
  }
  // D-C4-2: JWT_REFRESH_SECRET is not used (refresh tokens are opaque). Optional; checked only when set.
  if (present(env.JWT_REFRESH_SECRET)) {
    add(checkSecret('JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET, { minLength: JWT_MIN_LENGTH }));
  }

  // Datastores
  add(checkSecret('POSTGRES_PASSWORD', env.POSTGRES_PASSWORD, { minLength: DATASTORE_MIN_LENGTH }));
  add(checkSecret('REDIS_PASSWORD', env.REDIS_PASSWORD, { minLength: DATASTORE_MIN_LENGTH })); // D-C4-3
  add(checkSecret('MINIO_ROOT_PASSWORD', env.MINIO_ROOT_PASSWORD, { minLength: DATASTORE_MIN_LENGTH }));
  if (present(env.MINIO_SECRET_KEY)) {
    add(checkSecret('MINIO_SECRET_KEY', env.MINIO_SECRET_KEY, { minLength: DATASTORE_MIN_LENGTH }));
  }
  if (!present(env.MINIO_ROOT_USER)) problems.push('MINIO_ROOT_USER is missing');
  else if (env.MINIO_ROOT_USER.trim().toLowerCase() === 'minioadmin') problems.push('MINIO_ROOT_USER must not be the default minioadmin');
  if (present(env.MINIO_ACCESS_KEY) && env.MINIO_ACCESS_KEY.trim().toLowerCase() === 'minioadmin') {
    problems.push('MINIO_ACCESS_KEY must not be the default minioadmin');
  }

  // SMTP: placeholder check only, and only when an SMTP user is configured.
  const smtpPass = env.SMTP_PASSWORD || env.SMTP_PASS;
  if (present(env.SMTP_USER) && present(smtpPass) && PLACEHOLDER_RE.test(smtpPass)) {
    problems.push('SMTP_PASSWORD is a template placeholder');
  }

  // The JWT secret must be unique.
  if (cfg.jwt.algorithm !== 'RS256' && present(env.JWT_ACCESS_SECRET)) {
    const others = ['JWT_REFRESH_SECRET', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'MINIO_ROOT_PASSWORD', 'MINIO_SECRET_KEY', 'SMTP_PASSWORD', 'SMTP_PASS'];
    for (const other of others) {
      if (env[other] === env.JWT_ACCESS_SECRET) problems.push(`JWT_ACCESS_SECRET must not equal ${other}`);
    }
  }
  return problems;
}

/** Throws one error listing every violation. Call only when NODE_ENV=production. */
export function assertProductionSecrets(env: NodeJS.ProcessEnv, cfg: SecretPolicyConfig): void {
  const problems = productionSecretProblems(env, cfg);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production: ${problems.join('; ')}. Generate each secret with: openssl rand -base64 48`,
    );
  }
}
