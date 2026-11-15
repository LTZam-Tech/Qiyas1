/**
 * Roles, permissions and separation of duties (docs/phase1/02-roles-and-permissions.md).
 *
 * The default role matrix ships as data and is seeded into the database;
 * administrators can add custom roles later (BR-ADM-04). Separation-of-duty
 * rules are code and cannot be configured away.
 */
import type { Actor } from './stateMachines';

export const ROLE_CODES = ['QC', 'DM', 'EMP', 'DSO', 'EXE', 'ADM'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

/** Roles granted per department; the others are organization-wide. */
export const DEPARTMENT_SCOPED_ROLES: readonly RoleCode[] = ['DM', 'EMP'];

export const ROLE_NAMES: Record<RoleCode, { ar: string; en: string }> = {
  QC: { ar: 'مستشار قياس', en: 'Qiyas Consultant' },
  DM: { ar: 'مدير الإدارة', en: 'Department Manager' },
  EMP: { ar: 'موظف (منفّذ)', en: 'Employee (Executor)' },
  DSO: { ar: 'مسؤول الرفع على منصة الهيئة', en: 'DGA Submission Officer' },
  EXE: { ar: 'الإدارة العليا (اطلاع)', en: 'Executive Viewer' },
  ADM: { ar: 'مدير النظام', en: 'System Administrator' },
};

export const PERMISSIONS = [
  'framework.view', 'framework.import', 'framework.crosswalk', 'cycle.manage', 'applicability.manage',
  'assignment.create', 'assignment.edit', 'assignment.cancel',
  'task.view', 'task.assign', 'task.self_assign', 'task.reassign', 'task.split', 'task.work', 'deadline.correct',
  'clarification.request', 'clarification.answer', 'clarification.view',
  'extension.suggest', 'extension.request', 'extension.forward_or_decline', 'extension.decide',
  'escalation.manual', 'escalation.view',
  'evidence.upload', 'evidence.link', 'evidence.submit', 'evidence.withdraw', 'evidence.view', 'evidence.download',
  'review.decide',
  'submission.view_queue', 'submission.package', 'submission.mark_posted', 'submission.mark_not_posted',
  'bank.view_current', 'bank.search_history', 'bank.reuse', 'bank.import',
  'library.view', 'library.manage',
  'dashboard.programme', 'dashboard.department', 'dashboard.personal', 'report.generate', 'audit.view',
  'admin.users', 'admin.departments', 'admin.groups', 'admin.roles', 'admin.settings', 'admin.sla_policies',
  'admin.notification_templates',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * own      — records where the user is owner, original assignee, requester or uploader
 * dept     — records of the department(s) where the user holds the role
 * accepted — accepted evidence only (submission officer, executives)
 * all      — every record
 */
export type Scope = 'own' | 'dept' | 'accepted' | 'all';

type Matrix = Record<RoleCode, Partial<Record<Permission, Scope>>>;

export const DEFAULT_ROLE_PERMISSIONS: Matrix = {
  QC: {
    'framework.view': 'all', 'framework.import': 'all', 'framework.crosswalk': 'all', 'cycle.manage': 'all',
    'applicability.manage': 'all', 'assignment.create': 'all', 'assignment.edit': 'all', 'assignment.cancel': 'all',
    'task.view': 'all', 'deadline.correct': 'all',
    'clarification.answer': 'all', 'clarification.view': 'all', 'extension.decide': 'all',
    'escalation.manual': 'all', 'escalation.view': 'all',
    // D3: attaches and submits evidence on any task like a normal employee
    'evidence.upload': 'all', 'evidence.link': 'all', 'evidence.submit': 'all', 'evidence.withdraw': 'all',
    'evidence.view': 'all', 'evidence.download': 'all', 'review.decide': 'all',
    'submission.view_queue': 'all', 'bank.view_current': 'all', 'bank.search_history': 'all', 'bank.reuse': 'all',
    // folder import of central evidence; the imported files are reviewed by another consultant (D9)
    'bank.import': 'all', 'library.view': 'all', 'library.manage': 'all',
    'dashboard.programme': 'all', 'dashboard.department': 'all', 'dashboard.personal': 'all',
    'report.generate': 'all', 'audit.view': 'all', 'admin.sla_policies': 'all',
  },
  DM: {
    'framework.view': 'all', 'task.view': 'dept', 'task.assign': 'dept', 'task.self_assign': 'dept',
    'task.reassign': 'dept', 'task.split': 'dept', 'task.work': 'own',
    'clarification.request': 'own', 'clarification.answer': 'dept', 'clarification.view': 'dept',
    'extension.request': 'dept', 'extension.forward_or_decline': 'dept', 'escalation.view': 'dept',
    'evidence.upload': 'own', 'evidence.link': 'own', 'evidence.submit': 'own', 'evidence.withdraw': 'own',
    'evidence.view': 'dept', 'evidence.download': 'dept', 'bank.view_current': 'dept',
    'dashboard.department': 'dept', 'dashboard.personal': 'own', 'report.generate': 'dept', 'audit.view': 'dept',
    'library.view': 'all',
  },
  EMP: {
    'framework.view': 'all', 'task.view': 'own', 'task.work': 'own', 'clarification.request': 'own',
    'clarification.view': 'own', 'extension.suggest': 'own', 'escalation.view': 'own',
    'evidence.upload': 'own', 'evidence.link': 'own', 'evidence.submit': 'own', 'evidence.withdraw': 'own',
    'evidence.view': 'own', 'evidence.download': 'own', 'bank.view_current': 'own', 'dashboard.personal': 'own',
    'library.view': 'all',
  },
  DSO: {
    'framework.view': 'all', 'task.view': 'all', 'evidence.view': 'accepted', 'evidence.download': 'accepted',
    'submission.view_queue': 'all', 'submission.package': 'all', 'submission.mark_posted': 'all',
    'submission.mark_not_posted': 'all', 'bank.view_current': 'accepted', 'bank.search_history': 'accepted',
    'dashboard.programme': 'all', 'dashboard.personal': 'own', 'report.generate': 'all', 'library.view': 'all',
  },
  EXE: {
    'framework.view': 'all', 'task.view': 'all', 'escalation.view': 'all', 'evidence.view': 'accepted',
    'evidence.download': 'accepted', 'submission.view_queue': 'all', 'bank.view_current': 'accepted',
    'dashboard.programme': 'all', 'dashboard.department': 'all', 'report.generate': 'all', 'library.view': 'all',
  },
  // No access to evidence content by default (data minimization).
  ADM: {
    'framework.view': 'all', 'framework.import': 'all', 'cycle.manage': 'all', 'audit.view': 'all',
    'admin.users': 'all', 'admin.departments': 'all', 'admin.groups': 'all', 'admin.roles': 'all',
    'admin.settings': 'all', 'admin.sla_policies': 'all', 'admin.notification_templates': 'all',
    'library.view': 'all', 'library.manage': 'all',
  },
};

export interface RoleGrant {
  role: RoleCode;
  /** Required for DM and EMP, forbidden otherwise. */
  departmentId: string | null;
}

export interface EffectiveEntry {
  scope: Scope;
  departmentId: string | null;
  role: RoleCode;
}
export type EffectivePermissions = Map<Permission, EffectiveEntry[]>;

export class GrantError extends Error {
  constructor(public readonly code: 'sod_qc_dso' | 'department_required' | 'department_not_allowed' | 'duplicate', message: string) {
    super(message);
    this.name = 'GrantError';
  }
}

/** Validates a new role grant against the user's existing grants (SoD-5, D3). */
export function validateGrant(existing: readonly RoleGrant[], grant: RoleGrant): void {
  const scoped = DEPARTMENT_SCOPED_ROLES.includes(grant.role);
  if (scoped && !grant.departmentId) throw new GrantError('department_required', `${grant.role} must be granted for a department`);
  if (!scoped && grant.departmentId) throw new GrantError('department_not_allowed', `${grant.role} is organization-wide`);
  if (existing.some((g) => g.role === grant.role && g.departmentId === grant.departmentId)) {
    throw new GrantError('duplicate', 'The user already has this role');
  }
  const roles = new Set(existing.map((g) => g.role));
  if ((grant.role === 'QC' && roles.has('DSO')) || (grant.role === 'DSO' && roles.has('QC'))) {
    throw new GrantError('sod_qc_dso', 'Qiyas Consultant and DGA Submission Officer cannot be held by the same person');
  }
}

export function resolvePermissions(grants: readonly RoleGrant[], matrix: Matrix = DEFAULT_ROLE_PERMISSIONS): EffectivePermissions {
  const out: EffectivePermissions = new Map();
  for (const g of grants) {
    for (const [perm, scope] of Object.entries(matrix[g.role] ?? {}) as [Permission, Scope][]) {
      const list = out.get(perm) ?? [];
      list.push({ scope, departmentId: scope === 'dept' ? g.departmentId : null, role: g.role });
      out.set(perm, list);
    }
  }
  return out;
}

/** What a check needs to know about the record being accessed. */
export interface ResourceContext {
  departmentId?: string | null;
  /** Users who "own" it in the own-scope sense: owner, original assignee, requester, uploader. */
  ownerIds?: readonly string[];
  /** For evidence: whether the review status is accepted. */
  isAccepted?: boolean;
}

export function can(
  effective: EffectivePermissions,
  userId: string,
  permission: Permission,
  resource: ResourceContext = {},
): boolean {
  const entries = effective.get(permission);
  if (!entries) return false;
  return entries.some((e) => {
    switch (e.scope) {
      case 'all':
        return true;
      case 'dept':
        return Boolean(resource.departmentId && resource.departmentId === e.departmentId) || Boolean(resource.ownerIds?.includes(userId));
      case 'accepted':
        return resource.isAccepted === true;
      case 'own':
        return Boolean(resource.ownerIds?.includes(userId));
      default:
        return false;
    }
  });
}

/**
 * The state-machine actors a user acts as for a given record. Department
 * roles only apply inside their own department (SoD-3).
 */
export function actorsFor(grants: readonly RoleGrant[], departmentId: string | null): Actor[] {
  const actors = new Set<Actor>();
  for (const g of grants) {
    if (DEPARTMENT_SCOPED_ROLES.includes(g.role)) {
      if (departmentId && g.departmentId === departmentId) actors.add(g.role);
    } else {
      actors.add(g.role);
    }
  }
  return [...actors];
}

/** SoD-1 / D9: nobody reviews evidence they uploaded. */
export function canReview(reviewerId: string, uploaderId: string, reviewerPermissions: EffectivePermissions): boolean {
  return reviewerId !== uploaderId && can(reviewerPermissions, reviewerId, 'review.decide');
}
