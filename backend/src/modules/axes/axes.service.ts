import { BaseRepository } from '@/db/repository';
import db from '@/db';
import { NotFoundError } from '@/utils/errors';

interface Axis {
  id: number;
  perspective_id: number;
  name: string;
  code: string;
  description: string;
  weight: number;
  display_order: number;
  completion_percentage: number;
}

class AxesService extends BaseRepository<Axis> {
  constructor() {
    super('axes');
  }

  async getAllAxes(perspectiveId?: string) {
    let query = `
      SELECT 
        a.*,
        p.name as perspective_name,
        COUNT(DISTINCT s.id) as standards_count
      FROM axes a
      LEFT JOIN perspectives p ON a.perspective_id = p.id
      LEFT JOIN standards s ON a.id = s.axis_id
    `;
    const params: any[] = [];

    if (perspectiveId) {
      query += ' WHERE a.perspective_id = $1';
      params.push(perspectiveId);
    }

    query += ' GROUP BY a.id, p.name ORDER BY a.perspective_id, a.display_order';

    const result = await db.query(query, params);
    return result.rows;
  }

  async getAxisById(axisId: string) {
    const result = await db.query(`
      SELECT 
        a.*,
        p.name as perspective_name,
        COUNT(DISTINCT s.id) as standards_count
      FROM axes a
      LEFT JOIN perspectives p ON a.perspective_id = p.id
      LEFT JOIN standards s ON a.id = s.axis_id
      WHERE a.id = $1
      GROUP BY a.id, p.name
    `, [axisId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Axis not found');
    }

    // Get standards
    const standardsResult = await db.query(
      'SELECT * FROM standards WHERE axis_id = $1 ORDER BY display_order',
      [axisId]
    );

    return {
      ...result.rows[0],
      standards: standardsResult.rows,
    };
  }

  async createAxis(data: any, createdBy: string) {
    const result = await db.query(`
      INSERT INTO axes (perspective_id, name, code, description, weight, display_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [data.perspectiveId, data.name, data.code, data.description, data.weight, data.displayOrder]);

    const axis = result.rows[0];
    await this.logAudit(createdBy, 'create_axis', 'axis', axis.id, data);

    return axis;
  }

  async updateAxis(axisId: string, data: any, updatedBy: string) {
    await this.getAxisById(axisId);

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name) { updates.push(`name = $${idx}`); values.push(data.name); idx++; }
    if (data.code) { updates.push(`code = $${idx}`); values.push(data.code); idx++; }
    if (data.description) { updates.push(`description = $${idx}`); values.push(data.description); idx++; }
    if (data.weight !== undefined) { updates.push(`weight = $${idx}`); values.push(data.weight); idx++; }
    if (data.displayOrder !== undefined) { updates.push(`display_order = $${idx}`); values.push(data.displayOrder); idx++; }

    if (updates.length === 0) return this.getAxisById(axisId);

    updates.push(`updated_at = NOW()`);
    values.push(axisId);

    const result = await db.query(`UPDATE axes SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    await this.logAudit(updatedBy, 'update_axis', 'axis', axisId, data);

    return result.rows[0];
  }

  async deleteAxis(axisId: string, deletedBy: string) {
    await this.getAxisById(axisId);

    const standardsResult = await db.query('SELECT COUNT(*) as count FROM standards WHERE axis_id = $1', [axisId]);
    if (parseInt(standardsResult.rows[0].count) > 0) {
      throw new Error('Cannot delete axis with existing standards');
    }

    await db.query('DELETE FROM axes WHERE id = $1', [axisId]);
    await this.logAudit(deletedBy, 'delete_axis', 'axis', axisId, {});

    return true;
  }
}

export default new AxesService();
