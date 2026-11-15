import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import styles from './ErrorLogPage.module.css';
import errorLogger from '../services/errorLogger.js';
import { Icons } from '../utils/icons.jsx';
import { localeOf, makeT } from '../i18n/index.js';

const svgProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const StatIcons = {
  list: (
    <svg {...svgProps}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
  ),
  calendar: (
    <svg {...svgProps}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
  ),
  clock: (
    <svg {...svgProps}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
  ),
  error: (
    <svg {...svgProps}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
  ),
  warning: (
    <svg {...svgProps}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
  ),
  trash: (
    <svg {...svgProps}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
  ),
  checkCircle: (
    <svg {...svgProps}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
  ),
};

const SEVERITY_LABELS = {
  all: { ar: 'الكل', en: 'All' },
  error: { ar: 'خطأ', en: 'Error' },
  warning: { ar: 'تحذير', en: 'Warning' },
  info: { ar: 'معلومة', en: 'Info' },
};

const SEVERITY_FILTERS = ['all', 'error', 'warning', 'info'];

const SOURCE_LABELS = {
  all: { ar: 'كل المصادر', en: 'All sources' },
  frontend: { ar: 'الواجهة', en: 'Frontend' },
  backend: { ar: 'الخادم', en: 'Backend' },
  database: { ar: 'قاعدة البيانات', en: 'Database' },
  unknown: { ar: 'غير معروف', en: 'Unknown' },
};

const ErrorLogPage = ({ lang = 'ar' }) => {
  const t = makeT(lang);
  const severityLabel = (s) => (SEVERITY_LABELS[s] ? t(SEVERITY_LABELS[s].ar, SEVERITY_LABELS[s].en) : s);
  const sourceLabel = (s) => {
    const l = SOURCE_LABELS[s] || SOURCE_LABELS.unknown;
    return t(l.ar, l.en);
  };
  const [errors, setErrors] = useState(() => errorLogger.getAllErrors());
  const [selectedError, setSelectedError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [filters, setFilters] = useState({
    source: 'all',
    severity: 'all',
    search: '',
  });
  const [stats, setStats] = useState(() => errorLogger.getStats());

  useEffect(() => {
    setIsInitializing(true);

    setErrors(errorLogger.getAllErrors());
    setStats(errorLogger.getStats());

    // Subscribe to new errors from the external system
    const unsubscribe = errorLogger.subscribe(() => {
      setErrors(errorLogger.getAllErrors());
      setStats(errorLogger.getStats());
    });

    setIsInitializing(false);

    return unsubscribe;
  }, []);

  const filteredErrors = useMemo(() => {
    let filtered = [...errors];

    if (filters.source !== 'all') {
      filtered = filtered.filter(e => e.source === filters.source);
    }

    if (filters.severity !== 'all') {
      filtered = filtered.filter(e => e.severity === filters.severity);
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(e =>
        e.message.toLowerCase().includes(search) ||
        JSON.stringify(e.details).toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [errors, filters]);

  const handleClearAll = () => {
    if (window.confirm(t('هل أنت متأكد من مسح جميع سجلات الأخطاء؟', 'Are you sure you want to clear all error logs?'))) {
      errorLogger.clearErrors();
      setSelectedError(null);
    }
  };

  const handleDeleteError = (id) => {
    errorLogger.clearErrorById(id);
    if (selectedError?.id === id) {
      setSelectedError(null);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString(localeOf(lang), { dateStyle: 'medium', timeStyle: 'short' });
  };

  const getSeverityTone = (severity) => {
    switch (severity) {
      case 'error': return 'q-tone-danger';
      case 'warning': return 'q-tone-warning';
      case 'info': return 'q-tone-info';
      default: return 'q-tone-neutral';
    }
  };

  const getSourceBadge = (source) => {
    const badges = {
      frontend: { icon: Icons.monitor, tone: 'q-tone-info' },
      backend: { icon: Icons.settings, tone: 'q-tone-brand' },
      database: { icon: Icons.database, tone: 'q-tone-gold' },
      unknown: { icon: Icons.question, tone: 'q-tone-neutral' },
    };
    return badges[source] || badges.unknown;
  };

  const statTiles = stats
    ? [
        { key: 'total', label: t('الإجمالي', 'Total entries'), value: stats.total, tone: 'q-tone-brand', icon: StatIcons.list },
        { key: 'last24h', label: t('آخر 24 ساعة', 'Last 24 hours'), value: stats.last24h, tone: 'q-tone-info', icon: StatIcons.calendar },
        { key: 'lastHour', label: t('آخر ساعة', 'Last hour'), value: stats.lastHour, tone: 'q-tone-neutral', icon: StatIcons.clock },
        { key: 'errors', label: t('أخطاء', 'Errors'), value: stats.bySeverity.error, tone: 'q-tone-danger', icon: StatIcons.error },
        { key: 'warnings', label: t('تحذيرات', 'Warnings'), value: stats.bySeverity.warning, tone: 'q-tone-warning', icon: StatIcons.warning },
      ]
    : [];

  return (
    <div className={`q-page ${styles.container}`}>
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('سجل الأخطاء', 'Error log')}</h1>
          <p className="q-page-sub">{t('أخطاء الواجهة والخادم وقاعدة البيانات التي رصدها النظام.', 'Client, server and database errors captured by the portal.')}</p>
        </div>
        <div className="q-page-actions">
          <button
            type="button"
            className="q-btn q-btn-danger"
            onClick={handleClearAll}
            aria-label={t('مسح جميع سجلات الأخطاء', 'Clear all error logs')}
          >
            {StatIcons.trash}
            {t('مسح الكل', 'Clear all')}
          </button>
        </div>
      </div>

      {isInitializing ? <div className="q-state">{t('جاري تحميل سجل الأخطاء...', 'Loading error logs...')}</div> : null}

      {stats && (
        <div className={styles.stats}>
          {statTiles.map((tile) => (
            <div key={tile.key} className={`q-card ${styles.statCard}`}>
              <span className={`q-icon-chip ${tile.tone} ${styles.statChip}`} aria-hidden="true">
                {tile.icon}
              </span>
              <div className={styles.statText}>
                <span className={styles.statLabel}>{tile.label}</span>
                <span className={styles.statValue}>{tile.value}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.filters}>
        <div className={`q-search ${styles.searchBox}`}>
          {Icons.searchIcon}
          <input
            type="text"
            placeholder={t('بحث في الأخطاء...', 'Search errors...')}
            className="q-input"
            aria-label={t('بحث في الأخطاء', 'Search errors')}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>

        <select
          className={`q-input ${styles.filterSelect}`}
          aria-label={t('تصفية حسب المصدر', 'Filter by source')}
          value={filters.source}
          onChange={(e) => setFilters({ ...filters, source: e.target.value })}
        >
          {['all', 'frontend', 'backend', 'database'].map((s) => (
            <option key={s} value={s}>{sourceLabel(s)}</option>
          ))}
        </select>

        <div className="q-seg" role="group" aria-label={t('تصفية حسب الخطورة', 'Filter by severity')}>
          {SEVERITY_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filters.severity === value}
              onClick={() => setFilters({ ...filters, severity: value })}
            >
              {severityLabel(value)}
            </button>
          ))}
        </div>
      </div>

      <div className={`${styles.content} ${selectedError ? styles.contentSplit : ''}`}>
        <div className={`q-card ${styles.errorList}`}>
          <div className={styles.listHead}>
            <span className="q-section-title">{t('السجلات', 'Entries')}</span>
            <span className={styles.count}>{filteredErrors.length}</span>
          </div>
          {filteredErrors.length === 0 ? (
            <div className="q-state">
              <span className="q-state-icon">{StatIcons.checkCircle}</span>
              <p className="q-state-title">{t('لا توجد أخطاء', 'No errors found')}</p>
              {errors.length > 0 && <p>{t('جرّب تغيير عوامل التصفية.', 'Try adjusting your filters.')}</p>}
            </div>
          ) : (
            <div className={styles.items}>
              {filteredErrors.map((error) => {
                const badge = getSourceBadge(error.source);
                const isSelected = selectedError?.id === error.id;
                return (
                  <div
                    key={error.id}
                    className={`${styles.errorItem} ${isSelected ? styles.selected : ''}`}
                    onClick={() => setSelectedError(error)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${severityLabel(error.severity)} · ${sourceLabel(error.source)}: ${error.message}`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedError(error);
                      }
                    }}
                  >
                    <div className={styles.errorHeader}>
                      <span className={`q-badge ${getSeverityTone(error.severity)}`}>
                        {severityLabel(error.severity)}
                      </span>
                      <span className={`${styles.sourceTag} ${badge.tone}`}>
                        {badge.icon}
                        {sourceLabel(error.source)}
                      </span>
                      <span className={styles.errorTime}>{formatTimestamp(error.timestamp)}</span>
                    </div>
                    <div className={styles.errorMessage} dir="auto">{error.message}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedError && (
          <div className={`q-card ${styles.errorDetails}`}>
            <div className={styles.detailsHeader}>
              <div>
                <h3 className="q-section-title">{t('تفاصيل الخطأ', 'Error details')}</h3>
                <p className="q-section-sub">{formatTimestamp(selectedError.timestamp)}</p>
              </div>
              <button
                type="button"
                className="q-btn q-btn-danger q-btn-sm"
                onClick={() => handleDeleteError(selectedError.id)}
                aria-label={t('حذف الخطأ المحدد', 'Delete selected error')}
              >
                {StatIcons.trash}
                {t('حذف', 'Delete')}
              </button>
            </div>

            <div className={styles.detailsContent}>
              <dl className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <dt>{t('المعرّف', 'ID')}</dt>
                  <dd><code className={styles.idCode}>{selectedError.id}</code></dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>{t('الخطورة', 'Severity')}</dt>
                  <dd>
                    <span className={`q-badge ${getSeverityTone(selectedError.severity)}`}>
                      {severityLabel(selectedError.severity)}
                    </span>
                  </dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>{t('المصدر', 'Source')}</dt>
                  <dd>{sourceLabel(selectedError.source)}</dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>{t('النوع', 'Type')}</dt>
                  <dd dir="auto">{selectedError.type || '-'}</dd>
                </div>
              </dl>

              <div className={styles.detailRow}>
                <strong>{t('الرسالة', 'Message')}</strong>
                <span className={styles.messageText} dir="auto">{selectedError.message}</span>
              </div>

              {selectedError.url && (
                <div className={styles.detailRow}>
                  <strong>{t('الرابط', 'URL')}</strong>
                  <code className={styles.codeBlock}>{selectedError.url}</code>
                </div>
              )}

              {selectedError.details && Object.keys(selectedError.details).length > 0 && (
                <div className={styles.detailRow}>
                  <strong>{t('التفاصيل', 'Details')}</strong>
                  <pre className={styles.codeBlock}>
                    {JSON.stringify(selectedError.details, null, 2)}
                  </pre>
                </div>
              )}

              {selectedError.stack && (
                <div className={styles.detailRow}>
                  <strong>{t('تتبع الاستدعاءات', 'Stack trace')}</strong>
                  <pre className={styles.codeBlock}>{selectedError.stack}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

ErrorLogPage.propTypes = {
  lang: PropTypes.oneOf(['ar', 'en', 'ur']),
};

export default ErrorLogPage;
