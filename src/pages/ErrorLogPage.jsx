import { useState, useEffect } from 'react';
import styles from './ErrorLogPage.module.css';
import errorLogger from '../services/errorLogger.js';

const ErrorLogPage = () => {
  const [errors, setErrors] = useState([]);
  const [filteredErrors, setFilteredErrors] = useState([]);
  const [selectedError, setSelectedError] = useState(null);
  const [filters, setFilters] = useState({
    source: 'all',
    severity: 'all',
    search: '',
  });
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // Load initial errors
    loadErrors();

    // Subscribe to new errors
    const unsubscribe = errorLogger.subscribe(() => {
      loadErrors();
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    applyFilters();
  }, [errors, filters]);

  const loadErrors = () => {
    const allErrors = errorLogger.getAllErrors();
    const errorStats = errorLogger.getStats();
    setErrors(allErrors);
    setStats(errorStats);
  };

  const applyFilters = () => {
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

    setFilteredErrors(filtered);
  };

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
      frontend: { emoji: '🖥️', color: '#3b82f6' },
      backend: { emoji: '⚙️', color: '#10b981' },
      database: { emoji: '🗄️', color: '#f59e0b' },
      unknown: { emoji: '❓', color: '#6b7280' },
    };
    return badges[source] || badges.unknown;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>📊 Error Logs</h1>
        <button className={styles.clearButton} onClick={handleClearAll}>
          🗑️ Clear All
        </button>
      </div>

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
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        
        <select
          className={styles.filterSelect}
          value={filters.source}
          onChange={(e) => setFilters({ ...filters, source: e.target.value })}
        >
          <option value="all">All Sources</option>
          <option value="frontend">🖥️ Frontend</option>
          <option value="backend">⚙️ Backend</option>
          <option value="database">🗄️ Database</option>
        </select>

        <select
          className={styles.filterSelect}
          value={filters.severity}
          onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
        >
          <option value="all">All Severities</option>
          <option value="error">🔴 Error</option>
          <option value="warning">🟡 Warning</option>
          <option value="info">🔵 Info</option>
        </select>
      </div>

      <div className={styles.content}>
        <div className={styles.errorList}>
          {filteredErrors.length === 0 ? (
            <div className={styles.noErrors}>
              <p>✅ No errors found</p>
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
                >
                  <div className={styles.errorHeader}>
                    <span
                      className={styles.sourceBadge}
                      style={{ backgroundColor: badge.color }}
                    >
                      {badge.emoji} {error.source}
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
              >
                🗑️ Delete
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
