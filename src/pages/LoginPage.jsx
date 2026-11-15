import { useState } from 'react';
import PropTypes from 'prop-types';
import styles from './LoginPage.module.css';
import { env } from '../config/env.js';
import { Icons } from '../utils/icons.jsx';
import BrandMark from '../components/BrandMark.jsx';
import joufLogo from '../assets/jouf_logo.png';

const getBackendPortLabel = () => {
  try {
    const url = new URL(env.apiBaseUrl, window.location.origin);
    return url.port || '8082';
  } catch {
    return '8082';
  }
};

const LoginPage = ({ onLogin, isLoading, lang = 'ar', onToggleLanguage }) => {
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!credentials.email || !credentials.password) {
      setError(t('يرجى إدخال البريد الإلكتروني وكلمة المرور', 'Please enter your email and password'));
      return;
    }

    try {
      await onLogin(credentials);
    } catch (err) {
      let userMessage = t('تعذر تسجيل الدخول. حاول مرة أخرى.', 'Login failed. Please try again.');
      if (err.name === 'AbortError' || err.message?.includes('timeout')) {
        userMessage = t('انتهت مهلة الاتصال. تحقق من الشبكة.', 'Connection timed out. Check your network.');
      } else if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError') || err.status >= 500) {
        userMessage = t(
          `تعذر الوصول إلى الخادم. تأكد من تشغيله على المنفذ ${getBackendPortLabel()}.`,
          `Can't reach the server. Make sure it is running on port ${getBackendPortLabel()}.`,
        );
      } else if (err.status === 401) {
        userMessage = t('البريد الإلكتروني أو كلمة المرور غير صحيحة.', 'Incorrect email or password.');
      } else if (err.status === 404) {
        userMessage = t('خدمة تسجيل الدخول غير متاحة.', 'Login service not found.');
      } else if (err.message) {
        userMessage = err.message;
      }
      setError(userMessage);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  return (
    <div className={styles.page} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <aside className={styles.brandPanel}>
        <div className={styles.brandTop}>
          <BrandMark size={44} />
          <div className={styles.brandName}>
            <span>{t('قياس', 'Qiyas')}</span>
            <small>{t('من التزام تك', 'by IltizamTech')}</small>
          </div>
        </div>

        <div className={styles.brandBody}>
          <h2 className={styles.brandHeadline}>
            {t('امتثال واضح، وأدلة منظمة، ومراجعة أسرع.', 'Clear compliance. Organized evidence. Faster reviews.')}
          </h2>
          <ul className={styles.points}>
            <li><span>{Icons.checkCircle}</span>{t('تتبع الالتزام عبر المناظير والمحاور والمعايير', 'Track compliance across perspectives, axes and standards')}</li>
            <li><span>{Icons.archive}</span>{t('خزنة أدلة موحدة مع سجل كامل للتعديلات', 'One evidence locker with a full audit trail')}</li>
            <li><span>{Icons.shield}</span>{t('مراجعة واعتماد حسب الأدوار والصلاحيات', 'Role-based review and approval workflow')}</li>
          </ul>
        </div>

        <div className={styles.client}>
          <span className={styles.clientLogo}><img src={joufLogo} alt="" /></span>
          <span>{t('مقدّم لجامعة الجوف', 'Prepared for Jouf University')}</span>
        </div>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.formTop}>
          <div className={styles.mobileBrand}><BrandMark size={34} /><span>{t('قياس', 'Qiyas')}</span></div>
          {onToggleLanguage && (
            <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={onToggleLanguage}>
              {Icons.globeIcon}
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
          )}
        </div>

        <div className={styles.formWrap}>
          <h1 className={styles.title}>{t('تسجيل الدخول', 'Sign in to Qiyas')}</h1>
          <p className={styles.subtitle}>{t('أدخل بريدك الإلكتروني وكلمة المرور للمتابعة.', 'Enter your work email and password to continue.')}</p>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>{t('البريد الإلكتروني', 'Email')}</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>{Icons.mail}</span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={credentials.email}
                  onChange={handleChange}
                  className={`q-input ${styles.input}`}
                  placeholder="name@organization.sa"
                  disabled={isLoading}
                  aria-invalid={Boolean(error) && !credentials.email}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label htmlFor="password" className={styles.label}>{t('كلمة المرور', 'Password')}</label>
                <a href="#" className={styles.forgot} onClick={(e) => e.preventDefault()}>
                  {t('نسيت كلمة المرور؟', 'Forgot password?')}
                </a>
              </div>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>{Icons.lock}</span>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={credentials.password}
                  onChange={handleChange}
                  className={`q-input ${styles.input} ${styles.inputPassword}`}
                  placeholder="••••••••"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  className={styles.reveal}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('إخفاء كلمة المرور', 'Hide password') : t('إظهار كلمة المرور', 'Show password')}
                  aria-pressed={showPassword}
                >
                  {showPassword ? Icons.eyeOff : Icons.eyeSmall}
                </button>
              </div>
            </div>

            <label className={styles.remember}>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} disabled={isLoading} />
              <span>{t('تذكّرني على هذا الجهاز', 'Keep me signed in on this device')}</span>
            </label>

            {error && (
              <div className={styles.error} role="alert">
                {Icons.alertCircle}
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className={`q-btn q-btn-primary ${styles.submit}`} disabled={isLoading}>
              {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : null}
              {isLoading ? t('جاري تسجيل الدخول...', 'Signing in...') : t('تسجيل الدخول', 'Login')}
            </button>
          </form>
        </div>

        <p className={styles.legal}>© {new Date().getFullYear()} IltizamTech · {t('جميع الحقوق محفوظة', 'All rights reserved')}</p>
      </main>
    </div>
  );
};

LoginPage.propTypes = {
  onLogin: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  lang: PropTypes.string,
  onToggleLanguage: PropTypes.func,
};

export default LoginPage;
