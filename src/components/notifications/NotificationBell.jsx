import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../../utils/icons.jsx';
import { C } from '../../utils/theme.js';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../services/notificationsService.js';
import styles from './Notifications.module.css';

export default function NotificationBell({ lang = 'ar' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  const fetchNotifications = async () => {
    const data = await getNotifications();
    setNotifications(data);
    setUnreadCount(data.filter(n => !n.isRead).length);
  };

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchNotifications();
    }
  };

  const handleMarkRead = async (id) => {
    const success = await markNotificationAsRead(id);
    if (success) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleMarkAllRead = async () => {
    const success = await markAllNotificationsAsRead();
    if (success) {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button 
        type="button" 
        className={styles.bellBtn} 
        onClick={toggleDropdown}
        aria-label={lang === 'ar' ? 'التنبيهات' : 'Notifications'}
      >
        <div className={styles.iconWrapper}>
          {Icons.bellIcon}
          {unreadCount > 0 && (
            <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </div>
      </button>

      {isOpen && (
        <div className={styles.dropdown} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className={styles.header}>
            <h3>{lang === 'ar' ? 'التنبيهات' : 'Notifications'}</h3>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className={styles.markAllBtn}>
                {lang === 'ar' ? 'تحديد الكل كمقروء' : 'Mark all as read'}
              </button>
            )}
          </div>
          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>
                {lang === 'ar' ? 'لا توجد تنبيهات' : 'No notifications'}
              </div>
            ) : (
              notifications.map((note) => (
                <div 
                  key={note.id} 
                  className={`${styles.item} ${!note.isRead ? styles.unread : ''}`}
                  onClick={() => !note.isRead && handleMarkRead(note.id)}
                >
                  <div className={styles.itemHeader}>
                    <span className={styles.itemTitle}>{note.title}</span>
                    <span className={styles.itemTime}>{formatTime(note.createdAt)}</span>
                  </div>
                  <p className={styles.itemBody}>{note.body}</p>
                  {!note.isRead && <span className={styles.unreadDot} />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
