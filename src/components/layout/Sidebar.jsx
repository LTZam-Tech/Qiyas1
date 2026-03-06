import PropTypes from 'prop-types';
import { Icons } from '../../utils/icons.jsx';
import styles from './Layout.module.css';

export default function Sidebar({
  sideOpen,
  isTablet,
  page,
  lang,
  navItems,
  expandedGroups,
  onToggleGroup,
  onNavigate,
  user,
  onLogout,
  filteredNavItems,
}) {
  const list = filteredNavItems.length > 0 ? filteredNavItems : navItems;

  return (
    <aside
      className={`${styles.sidebar} ${!sideOpen ? styles.sidebarCollapsed : ''}`}
      aria-label="Main navigation sidebar"
    >
      <nav className={styles.nav} aria-label="Main navigation">
        {list.map((item) => {
          const active = page === item.key;
          const label = lang === 'ar' ? item.label : item.labelEn;
          return (
            <div key={item.key}>
              <button
                type="button"
                className={`${styles.navBtn} ${active ? styles.navBtnActive : ''}`}
                onClick={() => (item.isGroup ? onToggleGroup(item.key) : onNavigate(item))}
                aria-expanded={item.isGroup ? expandedGroups.has(item.key) : undefined}
                aria-label={label}
              >
                <span aria-hidden="true">{Icons[item.iconKey]}</span>
                {sideOpen && (
                  <span className={styles.navText}>
                    <span>{label}</span>
                    <span className={styles.navTextEn}>{lang === 'ar' ? item.labelEn : item.label}</span>
                  </span>
                )}
              </button>

              {sideOpen && item.isGroup && expandedGroups.has(item.key) && (
                <div className={styles.navChildren}>
                  {item.children?.map((child) => {
                    const childActive = page === child.key;
                    const childLabel = lang === 'ar' ? child.label : child.labelEn;
                    return (
                      <button
                        type="button"
                        key={child.key}
                        className={`${styles.navBtn} ${childActive ? styles.navBtnActive : ''}`}
                        onClick={() => onNavigate(child)}
                        aria-label={childLabel}
                      >
                        <span aria-hidden="true">{Icons[child.iconKey]}</span>
                        {sideOpen && <span>{childLabel}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {sideOpen && (
        <div className={styles.profileBox}>
          <div className={styles.profileCard}>
            <span aria-hidden="true">👤</span>
            <div>
              <div>{user?.fullName || (lang === 'ar' ? user?.nameAr : user?.nameEn)}</div>
              <small style={{ 
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '600',
                background: 'rgba(102, 126, 234, 0.15)',
                color: '#667eea',
              }}>
                {user?.role || 'user'}
              </small>
            </div>
          </div>
          <button type="button" className={styles.logoutBtn} onClick={onLogout} aria-label="Logout">
            {lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
          </button>
        </div>
      )}

      {!sideOpen && !isTablet && (
        <button type="button" className={styles.logoutBtn} onClick={onLogout} aria-label="Logout">
          🚪
        </button>
      )}
    </aside>
  );
}

Sidebar.propTypes = {
  sideOpen: PropTypes.bool.isRequired,
  isTablet: PropTypes.bool.isRequired,
  page: PropTypes.string.isRequired,
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
  navItems: PropTypes.arrayOf(PropTypes.object).isRequired,
  expandedGroups: PropTypes.instanceOf(Set).isRequired,
  onToggleGroup: PropTypes.func.isRequired,
  onNavigate: PropTypes.func.isRequired,
  user: PropTypes.shape({
    nameAr: PropTypes.string,
    nameEn: PropTypes.string,
    role: PropTypes.string,
  }),
  onLogout: PropTypes.func.isRequired,
  filteredNavItems: PropTypes.arrayOf(PropTypes.object).isRequired,
};
