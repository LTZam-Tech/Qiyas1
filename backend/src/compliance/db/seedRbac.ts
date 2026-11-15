/**
 * Seeds the permission catalogue and the six system roles from the code
 * matrix (domain/permissions.ts). Idempotent: system roles are brought back
 * in line with the code on every run; custom roles are never touched.
 */
import { DEFAULT_ROLE_PERMISSIONS, DEPARTMENT_SCOPED_ROLES, PERMISSIONS, ROLE_CODES, ROLE_NAMES } from '../domain/permissions';
import type { Queryable } from './migrate';

export interface SeedStatement {
  text: string;
  params: unknown[];
}

/** The statements, separated from execution so they can be inspected in tests. */
export function rbacSeedStatements(): SeedStatement[] {
  const out: SeedStatement[] = [];
  for (const code of PERMISSIONS) {
    out.push({ text: 'INSERT INTO qiyas.permissions (code) VALUES ($1) ON CONFLICT (code) DO NOTHING', params: [code] });
  }
  for (const role of ROLE_CODES) {
    out.push({
      text: `INSERT INTO qiyas.roles (code, name_ar, name_en, is_system, department_scoped)
             VALUES ($1, $2, $3, TRUE, $4)
             ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
               is_system = TRUE, department_scoped = EXCLUDED.department_scoped`,
      params: [role, ROLE_NAMES[role].ar, ROLE_NAMES[role].en, DEPARTMENT_SCOPED_ROLES.includes(role)],
    });
    out.push({
      text: 'DELETE FROM qiyas.role_permissions WHERE role_id = (SELECT id FROM qiyas.roles WHERE code = $1)',
      params: [role],
    });
    for (const [perm, scope] of Object.entries(DEFAULT_ROLE_PERMISSIONS[role])) {
      out.push({
        text: `INSERT INTO qiyas.role_permissions (role_id, permission_id, scope)
               SELECT r.id, p.id, $3 FROM qiyas.roles r, qiyas.permissions p WHERE r.code = $1 AND p.code = $2`,
        params: [role, perm, scope],
      });
    }
  }
  return out;
}

export async function seedRbac(db: Queryable): Promise<number> {
  const statements = rbacSeedStatements();
  await db.query('BEGIN');
  try {
    for (const s of statements) await db.query(s.text, s.params);
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
  return statements.length;
}
