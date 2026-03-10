import PropTypes from 'prop-types';
import { Icons } from '../../utils/icons.jsx';
import styles from './Sidebar.module.css';
import joufLogo from '../../assets/jouf_logo.png';

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
  onToggleSidebar,
}) {
  const list = filteredNavItems.length > 0 ? filteredNavItems : navItems;

  return (
    <aside
      className={`${styles.sidebar} ${!sideOpen ? styles.sidebarCollapsed : ''}`}
      aria-label="Main navigation sidebar"
    >
      {/* 1. Sidebar Header (Logo on right in RTL) */}
      <div className={styles.sidebarHeader}>
        <img src={joufLogo} alt="Jouf University" className={styles.joufLogo} />
      </div>

      <nav className={styles.nav} aria-label="Main navigation">
        {list.map((item) => {
          const active = page === item.key;
          const label = lang === 'ar' ? item.label : item.labelEn;
          const isExpanded = expandedGroups.has(item.key);

          // All items are now card-wrapped
          return (
            <div key={item.key} className={styles.cardWrapper}>
              <button
                type="button"
                className={`${styles.navBtn} ${active && !item.isGroup ? styles.activeSubItem : ''}`}
                onClick={() => (item.isGroup ? onToggleGroup(item.key) : onNavigate(item))}
                aria-expanded={item.isGroup ? isExpanded : undefined}
              >
                <div className={styles.navBtnContent}>
                  {sideOpen && <span className={styles.navLabel}>{label}</span>}
                  <span className={styles.icon}>{item.key === 'dash' ? Icons.dashboard : (Icons[item.iconKey] || Icons.alertCircle)}</span>
                </div>

                {sideOpen && item.isGroup && (
                   <span className={styles.chevron} style={{ transform: isExpanded ? 'rotate(90deg)' : (lang === 'ar' ? 'rotate(180deg)' : 'rotate(0deg)'), display: 'flex' }}>
                     {Icons.chevron}
                   </span>
                )}
              </button>

              {item.isGroup && isExpanded && sideOpen && (
                <div className={styles.childrenList}>
                  {item.children?.map((child) => {
                    const childActive = page === child.key;
                    const childLabel = lang === 'ar' ? child.label : child.labelEn;
                    return (
                      <button
                        type="button"
                        key={child.key}
                        className={`${styles.childBtn} ${childActive ? styles.childBtnActive : ''}`}
                        onClick={() => onNavigate(child)}
                      >
                        <span className={styles.navLabel}>{childLabel}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <button 
        className={styles.pullTab} 
        onClick={onToggleSidebar}
        aria-label={sideOpen ? "Close sidebar" : "Open sidebar"}
      >
        <span style={{ transform: sideOpen ? (lang === 'ar' ? 'rotate(0deg)' : 'rotate(180deg)') : (lang === 'ar' ? 'rotate(180deg)' : 'rotate(0deg)'), display: 'flex' }}>
          {Icons.chevron}
        </span>
      </button>

      {/* Footer Profile Section */}
      <div className={styles.footer}>
        <div className={styles.profileCard}>
          {sideOpen && (
            <div className={styles.profileInfo}>
              <div className={styles.profileName}>
                {lang === 'ar' ? 'د. أحمد المحمد' : 'Dr. Ahmed'}
              </div>
              <div className={styles.profileRole}>admin</div>
            </div>
          )}
          <div className={styles.avatar}>
             <img src="https://i.pravatar.cc/150?u=dean" alt="Profile" />
          </div>
        </div>
        
        <button type="button" className={styles.logoutBtn} onClick={onLogout}>
           {sideOpen && <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}</span>}
           <span className={styles.logoutIcon}>{Icons.redLogout}</span>
        </button>
      </div>
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
  onToggleSidebar: PropTypes.func.isRequired,
};
