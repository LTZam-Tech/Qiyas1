import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Icons } from '../utils/icons.jsx';
import Badge from '../components/Badge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import useEvidenceData from '../hooks/useEvidenceData.js';
import styles from './EvidencePage.module.css';

const FILE_NAME_PATTERN = /^[A-Za-z0-9]+_[A-Za-z0-9]+_[A-Za-z0-9]+_\d{8}\.[A-Za-z0-9]+$/;

const EvidencePage = ({ isMobile, lang }) => {
  const { data, isLoading, error } = useEvidenceData();
  const items = (data || []).slice(0, 6);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const cardStatusClass = (status) => {
    if (status === 'non') return styles.cardNon;
    if (status === 'partial') return styles.cardPartial;
    return styles.cardFull;
  };

  const handleUploaderClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelection = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      setUploadError('');
      return;
    }

    const invalidFile = files.find((file) => !FILE_NAME_PATTERN.test(file.name));
    if (invalidFile) {
      setUploadError(
        lang === 'ar'
          ? `اسم الملف غير صالح: ${invalidFile.name}. استخدم النمط المطلوب.`
          : `Invalid file name: ${invalidFile.name}. Use the required pattern.`
      );
    } else {
      setUploadError('');
    }
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

      {uploadError ? <div className={styles.errorState}>{uploadError}</div> : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelection}
        style={{ display: 'none' }}
        aria-label={lang === 'ar' ? 'اختيار ملفات الأدلة' : 'Select evidence files'}
      />

      <button
        type="button"
        aria-label={lang === 'ar' ? 'رفع شاهد جديد' : 'Upload New Evidence'}
        className={styles.uploader}
        onClick={handleUploaderClick}
      >
        <div className={styles.uploaderIcon}>{Icons.upload}</div>
        <div className={styles.uploaderTitle}>{lang === 'ar' ? 'رفع شاهد جديد' : 'Upload New Evidence'}</div>
        <div className={styles.uploaderHint}>{lang === 'ar' ? 'اسحب الملفات هنا أو اضغط للاختيار' : 'Drag files here or click to select'} - PDF, PNG, XLSX, DOCX</div>
        <div className={styles.uploaderPattern}>
          {lang === 'ar' ? 'تسمية الملف' : 'File name'}: [StandardCode]_[SystemName]_[ScreenName]_[YYYYMMDD].ext
        </div>
      </button>
    </div>
  );
};

EvidencePage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
};

export default EvidencePage;
