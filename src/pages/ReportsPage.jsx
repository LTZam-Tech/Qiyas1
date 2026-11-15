import { useState } from 'react';
import PropTypes from 'prop-types';
import PageHeader from '../components/PageHeader.jsx';
import useToast from '../hooks/useToast.js';
import { Icons } from '../utils/icons.jsx';
import styles from './ReportsPage.module.css';

const REPORT_ITEMS = [
  {
    id: 'self-assessment-report', icon: 'chart', tone: 'brand', format: 'PDF',
    title: 'تقرير التقييم الذاتي', titleEn: 'Self-assessment report',
    desc: 'تقرير شامل عن مستوى الالتزام في جميع المناظير والمعايير',
    descEn: 'Compliance level across every perspective and standard.',
  },
  {
    id: 'executive-summary', icon: 'zap', tone: 'gold', format: 'PDF',
    title: 'الملخص التنفيذي', titleEn: 'Executive summary',
    desc: 'عرض مختصر للإنجازات الحالية ومؤشرات الأداء الرئيسية',
    descEn: 'A short view of current progress and key indicators.',
  },
  {
    id: 'non-compliance-report', icon: 'alertCircle', tone: 'danger', format: 'PDF',
    title: 'تقرير عدم الالتزام', titleEn: 'Non-compliance report',
    desc: 'ملخص بالمعايير غير الملتزمة مع خطط المعالجة والإجراءات المقترحة',
    descEn: 'Standards not met, with remediation plans and next actions.',
  },
  {
    id: 'evidence-register', icon: 'list', tone: 'info', format: 'XLSX',
    title: 'سجل الأدلة', titleEn: 'Evidence register',
    desc: 'قائمة بجميع الأدلة المرفوعة مع تفاصيل المراجعة وحالة الاعتماد',
    descEn: 'Every uploaded file with its review details and approval state.',
  },
  {
    id: 'reviewer-sla-report', icon: 'clock', tone: 'warning', format: 'XLSX',
    title: 'تقرير زمن المراجعة', titleEn: 'Reviewer SLA report',
    desc: 'تحليل دورة المراجعة حسب فرق العمل ومعدل وقت الاعتماد',
    descEn: 'Review cycle times by team and average time to approval.',
  },
  {
    id: 'full-audit-pack', icon: 'archive', tone: 'success', format: 'ZIP',
    title: 'حزمة التدقيق الكاملة', titleEn: 'Full audit pack',
    desc: 'جميع الوثائق الرسمية مع الأدلة ونتائج المراجعة في ملف واحد',
    descEn: 'All official documents, evidence and review results in one file.',
  },
];

const ReportsPage = ({ lang }) => {
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const { toast, showToast } = useToast();
  const [preview, setPreview] = useState(null);

  const handleDownload = (report) => {
    const content = [
      `Report: ${report.titleEn}`,
      `Description: ${report.descEn}`,
      '',
      `Generated at: ${new Date().toISOString()}`,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(t(`تم تنزيل: ${report.title}`, `Downloaded: ${report.titleEn}`));
  };

  return (
    <div className="q-page">
      <PageHeader
        title={t('التقارير وحزم التدقيق', 'Reports & audit packs')}
        subtitle={t('أنشئ تقارير جاهزة للمشاركة مع الإدارة والمدققين.', 'Generate ready-to-share reports for leadership and auditors.')}
      />

      <div className={styles.grid}>
        {REPORT_ITEMS.map((report) => {
          const title = lang === 'ar' ? report.title : report.titleEn;
          return (
            <article key={report.id} className={`q-card ${styles.card}`} aria-label={title}>
              <div className={styles.top}>
                <span className={`q-icon-chip q-tone-${report.tone}`}>{Icons[report.icon]}</span>
                <span className={styles.format}>{report.format}</span>
              </div>
              <h2 className={styles.title}>{title}</h2>
              <p className={styles.desc}>{lang === 'ar' ? report.desc : report.descEn}</p>
              <div className={styles.actions}>
                <button type="button" className="q-btn q-btn-secondary q-btn-sm" onClick={() => setPreview(report)} aria-label={t(`معاينة ${report.title}`, `Preview ${report.titleEn}`)}>
                  {Icons.eyeSmall}
                  {t('معاينة', 'Preview')}
                </button>
                <button type="button" className="q-btn q-btn-primary q-btn-sm" onClick={() => handleDownload(report)} aria-label={t(`تنزيل ${report.title}`, `Download ${report.titleEn}`)}>
                  {Icons.download}
                  {t('تنزيل', 'Download')}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {preview && (
        <div className={styles.backdrop} onClick={() => setPreview(null)} role="presentation">
          <div className={`q-card ${styles.dialog}`} role="dialog" aria-modal="true" aria-labelledby="report-preview-title" onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <span className={`q-icon-chip q-tone-${preview.tone}`}>{Icons[preview.icon]}</span>
              <div>
                <h2 id="report-preview-title" className={styles.title}>{lang === 'ar' ? preview.title : preview.titleEn}</h2>
                <p className={styles.desc}>{lang === 'ar' ? preview.desc : preview.descEn}</p>
              </div>
              <button type="button" className="q-icon-btn" onClick={() => setPreview(null)} aria-label={t('إغلاق', 'Close')}>{Icons.x}</button>
            </div>
            <div className={styles.dialogBody}>
              <div className="q-skeleton" style={{ height: 12, width: '45%' }} />
              <div className="q-skeleton" style={{ height: 12 }} />
              <div className="q-skeleton" style={{ height: 12, width: '85%' }} />
              <div className="q-skeleton" style={{ height: 120, marginTop: 8 }} />
              <p className="q-faint" style={{ fontSize: '0.85rem' }}>
                {t('المعاينة الكاملة ستتوفر عند ربط خدمة التقارير.', 'Full preview becomes available once the reporting service is connected.')}
              </p>
            </div>
            <div className={styles.dialogFoot}>
              <button type="button" className="q-btn q-btn-secondary" onClick={() => setPreview(null)}>{t('إغلاق', 'Close')}</button>
              <button type="button" className="q-btn q-btn-primary" onClick={() => { handleDownload(preview); setPreview(null); }}>
                {Icons.download}
                {t('تنزيل', 'Download')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast}
    </div>
  );
};

ReportsPage.propTypes = {
  isMobile: PropTypes.bool,
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
};

export default ReportsPage;
