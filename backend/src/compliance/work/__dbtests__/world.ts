/**
 * A small organization for workflow tests:
 *   consultants Alaa and Ahmad · submission officer Yousef · administrator Tariq
 *   IT: manager Mona, employees Ali and Sara · HR: manager Khalid, employee Huda
 * plus the DGA v5.0 sample (standard 5.1.1) imported into an active cycle.
 */
import { Client } from 'pg';
import { ServiceContext, buildContext } from '../../core/context';
import { addBusinessDays, endOfLocalDay } from '../../domain/calendar';
import sample from '../../framework/samples/dga-v5.0-sample.json';
import { activateFramework, createCycle, importFramework, transitionCycle } from '../../framework/frameworkService';
import { createAssignment, publishAssignment } from '../tasks';
import { createUser, roleId } from '../../db/__dbtests__/testDb';

/** Sunday 15 Nov 2026, 09:00 Riyadh. */
export const T0 = new Date(Date.UTC(2026, 10, 15, 6, 0));
export const at = (y: number, m: number, d: number, h = 9) => new Date(Date.UTC(y, m - 1, d, h) - 180 * 60_000);

export interface World {
  db: Client;
  users: Record<'alaa' | 'ahmad' | 'yousef' | 'tariq' | 'mona' | 'ali' | 'sara' | 'khalid' | 'huda', string>;
  depts: { it: string; hr: string; noManager: string };
  cycleId: string;
  bankId: string;
  requirementId: string;
  frameworkVersionId: string;
  ctx: (user: keyof World['users'], now?: Date) => Promise<ServiceContext>;
  /** QC Alaa assigns 5.1.1 to a department and publishes; returns the task id. */
  publishedTask: (dept?: 'it' | 'hr', now?: Date) => Promise<string>;
}

export async function buildWorld(db: Client): Promise<World> {
  const names = ['alaa', 'ahmad', 'yousef', 'tariq', 'mona', 'ali', 'sara', 'khalid', 'huda'] as const;
  const users = {} as World['users'];
  for (const n of names) users[n] = await createUser(db, n[0].toUpperCase() + n.slice(1));

  const dept = async (code: string) =>
    (await db.query(`INSERT INTO qiyas.departments (code, name_ar, name_en) VALUES ($1, $1, $1) RETURNING id`, [code])).rows[0].id as string;
  const depts = { it: await dept('IT'), hr: await dept('HR'), noManager: await dept('LEGAL') };
  const member = (d: string, u: string, membership: string) =>
    db.query('INSERT INTO qiyas.department_members (department_id, user_id, membership) VALUES ($1, $2, $3)', [d, u, membership]);
  await member(depts.it, users.mona, 'manager');
  await member(depts.it, users.ali, 'member');
  await member(depts.it, users.sara, 'member');
  await member(depts.hr, users.khalid, 'manager');
  await member(depts.hr, users.huda, 'member');
  await member(depts.noManager, users.sara, 'member');

  const grant = async (u: string, role: string, d: string | null = null) =>
    db.query('INSERT INTO qiyas.role_grants (role_id, user_id, department_id) VALUES ($1, $2, $3)', [await roleId(db, role), u, d]);
  await grant(users.alaa, 'QC');
  await grant(users.ahmad, 'QC');
  await grant(users.yousef, 'DSO');
  await grant(users.tariq, 'ADM');
  await grant(users.mona, 'DM', depts.it);
  await grant(users.ali, 'EMP', depts.it);
  await grant(users.sara, 'EMP', depts.it);
  await grant(users.khalid, 'DM', depts.hr);
  await grant(users.huda, 'EMP', depts.hr);

  const ctx = (user: keyof World['users'], now = T0) => buildContext(db, users[user], now);
  const alaa = await ctx('alaa');
  const { frameworkVersionId } = await importFramework(alaa, sample);
  await activateFramework(alaa, frameworkVersionId);
  const { cycleId, bankId } = await createCycle(alaa, { frameworkVersionId, year: 2026, name: 'Qiyas 2026 / v5.0', startsOn: '2026-01-01', endsOn: '2026-12-31' });
  await transitionCycle(alaa, cycleId, 'open');
  const requirementId = (await db.query('SELECT id FROM qiyas.cycle_requirements WHERE cycle_id = $1', [cycleId])).rows[0].id as string;

  const publishedTask = async (d: 'it' | 'hr' = 'it', now = T0) => {
    const c = await ctx('alaa', now);
    const assignmentId = await createAssignment(c, {
      cycleId, departmentId: depts[d], cycleRequirementIds: [requirementId], title: 'Strategic plan 5.1.1',
      implementationDueAt: addBusinessDays(now, 5, c.calendar), managerDueAt: addBusinessDays(now, 2, c.calendar),
    });
    return publishAssignment(c, assignmentId);
  };

  return { db, users, depts, cycleId, bankId, requirementId, frameworkVersionId, ctx, publishedTask };
}

export { addBusinessDays, endOfLocalDay };
