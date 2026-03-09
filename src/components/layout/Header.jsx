import PropTypes from 'prop-types';
import { C } from '../../utils/theme.js';
import { Icons } from '../../utils/icons.jsx';
import styles from './Layout.module.css';
import joufLogo from '../../assets/jouf_logo.png';
import NotificationBell from '../notifications/NotificationBell.jsx';

export default function Header({
  isMobile,
  isTablet,
  title,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onToggleSidebar,
  onToggleTheme,
  onToggleLanguage,
  lang = 'ar',
}) {
  return (
    <header className={styles.header}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isTablet && (
          <button
            type="button"
            aria-label={lang === 'ar' ? 'تبديل الشريط الجانبي' : 'Toggle sidebar'}
            aria-expanded={!isMobile}
            className={`${styles.headerBtn} ${styles.mobileMenuBtn}`}
            onClick={onToggleSidebar}
          >
            {Icons.menuIcon}
          </button>
        )}
        <span style={{ display: 'flex', alignItems: 'center', background: '#fff', padding: '4px', borderRadius: '4px' }} aria-hidden="true">
          <img src={joufLogo} alt="Jouf University Logo" style={{ height: '32px', width: 'auto' }} />
        </span>
        <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>
          {lang === 'ar' ? 'بوابة قياس' : 'Qiyas Portal'}
        </span>
        <span className={styles.headerTitle} style={{ marginLeft: '12px' }}>{title}</span>
      </div>

      <form
        className={styles.headerSearch}
        role="search"
        aria-label="Global search"
        onSubmit={onSearchSubmit}
      >
        <input
          type="text"
          placeholder={lang === 'ar' ? 'ابحث عن صفحة او عنصر...' : 'Search for page or item...'}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center' }}>{Icons.searchIcon}</span>
      </form>

      <div className={styles.headerControls}>
        <button type="button" className={styles.headerBtn} aria-label="Toggle theme" onClick={onToggleTheme}>
          {Icons.sunIcon}
        </button>
        <button type="button" className={styles.headerBtn} aria-label="Toggle language" onClick={onToggleLanguage}>
          {Icons.globeIcon}
        </button>
        <NotificationBell lang={lang} />
      </div>
    </header>
  );
}

Header.propTypes = {
  isMobile: PropTypes.bool.isRequired,
  isTablet: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  searchQuery: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  onSearchSubmit: PropTypes.func.isRequired,
  onToggleSidebar: PropTypes.func.isRequired,
  onToggleTheme: PropTypes.func.isRequired,
  onToggleLanguage: PropTypes.func.isRequired,
  onToggleNotifications: PropTypes.func.isRequired,
  notificationCount: PropTypes.number.isRequired,
  lang: PropTypes.oneOf(['ar', 'en']),
};
