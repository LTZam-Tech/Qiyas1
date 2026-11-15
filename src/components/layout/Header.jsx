import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Icons } from '../../utils/icons.jsx';
import styles from './Layout.module.css';
import NotificationBell from '../notifications/NotificationBell.jsx';

export default function Header({
  isMobile,
  title,
  section,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onToggleSidebar,
  onToggleTheme,
  onToggleLanguage,
  isDark = false,
  lang = 'ar',
}) {
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const searchRef = useRef(null);

  // "/" focuses the page search, like most modern dashboards.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        onSearchChange('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSearchChange]);

  return (
    <header className={styles.header}>
      <div className={styles.headerStart}>
        <button
          type="button"
          className="q-icon-btn"
          onClick={onToggleSidebar}
          aria-label={t('إظهار/إخفاء القائمة', 'Toggle sidebar')}
          title={t('القائمة', 'Menu')}
        >
          {isMobile ? Icons.menuIcon : Icons.panelIcon}
        </button>

        <nav className={styles.crumbs} aria-label={t('مسار الصفحة', 'Breadcrumb')}>
          {section && !isMobile ? (
            <>
              <span className={styles.crumbSection}>{section}</span>
              <span className={styles.crumbSep} aria-hidden="true">/</span>
            </>
          ) : null}
          <span className={styles.crumbCurrent} aria-current="page">{title}</span>
        </nav>
      </div>

      {!isMobile && (
        <form className={styles.search} role="search" onSubmit={onSearchSubmit}>
          <span className={styles.searchIcon} aria-hidden="true">{Icons.searchIcon}</span>
          <input
            ref={searchRef}
            type="search"
            className={styles.searchInput}
            placeholder={t('ابحث عن صفحة...', 'Jump to a page...')}
            aria-label={t('بحث في الصفحات', 'Search pages')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <kbd className={styles.kbd} aria-hidden="true">/</kbd>
        </form>
      )}

      <div className={styles.headerEnd}>
        <button
          type="button"
          className={`q-icon-btn ${styles.langBtn}`}
          onClick={onToggleLanguage}
          aria-label={t('Switch to English', 'التبديل إلى العربية')}
          title={t('English', 'العربية')}
        >
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
        <button
          type="button"
          className="q-icon-btn"
          onClick={onToggleTheme}
          aria-label={isDark ? t('الوضع الفاتح', 'Light mode') : t('الوضع الداكن', 'Dark mode')}
          title={isDark ? t('الوضع الفاتح', 'Light mode') : t('الوضع الداكن', 'Dark mode')}
        >
          {isDark ? Icons.sunIcon : Icons.moonIcon}
        </button>
        <NotificationBell lang={lang} />
      </div>
    </header>
  );
}

Header.propTypes = {
  isMobile: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  section: PropTypes.string,
  searchQuery: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  onSearchSubmit: PropTypes.func.isRequired,
  onToggleSidebar: PropTypes.func.isRequired,
  onToggleTheme: PropTypes.func.isRequired,
  onToggleLanguage: PropTypes.func.isRequired,
  isDark: PropTypes.bool,
  lang: PropTypes.oneOf(['ar', 'en']),
};
