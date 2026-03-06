import { BaseRepository } from '@/db/repository';
import db from '@/db';
import { NotFoundError } from '@/utils/errors';

interface Perspective {
  id: number;
  name: string;
  code: string;
  description: string;
  weight: number;
  display_order: number;
  completion_percentage: number;
  created_at: Date;
  updated_at: Date;
}

interface CreatePerspectiveDto {
  name: string;
  code: string;
  description: string;
  weight: number;
  displayOrder: number;
}

interface UpdatePerspectiveDto {
  name?: string;
  code?: string;
  description?: string;
  weight?: number;
  displayOrder?: number;
}

class PerspectivesService extends BaseRepository<Perspective> {
  constructor() {
    super('perspectives');
  }

  async getAllPerspectives() {
    const result = await db.query(`
      SELECT 
        p.*,
        COUNT(DISTINCT a.id) as axes_count,
        COUNT(DISTINCT s.id) as standards_count
      FROM perspectives p
      LEFT JOIN axes a ON p.id = a.perspective_id
      LEFT JOIN standards s ON a.id = s.axis_id
      GROUP BY p.id
      ORDER BY p.display_order
    `);

    return result.rows;
  }

  async getPerspectiveById(perspectiveId: string) {
    const result = await db.query(`
      SELECT 
        p.*,
        COUNT(DISTINCT a.id) as axes_count,
        COUNT(DISTINCT s.id) as standards_count
      FROM perspectives p
      LEFT JOIN axes a ON p.id = a.perspective_id
      LEFT JOIN standards s ON a.id = s.axis_id
      WHERE p.id = $1
      GROUP BY p.id
    `, [perspectiveId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Perspective not found');
    }

    // Get axes for this perspective
    const axesResult = await db.query(`
      SELECT 
        a.*,
        COUNT(DISTINCT s.id) as standards_count
      FROM axes a
      LEFT JOIN standards s ON a.id = s.axis_id
      WHERE a.perspective_id = $1
      GROUP BY a.id
      ORDER BY a.display_order
    `, [perspectiveId]);

    return {
      ...result.rows[0],
      axes: axesResult.rows,
    };
  }

  async createPerspective(data: CreatePerspectiveDto, createdBy: string) {
    const result = await db.query(`
      INSERT INTO perspectives (name, code, description, weight, display_order)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [data.name, data.code, data.description, data.weight, data.displayOrder]);

    const perspective = result.rows[0];

    // Audit log
    await this.logAudit(createdBy, 'create_perspective', 'perspective', perspective.id, data);

    return perspective;
  }

  async updatePerspective(perspectiveId: string, data: UpdatePerspectiveDto, updatedBy: string) {
    await this.getPerspectiveById(perspectiveId); // Check exists

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name) {
      updates.push(`name = $${paramIndex}`);
      values.push(data.name);
      paramIndex++;
    }

    if (data.code) {
      updates.push(`code = $${paramIndex}`);
      values.push(data.code);
      paramIndex++;
    }

    if (data.description) {
      updates.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }

    if (data.weight !== undefined) {
      updates.push(`weight = $${paramIndex}`);
      values.push(data.weight);
      paramIndex++;
    }

    if (data.displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex}`);
      values.push(data.displayOrder);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.getPerspectiveById(perspectiveId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(perspectiveId);

    const result = await db.query(
      `UPDATE perspectives SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    // Audit log
    await this.logAudit(updatedBy, 'update_perspective', 'perspective', perspectiveId, data);

    return result.rows[0];
  }

  async deletePerspective(perspectiveId: string, deletedBy: string) {
    await this.getPerspectiveById(perspectiveId); // Check exists

    // Check for dependencies
    const axesResult = await db.query('SELECT COUNT(*) as count FROM axes WHERE perspective_id = $1', [perspectiveId]);
    if (parseInt(axesResult.rows[0].count) > 0) {
      throw new Error('Cannot delete perspective with existing axes');
    }

    await db.query('DELETE FROM perspectives WHERE id = $1', [perspectiveId]);

    // Audit log
    await this.logAudit(deletedBy, 'delete_perspective', 'perspective', perspectiveId, {});

    return true;
  }
}

export default new PerspectivesService();
