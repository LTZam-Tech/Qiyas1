import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Icons } from '../utils/icons.jsx';
import Badge from '../components/Badge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StateView from '../components/StateView.jsx';
import EvidenceUploadModal from '../components/EvidenceUploadModal.jsx';
import useEvidenceData from '../hooks/useEvidenceData.js';
import useToast from '../hooks/useToast.js';
import useAuth from '../context/useAuth.js';
import { canAccessPage } from '../utils/permissions.js';
import styles from './EvidencePage.module.css';
import { makeT } from '../i18n/index.js';

// A standard's state comes from its files: all approved = full, some = partial, none = non.
const deriveStatus = (item) => {
  if (item.reqCount > 0 && item.approved >= item.reqCount) return 'full';
  if (item.approved > 0) return 'partial';
  return 'non';
};

const FILTERS = [
  ['all', 'الكل', 'All'],
  ['full', 'مكتملة', 'Complete'],
  ['partial', 'جزئية', 'Partial'],
  ['non', 'بلا اعتماد', 'Not approved'],
];

const EvidencePage = ({ lang, onNavigate }) => {
  const t = makeT(lang);
  const { data, isLoading, error, reload } = useEvidenceData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const canUpload = user?.role !== 'dean'; // Dean has view-only access to the evidence locker

  const items = useMemo(() => (data || []).map((item) => ({ ...item, state: deriveStatus(item) })), [data]);
  const counts = useMemo(() => {
    const c = { all: items.length, full: 0, partial: 0, non: 0 };
    items.forEach((i) => { c[i.state] += 1; });
    return c;
  }, [items]);
  const visible = filter === 'all' ? items : items.filter((i) => i.state === filter);

  const handleUploadSuccess = () => {
    if (typeof reload === 'function') reload();
    showToast(t('تم رفع الملفات بنجاح', 'Files uploaded'));
  };

  const uploadButton = canUpload ? (
    <button type="button" className="q-btn q-btn-primary" onClick={() => setIsModalOpen(true)} aria-label={t('رفع شاهد جديد', 'Upload New Evidence')}>
      {Icons.upload}
      {t('رفع شاهد', 'Upload evidence')}
    </button>
  ) : null;

  return (
    <div className="q-page">
      <PageHeader
        title={t('خزنة الأدلة', 'Evidence locker')}
        subtitle={t('حالة الأدلة لكل معيار. المعيار يكتمل عند اعتماد جميع ملفاته.', 'Evidence status per standard. A standard is complete when all its files are approved.')}
        actions={
          <>
            {onNavigate && canAccessPage('evidence-list', user?.role) && (
              <button type="button" className="q-btn q-btn-secondary" onClick={() => onNavigate('evidence-list')}>
                {Icons.list}
                {t('سجل الملفات', 'Files ledger')}
              </button>
            )}
            {uploadButton}
          </>
        }
      />

      {!isLoading && !error && items.length > 0 && (
        <div className="q-seg" role="group" aria-label={t('فلترة حسب الحالة', 'Filter by status')}>
          {FILTERS.map(([key, ar, en]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {t(ar, en)}
              <span className={styles.count}>{counts[key]}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className={styles.grid}>
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="q-skeleton" style={{ height: 168, borderRadius: 16 }} />)}
        </div>
      ) : error ? (
        <div className="q-card"><StateView kind="error" title={t('تعذر تحميل الأدلة', 'Could not load evidence')} message={error} /></div>
      ) : items.length === 0 ? (
        <div className="q-card">
          <StateView
            icon="archive"
            title={t('لا توجد أدلة بعد', 'No evidence yet')}
            message={t('ابدأ برفع أول ملف لمعيار.', 'Start by uploading the first file for a standard.')}
            action={uploadButton}
          />
        </div>
      ) : (
        <div className={styles.grid}>
          {visible.map((item) => {
            const pct = item.reqCount ? Math.round((item.approved / item.reqCount) * 100) : 0;
            return (
              <article key={item.code} className={`q-card ${styles.card}`}>
                <div className={styles.cardHead}>
                  <span className="q-code">{item.code}</span>
                  <Badge status={item.state} lang={lang} />
                </div>
                <h3 className={styles.title}>{t(item.title, item.titleEn)}</h3>
                <div className={styles.progress}>
                  <ProgressBar value={pct} height={6} label={t('نسبة الاعتماد', 'Approval progress')} />
                  <div className={styles.meta}>
                    <span>{t(`${item.approved} من ${item.reqCount} ملفات معتمدة`, `${item.approved} of ${item.reqCount} files approved`, `${item.reqCount} میں سے ${item.approved} فائلیں منظور شدہ`)}</span>
                    <b>{pct}%</b>
                  </div>
                </div>
              </article>
            );
          })}
          {canUpload && (
            <button type="button" className={styles.addCard} onClick={() => setIsModalOpen(true)}>
              <span className={styles.addIcon}>{Icons.plus}</span>
              <span className={styles.addTitle}>{t('رفع شاهد جديد', 'Upload new evidence')}</span>
              <span className={styles.addHint}>{t('اختر المنظور والمعيار ثم الملفات', 'Pick perspective, standard, then files')}</span>
            </button>
          )}
        </div>
      )}

      <EvidenceUploadModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={handleUploadSuccess} lang={lang} />
      {toast}
    </div>
  );
};

EvidencePage.propTypes = {
  isMobile: PropTypes.bool,
  lang: PropTypes.oneOf(['ar', 'en', 'ur']).isRequired,
  onNavigate: PropTypes.func,
};

export default EvidencePage;
