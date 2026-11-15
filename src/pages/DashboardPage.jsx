import PropTypes from 'prop-types';
import StatCard from '../components/StatCard.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StateView from '../components/StateView.jsx';
import { Icons } from '../utils/icons.jsx';
import { canAccessPage } from '../utils/permissions.js';
import { getDisplayName } from '../utils/user.js';
import useDashboardData from '../hooks/useDashboardData.js';
import styles from './DashboardPage.module.css';

const EMPTY_DASHBOARD = {
  kpis: { totalStandards: 0, fullCompliance: 0, partialCompliance: 0, nonCompliance: 0 },
  perspectives: [],
  activities: [],
  alerts: [],
};

const normalizeDashboardData = (data) => {
  if (!data || typeof data !== 'object') return EMPTY_DASHBOARD;
  const kpis = data.kpis && typeof data.kpis === 'object' ? data.kpis : EMPTY_DASHBOARD.kpis;
  return {
    kpis: {
      totalStandards: Number(kpis.totalStandards) || 0,
      fullCompliance: Number(kpis.fullCompliance) || 0,
      partialCompliance: Number(kpis.partialCompliance) || 0,
      nonCompliance: Number(kpis.nonCompliance) || 0,
    },
    perspectives: Array.isArray(data.perspectives) ? data.perspectives : [],
    activities: Array.isArray(data.activities) ? data.activities : [],
    alerts: Array.isArray(data.alerts) ? data.alerts : [],
  };
};

const ACTIVITY_STYLE = {
  approve: { icon: 'checkCircle', tone: 'success' },
  reject: { icon: 'xCircle', tone: 'danger' },
  revision: { icon: 'edit', tone: 'warning' },
};

function ComplianceRing({ full, partial, total }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const fullLen = total ? (full / total) * c : 0;
  const partialLen = total ? (partial / total) * c : 0;
  return (
    <svg viewBox="0 0 128 128" className={styles.ring} aria-hidden="true">
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--track)" strokeWidth="14" />
      <circle
        cx="64" cy="64" r={r} fill="none" stroke="var(--warning)" strokeWidth="14"
        strokeDasharray={`${partialLen} ${c}`} strokeDashoffset={-fullLen}
        transform="rotate(-90 64 64)" strokeLinecap="butt"
      />
      <circle
        cx="64" cy="64" r={r} fill="none" stroke="var(--brand-500)" strokeWidth="14"
        strokeDasharray={`${fullLen} ${c}`} transform="rotate(-90 64 64)" strokeLinecap="butt"
      />
    </svg>
  );
}

ComplianceRing.propTypes = {
  full: PropTypes.number.isRequired,
  partial: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
};

const DashboardPage = ({ lang, user, onNavigate }) => {
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const { data, isLoading, error } = useDashboardData();
  const { kpis, perspectives, activities, alerts } = normalizeDashboardData(data);
  const { totalStandards: total, fullCompliance: full, partialCompliance: partial, nonCompliance: non } = kpis;
  const fullPct = total ? Math.round((full / total) * 100) : 0;
  const needsWork = partial + non;
  const firstName = getDisplayName(user, lang).replace(/^(د\.|dr\.?)\s*/i, '').split(' ')[0];
  const go = (key) => onNavigate && canAccessPage(key, user?.role) && onNavigate(key);
  const canSee = (key) => canAccessPage(key, user?.role);

  const header = (
    <PageHeader
      title={firstName ? t(`مرحباً، ${firstName}`, `Welcome back, ${firstName}`) : t('نظرة عامة', 'Overview')}
      subtitle={t('ملخص مستوى الالتزام والأنشطة الأخيرة في جميع المناظير.', 'Your compliance posture and latest activity across every perspective.')}
      actions={
        <>
          {canSee('tasks') && (
            <button type="button" className="q-btn q-btn-secondary" onClick={() => go('tasks')}>
              {Icons.tasks}
              {t('المهام', 'View tasks')}
            </button>
          )}
          {canSee('evidence') && (
            <button type="button" className="q-btn q-btn-primary" onClick={() => go('evidence')}>
              {Icons.upload}
              {t('رفع شاهد', 'Upload evidence')}
            </button>
          )}
        </>
      }
    />
  );

  if (isLoading) {
    return (
      <div className="q-page">
        {header}
        <div className={styles.skeletonGrid}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="q-skeleton" style={{ height: 120, borderRadius: 16 }} />)}
        </div>
        <div className="q-skeleton" style={{ height: 280, borderRadius: 16 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="q-page">
        {header}
        <div className="q-card"><StateView kind="error" title={t('تعذر تحميل لوحة التحكم', 'Could not load the dashboard')} message={error} /></div>
      </div>
    );
  }

  return (
    <div className="q-page">
      {header}

      {alerts.length > 0 && (
        <section className={styles.alertBar} aria-label={t('تنبيهات', 'Alerts')}>
          <span className={`q-icon-chip q-tone-warning ${styles.alertIcon}`}>{Icons.alert}</span>
          <div className={styles.alertText}>
            <strong>{t('يتطلب انتباهك', 'Needs your attention')}</strong>
            <ul className={styles.alertList}>
              {alerts.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
        </section>
      )}

      <section className={styles.topGrid}>
        <div className={`q-card ${styles.hero}`}>
          <div className={styles.ringWrap}>
            <ComplianceRing full={full} partial={partial} total={total} />
            <div className={styles.ringCenter}>
              <span className={styles.ringValue}>{fullPct}%</span>
              <span className={styles.ringLabel}>{t('التزام كلي', 'fully compliant')}</span>
            </div>
          </div>
          <div className={styles.heroText}>
            <h2 className="q-section-title">{t('مؤشر الالتزام العام', 'Overall compliance')}</h2>
            <p className={styles.heroLead}>
              {total === 0
                ? t('لا توجد معايير بعد.', 'No standards yet.')
                : t(`${full} من ${total} معياراً مستوفاة بالكامل.`, `${full} of ${total} standards are fully met.`)}
            </p>
            <ul className={styles.legend}>
              <li><span style={{ background: 'var(--brand-500)' }} />{t('كلي', 'Full')}<b>{full}</b></li>
              <li><span style={{ background: 'var(--warning)' }} />{t('جزئي', 'Partial')}<b>{partial}</b></li>
              <li><span style={{ background: 'var(--track)' }} />{t('غير ملتزم', 'Not met')}<b>{non}</b></li>
            </ul>
            {needsWork > 0 && canSee('evidence') && (
              <button type="button" className={styles.linkBtn} onClick={() => go('evidence')}>
                {t(`${needsWork} معايير تحتاج أدلة`, `${needsWork} standards need evidence`)}
                <span className={styles.linkArrow}>{Icons.arrowRight}</span>
              </button>
            )}
          </div>
        </div>

        <div className={styles.kpiGrid}>
          <StatCard label={t('إجمالي المعايير', 'Total standards')} value={total} icon="catalog" tone="brand" hint={t('ضمن نطاق التقييم', 'In assessment scope')} />
          <StatCard label={t('التزام كلي', 'Full compliance')} value={full} icon="checkCircle" tone="success" hint={t(`${fullPct}% من الإجمالي`, `${fullPct}% of total`)} />
          <StatCard label={t('التزام جزئي', 'Partial compliance')} value={partial} icon="clock" tone="warning" hint={t('أدلة غير مكتملة', 'Evidence incomplete')} />
          <StatCard label={t('عدم الالتزام', 'Non-compliance')} value={non} icon="xCircle" tone="danger" hint={t('لا توجد أدلة معتمدة', 'No approved evidence')} />
        </div>
      </section>

      <section className={styles.panelGrid}>
        <div className="q-card">
          <div className="q-card-head">
            <div>
              <h2 className="q-section-title">{t('الإنجاز حسب المنظور', 'Progress by perspective')}</h2>
              <p className="q-section-sub">{t('نسبة الأدلة المعتمدة لكل منظور', 'Share of approved evidence per perspective')}</p>
            </div>
            {canSee('catalog') && (
              <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => go('catalog')}>
                {t('الفهرس', 'Catalog')}
                <span className={styles.flip}>{Icons.arrowRight}</span>
              </button>
            )}
          </div>
          <div className="q-card-body">
            {perspectives.length > 0 ? (
              <ul className={styles.perspList}>
                {[...perspectives].sort((a, b) => b.completion - a.completion).map((p) => (
                  <li key={p.id} className={styles.perspRow}>
                    <div className={styles.perspTop}>
                      <span className={styles.perspName}>{lang === 'ar' ? p.name : p.nameEn}</span>
                      <span className={styles.perspPct}>{p.completion}%</span>
                    </div>
                    <ProgressBar value={p.completion} height={8} label={lang === 'ar' ? p.name : p.nameEn} />
                  </li>
                ))}
              </ul>
            ) : (
              <StateView title={t('لا توجد بيانات', 'No data yet')} message={t('ستظهر نسب الإنجاز عند رفع الأدلة.', 'Progress appears once evidence is uploaded.')} icon="chart" />
            )}
          </div>
        </div>

        <div className="q-card">
          <div className="q-card-head">
            <div>
              <h2 className="q-section-title">{t('آخر النشاطات', 'Recent activity')}</h2>
              <p className="q-section-sub">{t('ما حدث مؤخراً على الأدلة', 'Latest actions on evidence')}</p>
            </div>
          </div>
          <div className="q-card-body">
            {activities.length > 0 ? (
              <ol className={styles.timeline}>
                {activities.map((a) => {
                  const s = ACTIVITY_STYLE[a.type] || { icon: 'upload', tone: 'brand' };
                  return (
                    <li key={a.id} className={styles.event}>
                      <span className={`q-icon-chip q-tone-${s.tone} ${styles.eventIcon}`}>{Icons[s.icon]}</span>
                      <div className={styles.eventText}>
                        <div className={styles.eventMain}>
                          <strong>{lang === 'ar' ? a.user_ar : a.user_en}</strong> {lang === 'ar' ? a.action_ar : a.action_en}
                        </div>
                        <div className={styles.eventMeta}>
                          <span className="q-code">{a.standard}</span>
                          <span>{lang === 'ar' ? a.time_ar : a.time_en}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <StateView title={t('لا توجد نشاطات', 'No activity yet')} icon="clock" />
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

DashboardPage.propTypes = {
  isMobile: PropTypes.bool,
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
  user: PropTypes.object,
  onNavigate: PropTypes.func,
};

export default DashboardPage;
