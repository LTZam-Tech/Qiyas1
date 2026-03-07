import PropTypes from 'prop-types';
import styles from './ReportsPage.module.css';

const REPORT_ITEMS = [
  {
    id: 'self-assessment-report',
    title: 'تقرير التقييم الذاتي',
    titleEn: 'Self-Assessment Report',
    desc: 'تقرير شامل عن مستوى الالتزام في جميع المناظير والمعايير',
    descEn: 'Comprehensive report on compliance level across all perspectives and standards',
  },
  {
    id: 'evidence-register',
    title: 'سجل الأدلة',
    titleEn: 'Evidence Register',
    desc: 'قائمة بجميع الأدلة المرفوعة مع تفاصيل المراجعة وحالة الاعتماد',
    descEn: 'List of all uploaded evidence with review details and approval status',
  },
  {
    id: 'full-audit-pack',
    title: 'حزمة التدقيق الكاملة',
    titleEn: 'Full Audit Pack (ZIP)',
    desc: 'جميع الوثائق الرسمية مع الأدلة ونتائج المراجعة في ملف واحد',
    descEn: 'All official documents with evidence and review results in one file',
  },
  {
    id: 'non-compliance-report',
    title: 'تقرير عدم الالتزام',
    titleEn: 'Non-Compliance Report',
    desc: 'ملخص بالمعايير غير الملتزمة مع خطط المعالجة والإجراءات المقترحة',
    descEn: 'Summary of non-compliant standards with remediation plans and proposed actions',
  },
  {
    id: 'executive-summary',
    title: 'الملخص التنفيذي',
    titleEn: 'Executive Summary',
    desc: 'عرض مختصر للإنجازات الحالية ومؤشرات الأداء الرئيسية',
    descEn: 'Brief overview of current achievements and key performance indicators',
  },
  {
    id: 'reviewer-sla-report',
    title: 'تقرير زمن المراجعة',
    titleEn: 'Reviewer SLA Report',
    desc: 'تحليل دورة المراجعة حسب فرق العمل ومعدل وقت الاعتماد',
    descEn: 'Analysis of review cycle by work teams and approval time metrics',
  },
];

const ReportsPage = ({ isMobile, lang }) => {
  const handleView = (report) => {
    const title = lang === 'ar' ? report.title : report.titleEn;
    window.alert(lang === 'ar' ? `عرض التقرير: ${title}` : `Viewing report: ${title}`);
  };

  const handleDownload = (report) => {
    const title = lang === 'ar' ? report.title : report.titleEn;
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

    window.alert(lang === 'ar' ? `تم تنزيل التقرير: ${title}` : `Report downloaded: ${title}`);
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>{lang === 'ar' ? 'التقارير وحزم التدقيق' : 'Reports & Audit Packs'}</h2>
      <div className={`${styles.grid} ${isMobile ? styles.gridMobile : styles.gridDesktop}`}>
        {REPORT_ITEMS.length > 0 ? (
          REPORT_ITEMS.map((report) => (
            <article key={report.id} className={styles.card} role="group" aria-label={lang === 'ar' ? report.title : report.titleEn}>
              <div className={styles.cardBody}>
                <div className={styles.title}>{lang === 'ar' ? report.title : report.titleEn}</div>
                <div className={styles.desc}>{lang === 'ar' ? report.desc : report.descEn}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => handleView(report)}
                    aria-label={lang === 'ar' ? `عرض ${report.title}` : `View ${report.titleEn}`}
                  >
                    {lang === 'ar' ? 'عرض' : 'View'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(report)}
                    aria-label={lang === 'ar' ? `تنزيل ${report.title}` : `Download ${report.titleEn}`}
                  >
                    {lang === 'ar' ? 'تنزيل' : 'Download'}
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className={styles.emptyState}>{lang === 'ar' ? 'لا توجد تقارير جاهزة حاليا' : 'No reports available'}</div>
        )}
      </div>
    </div>
  );
};

ReportsPage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
};

export default ReportsPage;
