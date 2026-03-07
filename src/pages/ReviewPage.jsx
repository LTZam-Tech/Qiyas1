import PropTypes from 'prop-types';
import { cardGradients } from '../utils/theme.js';
import { TASKS_DATA } from '../utils/data.js';
import Badge from '../components/Badge.jsx';
import StatCard from '../components/StatCard.jsx';
import styles from './ReviewPage.module.css';

const ReviewPage = ({ isMobile, lang }) => {
  const pendingReviews = TASKS_DATA.filter((task) => task.status === 'submitted' || task.status === 'revision');

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>{lang === 'ar' ? 'المراجعة والاعتماد' : 'Review & Approval'}</h2>

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
              <div className={styles.rowActions}>
                <button type="button" aria-label={`اعتماد ${task.req}`} className={`${styles.actionButton} ${styles.approve}`}>
                  اعتماد
                </button>
                <button type="button" aria-label={`طلب مراجعة ${task.req}`} className={`${styles.actionButton} ${styles.revise}`}>
                  مراجعة
                </button>
                <button type="button" aria-label={`رفض ${task.req}`} className={`${styles.actionButton} ${styles.reject}`}>
                  رفض
                </button>
              </div>

              <div className={styles.rowBody}>
                <div className={styles.rowTitle}>{task.req}</div>
                <div className={styles.rowMeta}>
                  المعيار: {task.code} | المسؤول: {task.assignee}
                </div>
              </div>

              <Badge status={task.status} lang={lang} />
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
};

export default ReviewPage;
