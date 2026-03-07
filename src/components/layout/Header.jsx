import PropTypes from 'prop-types';
import { C } from '../../utils/theme.js';
import { Icons } from '../../utils/icons.jsx';
import styles from './Layout.module.css';

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
  onToggleNotifications,
  notificationCount,
}) {
  return (
    <header className={styles.header}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isTablet && (
          <button
            type="button"
            aria-label="Toggle sidebar"
            aria-expanded={!isMobile}
            className={`${styles.headerBtn} ${styles.mobileMenuBtn}`}
            onClick={onToggleSidebar}
          >
            {Icons.menuIcon}
          </button>
        )}
        <span style={{ color: C.white, display: 'flex', alignItems: 'center' }}>{Icons.bookIcon}</span>
        <span className={styles.headerTitle}>{title}</span>
      </div>

      <form
        className={styles.headerSearch}
        role="search"
        aria-label="Global search"
        onSubmit={onSearchSubmit}
      >
        <input
          type="text"
          placeholder="ابحث عن صفحة او عنصر..."
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
        <button
          type="button"
          className={styles.headerBtn}
          aria-label="Show notifications"
          onClick={onToggleNotifications}
          style={{ position: 'relative' }}
        >
          {Icons.bellIcon}
          {notificationCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: C.red,
              }}
            />
          )}
        </button>
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
};
