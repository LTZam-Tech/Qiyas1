import { useState } from 'react';
import PropTypes from 'prop-types';
import Badge from '../components/Badge.jsx';
import useTasksData from '../hooks/useTasksData.js';
import styles from './TasksPage.module.css';

const FILTERS = [
  ['all', 'الكل'],
  ['active', 'نشط'],
  ['submitted', 'مقدم'],
  ['revision', 'مراجعة'],
  ['approved', 'معتمد'],
];

const TABLE_HEADERS = ['الأولوية', 'الحالة', 'الموعد النهائي', 'المسؤول', 'الشاهد المطلوب', 'المعيار'];

const TasksPage = ({ isMobile }) => {
  const [filter, setFilter] = useState('all');
  const { data: tasks, isLoading, error } = useTasksData(filter);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.filters}>
          {FILTERS.map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-label={`فلترة المهام: ${label}`}
              className={`${styles.filterButton} ${filter === key ? styles.filterButtonActive : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <h2 className={styles.heading}>إدارة المهام - Task Management</h2>
      </div>

      <div className={styles.tableContainer}>
        <table className={`${styles.table} ${isMobile ? styles.tableMobile : ''}`}>
          <thead>
            <tr className={styles.tableHeadRow}>
              {TABLE_HEADERS.map((header) => (
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
                      <Badge status={task.priority} />
                    </td>
                    <td className={styles.centerCell}>
                      <Badge status={task.status} />
                    </td>
                    <td className={styles.dueCell}>{task.due}</td>
                    <td className={styles.textCell}>{task.assignee}</td>
                    <td className={styles.textCell}>{task.req}</td>
                    <td className={styles.codeCell}>{task.code}</td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

TasksPage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
};

export default TasksPage;
