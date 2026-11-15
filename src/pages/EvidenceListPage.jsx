import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import useEvidenceFiles from '../hooks/useEvidenceFiles.js';
import { downloadEvidenceFile } from '../services/evidenceService.js';
import PageHeader from '../components/PageHeader.jsx';
import StateView from '../components/StateView.jsx';
import Badge from '../components/Badge.jsx';
import { Icons } from '../utils/icons.jsx';
import styles from './EvidenceListPage.module.css';
import { localeOf, makePick, makeT, pickName } from '../i18n/index.js';

const FILE_KINDS = {
  pdf: { label: 'PDF', tone: 'danger' },
  doc: { label: 'DOC', tone: 'info' },
  docx: { label: 'DOC', tone: 'info' },
  xls: { label: 'XLS', tone: 'success' },
  xlsx: { label: 'XLS', tone: 'success' },
  png: { label: 'IMG', tone: 'gold' },
  jpg: { label: 'IMG', tone: 'gold' },
  jpeg: { label: 'IMG', tone: 'gold' },
};

const fileKind = (name = '') => FILE_KINDS[name.split('.').pop()?.toLowerCase()] || { label: 'FILE', tone: 'neutral' };

const STATUS_FOR_BADGE = { approved: 'approved', partial: 'submitted', non: 'submitted', rejected: 'reject' };

export default function EvidenceListPage({ lang = 'ar', isMobile = false }) {
  const t = makeT(lang);
  const { data: files, isLoading, error } = useEvidenceFiles();
  const [searchTerm, setSearchTerm] = useState('');

  const pickData = makePick(lang);
  const pick = (ar, en) => pickData(ar, en) || '—';

  const filteredFiles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return files;
    return files.filter((f) =>
      [f.original_filename, f.standard_title, f.standard_title_en, f.standard_code, f.uploaded_by_name, f.uploaded_by_name_en, f.domain_title, f.domain_title_en]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [files, searchTerm]);

  const handleDownload = async (submissionId, fileId) => {
    try {
      await downloadEvidenceFile(submissionId, fileId);
    } catch (err) {
      console.error('Download failed', err);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(localeOf(lang), { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const fileCell = (file) => {
    const kind = fileKind(file.original_filename);
    return (
      <div className={styles.fileCell}>
        <span className={`q-tone-${kind.tone} ${styles.fileKind}`}>{kind.label}</span>
        <div className={styles.fileText}>
          <span className={styles.fileName} title={file.original_filename}>{file.original_filename}</span>
          <span className={styles.fileSub}><bdi>{pickName(lang, file.uploaded_by_name, file.uploaded_by_name_en) || '—'}</bdi> · <bdi>{formatDate(file.uploaded_at)}</bdi></span>
        </div>
      </div>
    );
  };

  const downloadBtn = (file) => (
    <button
      type="button"
      onClick={() => handleDownload(file.submission_id, file.file_id)}
      className="q-icon-btn"
      aria-label={t(`تحميل ${file.original_filename}`, `Download ${file.original_filename}`, `${file.original_filename} ڈاؤن لوڈ کریں`)}
      title={t('تحميل الملف', 'Download file')}
    >
      {Icons.download}
    </button>
  );

  let body;
  if (isLoading) body = <StateView kind="loading" message={t('جاري تحميل الملفات...', 'Loading files...')} />;
  else if (error) body = <StateView kind="error" title={t('تعذر تحميل الملفات', 'Could not load files')} message={error} />;
  else if (filteredFiles.length === 0) {
    body = (
      <StateView
        icon="folderIcon"
        title={searchTerm ? t('لا توجد ملفات مطابقة', 'No matching files') : t('لا توجد ملفات بعد', 'No files yet')}
        message={searchTerm ? t('جرّب كلمة بحث أخرى.', 'Try a different search term.') : undefined}
      />
    );
  } else if (isMobile) {
    body = (
      <ul className={styles.cards}>
        {filteredFiles.map((file) => (
          <li key={file.file_id} className={styles.cardItem}>
            {fileCell(file)}
            <div className={styles.cardMeta}>
              <span className="q-code">{file.standard_code || '—'}</span>
              <span className={styles.cardStd}>{pick(file.standard_title, file.standard_title_en)}</span>
              {downloadBtn(file)}
            </div>
          </li>
        ))}
      </ul>
    );
  } else {
    body = (
      <div className="q-table-wrap">
        <table className="q-table">
          <thead>
            <tr>
              <th>{t('الملف', 'File')}</th>
              <th>{t('المعيار', 'Standard')}</th>
              <th>{t('المنظور / المحور', 'Perspective / axis')}</th>
              <th>{t('الحالة', 'Status')}</th>
              <th><span className="q-sr-only">{t('الإجراءات', 'Actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredFiles.map((file) => (
              <tr key={file.file_id}>
                <td>{fileCell(file)}</td>
                <td>
                  <div className={styles.stdCell}>
                    {file.standard_code ? <span className="q-code">{file.standard_code}</span> : null}
                    <span>{pick(file.standard_title, file.standard_title_en)}</span>
                  </div>
                </td>
                <td className="q-cell-muted">
                  <div className={styles.pathCell}>
                    <span>{pick(file.domain_title, file.domain_title_en)}</span>
                    <span className={styles.fileSub}>{pick(file.axis_title, file.axis_title_en)}</span>
                  </div>
                </td>
                <td><Badge status={STATUS_FOR_BADGE[file.status] || 'submitted'} lang={lang} /></td>
                <td className={styles.actionsCell}>{downloadBtn(file)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="q-page">
      <PageHeader
        title={t('سجل الملفات', 'Files ledger')}
        subtitle={t('كل ملف مرفوع كشاهد، مع معياره ومن رفعه ومتى.', 'Every file uploaded as evidence, with its standard, uploader and date.')}
      />
      <section className="q-card">
        <div className={styles.toolbar}>
          <span className={styles.total}>
            {isLoading ? '' : t(`${filteredFiles.length} ملف`, `${filteredFiles.length} file${filteredFiles.length === 1 ? '' : 's'}`, `${filteredFiles.length} ${filteredFiles.length === 1 ? 'فائل' : 'فائلیں'}`)}
          </span>
          <label className={`q-search ${styles.search}`}>
            {Icons.searchIcon}
            <span className="q-sr-only">{t('بحث في الملفات', 'Search files')}</span>
            <input
              type="search"
              className="q-input"
              placeholder={t('بحث بالاسم أو المعيار أو الشخص...', 'Search by name, standard or person...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
        </div>
        {body}
      </section>
    </div>
  );
}

EvidenceListPage.propTypes = {
  lang: PropTypes.oneOf(['ar', 'en', 'ur']),
  isMobile: PropTypes.bool,
};
