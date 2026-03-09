import { BaseRepository } from '@/db/repository';
import db from '@/db';
import { BusinessLogicError, NotFoundError } from '@/utils/errors';

interface Task {
  id: string;
  evidence_requirement_id: string | null;
  perspective_id: string;
  axis_id: string;
  standard_id: string;
  evidence_type: 'file' | 'screenshot';
  assigned_to: string;
  assigned_by: string;
  target_type: 'department' | 'unit';
  target_department_id: string | null;
  target_unit_id: string | null;
  title: string;
  instructions: string | null;
  due_date: Date;
  priority: string;
  status: string;
}

type CreateTaskInput = {
  title: string;
  perspectiveId: string;
  axisId: string;
  standardId: string;
  evidenceType: 'file' | 'screenshot';
  assignedTo: string;
  targetType: 'department' | 'unit';
  targetId: string;
  dueDate: string;
  priority: 'critical' | 'high' | 'medium' | 'low' | 'normal';
  description?: string;
};

type UpdateTaskInput = {
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low' | 'normal';
  status?: string;
  completionNotes?: string;
};

class TasksService extends BaseRepository<Task> {
  private evidenceTypeSchemaChecked = false;

  constructor() {
    super('tasks');
  }

  private async ensureEvidenceTypeColumn(): Promise<void> {
    if (this.evidenceTypeSchemaChecked) {
      return;
    }

    await db.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(50) DEFAULT 'file'
    `);

    await db.query(`
      UPDATE tasks
      SET evidence_type = 'file'
      WHERE evidence_type IS NULL
    `);

    this.evidenceTypeSchemaChecked = true;
  }

  private normalizePriority(priority?: string): 'critical' | 'high' | 'medium' | 'low' {
    if (!priority || priority === 'normal') {
      return 'medium';
    }

    return priority as 'critical' | 'high' | 'medium' | 'low';
  }

  async getAllTasks(filters?: { assignedTo?: string; status?: string; priority?: string }, userId?: string, role?: string) {
    let query = `
      SELECT 
        t.*,
        u.name as assigned_to_name,
        c.name as assigned_by_name,
        s.name_ar as standard_name_ar,
        s.name_en as standard_name_en,
        a.name_ar as axis_name,
        p.name_ar as perspective_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users c ON t.assigned_by = c.id
      LEFT JOIN evidence_requirements er ON t.evidence_requirement_id = er.id
      LEFT JOIN standards s ON t.standard_id = s.id
      LEFT JOIN axes a ON s.axis_id = a.id
      LEFT JOIN perspectives p ON a.perspective_id = p.id
      WHERE t.deleted_at IS NULL
    `;
    const params: any[] = [];
    let paramIndex = 1;

    // Role-based filtering
    if (role !== 'admin' && role !== 'dean' && userId) {
      query += ` AND t.assigned_to = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (filters?.assignedTo) {
      query += ` AND t.assigned_to = $${paramIndex}`;
      params.push(filters.assignedTo);
      paramIndex++;
    }

    if (filters?.status) {
      query += ` AND t.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.priority) {
      query += ` AND t.priority = $${paramIndex}`;
      params.push(filters.priority);
      paramIndex++;
    }

    query += ' ORDER BY t.due_date ASC, t.priority DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  async getTaskById(taskId: string) {
    const result = await db.query(`
      SELECT 
        t.*,
        u.name as assigned_to_name,
        u.email as assigned_to_email,
        c.name as assigned_by_name,
        er.title as requirement_title,
        er.description_ar as requirement_description,
        s.name_ar as standard_name_ar,
        s.name_en as standard_name_en,
        a.name_ar as axis_name,
        p.name_ar as perspective_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users c ON t.assigned_by = c.id
      LEFT JOIN evidence_requirements er ON t.evidence_requirement_id = er.id
      LEFT JOIN standards s ON t.standard_id = s.id
      LEFT JOIN axes a ON s.axis_id = a.id
      LEFT JOIN perspectives p ON a.perspective_id = p.id
      WHERE t.id = $1 AND t.deleted_at IS NULL
    `, [taskId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Task not found');
    }

    return result.rows[0];
  }

  async createTask(data: CreateTaskInput, createdBy: string) {
    await this.ensureEvidenceTypeColumn();

    const mappingResult = await db.query(
      `SELECT s.id AS standard_id, a.id AS axis_id, p.id AS perspective_id
       FROM standards s
       JOIN axes a ON a.id = s.axis_id
       JOIN perspectives p ON p.id = a.perspective_id
       WHERE s.id = $1 AND a.id = $2 AND p.id = $3
       LIMIT 1`,
      [data.standardId, data.axisId, data.perspectiveId]
    );

    if (mappingResult.rows.length === 0) {
      throw new BusinessLogicError('Invalid domain-axis-standard mapping');
    }

    const mapping = mappingResult.rows[0];

    const assigneeResult = await db.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [data.assignedTo]);
    if (assigneeResult.rows.length === 0) {
      throw new BusinessLogicError('Assigned user does not exist');
    }

    // evidence_requirement_id is nullable (since migration 0006) — link it if one exists,
    // but do NOT block task creation when the standard has no requirements yet.
    const requirementResult = await db.query(
      'SELECT id FROM evidence_requirements WHERE standard_id = $1 AND deleted_at IS NULL LIMIT 1',
      [mapping.standard_id]
    );
    const evidenceRequirementId: string | null = requirementResult.rows[0]?.id ?? null;

    let targetDepartmentId: string | null = null;
    let targetUnitId: string | null = null;

    if (data.targetType === 'department') {
      const departmentResult = await db.query(
        'SELECT id FROM departments WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [data.targetId]
      );

      if (departmentResult.rows.length === 0) {
        throw new BusinessLogicError('Target department does not exist');
      }

      targetDepartmentId = departmentResult.rows[0].id;
    } else {
      const unitResult = await db.query(
        'SELECT id FROM units WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [data.targetId]
      );

      if (unitResult.rows.length === 0) {
        throw new BusinessLogicError('Target unit does not exist');
      }

      targetUnitId = unitResult.rows[0].id;
    }

    const result = await db.query(`
      INSERT INTO tasks (
        evidence_requirement_id,
        perspective_id,
        axis_id,
        standard_id,
        assigned_to,
        assigned_by,
        target_type,
        target_department_id,
        target_unit_id,
        title,
        instructions,
        due_date,
        priority,
        status,
        evidence_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'assigned', $14)
      RETURNING *
    `, [
      evidenceRequirementId,
      mapping.perspective_id,
      mapping.axis_id,
      mapping.standard_id,
      data.assignedTo,
      createdBy,
      data.targetType,
      targetDepartmentId,
      targetUnitId,
      data.title,
      data.description || null,
      data.dueDate,
      this.normalizePriority(data.priority),
      data.evidenceType
    ]);

    const task = result.rows[0];
    await this.logAudit(createdBy, 'create_task', 'task', task.id, data);

    // TODO: Queue notification email

    return task;
  }

  async updateTask(taskId: string, data: UpdateTaskInput, updatedBy: string) {
    await this.getTaskById(taskId);

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const fieldMappings: Array<[keyof UpdateTaskInput, string]> = [
      ['title', 'title'],
      ['description', 'instructions'],
      ['dueDate', 'due_date'],
      ['priority', 'priority'],
      ['status', 'status'],
      ['completionNotes', 'completion_notes'],
    ];

    for (const [inputField, dbColumn] of fieldMappings) {
      const value = data[inputField];
      if (value !== undefined && value !== null && value !== '') {
        if (inputField === 'priority') {
          updates.push(`${dbColumn} = $${idx}`);
          values.push(this.normalizePriority(value));
          idx++;
          continue;
        }

        updates.push(`${dbColumn} = $${idx}`);
        values.push(value);
        idx++;
      }
    }

    if (updates.length === 0) return this.getTaskById(taskId);

    updates.push(`updated_at = NOW()`);
    values.push(taskId);

    const result = await db.query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    await this.logAudit(updatedBy, 'update_task', 'task', taskId, data);

    return result.rows[0];
  }

  async deleteTask(taskId: string, deletedBy: string) {
    await this.getTaskById(taskId);

    await db.query('UPDATE tasks SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [taskId]);
    await this.logAudit(deletedBy, 'delete_task', 'task', taskId, {});

    return true;
  }

  async getTasksByUser(userId: string) {
    const result = await db.query(`
      SELECT 
        t.*,
        er.title as requirement_title,
        s.name as standard_name
      FROM tasks t
      LEFT JOIN evidence_requirements er ON t.evidence_requirement_id = er.id
      LEFT JOIN standards s ON t.standard_id = s.id
      WHERE t.assigned_to = $1 AND t.deleted_at IS NULL
      ORDER BY t.due_date ASC
    `, [userId]);

    return result.rows;
  }

  async getOverdueTasks() {
    const result = await db.query(`
      SELECT 
        t.*,
        u.name as assigned_to_name,
        u.email as assigned_to_email
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.status NOT IN ('approved', 'closed', 'cancelled') AND t.due_date < NOW()
      ORDER BY t.due_date ASC
    `);

    return result.rows;
  }
}

export default new TasksService();
