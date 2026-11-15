import {
  DEFAULT_ROLE_PERMISSIONS,
  GrantError,
  PERMISSIONS,
  ROLE_CODES,
  actorsFor,
  can,
  canReview,
  resolvePermissions,
  validateGrant,
} from '../permissions';

const grantCode = (fn: () => void) => {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return e instanceof GrantError ? e.code : 'other';
  }
};

describe('default role matrix', () => {
  it('only uses known permissions', () => {
    for (const role of ROLE_CODES) {
      for (const perm of Object.keys(DEFAULT_ROLE_PERMISSIONS[role])) {
        expect(PERMISSIONS).toContain(perm);
      }
    }
  });

  it('the administrator cannot see evidence content by default', () => {
    const eff = resolvePermissions([{ role: 'ADM', departmentId: null }]);
    expect(can(eff, 'u', 'evidence.view', { isAccepted: true })).toBe(false);
    expect(can(eff, 'u', 'admin.users')).toBe(true);
  });

  it('executives are read-only', () => {
    const writes = Object.keys(DEFAULT_ROLE_PERMISSIONS.EXE).filter((p) => !/view|dashboard|report|download/.test(p));
    expect(writes).toEqual([]);
  });
});

describe('separation of duties when granting roles', () => {
  it('D3: Consultant and Submission Officer never go to the same person', () => {
    expect(grantCode(() => validateGrant([{ role: 'QC', departmentId: null }], { role: 'DSO', departmentId: null }))).toBe('sod_qc_dso');
    expect(grantCode(() => validateGrant([{ role: 'DSO', departmentId: null }], { role: 'QC', departmentId: null }))).toBe('sod_qc_dso');
  });

  it('manager and employee roles need a department; the others must not have one', () => {
    expect(grantCode(() => validateGrant([], { role: 'DM', departmentId: null }))).toBe('department_required');
    expect(grantCode(() => validateGrant([], { role: 'QC', departmentId: 'd1' }))).toBe('department_not_allowed');
    expect(grantCode(() => validateGrant([], { role: 'EMP', departmentId: 'd1' }))).toBe('ok');
  });

  it('a person can be a manager in one department and an employee in another', () => {
    expect(grantCode(() => validateGrant([{ role: 'DM', departmentId: 'd1' }], { role: 'EMP', departmentId: 'd2' }))).toBe('ok');
    expect(grantCode(() => validateGrant([{ role: 'DM', departmentId: 'd1' }], { role: 'DM', departmentId: 'd1' }))).toBe('duplicate');
  });
});

describe('scoped permission checks', () => {
  const dm = resolvePermissions([{ role: 'DM', departmentId: 'it' }, { role: 'EMP', departmentId: 'hr' }]);

  it('a manager sees tasks of his department only', () => {
    expect(can(dm, 'm', 'task.view', { departmentId: 'it' })).toBe(true);
    expect(can(dm, 'm', 'task.view', { departmentId: 'finance' })).toBe(false);
    // but his own work in another department is visible through the employee grant
    expect(can(dm, 'm', 'task.view', { departmentId: 'hr', ownerIds: ['m'] })).toBe(true);
    expect(can(dm, 'm', 'task.view', { departmentId: 'hr', ownerIds: ['x'] })).toBe(false);
  });

  it('D4: a manager answers clarifications in his department only', () => {
    expect(can(dm, 'm', 'clarification.answer', { departmentId: 'it' })).toBe(true);
    expect(can(dm, 'm', 'clarification.answer', { departmentId: 'hr' })).toBe(false);
  });

  it('employees see only their own tasks', () => {
    const emp = resolvePermissions([{ role: 'EMP', departmentId: 'it' }]);
    expect(can(emp, 'e', 'task.view', { departmentId: 'it', ownerIds: ['e'] })).toBe(true);
    expect(can(emp, 'e', 'task.view', { departmentId: 'it', ownerIds: ['other'] })).toBe(false);
    expect(can(emp, 'e', 'extension.suggest', { ownerIds: ['e'] })).toBe(true);
    expect(can(emp, 'e', 'extension.request', { ownerIds: ['e'] })).toBe(false);
  });

  it('the submission officer sees accepted evidence only', () => {
    const dso = resolvePermissions([{ role: 'DSO', departmentId: null }]);
    expect(can(dso, 's', 'evidence.view', { isAccepted: true })).toBe(true);
    expect(can(dso, 's', 'evidence.view', { isAccepted: false })).toBe(false);
    expect(can(dso, 's', 'submission.mark_posted')).toBe(true);
    expect(can(dso, 's', 'review.decide')).toBe(false);
  });

  it('unknown permissions are denied', () => {
    expect(can(resolvePermissions([]), 'x', 'task.view', { departmentId: 'it' })).toBe(false);
  });
});

describe('actors used by the workflows', () => {
  it('department roles apply only inside their department (SoD-3)', () => {
    const grants = [{ role: 'DM' as const, departmentId: 'it' }, { role: 'EMP' as const, departmentId: 'hr' }];
    expect(actorsFor(grants, 'it')).toEqual(['DM']);
    expect(actorsFor(grants, 'hr')).toEqual(['EMP']);
    expect(actorsFor(grants, 'finance')).toEqual([]);
    expect(actorsFor([{ role: 'QC', departmentId: null }], 'finance')).toEqual(['QC']);
  });
});

describe('review independence (SoD-1, D9)', () => {
  const qc = resolvePermissions([{ role: 'QC', departmentId: null }]);
  it('Alaa cannot review what Alaa uploaded; Ahmad can', () => {
    expect(canReview('alaa', 'alaa', qc)).toBe(false);
    expect(canReview('ahmad', 'alaa', qc)).toBe(true);
  });
});
