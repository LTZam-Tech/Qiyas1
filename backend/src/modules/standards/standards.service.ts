import { BaseRepository } from '@/db/repository';
import db from '@/db';
import { NotFoundError } from '@/utils/errors';

interface Standard {
  id: string;
  axis_id: string;
  name: string;
  code: string;
  description: string;
  weight: number;
  display_order: number;
  completion_percentage: number;
}

class StandardsService extends BaseRepository<Standard> {
  constructor() {
    super('standards');
  }

  async getAllStandards(axisId?: string) {
    let query = `
      SELECT 
        s.*,
        a.name as axis_name,
        p.name as perspective_name,
        COUNT(DISTINCT er.id) as evidence_requirements_count
      FROM standards s
      LEFT JOIN axes a ON s.axis_id = a.id
      LEFT JOIN perspectives p ON a.perspective_id = p.id
      LEFT JOIN evidence_requirements er ON s.id = er.standard_id
    `;
    const params: any[] = [];

    if (axisId) {
      query += ' WHERE s.axis_id = $1';
      params.push(axisId);
    }

    query += ' GROUP BY s.id, a.name, p.name ORDER BY s.axis_id, s.display_order';

    const result = await db.query(query, params);
    return result.rows;
  }

  async getStandardById(standardId: string) {
    const result = await db.query(`
      SELECT 
        s.*,
        a.name as axis_name,
        p.name as perspective_name,
        COUNT(DISTINCT er.id) as evidence_requirements_count
      FROM standards s
      LEFT JOIN axes a ON s.axis_id = a.id
      LEFT JOIN perspectives p ON a.perspective_id = p.id
      LEFT JOIN evidence_requirements er ON s.id = er.standard_id
      WHERE s.id = $1
      GROUP BY s.id, a.name, p.name
    `, [standardId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Standard not found');
    }

    // Get evidence requirements
    const reqsResult = await db.query(
      'SELECT * FROM evidence_requirements WHERE standard_id = $1 ORDER BY display_order',
      [standardId]
    );

    return {
      ...result.rows[0],
      evidence_requirements: reqsResult.rows,
    };
  }

  async createStandard(data: any, createdBy: string) {
    const result = await db.query(`
      INSERT INTO standards (axis_id, name, code, description, weight, display_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [data.axisId, data.name, data.code, data.description, data.weight, data.displayOrder]);

    const standard = result.rows[0];
    await this.logAudit(createdBy, 'create_standard', 'standard', standard.id, data);

    return standard;
  }

  async updateStandard(standardId: string, data: any, updatedBy: string) {
    await this.getStandardById(standardId);

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name) { updates.push(`name = $${idx}`); values.push(data.name); idx++; }
    if (data.code) { updates.push(`code = $${idx}`); values.push(data.code); idx++; }
    if (data.description) { updates.push(`description = $${idx}`); values.push(data.description); idx++; }
    if (data.weight !== undefined) { updates.push(`weight = $${idx}`); values.push(data.weight); idx++; }
    if (data.displayOrder !== undefined) { updates.push(`display_order = $${idx}`); values.push(data.displayOrder); idx++; }

    if (updates.length === 0) return this.getStandardById(standardId);

    updates.push(`updated_at = NOW()`);
    values.push(standardId);

    const result = await db.query(`UPDATE standards SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    await this.logAudit(updatedBy, 'update_standard', 'standard', standardId, data);

    return result.rows[0];
  }

  async deleteStandard(standardId: string, deletedBy: string) {
    await this.getStandardById(standardId);

    const reqsResult = await db.query('SELECT COUNT(*) as count FROM evidence_requirements WHERE standard_id = $1', [standardId]);
    if (parseInt(reqsResult.rows[0].count) > 0) {
      throw new Error('Cannot delete standard with existing evidence requirements');
    }

    await db.query('DELETE FROM standards WHERE id = $1', [standardId]);
    await this.logAudit(deletedBy, 'delete_standard', 'standard', standardId, {});

    return true;
  }
}

export default new StandardsService();
