import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Icons } from '../../utils/icons.jsx';
import { api } from '../../services/qiyasApi.js';
import styles from './Notifications.module.css';
import { makeT } from '../../i18n/index.js';

// Icon and colour by event family (event codes from the Phase 1 notification catalogue).
const styleFor = (code = '') => {
  if (/overdue|escalat|quarantin|rejected|declined|changed/.test(code)) return { icon: 'alert', tone: 'danger' };
  if (/reminder|requested|asked/.test(code)) return { icon: 'clock', tone: 'warning' };
  if (/accepted|approved|completed|answered|ready/.test(code)) return { icon: 'checkCircle', tone: 'success' };
  return { icon: 'tasks', tone: 'brand' };
};

const relativeTime = (dateString, lang) => {
  const then = new Date(dateString).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
};

export default function NotificationBell({ lang = 'ar', onNavigate }) {
  const t = makeT(lang);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const dropdownRef = useRef(null);
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const fetchNotifications = useCallback(async () => {
    try {
      setNotifications(await api.get('/notifications'));
    } catch {
      // keep the last list; the bell retries on the next poll
    }
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

  const markRead = async (ids) => {
    await api.post('/notifications/read', { ids }).catch(() => undefined);
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)));
  };

  const open = (note) => {
    if (!note.read_at) markRead([note.id]);
    const taskId = note.entity_type === 'task' ? note.entity_id : note.payload?.taskId;
    if (taskId && onNavigate) {
      setIsOpen(false);
      onNavigate('task', taskId);
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
        aria-label={unreadCount > 0 ? t(`التنبيهات (${unreadCount} غير مقروءة)`, `Notifications (${unreadCount} unread)`, `اطلاعات (${unreadCount} بغیر پڑھی)`) : t('التنبيهات', 'Notifications')}
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
                {unreadCount > 0 ? t(`${unreadCount} غير مقروءة`, `${unreadCount} unread`, `${unreadCount} بغیر پڑھی`) : t('لا جديد', 'All caught up')}
              </span>
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={() => markRead('all')} className={styles.markAllBtn}>
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
                const ts = styleFor(note.event_code);
                const text = note.text?.[lang] ?? { title: note.title };
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      className={`${styles.item} ${!note.read_at ? styles.unread : ''}`}
                      onClick={() => open(note)}
                    >
                      <span className={`q-icon-chip q-tone-${ts.tone} ${styles.itemIcon}`}>{Icons[ts.icon]}</span>
                      <span className={styles.itemText}>
                        <span className={styles.itemTitle}>{text.title}</span>
                        {text.reason ? <span className={styles.itemBody}>{text.reason}</span> : null}
                        <span className={styles.itemTime}>{relativeTime(note.created_at, lang)}</span>
                      </span>
                      {!note.read_at && <span className={styles.unreadDot} aria-label={t('غير مقروء', 'Unread')} />}
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
  lang: PropTypes.oneOf(['ar', 'en', 'ur']),
  onNavigate: PropTypes.func,
};
