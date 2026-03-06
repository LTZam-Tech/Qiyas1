import { CronJob } from 'cron';
import db from '@/db';
import { emailQueue } from '@/queue';
import logger from '@/utils/logger';

// Run every 15 minutes
const slaMonitorJob = new CronJob(
  '*/15 * * * *',
  async () => {
    try {
      logger.info('SLA monitoring job started');

      // Check tasks approaching deadline (within 48 hours)
      const approachingResult = await db.query(`
        SELECT 
          t.*,
          u.email as assigned_to_email,
          u.full_name as assigned_to_name,
          sp.escalation_threshold_hours
        FROM tasks t
        JOIN users u ON t.assigned_to = u.id
        LEFT JOIN sla_policies sp ON true
        WHERE t.status NOT IN ('completed', 'cancelled')
          AND t.due_date BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.task_id = t.id 
              AND n.type = 'deadline_approaching'
              AND n.created_at > NOW() - INTERVAL '24 hours'
          )
      `);

      // Send reminder emails
      for (const task of approachingResult.rows) {
        await emailQueue.add({
          to: task.assigned_to_email,
          subject: `Task Deadline Approaching: ${task.title}`,
          template: 'task_reminder',
          data: {
            taskId: task.id,
            taskTitle: task.title,
            dueDate: task.due_date,
            assignedToName: task.assigned_to_name,
          },
        });

        // Create notification
        await db.query(`
          INSERT INTO notifications (user_id, task_id, type, title, message)
          VALUES ($1, $2, 'deadline_approaching', 'Task Deadline Approaching', $3)
        `, [task.assigned_to, task.id, `Your task "${task.title}" is due soon`]);

        logger.info(`Sent deadline reminder for task ${task.id}`);
      }

      // Check overdue tasks
      const overdueResult = await db.query(`
        SELECT 
          t.*,
          u.email as assigned_to_email,
          u.full_name as assigned_to_name,
          er.standard_id
        FROM tasks t
        JOIN users u ON t.assigned_to = u.id
        JOIN evidence_requirements er ON t.evidence_requirement_id = er.id
        WHERE t.status NOT IN ('completed', 'cancelled')
          AND t.due_date < NOW()
          AND NOT EXISTS (
            SELECT 1 FROM escalation_events ee
            WHERE ee.task_id = t.id AND ee.status = 'open'
          )
      `);

      // Create escalation events
      for (const task of overdueResult.rows) {
        await db.query(`
          INSERT INTO escalation_events (task_id, escalation_level, status, escalated_to, reason)
          VALUES ($1, 1, 'open', NULL, 'Task overdue')
        `, [task.id]);

        // Send escalation email to dean/admin
        const adminResult = await db.query(`
          SELECT u.email, u.full_name 
          FROM users u 
          JOIN roles r ON u.role_id = r.id
          WHERE r.name IN ('dean', 'admin') AND u.status = 'active'
        `);

        for (const admin of adminResult.rows) {
          await emailQueue.add({
            to: admin.email,
            subject: `Task Overdue Escalation: ${task.title}`,
            template: 'escalation',
            data: {
              taskId: task.id,
              taskTitle: task.title,
              dueDate: task.due_date,
              assignedToName: task.assigned_to_name,
              adminName: admin.full_name,
            },
          });
        }

        logger.warn(`Escalated overdue task ${task.id}`);
      }

      logger.info(`SLA monitoring completed: ${approachingResult.rows.length} reminders, ${overdueResult.rows.length} escalations`);
    } catch (error) {
      logger.error('SLA monitoring job failed', error);
    }
  },
  null,
  true,
  'Asia/Riyadh'
);

export default slaMonitorJob;
