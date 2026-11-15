import { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Badge from '../components/Badge.jsx';
import TaskModal from '../components/TaskModal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StateView from '../components/StateView.jsx';
import useTasksData from '../hooks/useTasksData.js';
import useAuth from '../context/useAuth.js';
import errorLogger from '../services/errorLogger.js';
import { Icons } from '../utils/icons.jsx';
import { getInitials } from '../utils/user.js';
import styles from './TasksPage.module.css';
import { localeOf, makePick, makeT, pickName } from '../i18n/index.js';

const FILTERS = [
  ['all', 'الكل', 'All'],
  ['active', 'نشطة', 'Active'],
  ['submitted', 'مُقدَّمة', 'Submitted'],
  ['revision', 'تحتاج تعديل', 'Needs changes'],
  ['approved', 'معتمدة', 'Approved'],
];

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, normal: 2, low: 3 };
const TASK_CREATE_ROLES = new Set(['admin', 'dean', 'consultant']);

const collectRoleCandidates = (user) => {
  if (!user) return [];
  const direct = [user.role, user.roleName, user.role_name, user.userRole, user.user_role];
  const fromRolesArray = Array.isArray(user.roles)
    ? user.roles.flatMap((r) => [r, r?.name, r?.role, r?.label])
    : [];
  const values = [...direct, ...fromRolesArray]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(values));
};

const toDate = (task) => {
  const raw = task.due_date || task.due;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

const dueInfo = (task, lang) => {
  const t = makeT(lang);
  const d = toDate(task);
  if (!d) return { text: '—', tone: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d - today) / 86400000);
  const label = d.toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' });
  if (task.status === 'approved') return { text: label, sub: '', tone: '' };
  if (days < 0) return { text: label, sub: t(`متأخرة ${-days} يوم`, `${-days}d overdue`, `${-days} دن تاخیر`), tone: 'danger' };
  if (days === 0) return { text: label, sub: t('اليوم', 'Due today'), tone: 'warning' };
  if (days <= 3) return { text: label, sub: t(`خلال ${days} أيام`, `In ${days}d`, `${days} دن میں`), tone: 'warning' };
  return { text: label, sub: '', tone: '' };
};

const evidenceLabel = (type, lang) => {
  const t = makeT(lang);
  if (type === 'file') return { icon: 'file', text: t('ملف', 'File') };
  if (type === 'screenshot') return { icon: 'image', text: t('لقطة شاشة', 'Screenshot') };
  return { icon: 'file', text: '—' };
};

const TasksPage = ({ isMobile, user: pageUser, lang }) => {
  const t = makeT(lang);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: tasks, isLoading, error, refetch } = useTasksData(filter);
  const { user: authUser } = useAuth();

  const effectiveUser = pageUser || authUser;
  const canCreateTask = collectRoleCandidates(effectiveUser).some((role) => TASK_CREATE_ROLES.has(role));

  const handleTaskCreated = useCallback(async () => {
    if (typeof refetch === 'function') {
      try {
        await refetch();
      } catch (refreshError) {
        errorLogger.logWarning('Failed to refresh tasks after creation', 'frontend', { message: refreshError?.message });
      }
    }
  }, [refetch]);

  const standardName = useCallback(
    (task) => makePick(lang)(task.standard_name_ar, task.standard_name_en) || task.standard_name || task.code || '—',
    [lang],
  );

  // Client-side search + sort: most urgent first (priority, then due date).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tasks || [])
      .filter((task) => {
        if (!q) return true;
        return [task.title, standardName(task), task.assigned_to_name, task.assignee_en, task.assignee_ar, task.code]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const p = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
        if (p !== 0) return p;
        return (toDate(a)?.getTime() ?? Infinity) - (toDate(b)?.getTime() ?? Infinity);
      });
  }, [tasks, query, standardName]);

  const createButton = canCreateTask ? (
    <button
      type="button"
      className="q-btn q-btn-primary"
      onClick={() => setIsModalOpen(true)}
      aria-label={t('إنشاء مهمة جديدة', 'Create New Task')}
    >
      {Icons.plus}
      {t('مهمة جديدة', 'New task')}
    </button>
  ) : null;

  const renderState = () => {
    if (isLoading) return <StateView kind="loading" message={t('جاري تحميل المهام...', 'Loading tasks...')} />;
    if (error) return <StateView kind="error" title={t('تعذر تحميل المهام', 'Could not load tasks')} message={error} />;
    if (visible.length === 0) {
      return (
        <StateView
          icon="tasks"
          title={query ? t('لا توجد نتائج', 'No matching tasks') : t('لا توجد مهام هنا', 'No tasks here')}
          message={query ? t('جرّب كلمة بحث أخرى.', 'Try a different search term.') : t('غيّر الفلتر أو أنشئ مهمة جديدة.', 'Change the filter or create a new task.')}
        />
      );
    }
    return null;
  };

  const state = renderState();

  return (
    <div className="q-page">
      <PageHeader
        title={t('المهام', 'Tasks')}
        subtitle={t('كل مهمة تطلب شاهداً لمعيار محدد من شخص مسؤول وبموعد نهائي.', 'Each task asks one person for evidence on one standard, by a due date.')}
        actions={createButton}
      />

      <section className="q-card">
        <div className={styles.toolbar}>
          <div className="q-seg" role="group" aria-label={t('فلترة حسب الحالة', 'Filter by status')}>
            {FILTERS.map(([key, ar, en]) => (
              <button
                type="button"
                key={key}
                aria-pressed={filter === key}
                aria-label={t(`فلترة المهام: ${ar}`, `Filter tasks: ${en}`, `کام فلٹر کریں: ${t(ar, en)}`)}
                onClick={() => setFilter(key)}
              >
                {t(ar, en)}
              </button>
            ))}
          </div>
          <label className={`q-search ${styles.search}`}>
            {Icons.searchIcon}
            <span className="q-sr-only">{t('بحث في المهام', 'Search tasks')}</span>
            <input
              type="search"
              className="q-input"
              placeholder={t('بحث بالمعيار أو المسؤول...', 'Search by standard or person...')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        {state || (isMobile ? (
          <ul className={styles.cards}>
            {visible.map((task) => {
              const due = dueInfo(task, lang);
              const assignee = pickName(lang, task.assignee_ar || task.assigned_to_name, task.assignee_en) || '—';
              return (
                <li key={task.id} className={styles.cardItem}>
                  <div className={styles.cardTop}>
                    <Badge status={task.status} lang={lang} />
                    <Badge status={task.priority} lang={lang} />
                  </div>
                  <div className={styles.cardTitle}>{standardName(task)}</div>
                  <div className={styles.cardMeta}>
                    <span className={styles.person}><span className="q-avatar">{getInitials(assignee)}</span>{assignee}</span>
                    <span className={due.tone ? styles[`due_${due.tone}`] : ''}>{due.sub || due.text}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="q-table-wrap">
            <table className="q-table">
              <thead>
                <tr>
                  <th>{t('المعيار', 'Standard')}</th>
                  <th>{t('المسؤول', 'Assignee')}</th>
                  <th>{t('الموعد النهائي', 'Due date')}</th>
                  <th>{t('نوع الشاهد', 'Evidence')}</th>
                  <th>{t('الحالة', 'Status')}</th>
                  <th>{t('الأولوية', 'Priority')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((task) => {
                  const due = dueInfo(task, lang);
                  const ev = evidenceLabel(task.evidence_type, lang);
                  const assignee = pickName(lang, task.assignee_ar || task.assigned_to_name, task.assignee_en) || '—';
                  return (
                    <tr key={task.id}>
                      <td>
                        <div className={styles.stdCell}>
                          <span className={styles.stdName}>{standardName(task)}</span>
                          {task.code ? <span className={styles.stdCode}>{task.code}</span> : null}
                        </div>
                      </td>
                      <td>
                        <span className={styles.person}>
                          <span className="q-avatar">{getInitials(assignee)}</span>
                          {assignee}
                        </span>
                      </td>
                      <td>
                        <div className={styles.due}>
                          <span>{due.text}</span>
                          {due.sub ? <span className={styles[`due_${due.tone}`]}>{due.sub}</span> : null}
                        </div>
                      </td>
                      <td className="q-cell-muted">
                        <span className={styles.ev}>{Icons[ev.icon]}{ev.text}</span>
                      </td>
                      <td><Badge status={task.status} lang={lang} /></td>
                      <td><Badge status={task.priority} lang={lang} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {!state && (
          <div className={styles.footer}>
            {t(`عرض ${visible.length} مهمة`, `Showing ${visible.length} task${visible.length === 1 ? '' : 's'}`, `${visible.length} کام دکھائے جا رہے ہیں`)}
          </div>
        )}
      </section>

      <TaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleTaskCreated}
        lang={lang}
      />
    </div>
  );
};

TasksPage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
  user: PropTypes.shape({
    role: PropTypes.string,
  }),
  lang: PropTypes.oneOf(['ar', 'en', 'ur']).isRequired,
};

export default TasksPage;
