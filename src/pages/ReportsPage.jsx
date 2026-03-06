import PropTypes from 'prop-types';
import styles from './ReportsPage.module.css';

const REPORT_ITEMS = [
  {
    title: 'تقرير التقييم الذاتي',
    titleEn: 'Self-Assessment Report',
    desc: 'تقرير شامل عن مستوى الالتزام في جميع المناظير والمعايير',
  },
  {
    title: 'سجل الأدلة',
    titleEn: 'Evidence Register',
    desc: 'قائمة بجميع الأدلة المرفوعة مع تفاصيل المراجعة وحالة الاعتماد',
  },
  {
    title: 'حزمة التدقيق الكاملة',
    titleEn: 'Full Audit Pack (ZIP)',
    desc: 'جميع الوثائق الرسمية مع الأدلة ونتائج المراجعة في ملف واحد',
  },
  {
    title: 'تقرير عدم الالتزام',
    titleEn: 'Non-Compliance Report',
    desc: 'ملخص بالمعايير غير الملتزمة مع خطط المعالجة والإجراءات المقترحة',
  },
  {
    title: 'الملخص التنفيذي',
    titleEn: 'Executive Summary',
    desc: 'عرض مختصر للإنجازات الحالية ومؤشرات الأداء الرئيسية',
  },
  {
    title: 'تقرير زمن المراجعة',
    titleEn: 'Reviewer SLA Report',
    desc: 'تحليل دورة المراجعة حسب فرق العمل ومعدل وقت الاعتماد',
  },
];

const ReportsPage = ({ isMobile }) => {
  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>التقارير وحزم التدقيق - Reports & Audit Packs</h2>
      <div className={`${styles.grid} ${isMobile ? styles.gridMobile : styles.gridDesktop}`}>
        {REPORT_ITEMS.length > 0 ? (
          REPORT_ITEMS.map((report) => (
            <article key={report.titleEn} className={styles.card}>
              <div className={styles.cardBody}>
                <div className={styles.title}>{report.title}</div>
                <div className={styles.titleEn}>{report.titleEn}</div>
                <div className={styles.desc}>{report.desc}</div>
              </div>
            </article>
          ))
        ) : (
          <div className={styles.emptyState}>لا توجد تقارير جاهزة حاليا</div>
        )}
      </div>
    </div>
  );
};

ReportsPage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
};

export default ReportsPage;
