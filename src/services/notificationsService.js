import { request } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';

const normalizeNotification = (notification, index) => ({
  id: notification?.id || `notif-${index + 1}`,
  message_ar: notification?.message_ar || notification?.messageAr || notification?.message || '',
  message_en: notification?.message_en || notification?.messageEn || notification?.message || '',
});

export async function getNotifications() {
  try {
    const response = await request('/notifications', { method: 'GET', timeoutMs: 5000 });
    const data = response?.data || response || {};
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    return notifications.map(normalizeNotification);
  } catch (error) {
    errorLogger.logWarning('Notifications API failed', 'backend', {
      message: error?.message,
      status: error?.status,
    });
    throw error;
  }
}
