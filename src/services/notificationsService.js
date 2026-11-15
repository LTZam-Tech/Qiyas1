import { httpClient } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';

/**
 * Normalizes notification data from the backend to match frontend expectations
 */
const normalizeNotification = (n) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  // Optional per-language versions; the UI falls back to `title`.
  title_en: n.title_en,
  title_ur: n.title_ur,
  body: n.body || '',
  body_en: n.body_en,
  body_ur: n.body_ur,
  data: typeof n.data === 'string' ? JSON.parse(n.data) : (n.data || {}),
  isRead: n.is_read,
  createdAt: n.created_at
});

export async function getNotifications(limit = 50) {
  try {
    const response = await httpClient.get('/notifications', { limit });
    const notifications = response?.data?.notifications || [];
    return notifications.map(normalizeNotification);
  } catch (error) {
    errorLogger.logWarning('Notifications API failed', 'backend', {
      message: error?.message,
      status: error?.status,
    });
    return [];
  }
}

export async function markNotificationAsRead(id) {
  try {
    await httpClient.post(`/notifications/${id}/mark-read`);
    return true;
  } catch (error) {
    errorLogger.logWarning('Mark notification as read failed', 'backend', { id });
    return false;
  }
}

export async function markAllNotificationsAsRead() {
  try {
    await httpClient.post('/notifications/mark-all-read');
    return true;
  } catch (error) {
    errorLogger.logWarning('Mark all notifications as read failed', 'backend');
    return false;
  }
}
