import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { cardGradients } from '../utils/theme.js';
import { getTasks } from '../services/tasksService.js';
import StatCard from '../components/StatCard.jsx';
import styles from './ReviewPage.module.css';

const ReviewPage = ({ isMobile, lang }) => {
  const [tasks, setTasks] = useState([]);
  const [actionMessage, setActionMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadTasks = async () => {
      try {
        const result = await getTasks();
        if (!mounted) return;
        setTasks(Array.isArray(result) ? result : []);
      } catch {
        if (!mounted) return;
        setLoadError(lang === 'ar' ? 'فشل تحميل المهام من النظام' : 'Failed to load tasks from API');
      }
    };

    loadTasks();
    return () => {
      mounted = false;
    };
  }, [lang]);

  const pendingReviews = useMemo(
    () => tasks.filter((task) => ['submitted', 'under_review', 'resubmission_required', 'revision'].includes(task.status)),
    [tasks]
  );

  const handleReviewAction = (taskId, nextStatus) => {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)));

    const messageMap = {
      approved: lang === 'ar' ? 'تم اعتماد الشاهد بنجاح' : 'Evidence approved successfully',
      revision: lang === 'ar' ? 'تم إرسال الشاهد للمراجعة' : 'Evidence sent for review',
      reject: lang === 'ar' ? 'تم رفض الشاهد' : 'Evidence rejected',
    };
    setActionMessage(messageMap[nextStatus] || '');
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>{lang === 'ar' ? 'المراجعة والاعتماد' : 'Review & Approval'}</h2>

      {actionMessage ? <div className={styles.emptyState}>{actionMessage}</div> : null}
      {loadError ? <div className={styles.emptyState}>{loadError}</div> : null}

      <div className={`${styles.kpiGrid} ${isMobile ? styles.kpiGridMobile : styles.kpiGridDesktop}`}>
        <StatCard label={lang === 'ar' ? 'بانتظار المراجعة' : 'Pending Review'} value="18" gradient={cardGradients.accent} icon="clock" lang={lang} />
        <StatCard label={lang === 'ar' ? 'معتمد هذا الأسبوع' : 'Approved This Week'} value="12" gradient={cardGradients.green} icon="check" change={2.0} lang={lang} />
        <StatCard label={lang === 'ar' ? 'طلب مراجعة' : 'Review Request'} value="7" gradient={cardGradients.purple} icon="review" lang={lang} />
        <StatCard label={lang === 'ar' ? 'مرفوض' : 'Rejected'} value="3" gradient={cardGradients.pink} icon="x" lang={lang} />
      </div>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>{lang === 'ar' ? 'قائمة المراجعات المعلقة' : 'Pending Reviews Queue'}</h3>

        {pendingReviews.length > 0 ? (
          pendingReviews.map((task) => (
            <div key={task.id} className={styles.row}>
              <div className={styles.rowBody}>
                <div className={styles.rowTitle}>{task.title || (lang === 'ar' ? task.req_ar : task.req_en) || '-'}</div>
                <div className={styles.rowMeta}>
                  {lang === 'ar' ? 'المعيار' : 'Standard'}: {task.standard_name || task.code || '-'} | {lang === 'ar' ? 'المسؤول' : 'Responsible'}: {task.assigned_to_name || task.assignee_en || task.assignee_ar || '-'}
                </div>
              </div>

              <div className={styles.rowActions}>
                <button
                  type="button"
                  aria-label={lang === 'ar' ? `اعتماد ${task.req_ar}` : `Approve ${task.req_en}`}
                  className={`${styles.actionButton} ${styles.approve}`}
                  onClick={() => handleReviewAction(task.id, 'approved')}
                >
                  {lang === 'ar' ? 'اعتماد' : 'Approve'}
                </button>
                <button
                  type="button"
                  aria-label={lang === 'ar' ? `طلب مراجعة ${task.req_ar}` : `Request Review ${task.req_en}`}
                  className={`${styles.actionButton} ${styles.revise}`}
                  onClick={() => handleReviewAction(task.id, 'revision')}
                >
                  {lang === 'ar' ? 'مراجعة' : 'Review'}
                </button>
                <button
                  type="button"
                  aria-label={lang === 'ar' ? `رفض ${task.req_ar}` : `Reject ${task.req_en}`}
                  className={`${styles.actionButton} ${styles.reject}`}
                  onClick={() => handleReviewAction(task.id, 'reject')}
                >
                  {lang === 'ar' ? 'رفض' : 'Reject'}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>{lang === 'ar' ? 'لا توجد مراجعات معلقة' : 'No pending reviews'}</div>
        )}
      </section>
    </div>
  );
};

ReviewPage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
};

export default ReviewPage;
