import { DatabaseEncodingError, MigrationChecksumError, MigrationFile, Queryable, loadMigrations, migrate } from '../migrate';
import { rbacSeedStatements, seedRbac } from '../seedRbac';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_CODES } from '../../domain/permissions';

/** Records statements; answers the schema_migrations lookup from memory. */
class FakeDb implements Queryable {
  statements: string[] = [];
  applied: Array<{ name: string; checksum: string }> = [];
  failOn?: string;
  async query(text: string, params?: unknown[]) {
    this.statements.push(text.trim().split('\n')[0]);
    if (this.failOn && text.includes(this.failOn)) throw new Error('boom');
    if (text.startsWith('SELECT name, checksum')) return { rows: this.applied };
    if (text.startsWith('INSERT INTO qiyas.schema_migrations')) this.applied.push({ name: params![0] as string, checksum: params![1] as string });
    return { rows: [] };
  }
}

const m = (name: string, sql = `-- ${name}`): MigrationFile => ({ name, sql, checksum: `sum-${sql}` });

describe('migration runner', () => {
  it('finds the foundation migration in the source tree', () => {
    const files = loadMigrations();
    expect(files[0].name).toBe('001_foundation.sql');
    expect(files[0].sql).toContain('CREATE SCHEMA IF NOT EXISTS qiyas');
    expect(files[0].checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('applies pending migrations in order, each in a transaction, and skips applied ones', async () => {
    const db = new FakeDb();
    expect(await migrate(db, [m('001_a'), m('002_b')])).toEqual(['001_a', '002_b']);
    expect(db.statements.filter((s) => ['BEGIN', 'COMMIT'].includes(s))).toEqual(['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT']);
    expect(await migrate(db, [m('001_a'), m('002_b'), m('003_c')])).toEqual(['003_c']);
  });

  it('refuses to run when an applied migration was edited', async () => {
    const db = new FakeDb();
    await migrate(db, [m('001_a')]);
    await expect(migrate(db, [m('001_a', '-- edited')])).rejects.toBeInstanceOf(MigrationChecksumError);
  });

  it('refuses a database that is not UTF-8 (Arabic and Urdu would be lost)', async () => {
    const db: Queryable = {
      query: async (text: string) => ({ rows: text.startsWith('SHOW server_encoding') ? [{ server_encoding: 'WIN1252' }] : [] }),
    };
    await expect(migrate(db, [m('001_a')])).rejects.toBeInstanceOf(DatabaseEncodingError);
  });

  it('rolls back a failing migration and does not record it', async () => {
    const db = new FakeDb();
    db.failOn = 'broken';
    await expect(migrate(db, [m('001_a'), m('002_b', 'broken sql')])).rejects.toThrow('boom');
    expect(db.statements).toContain('ROLLBACK');
    expect(db.applied.map((a) => a.name)).toEqual(['001_a']);
  });
});

describe('RBAC seed', () => {
  it('seeds every role and every matrix entry', () => {
    const st = rbacSeedStatements();
    const rolePerms = st.filter((s) => s.text.includes('INSERT INTO qiyas.role_permissions'));
    const expected = ROLE_CODES.reduce((n, r) => n + Object.keys(DEFAULT_ROLE_PERMISSIONS[r]).length, 0);
    expect(rolePerms).toHaveLength(expected);
    const dm = st.find((s) => s.text.includes('INSERT INTO qiyas.roles') && s.params[0] === 'DM');
    expect(dm?.params[3]).toBe(true); // department scoped
  });

  it('runs inside one transaction', async () => {
    const db = new FakeDb();
    await seedRbac(db);
    expect(db.statements[0]).toBe('BEGIN');
    expect(db.statements[db.statements.length - 1]).toBe('COMMIT');
  });
});
