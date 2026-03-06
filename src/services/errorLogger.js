/**
 * Global Error Logging Service
 * Captures and stores all application errors from backend, frontend, and database
 */

class ErrorLogger {
  constructor() {
    this.errors = [];
    this.maxErrors = 500; // Keep last 500 errors
    this.listeners = new Set();
    
    // Initialize with error from localStorage
    this.loadFromStorage();
    
    // Capture unhandled errors
    this.setupGlobalErrorHandlers();
  }

  setupGlobalErrorHandlers() {
    // Capture unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        this.log({
          type: 'unhandled-rejection',
          source: 'frontend',
          message: event.reason?.message || String(event.reason),
          stack: event.reason?.stack,
          timestamp: new Date().toISOString(),
        });
      });

      // Capture global errors
      window.addEventListener('error', (event) => {
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
      });
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

    console.error(`[${errorEntry.severity.toUpperCase()}] ${errorEntry.source}:`, errorEntry.message);
    
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
        body: response.body,
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
        console.error('Error notifying listener:', err);
      }
    });
  }

  saveToStorage() {
    try {
      // Only save last 100 to localStorage to avoid quota
      const toSave = this.errors.slice(0, 100);
      localStorage.setItem('qiyas_error_logs', JSON.stringify(toSave));
    } catch (err) {
      console.error('Failed to save errors to storage:', err);
    }
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('qiyas_error_logs');
      if (saved) {
        this.errors = JSON.parse(saved);
      }
    } catch (err) {
      console.error('Failed to load errors from storage:', err);
    }
  }

  getStats() {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const lastHour = new Date(now - 60 * 60 * 1000);

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
}

// Singleton instance
const errorLogger = new ErrorLogger();

export default errorLogger;
