import PropTypes from 'prop-types';
import { cardGradients } from '../utils/theme.js';
import StatCard from '../components/StatCard.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { Icons } from '../utils/icons.jsx';
import useDashboardData from '../hooks/useDashboardData.js';
import styles from './DashboardPage.module.css';

const DashboardPage = ({ isMobile, lang }) => {
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
      <h2 className={styles.heading}>{lang === 'ar' ? 'المؤشرات الرئيسية للأداء' : 'Key Performance Indicators'}</h2>
      <div className={`${styles.kpiGrid} ${isMobile ? styles.kpiGridMobile : styles.kpiGridDesktop}`}>
        <StatCard label={lang === 'ar' ? 'إجمالي المعايير' : 'Total Standards'} value={totalStd} gradient={cardGradients.purple} icon="catalog" change={0} lang={lang} />
        <StatCard label={lang === 'ar' ? 'التزام كلي' : 'Full Compliance'} value={full} gradient={cardGradients.green} icon="check" change={12.3} lang={lang} />
        <StatCard label={lang === 'ar' ? 'التزام جزئي' : 'Partial Compliance'} value={partial} gradient={cardGradients.accent} icon="clock" change={8.5} lang={lang} />
        <StatCard label={lang === 'ar' ? 'عدم الالتزام' : 'Non-Compliance'} value={`${non}`} gradient={cardGradients.teal} icon="x" change={5.2} lang={lang} />
      </div>

      <div className={`${styles.panelGrid} ${isMobile ? styles.panelGridMobile : styles.panelGridDesktop}`}>
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>{lang === 'ar' ? 'نسبة الإنجاز حسب المنظور' : 'Completion by Perspective'}</h3>
          <div className={styles.rows}>
            {perspectives.length > 0 ? perspectives.map((p) => (
              <div key={p.id} className={styles.row}>
                <span className={styles.percent}>{p.completion}%</span>
                <div className={styles.progressWrapper}><ProgressBar value={p.completion} height={8} /></div>
                <span className={styles.perspectiveLabel}>{p.name}</span>
              </div>
            )) : (
              <p className={styles.emptyState}>{lang === 'ar' ? 'لا توجد بيانات للمناظير حاليا' : 'No perspective data available'}</p>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>{lang === 'ar' ? 'النشاطات الأخيرة' : 'Recent Activity'}</h3>
          <div className={styles.activityRows}>
            {activities.length > 0 ? activities.map((a, i) => {
              const dotClass = a.type === 'approve' ? styles.activityDotApprove :
                               a.type === 'reject' ? styles.activityDotReject :
                               a.type === 'revision' ? styles.activityDotRevision :
                               styles.activityDotDefault;
              const isLast = i === activities.length - 1;
              return (
                <div key={a.id} className={`${styles.activityRow} ${isLast ? styles.activityRowLast : ''}`}>
                  <div className={`${styles.activityDot} ${dotClass}`} />
                  <div className={styles.activityText}>
                    <div className={styles.activityMain}><strong>{a.user}</strong> — {lang === 'ar' ? a.action_ar : a.action_en}</div>
                    <div className={styles.activityMeta}>{lang === 'ar' ? 'المعيار' : 'Standard'} {a.standard} | {lang === 'ar' ? a.time_ar : a.time_en}</div>
                  </div>
                </div>
              );
            }) : (
              <p className={styles.emptyState}>{lang === 'ar' ? 'لا توجد نشاطات حديثة' : 'No recent activities'}</p>
            )}
          </div>
        </div>
      </div>

      <div className={styles.alertBox}>
        <span className={styles.alertIcon}>{Icons.alert}</span>
        <div className={styles.alertText}>
          <div className={styles.alertTitle}>{lang === 'ar' ? 'تنبيهات الاختناقات' : 'Bottleneck Alerts'}</div>
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
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
};

export default DashboardPage;