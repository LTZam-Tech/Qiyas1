import db from '@/db';
import logger from '@/utils/logger';

export enum NotificationType {
  TASK_ASSIGNED = 'task_assigned',
  TASK_CREATED = 'task_created',
  EVIDENCE_UPLOADED = 'evidence_uploaded',
  EVIDENCE_SUBMITTED = 'evidence_submitted',
  EVIDENCE_REVIEWED = 'evidence_reviewed',
  SYSTEM_ALERT = 'system_alert'
}

export interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: any;
  channel?: 'in_app' | 'email' | 'both';
}

class NotificationService {
  /**
   * Create a single notification for a specific user
   */
  async createNotification(params: CreateNotificationParams) {
    try {
      const result = await db.query(`
        INSERT INTO notifications (user_id, type, title, body, data, channel, is_read, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW())
        RETURNING *
      `, [
        params.userId,
        params.type,
        params.title,
        params.body || null,
        params.data ? JSON.stringify(params.data) : null,
        params.channel || 'in_app'
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create notification', { error, params });
      throw error;
    }
  }

  /**
   * Create a notification for multiple users (e.g. all admins or all consultants)
   */
  async notifyRoles(roles: string[], params: Omit<CreateNotificationParams, 'userId'>) {
    try {
      const usersResult = await db.query(`
        SELECT u.id
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE r.name = ANY($1) AND u.is_active = TRUE AND u.deleted_at IS NULL
      `, [roles]);

      const userIds = usersResult.rows.map(row => row.id);
      
      if (userIds.length === 0) {
        logger.warn('No active users found for roles to notify', { roles });
        return [];
      }

      const notifications = await Promise.all(
        userIds.map(userId => this.createNotification({ ...params, userId }))
      );

      return notifications;
    } catch (error) {
      logger.error('Failed to notify roles', { error, roles, params });
      throw error;
    }
  }

  /**
   * Fetch unread notifications for a user
   */
  async getUserNotifications(userId: string, limit: number = 20) {
    const result = await db.query(`
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    await db.query(`
      UPDATE notifications
      SET is_read = TRUE, read_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, [notificationId, userId]);
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    await db.query(`
      UPDATE notifications
      SET is_read = TRUE, read_at = NOW()
      WHERE user_id = $1 AND is_read = FALSE
    `, [userId]);
  }
}

export default new NotificationService();
