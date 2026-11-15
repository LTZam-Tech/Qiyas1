import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Icons } from '../../utils/icons.jsx';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../services/notificationsService.js';
import styles from './Notifications.module.css';

const TYPE_STYLE = {
  task_assigned: { icon: 'tasks', tone: 'brand' },
  review_completed: { icon: 'checkCircle', tone: 'success' },
  sla_warning: { icon: 'clock', tone: 'warning' },
  escalation: { icon: 'alert', tone: 'danger' },
};

const relativeTime = (dateString, lang) => {
  const then = new Date(dateString).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
};

export default function NotificationBell({ lang = 'ar' }) {
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const dropdownRef = useRef(null);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const fetchNotifications = useCallback(async () => {
    const data = await getNotifications();
    setNotifications(data);
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const toggleDropdown = () => {
    setIsOpen((open) => {
      if (!open) fetchNotifications();
      return !open;
    });
  };

  const handleMarkRead = async (id) => {
    if (await markNotificationAsRead(id)) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    }
  };

  const handleMarkAllRead = async () => {
    if (await markAllNotificationsAsRead()) {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    }
  };

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        type="button"
        className={`q-icon-btn ${styles.bellBtn}`}
        onClick={toggleDropdown}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={unreadCount > 0 ? t(`التنبيهات (${unreadCount} غير مقروءة)`, `Notifications (${unreadCount} unread)`) : t('التنبيهات', 'Notifications')}
      >
        {Icons.bellIcon}
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="dialog" aria-label={t('التنبيهات', 'Notifications')}>
          <div className={styles.header}>
            <div>
              <h3>{t('التنبيهات', 'Notifications')}</h3>
              <span className={styles.headerSub}>
                {unreadCount > 0 ? t(`${unreadCount} غير مقروءة`, `${unreadCount} unread`) : t('لا جديد', 'All caught up')}
              </span>
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className={styles.markAllBtn}>
                {t('تحديد الكل كمقروء', 'Mark all read')}
              </button>
            )}
          </div>
          <ul className={styles.list}>
            {notifications.length === 0 ? (
              <li className={styles.empty}>
                <span className="q-state-icon">{Icons.bellIcon}</span>
                {t('لا توجد تنبيهات', 'No notifications yet')}
              </li>
            ) : (
              notifications.map((note) => {
                const ts = TYPE_STYLE[note.type] || { icon: 'bellIcon', tone: 'neutral' };
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      className={`${styles.item} ${!note.isRead ? styles.unread : ''}`}
                      onClick={() => !note.isRead && handleMarkRead(note.id)}
                    >
                      <span className={`q-icon-chip q-tone-${ts.tone} ${styles.itemIcon}`}>{Icons[ts.icon]}</span>
                      <span className={styles.itemText}>
                        <span className={styles.itemTitle}>{note.title}</span>
                        {note.body ? <span className={styles.itemBody}>{note.body}</span> : null}
                        <span className={styles.itemTime}>{relativeTime(note.createdAt, lang)}</span>
                      </span>
                      {!note.isRead && <span className={styles.unreadDot} aria-label={t('غير مقروء', 'Unread')} />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

NotificationBell.propTypes = {
  lang: PropTypes.oneOf(['ar', 'en']),
};
