import { useState } from 'react';
import PropTypes from 'prop-types';
import styles from './LoginPage.module.css';
import { env } from '../config/env.js';
import joufLogo from '../assets/jouf_logo.png';

const getBackendPortLabel = () => {
  try {
    const url = new URL(env.apiBaseUrl, window.location.origin);
    return url.port || '8082';
  } catch {
    return '8082';
  }
};

const LoginPage = ({ onLogin, isLoading, lang = 'ar' }) => {
  const [credentials, setCredentials] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!credentials.email || !credentials.password) {
      setError(lang === 'ar' ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور' : 'Please enter email and password');
      return;
    }

    try {
      await onLogin(credentials);
    } catch (err) {
      let userMessage = 'Login failed. Please try again.';

      if (err.name === 'AbortError' || err.message?.includes('timeout')) {
        userMessage = 'Connection timeout. Please check your network.';
      } else if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        userMessage = `Cannot connect to server. Please ensure backend is running on port ${getBackendPortLabel()}.`;
      } else if (err.status === 401) {
        userMessage = lang === 'ar' ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Invalid email or password.';
      } else if (err.status === 404) {
        userMessage = 'Login endpoint not found.';
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
    <div className={styles.loginContainer} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className={styles.loginBox}>
        <div className={styles.logoSection}>
          <img src={joufLogo} alt="Jouf University Logo" className={styles.logoImage} />
        </div>

        <h1 className={styles.title}>
          {lang === 'ar' ? 'تسجيل الدخول إلى حسابك' : 'Log in to your account'}
        </h1>
        <p className={styles.subtitle}>
          {lang === 'ar' ? 'أدخل بريدك الإلكتروني وكلمة المرور للمتابعة' : 'Enter your email and password to continue'}
        </p>

        <form className={styles.loginForm} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>
              {lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={credentials.email}
              onChange={handleChange}
              className={styles.input}
              placeholder="example@qiyas.sa"
              disabled={isLoading}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <div className={styles.passwordHeader}>
              <label htmlFor="password" className={styles.label}>
                {lang === 'ar' ? 'كلمة المرور' : 'Password'}
              </label>
              <a href="#" className={styles.forgotPassword} onClick={(e) => e.preventDefault()}>
                {lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot Password?'}
              </a>
            </div>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                name="password"
                type="password"
                value={credentials.password}
                onChange={handleChange}
                className={styles.input}
                placeholder="••••••••"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <div className={styles.rememberGroup}>
            <label className={styles.rememberLabel}>
              <span className={styles.rememberText}>{lang === 'ar' ? 'تذكّرني' : 'Remember me'}</span>
              <input 
                type="checkbox" 
                className={styles.rememberCheckbox} 
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
              />
            </label>
          </div>

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
  onLogin: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  lang: PropTypes.string,
};

export default LoginPage;
