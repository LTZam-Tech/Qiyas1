import { useState } from 'react';
import PropTypes from 'prop-types';
import { Icons } from '../utils/icons.jsx';
import Badge from '../components/Badge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import EvidenceUploadModal from '../components/EvidenceUploadModal.jsx';
import useEvidenceData from '../hooks/useEvidenceData.js';
import styles from './EvidencePage.module.css';

const EvidencePage = ({ isMobile, lang }) => {
  const { data, isLoading, error, reload } = useEvidenceData();
  const items = (data || []).slice(0, 6);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const cardStatusClass = (status) => {
    if (status === 'non') return styles.cardNon;
    if (status === 'partial') return styles.cardPartial;
    return styles.cardFull;
  };

  const handleUploadSuccess = () => {
    // Refresh evidence list after a successful upload
    if (typeof reload === 'function') reload();
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>{lang === 'ar' ? 'خزنة الأدلة' : 'Evidence Locker'}</h2>

      {isLoading ? <div className={styles.loadingState}>{lang === 'ar' ? 'جاري تحميل الأدلة...' : 'Loading evidence...'}</div> : null}
      {!isLoading && error ? <div className={styles.errorState}>{error}</div> : null}

      {!isLoading && !error ? (
        <div className={`${styles.grid} ${isMobile ? styles.gridMobile : styles.gridDesktop}`}>
          {items.length > 0 ? (
            items.map((item) => {
              const pct = Math.round((item.approved / item.reqCount) * 100);
              return (
                <article key={item.code} className={`${styles.card} ${cardStatusClass(item.status)}`}>
                  <div className={styles.cardHead}>
                    <Badge status={item.status} lang={lang} />
                    <span className={styles.code}>{item.code}</span>
                  </div>
                  <div className={styles.title}>{lang === 'ar' ? item.title : item.titleEn}</div>
                  <ProgressBar value={pct} height={6} />
                  <div className={styles.meta}>
                    {item.approved} / {item.reqCount} {lang === 'ar' ? 'شاهد معتمد' : 'approved'} - {pct}%
                  </div>
                </article>
              );
            })
          ) : (
            <div className={styles.emptyState}>{lang === 'ar' ? 'لا توجد أدلة مرفوعة' : 'No evidence uploaded'}</div>
          )}
        </div>
      ) : null}

      {/* Upload button — opens modal instead of direct file picker */}
      <button
        type="button"
        aria-label={lang === 'ar' ? 'رفع شاهد جديد' : 'Upload New Evidence'}
        className={styles.uploader}
        onClick={() => setIsModalOpen(true)}
      >
        <div className={styles.uploaderIcon}>{Icons.upload}</div>
        <div className={styles.uploaderTitle}>{lang === 'ar' ? 'رفع شاهد جديد' : 'Upload New Evidence'}</div>
        <div className={styles.uploaderHint}>{lang === 'ar' ? 'اضغط هنا لاختيار المجال والمعيار والملفات' : 'Click here to select domain, standard, and files'}</div>
      </button>

      {/* Upload modal with Domain → Axis → Standard DDLs */}
      <EvidenceUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleUploadSuccess}
        lang={lang}
      />
    </div>
  );
};

EvidencePage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
};

export default EvidencePage;
