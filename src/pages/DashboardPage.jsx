import PropTypes from 'prop-types';
import { C, cardGradients } from '../utils/theme.js';
import StatCard from '../components/StatCard.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { Icons } from '../utils/icons.jsx';
import useDashboardData from '../hooks/useDashboardData.js';
import styles from './DashboardPage.module.css';

const DashboardPage = ({ isMobile }) => {
  const { data, isLoading, error } = useDashboardData();
  const totalStd = data?.kpis?.totalStandards ?? 0;
  const full = data?.kpis?.fullCompliance ?? 0;
  const partial = data?.kpis?.partialCompliance ?? 0;
  const non = data?.kpis?.nonCompliance ?? 0;
  const perspectives = data?.perspectives ?? [];
  const activities = data?.activities ?? [];
  const alerts = data?.alerts ?? [];

  if (isLoading) {
    return <p className={styles.emptyState}>Loading dashboard...</p>;
  }

  if (error) {
    return <p className={styles.errorState}>{error}</p>;
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>المؤشرات الرئيسية للأداء — Key Performance Indicators</h2>
      <div className={`${styles.kpiGrid} ${isMobile ? styles.kpiGridMobile : styles.kpiGridDesktop}`}>
        <StatCard label="إجمالي المعايير" value={totalStd} gradient={cardGradients.purple} icon="catalog" change={0} />
        <StatCard label="التزام كلي" value={full} gradient={cardGradients.green} icon="check" change={12.3} />
        <StatCard label="التزام جزئي" value={partial} gradient={cardGradients.accent} icon="clock" change={8.5} />
        <StatCard label="عدم الالتزام" value={`${non}`} gradient={cardGradients.teal} icon="x" change={5.2} />
      </div>

      <div className={`${styles.panelGrid} ${isMobile ? styles.panelGridMobile : styles.panelGridDesktop}`}>
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>نسبة الإنجاز حسب المنظور — Completion by Perspective</h3>
          <div className={styles.rows}>
            {perspectives.length > 0 ? perspectives.map((p) => (
              <div key={p.id} className={styles.row}>
                <span className={styles.percent}>{p.completion}%</span>
                <div style={{ flex: 1 }}><ProgressBar value={p.completion} height={8} /></div>
                <span className={styles.perspectiveLabel}>{p.name}</span>
              </div>
            )) : (
              <p className={styles.emptyState}>لا توجد بيانات للمناظير حاليا</p>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>النشاطات الأخيرة — Recent Activity</h3>
          <div className={styles.activityRows}>
            {activities.length > 0 ? activities.map((a, i) => (
              <div key={a.id} className={styles.activityRow} style={{ borderBottom: i < activities.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div
                  className={styles.activityDot}
                  style={{ background: a.type === 'approve' ? C.green : a.type === 'reject' ? C.red : a.type === 'revision' ? C.orange : C.primary }}
                />
                <div className={styles.activityText}>
                  <div className={styles.activityMain}><strong>{a.user}</strong> — {a.action}</div>
                  <div className={styles.activityMeta}>المعيار {a.standard} | {a.time}</div>
                </div>
              </div>
            )) : (
              <p className={styles.emptyState}>لا توجد نشاطات حديثة</p>
            )}
          </div>
        </div>
      </div>

      <div className={styles.alertBox}>
        <span style={{ color: C.red, flexShrink: 0, marginTop: 2 }}>{Icons.alert}</span>
        <div className={styles.alertText}>
          <div className={styles.alertTitle}>تنبيهات الاختناقات — Bottleneck Alerts</div>
          <div className={styles.alertBody}>
            {alerts.length > 0 ? alerts.join(' — ') : 'لا توجد تنبيهات حالية'}
          </div>
        </div>
      </div>
    </div>
  );
};

DashboardPage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
};

export default DashboardPage;