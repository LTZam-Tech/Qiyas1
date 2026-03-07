/**
 * Global Error Logging Service
 * Captures and stores all application errors from backend, frontend, and database
 */

const MAX_IN_MEMORY_ERRORS = 500;
const MAX_STORED_ERRORS = 100;
const STORAGE_KEY = 'qiyas_error_logs';
const MS_IN_HOUR = 60 * 60 * 1000;
const MS_IN_24_HOURS = 24 * MS_IN_HOUR;
const IS_DEV = typeof import.meta !== 'undefined' ? import.meta.env?.DEV : false;

class ErrorLogger {
  constructor() {
    this.errors = [];
    this.maxErrors = MAX_IN_MEMORY_ERRORS;
    this.listeners = new Set();
    this.cleanupCallbacks = [];
    
    // Initialize with error from localStorage
    this.loadFromStorage();
    
    // Capture unhandled errors
    this.setupGlobalErrorHandlers();
  }

  setupGlobalErrorHandlers() {
    // Capture unhandled promise rejections
    if (typeof window !== 'undefined') {
      const onUnhandledRejection = (event) => {
        this.log({
          type: 'unhandled-rejection',
          source: 'frontend',
          message: event.reason?.message || String(event.reason),
          stack: event.reason?.stack,
          timestamp: new Date().toISOString(),
        });
      };
      window.addEventListener('unhandledrejection', onUnhandledRejection);
      this.cleanupCallbacks.push(() => window.removeEventListener('unhandledrejection', onUnhandledRejection));

      // Capture global errors
      const onGlobalError = (event) => {
        this.log({
          type: 'global-error',
          source: 'frontend',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          timestamp: new Date().toISOString(),
        });
      };
      window.addEventListener('error', onGlobalError);
      this.cleanupCallbacks.push(() => window.removeEventListener('error', onGlobalError));

      // Ensure event handlers are detached on page unload.
      window.addEventListener('beforeunload', () => this.destroy(), { once: true });
    }
  }

  log(error) {
    const errorEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: error.timestamp || new Date().toISOString(),
      type: error.type || 'error',
      source: error.source || 'unknown',
      severity: error.severity || 'error',
      message: error.message || 'Unknown error',
      details: error.details || {},
      stack: error.stack || null,
      url: error.url || (typeof window !== 'undefined' ? window.location.href : null),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    };

    if (IS_DEV) {
      console.error(`[${errorEntry.severity.toUpperCase()}] ${errorEntry.source}:`, errorEntry.message);
    }
    
    this.errors.unshift(errorEntry); // Add to beginning
    
    // Trim to max size
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Save to localStorage
    this.saveToStorage();
    
    // Notify listeners
    this.notifyListeners();
    
    return errorEntry;
  }

  logFrontendError(message, details = {}) {
    return this.log({
      type: 'frontend-error',
      source: 'frontend',
      severity: 'error',
      message,
      details,
      stack: new Error().stack,
    });
  }

  logBackendError(message, response = {}) {
    return this.log({
      type: 'backend-error',
      source: 'backend',
      severity: 'error',
      message,
      details: {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
      },
    });
  }

  logDatabaseError(message, details = {}) {
    return this.log({
      type: 'database-error',
      source: 'database',
      severity: 'error',
      message,
      details,
    });
  }

  logWarning(message, source = 'frontend', details = {}) {
    return this.log({
      type: 'warning',
      source,
      severity: 'warning',
      message,
      details,
    });
  }

  logInfo(message, source = 'frontend', details = {}) {
    return this.log({
      type: 'info',
      source,
      severity: 'info',
      message,
      details,
    });
  }

  getErrors(filters = {}) {
    let filtered = [...this.errors];

    if (filters.source) {
      filtered = filtered.filter(e => e.source === filters.source);
    }

    if (filters.severity) {
      filtered = filtered.filter(e => e.severity === filters.severity);
    }

    if (filters.type) {
      filtered = filtered.filter(e => e.type === filters.type);
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(e => 
        e.message.toLowerCase().includes(search) ||
        JSON.stringify(e.details).toLowerCase().includes(search)
      );
    }

    return filtered;
  }

  getAllErrors() {
    return [...this.errors];
  }

  clearErrors() {
    this.errors = [];
    this.saveToStorage();
    this.notifyListeners();
  }

  clearErrorById(id) {
    this.errors = this.errors.filter(e => e.id !== id);
    this.saveToStorage();
    this.notifyListeners();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.errors);
      } catch (err) {
        if (IS_DEV) {
          console.error('Error notifying listener:', err);
        }
      }
    });
  }

  saveToStorage() {
    try {
      // Only save a bounded window to avoid quota exhaustion.
      const toSave = this.errors.slice(0, MAX_STORED_ERRORS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (err) {
      if (IS_DEV) {
        console.error('Failed to save errors to storage:', err);
      }
    }
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.errors = JSON.parse(saved);
      }
    } catch (err) {
      if (IS_DEV) {
        console.error('Failed to load errors from storage:', err);
      }
    }
  }

  getStats() {
    const now = new Date();
    const last24h = new Date(now.getTime() - MS_IN_24_HOURS);
    const lastHour = new Date(now.getTime() - MS_IN_HOUR);

    return {
      total: this.errors.length,
      last24h: this.errors.filter(e => new Date(e.timestamp) > last24h).length,
      lastHour: this.errors.filter(e => new Date(e.timestamp) > lastHour).length,
      bySeverity: {
        error: this.errors.filter(e => e.severity === 'error').length,
        warning: this.errors.filter(e => e.severity === 'warning').length,
        info: this.errors.filter(e => e.severity === 'info').length,
      },
      bySource: {
        frontend: this.errors.filter(e => e.source === 'frontend').length,
        backend: this.errors.filter(e => e.source === 'backend').length,
        database: this.errors.filter(e => e.source === 'database').length,
      },
    };
  }

  destroy() {
    for (const cleanup of this.cleanupCallbacks) {
      try {
        cleanup();
      } catch {
        // Ignore cleanup failures at shutdown.
      }
    }
    this.cleanupCallbacks = [];
    this.listeners.clear();
  }
}

// Singleton instance
const errorLogger = new ErrorLogger();

export default errorLogger;
