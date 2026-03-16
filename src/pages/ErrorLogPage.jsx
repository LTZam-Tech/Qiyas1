import { useState, useEffect, useMemo } from 'react';
import styles from './ErrorLogPage.module.css';
import errorLogger from '../services/errorLogger.js';
import { Icons } from '../utils/icons.jsx';

const ErrorLogPage = () => {
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
    if (confirm('Are you sure you want to clear all error logs?')) {
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
    return date.toLocaleString();
  };

  const getSeverityClass = (severity) => {
    switch (severity) {
      case 'error': return styles.severityError;
      case 'warning': return styles.severityWarning;
      case 'info': return styles.severityInfo;
      default: return '';
    }
  };

  const getSourceBadge = (source) => {
    const badges = {
      frontend: { icon: Icons.monitor, color: '#3b82f6' },
      backend: { icon: Icons.settings, color: '#10b981' },
      database: { icon: Icons.database, color: '#f59e0b' },
      unknown: { icon: Icons.question, color: '#6b7280' },
    };
    return badges[source] || badges.unknown;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{Icons.dashboard} Error Logs</h1>
        <button className={styles.clearButton} onClick={handleClearAll} aria-label="Clear all error logs">
          Clear All
        </button>
      </div>

      {isInitializing ? <div className={styles.noErrors}>Loading error logs...</div> : null}

      {stats && (
        <div className={styles.stats}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.total}</span>
            <span className={styles.statLabel}>Total Errors</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.last24h}</span>
            <span className={styles.statLabel}>Last 24 Hours</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.lastHour}</span>
            <span className={styles.statLabel}>Last Hour</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.bySeverity.error}</span>
            <span className={styles.statLabel}>Errors</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.bySeverity.warning}</span>
            <span className={styles.statLabel}>Warnings</span>
          </div>
        </div>
      )}

      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Search errors..."
          className={styles.searchInput}
          aria-label="Search errors"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        
        <select
          className={styles.filterSelect}
          aria-label="Filter by source"
          value={filters.source}
          onChange={(e) => setFilters({ ...filters, source: e.target.value })}
        >
          <option value="all">All Sources</option>
          <option value="frontend">Frontend</option>
          <option value="backend">Backend</option>
          <option value="database">Database</option>
        </select>

        <select
          className={styles.filterSelect}
          aria-label="Filter by severity"
          value={filters.severity}
          onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
        >
          <option value="all">All Severities</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </div>

      <div className={styles.content}>
        <div className={styles.errorList}>
          {filteredErrors.length === 0 ? (
            <div className={styles.noErrors}>
              <p>{Icons.checkLarge} No errors found</p>
              {errors.length > 0 && <p>Try adjusting your filters</p>}
            </div>
          ) : (
            filteredErrors.map((error) => {
              const badge = getSourceBadge(error.source);
              return (
                <div
                  key={error.id}
                  className={`${styles.errorItem} ${selectedError?.id === error.id ? styles.selected : ''}`}
                  onClick={() => setSelectedError(error)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Error ${error.source} ${error.severity}: ${error.message}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedError(error);
                    }
                  }}
                >
                  <div className={styles.errorHeader}>
                    <span
                      className={styles.sourceBadge}
                      style={{ backgroundColor: badge.color }}
                    >
                      {badge.icon} {error.source}
                    </span>
                    <span className={`${styles.severityBadge} ${getSeverityClass(error.severity)}`}>
                      {error.severity}
                    </span>
                  </div>
                  <div className={styles.errorMessage}>{error.message}</div>
                  <div className={styles.errorTime}>{formatTimestamp(error.timestamp)}</div>
                </div>
              );
            })
          )}
        </div>

        {selectedError && (
          <div className={styles.errorDetails}>
            <div className={styles.detailsHeader}>
              <h3>Error Details</h3>
              <button
                className={styles.deleteButton}
                onClick={() => handleDeleteError(selectedError.id)}
                aria-label="Delete selected error"
              >
                Delete
              </button>
            </div>

            <div className={styles.detailsContent}>
              <div className={styles.detailRow}>
                <strong>ID:</strong>
                <code>{selectedError.id}</code>
              </div>
              <div className={styles.detailRow}>
                <strong>Timestamp:</strong>
                <span>{formatTimestamp(selectedError.timestamp)}</span>
              </div>
              <div className={styles.detailRow}>
                <strong>Source:</strong>
                <span>{selectedError.source}</span>
              </div>
              <div className={styles.detailRow}>
                <strong>Severity:</strong>
                <span className={getSeverityClass(selectedError.severity)}>
                  {selectedError.severity}
                </span>
              </div>
              <div className={styles.detailRow}>
                <strong>Type:</strong>
                <span>{selectedError.type}</span>
              </div>
              <div className={styles.detailRow}>
                <strong>Message:</strong>
                <span>{selectedError.message}</span>
              </div>

              {selectedError.url && (
                <div className={styles.detailRow}>
                  <strong>URL:</strong>
                  <code className={styles.codeBlock}>{selectedError.url}</code>
                </div>
              )}

              {selectedError.details && Object.keys(selectedError.details).length > 0 && (
                <div className={styles.detailRow}>
                  <strong>Details:</strong>
                  <pre className={styles.codeBlock}>
                    {JSON.stringify(selectedError.details, null, 2)}
                  </pre>
                </div>
              )}

              {selectedError.stack && (
                <div className={styles.detailRow}>
                  <strong>Stack Trace:</strong>
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

export default ErrorLogPage;
