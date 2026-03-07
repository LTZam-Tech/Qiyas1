import PropTypes from 'prop-types';
import styles from './ReportsPage.module.css';

const REPORT_ITEMS = [
  {
    title: 'تقرير التقييم الذاتي',
    titleEn: 'Self-Assessment Report',
    desc: 'تقرير شامل عن مستوى الالتزام في جميع المناظير والمعايير',
    descEn: 'Comprehensive report on compliance level across all perspectives and standards',
  },
  {
    title: 'سجل الأدلة',
    titleEn: 'Evidence Register',
    desc: 'قائمة بجميع الأدلة المرفوعة مع تفاصيل المراجعة وحالة الاعتماد',
    descEn: 'List of all uploaded evidence with review details and approval status',
  },
  {
    title: 'حزمة التدقيق الكاملة',
    titleEn: 'Full Audit Pack (ZIP)',
    desc: 'جميع الوثائق الرسمية مع الأدلة ونتائج المراجعة في ملف واحد',
    descEn: 'All official documents with evidence and review results in one file',
  },
  {
    title: 'تقرير عدم الالتزام',
    titleEn: 'Non-Compliance Report',
    desc: 'ملخص بالمعايير غير الملتزمة مع خطط المعالجة والإجراءات المقترحة',
    descEn: 'Summary of non-compliant standards with remediation plans and proposed actions',
  },
  {
    title: 'الملخص التنفيذي',
    titleEn: 'Executive Summary',
    desc: 'عرض مختصر للإنجازات الحالية ومؤشرات الأداء الرئيسية',
    descEn: 'Brief overview of current achievements and key performance indicators',
  },
  {
    title: 'تقرير زمن المراجعة',
    titleEn: 'Reviewer SLA Report',
    desc: 'تحليل دورة المراجعة حسب فرق العمل ومعدل وقت الاعتماد',
    descEn: 'Analysis of review cycle by work teams and approval time metrics',
  },
];

const ReportsPage = ({ isMobile, lang }) => {
  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>{lang === 'ar' ? 'التقارير وحزم التدقيق' : 'Reports & Audit Packs'}</h2>
      <div className={`${styles.grid} ${isMobile ? styles.gridMobile : styles.gridDesktop}`}>
        {REPORT_ITEMS.length > 0 ? (
          REPORT_ITEMS.map((report) => (
            <article key={report.titleEn} className={styles.card}>
              <div className={styles.cardBody}>
                <div className={styles.title}>{lang === 'ar' ? report.title : report.titleEn}</div>
                <div className={styles.desc}>{lang === 'ar' ? report.desc : report.descEn}</div>
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
};

export default ReportsPage;
