import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { getTasks } from '../services/tasksService.js';
import StatCard from '../components/StatCard.jsx';
import Badge from '../components/Badge.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StateView from '../components/StateView.jsx';
import useToast from '../hooks/useToast.js';
import { Icons } from '../utils/icons.jsx';
import { getInitials } from '../utils/user.js';
import useAuth from '../context/useAuth.js';
import styles from './ReviewPage.module.css';

const BUCKETS = {
  pending: ['submitted', 'under_review'],
  changes: ['revision', 'resubmission_required'],
  approved: ['approved'],
  rejected: ['reject', 'rejected'],
};

const formatDate = (value, lang) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short' });
};

const ReviewPage = ({ lang }) => {
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [bucket, setBucket] = useState('pending');
  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const canReview = user?.role === 'admin' || user?.role === 'consultant';

  useEffect(() => {
    let mounted = true;
    getTasks()
      .then((result) => mounted && setTasks(Array.isArray(result) ? result : []))
      .catch(() => mounted && setLoadError(t('فشل تحميل المهام من النظام', 'Failed to load tasks')))
      .finally(() => mounted && setIsLoading(false));
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(
    () => Object.fromEntries(Object.entries(BUCKETS).map(([k, statuses]) => [k, tasks.filter((x) => statuses.includes(x.status)).length])),
    [tasks],
  );
  const queue = useMemo(() => tasks.filter((x) => BUCKETS[bucket].includes(x.status)), [tasks, bucket]);

  const handleReviewAction = (task, nextStatus) => {
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status: nextStatus } : x)));
    const messages = {
      approved: t('تم اعتماد الشاهد', 'Evidence approved'),
      revision: t('تم طلب تعديل على الشاهد', 'Changes requested'),
      reject: t('تم رفض الشاهد', 'Evidence rejected'),
    };
    showToast(messages[nextStatus]);
  };

  const bucketTitle = {
    pending: t('بانتظار المراجعة', 'Awaiting review'),
    changes: t('بانتظار التعديل', 'Waiting for changes'),
    approved: t('المعتمدة', 'Approved'),
    rejected: t('المرفوضة', 'Rejected'),
  }[bucket];

  return (
    <div className="q-page">
      <PageHeader
        title={t('المراجعة والاعتماد', 'Review & approval')}
        subtitle={t('راجع الأدلة المقدمة واعتمدها أو اطلب تعديلها.', 'Check submitted evidence, then approve it or ask for changes.')}
      />

      <div className={styles.kpiGrid}>
        <StatCard label={t('بانتظار المراجعة', 'Awaiting review')} value={counts.pending} icon="inbox" tone="info" onClick={() => setBucket('pending')} active={bucket === 'pending'} />
        <StatCard label={t('مطلوب تعديل', 'Needs changes')} value={counts.changes} icon="edit" tone="warning" onClick={() => setBucket('changes')} active={bucket === 'changes'} />
        <StatCard label={t('معتمد', 'Approved')} value={counts.approved} icon="checkCircle" tone="success" onClick={() => setBucket('approved')} active={bucket === 'approved'} />
        <StatCard label={t('مرفوض', 'Rejected')} value={counts.rejected} icon="xCircle" tone="danger" onClick={() => setBucket('rejected')} active={bucket === 'rejected'} />
      </div>

      <section className="q-card">
        <div className="q-card-head">
          <div>
            <h2 className="q-section-title">{bucketTitle}</h2>
            <p className="q-section-sub">{t(`${queue.length} عنصر`, `${queue.length} item${queue.length === 1 ? '' : 's'}`)}</p>
          </div>
        </div>

        {isLoading ? (
          <StateView kind="loading" />
        ) : loadError ? (
          <StateView kind="error" title={loadError} />
        ) : queue.length === 0 ? (
          <StateView
            icon="checkCircle"
            title={bucket === 'pending' ? t('لا شيء بانتظارك', "You're all caught up") : t('لا توجد عناصر', 'Nothing here')}
            message={bucket === 'pending' ? t('لا توجد أدلة بانتظار المراجعة حالياً.', 'No evidence is waiting for review right now.') : undefined}
          />
        ) : (
          <ul className={styles.queue}>
            {queue.map((task) => {
              const assignee = task.assigned_to_name || (lang === 'ar' ? task.assignee_ar : task.assignee_en) || '—';
              const stdName = (lang === 'ar' ? task.standard_name_ar : task.standard_name_en) || task.standard_name || '';
              const code = (task.title || '').match(/\d+(\.\d+)+/)?.[0];
              return (
                <li key={task.id} className={styles.row}>
                  <span className={`q-icon-chip q-tone-brand ${styles.rowIcon}`}>{Icons.file}</span>
                  <div className={styles.rowBody}>
                    <div className={styles.rowTitle}>
                      {code ? <span className="q-code">{code}</span> : null}
                      <span>{stdName || task.title}</span>
                    </div>
                    <div className={styles.rowMeta}>
                      <span className={styles.person}>
                        <span className="q-avatar" style={{ width: 22, height: 22, fontSize: '0.62rem' }}>{getInitials(assignee)}</span>
                        {assignee}
                      </span>
                      <span className={styles.metaItem}>{Icons.calendar}{formatDate(task.due_date || task.due, lang)}</span>
                      <Badge status={task.status} lang={lang} />
                    </div>
                  </div>
                  {canReview && bucket !== 'approved' && (
                    <div className={styles.rowActions}>
                      <button type="button" className="q-btn q-btn-sm q-btn-success" onClick={() => handleReviewAction(task, 'approved')} aria-label={t(`اعتماد ${stdName}`, `Approve ${stdName}`)}>
                        {Icons.check}
                        {t('اعتماد', 'Approve')}
                      </button>
                      {bucket !== 'changes' && (
                        <button type="button" className="q-btn q-btn-sm q-btn-warning" onClick={() => handleReviewAction(task, 'revision')}>
                          {t('طلب تعديل', 'Request changes')}
                        </button>
                      )}
                      {bucket !== 'rejected' && (
                        <button type="button" className="q-btn q-btn-sm q-btn-ghost" onClick={() => handleReviewAction(task, 'reject')}>
                          {t('رفض', 'Reject')}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {toast}
    </div>
  );
};

ReviewPage.propTypes = {
  isMobile: PropTypes.bool,
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
};

export default ReviewPage;
