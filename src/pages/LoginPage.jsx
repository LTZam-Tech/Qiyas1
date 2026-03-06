import { useState } from 'react';
import PropTypes from 'prop-types';
import styles from './LoginPage.module.css';

const LoginPage = ({ onLogin, isLoading }) => {
  const [credentials, setCredentials] = useState({
    email: 'dean@university.edu',
    password: 'DeanPass123',
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!credentials.email || !credentials.password) {
      setError('Please enter email and password');
      return;
    }

    try {
      console.group('🔐 LoginPage: Submitting login');
      console.log('Email:', credentials.email);
      console.log('Calling onLogin...');
      await onLogin(credentials);
      console.log('✅ onLogin completed successfully');
      console.groupEnd();
    } catch (err) {
      console.error('❌ LoginPage: Login error:', err);
      console.error('Error details:', {
        name: err.name,
        message: err.message,
        status: err.status,
        body: err.body,
      });
      console.groupEnd();
      
      // More user-friendly error messages
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
        <h1 className={styles.title}>Qiyas Platform</h1>
        <p className={styles.subtitle}>Quality & Compliance Management</p>

        <form className={styles.loginForm} onSubmit={handleSubmit}>
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
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && <div className={styles.error} role="alert">{error}</div>}

          <button type="submit" className={styles.submitButton} disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

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
  onLogin: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
};

export default LoginPage;
