import { reportQueue, ReportJob } from '@/queue';
import db from '@/db';
import storageService from '@/services/storage.service';
import logger from '@/utils/logger';
import { writeFile } from 'fs/promises';
import { join } from 'path';

// Process report queue
reportQueue.process(async (job) => {
  const { type, userId } = job.data as ReportJob;

  try {
    logger.info(`Processing report job ${job.id}: ${type}`);

    let reportData: any;
    let fileName: string;

    switch (type) {
      case 'completion':
        reportData = await generateCompletionReport();
        fileName = `completion-report-${Date.now()}.json`;
        break;

      case 'detailed':
        reportData = await generateDetailedReport();
        fileName = `detailed-report-${Date.now()}.json`;
        break;

      case 'dashboard_snapshot':
        reportData = await generateDashboardSnapshot();
        fileName = `dashboard-snapshot-${Date.now()}.json`;
        break;

      default:
        throw new Error(`Unknown report type: ${type}`);
    }

    // Save to temp file
    const tempPath = join('uploads', fileName);
    await writeFile(tempPath, JSON.stringify(reportData, null, 2));

    // Upload to MinIO
    const objectName = await storageService.uploadFile(tempPath, fileName, 'reports');

    // Save report job record
    await db.query(`
      INSERT INTO report_jobs (user_id, report_type, status, output_path)
      VALUES ($1, $2, 'completed', $3)
    `, [userId, type, objectName]);

    logger.info(`Report generated successfully: ${job.id}`);
    return { success: true, objectName };
  } catch (error) {
    logger.error(`Report job ${job.id} failed`, error);

    await db.query(`
      INSERT INTO report_jobs (user_id, report_type, status, error_message)
      VALUES ($1, $2, 'failed', $3)
    `, [userId, type, (error as Error).message]);

    throw error;
  }
});

async function generateCompletionReport() {
  const result = await db.query(`
    SELECT 
      p.id as perspective_id,
      p.name as perspective_name,
      p.completion_percentage as perspective_completion,
      json_agg(
        json_build_object(
          'axis_id', a.id,
          'axis_name', a.name,
          'axis_completion', a.completion_percentage,
          'standards_count', (SELECT COUNT(*) FROM standards WHERE axis_id = a.id)
        )
      ) as axes
    FROM perspectives p
    LEFT JOIN axes a ON p.id = a.perspective_id
    GROUP BY p.id, p.name, p.completion_percentage
    ORDER BY p.display_order
  `);

  const globalResult = await db.query('SELECT completion_percentage FROM global_completion_mv LIMIT 1');

  return {
    generated_at: new Date().toISOString(),
    global_completion: globalResult.rows[0]?.completion_percentage || 0,
    perspectives: result.rows,
  };
}

async function generateDetailedReport() {
  const result = await db.query(`
    SELECT 
      p.name as perspective,
      a.name as axis,
      s.name as standard,
      er.title as evidence_requirement,
      t.title as task_title,
      t.status as task_status,
      t.due_date,
      u.full_name as assigned_to,
      es.status as submission_status,
      es.submitted_at,
      rd.decision as review_decision,
      rd.reviewed_at
    FROM perspectives p
    JOIN axes a ON p.id = a.perspective_id
    JOIN standards s ON a.id = s.axis_id
    JOIN evidence_requirements er ON s.id = er.standard_id
    LEFT JOIN tasks t ON er.id = t.evidence_requirement_id
    LEFT JOIN users u ON t.assigned_to = u.id
    LEFT JOIN evidence_submissions es ON t.id = es.task_id
    LEFT JOIN review_decisions rd ON es.id = rd.submission_id
    ORDER BY p.display_order, a.display_order, s.display_order, er.display_order
  `);

  return {
    generated_at: new Date().toISOString(),
    records: result.rows,
    total_records: result.rows.length,
  };
}

async function generateDashboardSnapshot() {
  const [global, perspectives, tasks] = await Promise.all([
    db.query('SELECT * FROM global_completion_mv LIMIT 1'),
    db.query(`
      SELECT 
        p.*,
        COUNT(DISTINCT a.id) as axes_count,
        COUNT(DISTINCT s.id) as standards_count
      FROM perspectives p
      LEFT JOIN axes a ON p.id = a.perspective_id
      LEFT JOIN standards s ON a.id = s.axis_id
      GROUP BY p.id
      ORDER BY p.display_order
    `),
    db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status != 'completed' AND due_date < NOW()) as overdue
      FROM tasks
    `),
  ]);

  // Save snapshot
  const snapshotData = {
    global_completion: global.rows[0]?.completion_percentage || 0,
    perspectives: perspectives.rows,
    tasks_summary: tasks.rows[0],
  };

  await db.query(`
    INSERT INTO dashboard_snapshots (snapshot_date, data)
    VALUES (NOW(), $1)
  `, [JSON.stringify(snapshotData)]);

  return {
    generated_at: new Date().toISOString(),
    snapshot: snapshotData,
  };
}

logger.info('Report generation worker started');

export default reportQueue;
