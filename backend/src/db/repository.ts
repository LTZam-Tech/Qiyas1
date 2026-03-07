import { PoolClient } from 'pg';
import db from '@/db';
import { ValidationError } from '@/utils/errors';

export interface IRepository<T> {
  findById(id: string): Promise<T | null>;
  findAll(filters?: any): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

export abstract class BaseRepository<T> implements IRepository<T> {
  protected tableName: string;
  private static readonly IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]*$/i;

  constructor(tableName: string) {
    this.tableName = this.quoteIdentifier(tableName);
  }

  private quoteIdentifier(identifier: string): string {
    if (!BaseRepository.IDENTIFIER_REGEX.test(identifier)) {
      throw new ValidationError(`Invalid SQL identifier: ${identifier}`);
    }
    return `"${identifier}"`;
  }

  private sanitizeColumnNames(columns: string[]): string[] {
    return columns.map((column) => this.quoteIdentifier(column));
  }

  private sanitizeAuditMetadata(metadata: unknown, depth = 0): unknown {
    if (depth > 4) {
      return '[TRUNCATED]';
    }

    if (metadata == null) return null;
    if (typeof metadata === 'string') return metadata.slice(0, 2000);
    if (typeof metadata === 'number' || typeof metadata === 'boolean') return metadata;

    if (Array.isArray(metadata)) {
      return metadata.slice(0, 100).map((item) => this.sanitizeAuditMetadata(item, depth + 1));
    }

    if (typeof metadata === 'object') {
      const entries = Object.entries(metadata as Record<string, unknown>)
        .slice(0, 100)
        .filter(([key]) => BaseRepository.IDENTIFIER_REGEX.test(key));

      return Object.fromEntries(
        entries.map(([key, value]) => [key, this.sanitizeAuditMetadata(value, depth + 1)])
      );
    }

    return String(metadata).slice(0, 2000);
  }

  async findById(id: string): Promise<T | null> {
    const result = await db.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findAll(_filters: any = {}): Promise<T[]> {
    const result = await db.query(`SELECT * FROM ${this.tableName}`);
    return result.rows;
  }

  async create(data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      throw new ValidationError('Cannot create a record with empty payload');
    }

    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = this.sanitizeColumnNames(keys).join(', ');

    const result = await db.query(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      throw new ValidationError('Cannot update a record with empty payload');
    }

    const values = Object.values(data);
    const setClause = this.sanitizeColumnNames(keys)
      .map((key, i) => `${key} = $${i + 2}`)
      .join(', ');

    const result = await db.query(
      `UPDATE ${this.tableName} SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );

    return result.rows[0];
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  protected async transaction<R>(callback: (client: PoolClient) => Promise<R>): Promise<R> {
    return db.transaction(callback);
  }

  // Audit logging helper
  protected async logAudit(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata?: any
  ): Promise<void> {
    const sanitizedMetadata = this.sanitizeAuditMetadata(metadata || {});
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, entityType, entityId, JSON.stringify(sanitizedMetadata)]
    );
  }
}
