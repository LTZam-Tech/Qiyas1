import { useState } from 'react';
import PropTypes from 'prop-types';
import Badge from '../components/Badge.jsx';
import TaskModal from '../components/TaskModal.jsx';
import useTasksData from '../hooks/useTasksData.js';
import useAuth from '../context/useAuth.js';
import styles from './TasksPage.module.css';

const FILTERS = {
  ar: [['all', 'الكل'], ['active', 'نشط'], ['submitted', 'مُقدَّم'], ['revision', 'مراجعة'], ['approved', 'معتمد']],
  en: [['all', 'All'], ['active', 'Active'], ['submitted', 'Submitted'], ['revision', 'Review'], ['approved', 'Approved']],
};

const TABLE_HEADERS = {
  ar: ['الأولوية', 'الحالة', 'الموعد النهائي', 'المسؤول', 'الشاهد المطلوب', 'المعيار'],
  en: ['Priority', 'Status', 'Due Date', 'Responsible', 'Evidence Type', 'Standard'],
};
const TASK_CREATE_ROLES = new Set(['dean', 'consultant']);

const collectRoleCandidates = (user) => {
  if (!user) return [];

  const direct = [
    user.role,
    user.roleName,
    user.role_name,
    user.userRole,
    user.user_role,
  ];

  const fromRolesArray = Array.isArray(user.roles)
    ? user.roles.flatMap((r) => [r, r?.name, r?.role, r?.label])
    : [];

  const values = [...direct, ...fromRolesArray]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(values));
};

const TasksPage = ({ isMobile, user: pageUser, lang }) => {
  const [filter, setFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: tasks, isLoading, error, refetch } = useTasksData(filter);
  const { user: authUser } = useAuth();

  const effectiveUser = pageUser || authUser;
  const roleCandidates = collectRoleCandidates(effectiveUser);

  // Check if user has permission to create tasks (dean or consultant)
  const canCreateTask = roleCandidates.some((role) => TASK_CREATE_ROLES.has(role));

  const handleTaskCreated = () => {
    // Refresh the tasks list after creating a new task
    refetch?.();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.filters}>
            {FILTERS[lang].map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-label={lang === 'ar' ? `فلترة المهام: ${label}` : `Filter tasks: ${label}`}
                className={`${styles.filterButton} ${filter === key ? styles.filterButtonActive : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {canCreateTask && (
            <button
              type="button"
              className={styles.createButton}
              onClick={() => setIsModalOpen(true)}
              title={lang === 'ar' ? 'إنشاء مهمة جديدة' : 'Create New Task'}
              aria-label={lang === 'ar' ? 'إنشاء مهمة جديدة' : 'Create New Task'}
            >
              {lang === 'ar' ? '+ مهمة جديدة' : '+ New Task'}
            </button>
          )}
        </div>
        <h2 className={styles.heading}>{lang === 'ar' ? 'إدارة المهام' : 'Task Management'}</h2>
      </div>

      <div className={styles.tableContainer}>
        <table className={`${styles.table} ${isMobile ? styles.tableMobile : ''}`}>
          <thead>
            <tr className={styles.tableHeadRow}>
              {TABLE_HEADERS[lang].map((header) => (
                <th key={header} className={styles.tableHeaderCell}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={styles.tableBody}>
            {isLoading ? (
              <tr>
                <td colSpan={6} className={styles.loadingState}>
                  جاري تحميل المهام...
                </td>
              </tr>
            ) : null}

            {!isLoading && error ? (
              <tr>
                <td colSpan={6} className={styles.errorState}>
                  {error}
                </td>
              </tr>
            ) : null}

            {!isLoading && !error && tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.emptyState}>
                  لا توجد مهام لهذه الفلترة
                </td>
              </tr>
            ) : null}

            {!isLoading && !error
              ? tasks.map((task) => (
                  <tr key={task.id} className={styles.tableRow}>
                    <td className={styles.centerCell}>
                      <Badge status={task.priority} lang={lang} />
                    </td>
                    <td className={styles.centerCell}>
                      <Badge status={task.status} lang={lang} />
                    </td>
                    <td className={styles.dueCell}>{task.due}</td>
                    <td className={styles.textCell}>{lang === 'ar' ? task.assignee_ar : task.assignee_en}</td>
                    <td className={styles.textCell}>{lang === 'ar' ? task.req_ar : task.req_en}</td>
                    <td className={styles.codeCell}>{task.code}</td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

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
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
};

export default TasksPage;
