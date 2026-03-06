import { PoolClient } from 'pg';
import db from '@/db';

export interface IRepository<T> {
  findById(id: string): Promise<T | null>;
  findAll(filters?: any): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

export abstract class BaseRepository<T> implements IRepository<T> {
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
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
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const result = await db.query(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');

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
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, entityType, entityId, JSON.stringify(metadata || {})]
    );
  }
}
