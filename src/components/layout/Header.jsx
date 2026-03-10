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
      {/* 1. Right Side (in RTL): Page Title */}
      <div className={styles.headerTitleSide}>
        <h1 className={styles.headerTitle}>{title}</h1>
      </div>

      {/* 2. Center: Centered Search Bar */}
      <div className={styles.searchWrapper}>
        <form
          className={styles.headerSearch}
          role="search"
          aria-label="Global search"
          onSubmit={onSearchSubmit}
        >
          <input
            type="text"
            placeholder={lang === 'ar' ? 'ابحث عن...' : 'Search...'}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <span className={styles.searchIconInside} aria-hidden="true">
            {Icons.searchIcon}
          </span>
        </form>
      </div>

      {/* 3. Left Side (in RTL): Action Buttons (White Circles) */}
      <div className={styles.headerActions}>
        <NotificationBell lang={lang} />
        
        <button 
          type="button" 
          className={styles.roundBtn} 
          aria-label="Toggle language" 
          onClick={onToggleLanguage}
        >
          {Icons.globeIcon}
        </button>

        <button 
          type="button" 
          className={styles.roundBtn} 
          aria-label="Toggle theme" 
          onClick={onToggleTheme}
        >
          {Icons.sunIcon}
        </button>

        {isTablet && (
          <button
            type="button"
            aria-label={lang === 'ar' ? 'تبديل الشريط الجانبي' : 'Toggle sidebar'}
            className={styles.roundBtn}
            onClick={onToggleSidebar}
          >
            {Icons.menuIcon}
          </button>
        )}
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
