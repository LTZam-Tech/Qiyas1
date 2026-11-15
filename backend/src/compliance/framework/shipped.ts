/**
 * Official DGA framework versions and crosswalks shipped with the release
 * (framework/data). A new installation gets them at first start; later
 * releases add new versions without touching existing ones (docs 09 §4:
 * framework updates are data). Imported versions are activated so cycles
 * can use them. Runs as the system (audit actor empty).
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { Db, ServiceContext, one } from '../core/context';
import { SAUDI_CALENDAR } from '../domain/calendar';
import { resolvePermissions } from '../domain/permissions';
import { importCrosswalk } from './crosswalk';
import { activateFramework, importFramework } from './frameworkService';

export const SHIPPED_DATA_DIR = path.resolve(__dirname, 'data');

function systemContext(db: Db): ServiceContext {
  const grants = [{ role: 'QC' as const, departmentId: null }, { role: 'ADM' as const, departmentId: null }];
  return { db, now: new Date(), calendar: SAUDI_CALENDAR, actor: { userId: null as unknown as string, grants, effective: resolvePermissions(grants) } };
}

interface Loaded { frameworks: string[]; crosswalks: string[] }

export async function loadShippedData(db: Db, dir = SHIPPED_DATA_DIR): Promise<Loaded> {
  const out: Loaded = { frameworks: [], crosswalks: [] };
  if (!existsSync(dir)) return out;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const ctx = systemContext(db);
  const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));

  for (const f of files.filter((x) => !x.startsWith('crosswalk-'))) {
    const data = read(f);
    if (data.format !== 'qiyas-framework/1') continue;
    const exists = await one(db, 'SELECT 1 FROM qiyas.framework_versions WHERE issuer = $1 AND document_code = $2 AND version = $3', [data.issuer, data.documentCode, data.version]);
    if (exists) continue;
    const { frameworkVersionId } = await importFramework(ctx, data);
    await activateFramework(ctx, frameworkVersionId);
    out.frameworks.push(`${data.documentCode} v${data.version}`);
  }
  for (const f of files.filter((x) => x.startsWith('crosswalk-'))) {
    const data = read(f);
    const ids = await db.query(`SELECT (SELECT id FROM qiyas.framework_versions WHERE issuer = $1 AND document_code = $2 AND version = $3) AS a,
                                        (SELECT id FROM qiyas.framework_versions WHERE issuer = $4 AND document_code = $5 AND version = $6) AS b`,
    [data.from.issuer, data.from.documentCode, data.from.version, data.to.issuer, data.to.documentCode, data.to.version]);
    const { a, b } = ids.rows[0];
    if (!a || !b) continue;
    if (await one(db, 'SELECT 1 FROM qiyas.crosswalk_sets WHERE from_framework_version_id = $1 AND to_framework_version_id = $2', [a, b])) continue;
    await importCrosswalk(ctx, data);
    out.crosswalks.push(`${data.from.version} → ${data.to.version}`);
  }
  return out;
}
