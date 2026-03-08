import { useState } from 'react';
import PropTypes from 'prop-types';
import styles from './LoginPage.module.css';
import { env } from '../config/env.js';

const getBackendPortLabel = () => {
  try {
    const url = new URL(env.apiBaseUrl, window.location.origin);
    return url.port || '8082';
  } catch {
    return '8082';
  }
};

/**
 * LoginPage — Entry point for authenticated access.
 *
 * Props:
 *   onLogin   {Function} - Called with { email, password } on form submit.
 *                          Should return a Promise; rejection triggers the error UI.
 *   isLoading {boolean}  - When true, disables inputs and shows a loading label
 *                          on the submit button (controlled by the parent/AuthContext).
 *   lang      {string}   - 'ar' for Arabic or 'en' for English
 */
const LoginPage = ({ onLogin, isLoading, lang = 'ar' }) => {
  // Keep fields empty by default to avoid exposing credentials in source/runtime.
  const [credentials, setCredentials] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Handles form submission — delegates the actual auth call to onLogin (AuthContext).
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!credentials.email || !credentials.password) {
      setError(lang === 'ar' ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور' : 'Please enter email and password');
      return;
    }

    try {
      await onLogin(credentials);
      // On success the parent (App.jsx) replaces this page with the main layout.
    } catch (err) {
      // Map common network / HTTP errors to user-friendly messages.
      let userMessage = 'Login failed. Please try again.';

      if (err.name === 'AbortError' || err.message.includes('timeout')) {
        userMessage = 'Connection timeout. Please check your network.';
      } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        userMessage = `Cannot connect to server. Please ensure backend is running on port ${getBackendPortLabel()}.`;
      } else if (err.status === 401) {
        userMessage = 'Invalid email or password.';
      } else if (err.status === 404) {
        userMessage = 'Login endpoint not found.';
      } else if (err.message) {
        userMessage = err.message;
      }
      
      setError(userMessage);
    }
  };

  // Syncs each input field into state and clears any existing error on change.
  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (error) setError('');
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginBox}>
        {/* Brand header */}
        <h1 className={styles.title}>Qiyas Platform</h1>
        <p className={styles.subtitle}>Quality &amp; Compliance Management</p>

        <form className={styles.loginForm} onSubmit={handleSubmit}>
          {/* Email field */}
          <div className={styles.formGroup}>
            <label htmlFor="email">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
            <input
              id="email"
              name="email"
              type="email"
              value={credentials.email}
              onChange={handleChange}
              className={styles.input}
              placeholder={lang === 'ar' ? 'user@example.com' : 'user@domain.com'}
              disabled={isLoading}
              required
            />
          </div>

          {/* Password field with show/hide toggle */}
          <div className={styles.formGroup}>
            <label htmlFor="password">{lang === 'ar' ? 'كلمة المرور' : 'Password'}</label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={credentials.password}
                onChange={handleChange}
                className={styles.input}
                placeholder={lang === 'ar' ? '••••••••' : '••••••••'}
                disabled={isLoading}
                required
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Inline error message (role="alert" for screen-reader announcements) */}
          {error && <div className={styles.error} role="alert">{error}</div>}

          <button type="submit" className={styles.submitButton} disabled={isLoading}>
            {isLoading ? (lang === 'ar' ? 'جاري تسجيل الدخول...' : 'Logging in...') : (lang === 'ar' ? 'تسجيل الدخول' : 'Login')}
          </button>
        </form>
      </div>
    </div>
  );
};

LoginPage.propTypes = {
  /** Called on form submit with { email, password }. Must return a Promise. */
  onLogin: PropTypes.func.isRequired,
  /** Controls disabled state of inputs and the submit button label. */
  isLoading: PropTypes.bool,
};

export default LoginPage;
