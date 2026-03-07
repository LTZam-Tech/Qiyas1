import db from '@/db';
import logger from '@/utils/logger';

interface DashboardOverview {
  globalCompletion: number;
  perspectivesCount: number;
  axesCount: number;
  standardsCount: number;
  tasksTotal: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksOverdue: number;
}

interface PerspectiveWithCompletion {
  id: number;
  name: string;
  code: string;
  completion_percentage: number;
  weight: number;
  axes_count: number;
}

interface TaskSummary {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
  by_priority: {
    urgent: number;
    high: number;
    normal: number;
    low: number;
  };
}

class DashboardService {
  // Get global dashboard overview
  async getOverview(userId: string, role: string): Promise<DashboardOverview> {
    try {
      // Get global completion using the recalc function
      const globalResult = await db.query(`
        SELECT recalc_global_completion() as completion_pct
      `);
      
      const globalCompletion = globalResult.rows[0]?.completion_pct || 0;

      // Get hierarchy counts (only active, non-deleted)
      const countsResult = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM perspectives WHERE deleted_at IS NULL) as perspectives_count,
          (SELECT COUNT(*) FROM axes WHERE deleted_at IS NULL) as axes_count,
          (SELECT COUNT(*) FROM standards WHERE deleted_at IS NULL) as standards_count
      `);
      
      const counts = countsResult.rows[0];

      // Get task statistics (use valid task statuses from CHECK constraint)
      const tasksResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'approved' OR status = 'closed') as completed,
          COUNT(*) FILTER (WHERE status IN ('assigned', 'in_progress', 'submitted', 'under_review')) as pending,
          COUNT(*) FILTER (WHERE status NOT IN ('approved', 'closed', 'cancelled') AND due_date < NOW()) as overdue
        FROM tasks
        WHERE ($1 = 'admin' OR $1 = 'dean') OR assigned_to = $2
      `, [role, userId]);
      
      const tasks = tasksResult.rows[0];

      return {
        globalCompletion: parseFloat(globalCompletion),
        perspectivesCount: parseInt(counts.perspectives_count),
        axesCount: parseInt(counts.axes_count),
        standardsCount: parseInt(counts.standards_count),
        tasksTotal: parseInt(tasks.total),
        tasksCompleted: parseInt(tasks.completed),
        tasksPending: parseInt(tasks.pending),
        tasksOverdue: parseInt(tasks.overdue),
      };
    } catch (error) {
      logger.error('Dashboard overview error', error);
      throw error;
    }
  }

  // Get perspectives with completion percentages
  async getPerspectives(_userId: string, _role: string): Promise<PerspectiveWithCompletion[]> {
    try {
      const result = await db.query(`
        SELECT 
          p.id,
          p.name_ar as name,
          p.code,
          p.weight,
          p.completion_pct,
          COUNT(DISTINCT a.id) as axes_count
        FROM perspectives p
        LEFT JOIN axes a ON p.id = a.perspective_id
        GROUP BY p.id, p.name_ar, p.code, p.weight, p.completion_pct
        ORDER BY p.sort_order
      `);

      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        completion_percentage: parseFloat(row.completion_pct) || 0,
        weight: parseFloat(row.weight),
        axes_count: parseInt(row.axes_count),
      }));
    } catch (error) {
      logger.error('Dashboard perspectives error', error);
      throw error;
    }
  }

  // Get task summary
  async getTasks(userId: string, role: string): Promise<TaskSummary> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status IN ('assigned', 'draft')) as pending,
          COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
          COUNT(*) FILTER (WHERE status IN ('approved', 'closed')) as completed,
          COUNT(*) FILTER (WHERE status NOT IN ('approved', 'closed', 'cancelled') AND due_date < NOW()) as overdue,
          COUNT(*) FILTER (WHERE priority = 'critical') as urgent,
          COUNT(*) FILTER (WHERE priority = 'high') as high,
          COUNT(*) FILTER (WHERE priority = 'medium') as normal,
          COUNT(*) FILTER (WHERE priority = 'low') as low
        FROM tasks
        WHERE ($1 = 'admin' OR $1 = 'dean') OR assigned_to = $2
      `, [role, userId]);
      
      const data = result.rows[0];

      return {
        total: parseInt(data.total),
        pending: parseInt(data.pending),
        in_progress: parseInt(data.in_progress),
        completed: parseInt(data.completed),
        overdue: parseInt(data.overdue),
        by_priority: {
          urgent: parseInt(data.urgent),
          high: parseInt(data.high),
          normal: parseInt(data.normal),
          low: parseInt(data.low),
        },
      };
    } catch (error) {
      logger.error('Dashboard tasks error', error);
      throw error;
    }
  }

  // Get recent activity (submissions, reviews, escalations)
  async getRecentActivity(userId: string, role: string, limit: number = 10): Promise<any[]> {
    try {
      // Combine recent submissions, reviews, and escalations
      const result = await db.query(`
        (
          SELECT 
            'submission' as type,
            es.id,
            es.created_at as timestamp,
            t.title as task_title,
            u.name as user_name,
            es.status
          FROM evidence_submissions es
          JOIN tasks t ON es.task_id = t.id
          JOIN users u ON es.submitted_by = u.id
          WHERE ($1 = 'admin' OR $1 = 'dean') OR t.assigned_to = $2
          ORDER BY es.created_at DESC
          LIMIT $3
        )
        UNION ALL
        (
          SELECT 
            'review' as type,
            rd.id,
            rd.created_at as timestamp,
            t.title as task_title,
            u.name as user_name,
            rd.decision as status
          FROM review_decisions rd
          JOIN evidence_submissions es ON rd.submission_id = es.id
          JOIN tasks t ON es.task_id = t.id
          JOIN users u ON rd.reviewer_id = u.id
          WHERE ($1 = 'admin' OR $1 = 'dean') OR t.assigned_to = $2
          ORDER BY rd.created_at DESC
          LIMIT $3
        )
        UNION ALL
        (
          SELECT 
            'escalation' as type,
            ee.id,
            ee.triggered_at as timestamp,
            t.title as task_title,
            u.name as user_name,
            CASE WHEN ee.resolved_at IS NOT NULL THEN 'resolved' ELSE 'pending' END as status
          FROM escalation_events ee
          JOIN tasks t ON ee.task_id = t.id
          JOIN users u ON t.assigned_to = u.id
          WHERE ($1 = 'admin' OR $1 = 'dean') OR t.assigned_to = $2
          ORDER BY ee.triggered_at DESC
          LIMIT $3
        )
        ORDER BY timestamp DESC
        LIMIT $3
      `, [role, userId, limit]);

      return result.rows;
    } catch (error) {
      logger.error('Dashboard recent activity error', error);
      throw error;
    }
  }

  // Refresh dashboard snapshot (materialized view)
  async refreshSnapshot(): Promise<void> {
    try {
      await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_snapshot_mv');
      logger.info('Dashboard snapshot refreshed');
    } catch (error) {
      logger.error('Dashboard snapshot refresh error', error);
      throw error;
    }
  }
}

export default new DashboardService();
