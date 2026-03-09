import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Icons } from '../utils/icons.jsx';
import useEvidenceData from '../hooks/useEvidenceData.js';
import { downloadEvidenceFile } from '../services/evidenceService.js';
import styles from './EvidenceListPage.module.css';

export default function EvidenceListPage({ lang = 'ar' }) {
  const { data: files, isLoading, error } = useEvidenceData();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredFiles = useMemo(() => {
    if (!searchTerm) return files;
    const term = searchTerm.toLowerCase();
    return files.filter(f => 
      f.original_filename?.toLowerCase().includes(term) ||
      f.standard_title?.toLowerCase().includes(term) ||
      f.standard_title_en?.toLowerCase().includes(term) ||
      f.uploaded_by_name?.toLowerCase().includes(term)
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
    const date = new Date(dateStr);
    return date.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          {lang === 'ar' ? 'سجل الأدلة والمرفقات' : 'Evidence & Files Ledger'}
        </h2>
        <div className={styles.searchWrapper}>
          {Icons.searchIcon}
          <input
            type="text"
            placeholder={lang === 'ar' ? 'بحث في الملفات...' : 'Search files...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableResponsive}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{lang === 'ar' ? 'اسم الملف' : 'File Name'}</th>
                <th>{lang === 'ar' ? 'المجال' : 'Domain'}</th>
                <th>{lang === 'ar' ? 'المحور' : 'Axis'}</th>
                <th>{lang === 'ar' ? 'المعيار' : 'Standard'}</th>
                <th>{lang === 'ar' ? 'بواسطة' : 'Uploaded By'}</th>
                <th>{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th className={styles.actionsHeader}>{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="7" className={styles.loadingCell}>
                    {lang === 'ar' ? 'جاري تحميل البيانات...' : 'Loading data...'}
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="7" className={styles.errorCell}>{error}</td>
                </tr>
              ) : filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan="7" className={styles.emptyCell}>
                    {lang === 'ar' ? 'لا توجد ملفات مطابقة' : 'No matching files found'}
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => (
                  <tr key={file.file_id}>
                    <td className={styles.fileNameCell}>
                      <div className={styles.fileIconWrapper}>
                        {Icons.documentIcon}
                      </div>
                      <span title={file.original_filename}>{file.original_filename}</span>
                    </td>
                    <td>{lang === 'ar' ? (file.domain_title || '—') : (file.domain_title_en || file.domain_title || '—')}</td>
                    <td>{lang === 'ar' ? (file.axis_title || '—') : (file.axis_title_en || file.axis_title || '—')}</td>
                    <td>
                      <div className={styles.standardCell}>
                        {lang === 'ar' ? (file.standard_title || '—') : (file.standard_title_en || file.standard_title || '—')}
                      </div>
                    </td>
                    <td>{file.uploaded_by_name || '—'}</td>
                    <td className={styles.dateCell}>{formatDate(file.uploaded_at)}</td>
                    <td className={styles.actionsCell}>
                      <button
                        onClick={() => handleDownload(file.submission_id, file.file_id)}
                        className={styles.downloadBtn}
                        title={lang === 'ar' ? 'تحميل الملف' : 'Download file'}
                      >
                        {Icons.download}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

EvidenceListPage.propTypes = {
  lang: PropTypes.oneOf(['ar', 'en'])
};
