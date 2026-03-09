import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import perspectivesService from '../services/perspectivesService.js';
import axesService from '../services/axesService.js';
import standardsService from '../services/standardsService.js';
import styles from './EvidenceUploadModal.module.css';

const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg,.xlsx,.docx';

const EvidenceUploadModal = ({ isOpen, onClose, lang = 'ar' }) => {
  const [perspectives, setPerspectives] = useState([]);
  const [axes, setAxes] = useState([]);
  const [standards, setStandards] = useState([]);

  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedAxis, setSelectedAxis] = useState('');
  const [selectedStandard, setSelectedStandard] = useState('');
  const [files, setFiles] = useState([]);

  const [isLoadingDomains, setIsLoadingDomains] = useState(false);
  const [isLoadingAxes, setIsLoadingAxes] = useState(false);
  const [isLoadingStandards, setIsLoadingStandards] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load domains when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingDomains(true);
    setError('');
    perspectivesService
      .getPerspectives()
      .then((data) => setPerspectives(data))
      .catch(() =>
        setError(lang === 'ar' ? 'فشل تحميل المجالات' : 'Failed to load domains')
      )
      .finally(() => setIsLoadingDomains(false));
  }, [isOpen, lang]);

  // Load axes when domain changes
  useEffect(() => {
    setAxes([]);
    setStandards([]);
    setSelectedAxis('');
    setSelectedStandard('');
    if (!selectedDomain) return;
    setIsLoadingAxes(true);
    axesService
      .getAxes(selectedDomain)
      .then((data) => setAxes(data))
      .catch(() =>
        setError(lang === 'ar' ? 'فشل تحميل المحاور' : 'Failed to load axes')
      )
      .finally(() => setIsLoadingAxes(false));
  }, [selectedDomain, lang]);

  // Load standards when axis changes
  useEffect(() => {
    setStandards([]);
    setSelectedStandard('');
    if (!selectedAxis) return;
    setIsLoadingStandards(true);
    standardsService
      .getStandards(selectedAxis)
      .then((data) => setStandards(data))
      .catch(() =>
        setError(lang === 'ar' ? 'فشل تحميل المعايير' : 'Failed to load standards')
      )
      .finally(() => setIsLoadingStandards(false));
  }, [selectedAxis, lang]);

  const reset = () => {
    setSelectedDomain('');
    setSelectedAxis('');
    setSelectedStandard('');
    setFiles([]);
    setError('');
    setSuccessMsg('');
    setAxes([]);
    setStandards([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    setFiles(selected);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!selectedDomain) {
      setError(lang === 'ar' ? 'يرجى اختيار المجال' : 'Please select a domain');
      return;
    }
    if (!selectedAxis) {
      setError(lang === 'ar' ? 'يرجى اختيار المحور' : 'Please select an axis');
      return;
    }
    if (!selectedStandard) {
      setError(lang === 'ar' ? 'يرجى اختيار المعيار' : 'Please select a standard');
      return;
    }
    if (files.length === 0) {
      setError(lang === 'ar' ? 'يرجى اختيار ملف واحد على الأقل' : 'Please select at least one file');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('perspectiveId', selectedDomain);
      formData.append('axisId', selectedAxis);
      formData.append('standardId', selectedStandard);
      files.forEach((file) => formData.append('files', file));

      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.message || `Upload failed (${response.status})`);
      }

      setSuccessMsg(
        lang === 'ar'
          ? `تم رفع ${files.length} ملف بنجاح!`
          : `${files.length} file(s) uploaded successfully!`
      );
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err.message || (lang === 'ar' ? 'فشل رفع الملفات' : 'Upload failed'));
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const t = (ar, en) => (lang === 'ar' ? ar : en);

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>{t('رفع شاهد جديد', 'Upload New Evidence')}</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleClose}
            aria-label={t('إغلاق', 'Close')}
          >
            ×
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {/* Error / Success */}
          {error && <div className={styles.error}>{error}</div>}
          {successMsg && <div className={styles.success}>{successMsg}</div>}

          {/* Domain DDL */}
          <div className={styles.field}>
            <label className={styles.label}>
              {t('المجال', 'Domain')} <span className={styles.req}>*</span>
            </label>
            <select
              className={styles.select}
              value={selectedDomain}
              onChange={(e) => { setSelectedDomain(e.target.value); setError(''); }}
              disabled={isLoadingDomains || isUploading}
            >
              <option value="">
                {isLoadingDomains
                  ? t('جاري التحميل...', 'Loading...')
                  : t('اختر المجال', 'Select Domain')}
              </option>
              {perspectives.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} – {lang === 'ar' ? p.name_ar : p.name_en}
                </option>
              ))}
            </select>
          </div>

          {/* Axis DDL */}
          <div className={styles.field}>
            <label className={styles.label}>
              {t('المحور', 'Axis')} <span className={styles.req}>*</span>
            </label>
            <select
              className={styles.select}
              value={selectedAxis}
              onChange={(e) => { setSelectedAxis(e.target.value); setError(''); }}
              disabled={!selectedDomain || isLoadingAxes || isUploading}
            >
              <option value="">
                {isLoadingAxes
                  ? t('جاري التحميل...', 'Loading...')
                  : !selectedDomain
                  ? t('اختر المجال أولاً', 'Select a domain first')
                  : axes.length === 0
                  ? t('لا توجد محاور', 'No axes found')
                  : t('اختر المحور', 'Select Axis')}
              </option>
              {axes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} – {lang === 'ar' ? a.name_ar : a.name_en}
                </option>
              ))}
            </select>
          </div>

          {/* Standard DDL */}
          <div className={styles.field}>
            <label className={styles.label}>
              {t('المعيار', 'Standard')} <span className={styles.req}>*</span>
            </label>
            <select
              className={styles.select}
              value={selectedStandard}
              onChange={(e) => { setSelectedStandard(e.target.value); setError(''); }}
              disabled={!selectedAxis || isLoadingStandards || isUploading}
            >
              <option value="">
                {isLoadingStandards
                  ? t('جاري التحميل...', 'Loading...')
                  : !selectedAxis
                  ? t('اختر المحور أولاً', 'Select an axis first')
                  : standards.length === 0
                  ? t('لا توجد معايير', 'No standards found')
                  : t('اختر المعيار', 'Select Standard')}
              </option>
              {standards.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} – {lang === 'ar' ? s.name_ar : s.name_en}
                </option>
              ))}
            </select>
          </div>

          {/* File picker */}
          <div className={styles.field}>
            <label className={styles.label}>
              {t('الملفات', 'Files')} <span className={styles.req}>*</span>
            </label>
            <label className={`${styles.filePicker} ${files.length > 0 ? styles.filePickerHasFiles : ''}`}>
              <input
                type="file"
                multiple
                accept={ACCEPTED_TYPES}
                onChange={handleFileChange}
                disabled={isUploading}
                className={styles.hiddenInput}
              />
              <span className={styles.filePickerIcon}>📎</span>
              <span className={styles.filePickerText}>
                {files.length > 0
                  ? t(`${files.length} ملف مختار`, `${files.length} file(s) selected`)
                  : t('اضغط لاختيار الملفات (PDF, PNG, XLSX, DOCX)', 'Click to select files (PDF, PNG, XLSX, DOCX)')}
              </span>
            </label>
            {files.length > 0 && (
              <ul className={styles.fileList}>
                {files.map((f, i) => (
                  <li key={i} className={styles.fileItem}>
                    <span className={styles.fileIcon}>📄</span>
                    <span className={styles.fileName}>{f.name}</span>
                    <span className={styles.fileSize}>({(f.size / 1024).toFixed(0)} KB)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={handleClose}
              disabled={isUploading}
            >
              {t('إلغاء', 'Cancel')}
            </button>
            <button
              type="submit"
              className={styles.uploadBtn}
              disabled={isUploading}
            >
              {isUploading
                ? t('جاري الرفع...', 'Uploading...')
                : t('رفع', 'Upload')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

EvidenceUploadModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  lang: PropTypes.oneOf(['ar', 'en']),
};

export default EvidenceUploadModal;
