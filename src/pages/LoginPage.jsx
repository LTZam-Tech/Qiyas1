import { useState } from 'react';
import PropTypes from 'prop-types';
import styles from './LoginPage.module.css';

/**
 * LoginPage — Entry point for authenticated access.
 *
 * Props:
 *   onLogin   {Function} - Called with { email, password } on form submit.
 *                          Should return a Promise; rejection triggers the error UI.
 *   isLoading {boolean}  - When true, disables inputs and shows a loading label
 *                          on the submit button (controlled by the parent/AuthContext).
 */
const LoginPage = ({ onLogin, isLoading }) => {
  // Pre-filled with demo credentials for convenience during development.
  const [credentials, setCredentials] = useState({
    email: 'dean@university.edu',
    password: 'DeanPass123',
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Handles form submission — delegates the actual auth call to onLogin (AuthContext).
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!credentials.email || !credentials.password) {
      setError('Please enter email and password');
      return;
    }

    try {
      await onLogin(credentials);
      // On success the parent (App.jsx) replaces this page with the main layout.
    } catch (err) {
      // Map common network / HTTP errors to user-friendly messages.
      let userMessage = 'Login failed. Please try again.';

      if (err.name === 'AbortError' || err.message.includes('timeout')) {
        userMessage = '⏱️ Connection timeout. Please check if backend server is running.';
      } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        userMessage = '🌐 Cannot connect to server. Please ensure backend is running on port 8000.';
      } else if (err.status === 401) {
        userMessage = '🔒 Invalid email or password.';
      } else if (err.status === 404) {
        userMessage = '❌ Login endpoint not found. Check backend configuration.';
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
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={credentials.email}
              onChange={handleChange}
              className={styles.input}
              placeholder="user@domain.com"
              disabled={isLoading}
              required
            />
          </div>

          {/* Password field with show/hide toggle */}
          <div className={styles.formGroup}>
            <label htmlFor="password">Password</label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={credentials.password}
                onChange={handleChange}
                className={styles.input}
                placeholder="••••••••"
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
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Demo credentials hint — remove before going to production */}
        <div className={styles.demoCredentials}>
          <p><strong>Demo Credentials:</strong></p>
          <div>
            <p>👤 Dean: dean@university.edu / DeanPass123</p>
            <p>📋 Consultant: consultant@qiyas.sa / ConsultPass123</p>
          </div>
        </div>
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
