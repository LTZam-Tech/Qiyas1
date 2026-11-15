import PropTypes from 'prop-types';
import { Icons } from '../../utils/icons.jsx';
import BrandMark from '../BrandMark.jsx';
import styles from './Sidebar.module.css';
import { ROLE_LABELS, getDisplayName, getInitials } from '../../utils/user.js';
import { makeT } from '../../i18n/index.js';


export default function Sidebar({
  sideOpen,
  isTablet,
  page,
  lang,
  navItems,
  onNavigate,
  user,
  onLogout,
  filteredNavItems,
  onClose,
}) {
  const t = makeT(lang);
  const list = filteredNavItems.length > 0 ? filteredNavItems : navItems;
  // On tablet/mobile the sidebar is a drawer: always full width when visible.
  const collapsed = !isTablet && !sideOpen;
  const name = getDisplayName(user, lang);
  const role = ROLE_LABELS[user?.role] || { ar: user?.role || '', en: user?.role || '' };

  const renderItem = (item) => {
    const active = page === item.key || (page === 'approvals' && item.key === 'review') || (page === 'analytics' && item.key === 'reports');
    const label = t(item.label, item.labelEn);
    return (
      <li key={item.key}>
        <button
          type="button"
          className={`${styles.item} ${active ? styles.itemActive : ''}`}
          onClick={() => onNavigate(item)}
          aria-current={active ? 'page' : undefined}
          title={collapsed ? label : undefined}
        >
          <span className={styles.itemIcon}>{Icons[item.iconKey] || Icons.alertCircle}</span>
          {!collapsed && <span className={styles.itemLabel}>{label}</span>}
        </button>
      </li>
    );
  };

  return (
    <aside
      className={[
        styles.sidebar,
        collapsed ? styles.collapsed : '',
        isTablet ? styles.drawer : '',
        isTablet && sideOpen ? styles.drawerOpen : '',
      ].join(' ')}
      aria-label={t('القائمة الرئيسية', 'Main navigation')}
    >
      <div className={styles.brand}>
        <BrandMark size={38} />
        {!collapsed && (
          <div className={styles.brandText}>
            <span className={styles.brandName}>{t('قياس', 'Qiyas')}</span>
            <span className={styles.brandSub}>{t('منصة الامتثال · التزام تك', 'Compliance · IltizamTech')}</span>
          </div>
        )}
        {isTablet && (
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('إغلاق القائمة', 'Close menu')}>
            {Icons.x}
          </button>
        )}
      </div>

      <nav className={styles.nav} aria-label={t('التنقل', 'Navigation')}>
        {list.map((item) =>
          item.isGroup ? (
            <div key={item.key} className={styles.section}>
              {collapsed ? (
                <div className={styles.sectionDivider} aria-hidden="true" />
              ) : (
                <div className={styles.sectionLabel}>{t(item.label, item.labelEn)}</div>
              )}
              <ul className={styles.list}>{item.children?.map(renderItem)}</ul>
            </div>
          ) : (
            <ul key={item.key} className={styles.list}>
              {renderItem(item)}
            </ul>
          ),
        )}
      </nav>

      <div className={styles.footer}>
        <div className={styles.profile} title={collapsed ? name : undefined}>
          <span className={styles.avatar}>{getInitials(name)}</span>
          {!collapsed && (
            <div className={styles.profileText}>
              <span className={styles.profileName}>{name}</span>
              <span className={styles.profileRole}>{t(role.ar, role.en)}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.logout}
          onClick={onLogout}
          aria-label={t('تسجيل الخروج', 'Log out')}
          title={t('تسجيل الخروج', 'Log out')}
        >
          {Icons.logout}
        </button>
      </div>
    </aside>
  );
}

Sidebar.propTypes = {
  sideOpen: PropTypes.bool.isRequired,
  isTablet: PropTypes.bool.isRequired,
  page: PropTypes.string.isRequired,
  lang: PropTypes.oneOf(['ar', 'en', 'ur']).isRequired,
  navItems: PropTypes.arrayOf(PropTypes.object).isRequired,
  onNavigate: PropTypes.func.isRequired,
  user: PropTypes.shape({
    full_name: PropTypes.string,
    full_name_en: PropTypes.string,
    email: PropTypes.string,
    role: PropTypes.string,
  }),
  onLogout: PropTypes.func.isRequired,
  filteredNavItems: PropTypes.arrayOf(PropTypes.object).isRequired,
  onClose: PropTypes.func.isRequired,
};
