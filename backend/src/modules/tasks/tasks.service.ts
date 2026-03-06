import { BaseRepository } from '@/db/repository';
import db from '@/db';
import { NotFoundError } from '@/utils/errors';

interface Task {
  id: string;
  evidence_requirement_id: string;
  assigned_to: string;
  created_by: string;
  title: string;
  description: string;
  due_date: Date;
  priority: string;
  status: string;
  completion_notes: string | null;
}

class TasksService extends BaseRepository<Task> {
  constructor() {
    super('tasks');
  }

  async getAllTasks(filters?: { assignedTo?: string; status?: string; priority?: string }, userId?: string, role?: string) {
    let query = `
      SELECT 
        t.*,
        u.name as assigned_to_name,
        c.name as created_by_name,
        er.title as requirement_title,
        s.name as standard_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users c ON t.created_by = c.id
      LEFT JOIN evidence_requirements er ON t.evidence_requirement_id = er.id
      LEFT JOIN standards s ON er.standard_id = s.id
      WHERE 1=1
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
        c.name as created_by_name,
        er.title as requirement_title,
        er.description as requirement_description,
        s.name as standard_name,
        a.name as axis_name,
        p.name as perspective_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users c ON t.created_by = c.id
      LEFT JOIN evidence_requirements er ON t.evidence_requirement_id = er.id
      LEFT JOIN standards s ON er.standard_id = s.id
      LEFT JOIN axes a ON s.axis_id = a.id
      LEFT JOIN perspectives p ON a.perspective_id = p.id
      WHERE t.id = $1
    `, [taskId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Task not found');
    }

    return result.rows[0];
  }

  async createTask(data: any, createdBy: string) {
    const result = await db.query(`
      INSERT INTO tasks (evidence_requirement_id, assigned_to, created_by, title, description, due_date, priority, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `, [data.evidenceRequirementId, data.assignedTo, createdBy, data.title, data.description, data.dueDate, data.priority]);

    const task = result.rows[0];
    await this.logAudit(createdBy, 'create_task', 'task', task.id, data);

    // TODO: Queue notification email

    return task;
  }

  async updateTask(taskId: string, data: any, updatedBy: string) {
    await this.getTaskById(taskId);

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.title) { updates.push(`title = $${idx}`); values.push(data.title); idx++; }
    if (data.description) { updates.push(`description = $${idx}`); values.push(data.description); idx++; }
    if (data.dueDate) { updates.push(`due_date = $${idx}`); values.push(data.dueDate); idx++; }
    if (data.priority) { updates.push(`priority = $${idx}`); values.push(data.priority); idx++; }
    if (data.status) { updates.push(`status = $${idx}`); values.push(data.status); idx++; }
    if (data.completionNotes) { updates.push(`completion_notes = $${idx}`); values.push(data.completionNotes); idx++; }

    if (updates.length === 0) return this.getTaskById(taskId);

    updates.push(`updated_at = NOW()`);
    values.push(taskId);

    const result = await db.query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    await this.logAudit(updatedBy, 'update_task', 'task', taskId, data);

    return result.rows[0];
  }

  async deleteTask(taskId: string, deletedBy: string) {
    await this.getTaskById(taskId);

    await db.query('DELETE FROM tasks WHERE id = $1', [taskId]);
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
      LEFT JOIN standards s ON er.standard_id = s.id
      WHERE t.assigned_to = $1
      ORDER BY t.due_date ASC
    `, [userId]);

    return result.rows;
  }

  async getOverdueTasks() {
    const result = await db.query(`
      SELECT 
        t.*,
        u.full_name as assigned_to_name,
        u.email as assigned_to_email
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.status NOT IN ('completed', 'cancelled') AND t.due_date < NOW()
      ORDER BY t.due_date ASC
    `);

    return result.rows;
  }
}

export default new TasksService();
