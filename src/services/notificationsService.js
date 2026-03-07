import { env } from '../config/env.js';
import { request } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';

const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-1',
    message_ar: 'تم رفع شاهد جديد للمعيار 5.10.3',
    message_en: 'New evidence uploaded for standard 5.10.3',
  },
  {
    id: 'notif-2',
    message_ar: '3 مهام تقترب من الموعد النهائي',
    message_en: '3 tasks are close to deadline',
  },
  {
    id: 'notif-3',
    message_ar: 'تم اعتماد شاهد من قبل المراجع',
    message_en: 'Evidence approved by reviewer',
  },
];

const normalizeNotification = (notification, index) => ({
  id: notification?.id || `notif-${index + 1}`,
  message_ar: notification?.message_ar || notification?.messageAr || notification?.message || '',
  message_en: notification?.message_en || notification?.messageEn || notification?.message || '',
});

export async function getNotifications() {
  if (env.useMockApi) {
    return MOCK_NOTIFICATIONS;
  }

  try {
    const response = await request('/notifications', { method: 'GET', timeoutMs: 5000 });
    const data = response?.data || response || {};
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    if (notifications.length === 0) {
      return MOCK_NOTIFICATIONS;
    }

    return notifications.map(normalizeNotification);
  } catch (error) {
    errorLogger.logWarning('Notifications API failed, using fallback notifications', 'backend', {
      message: error?.message,
      status: error?.status,
    });
    return MOCK_NOTIFICATIONS;
  }
}
