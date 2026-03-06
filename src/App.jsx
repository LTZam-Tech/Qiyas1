import { useEffect, useMemo, useState } from 'react';
import { C } from './utils/theme.js';
import { NAV_ITEMS } from './utils/data.js';
import { BREAKPOINTS, PAGES } from './constants/index.js';
import useResponsive from './hooks/useResponsive.js';
import usePageLoad from './hooks/usePageLoad.js';
import useAuth from './context/useAuth.js';
import Header from './components/layout/Header.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import styles from './components/layout/Layout.module.css';
import DashboardPage from './pages/DashboardPage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import EvidencePage from './pages/EvidencePage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';

const PAGE_COMPONENTS = {
  dashboard: DashboardPage,
  catalog: CatalogPage,
  tasks: TasksPage,
  evidence: EvidencePage,
  review: ReviewPage,
  reports: ReportsPage,
  'evidence-list': EvidencePage,
  approvals: ReviewPage,
  analytics: ReportsPage,
};

export default function App() {
  const { isMobile, isTablet, vw } = useResponsive();
  const { user, logout, login } = useAuth();
  const [page, setPage] = useState(PAGES.dashboard);
  const [sideOpen, setSideOpen] = useState(vw > BREAKPOINTS.tablet);
  const [expandedGroups, setExpandedGroups] = useState(new Set(['management']));
  const [searchQuery, setSearchQuery] = useState('');
  const [lang, setLang] = useState('ar');
  const [isDark, setIsDark] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  usePageLoad(page);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 320);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  const toggleGroup = (groupKey) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const navigateTo = (item) => {
    setPage(item.key);
    if (isMobile) {
      setSideOpen(false);
    }
    setShowNotifications(false);
  };

  const onSearchSubmit = (event) => {
    event.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    const flattened = NAV_ITEMS.flatMap((item) => [item, ...(item.children || [])]);
    const match = flattened.find(
      (item) =>
        item.label.toLowerCase().includes(query) || item.labelEn.toLowerCase().includes(query),
    );

    if (match) {
      navigateTo(match);
    }
  };

  const filteredNavItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return NAV_ITEMS.filter((item) => {
      const groupMatch =
        item.label.toLowerCase().includes(query) || item.labelEn.toLowerCase().includes(query);
      const childMatch = item.children?.some(
        (child) =>
          child.label.toLowerCase().includes(query) ||
          child.labelEn.toLowerCase().includes(query),
      );
      return groupMatch || childMatch;
    }).map((item) => ({
      ...item,
      children:
        item.children?.filter(
          (child) =>
            child.label.toLowerCase().includes(query) ||
            child.labelEn.toLowerCase().includes(query),
        ) || item.children,
    }));
  }, [searchQuery]);

  const pageTitle =
    NAV_ITEMS.flatMap((item) => [item, ...(item.children || [])]).find((item) => item.key === page) ||
    NAV_ITEMS[0];

  const notifications = [
    lang === 'ar' ? 'تم رفع شاهد جديد للمعيار 5.10.3' : 'New evidence uploaded for standard 5.10.3',
    lang === 'ar' ? '3 مهام تقترب من الموعد النهائي' : '3 tasks are close to deadline',
    lang === 'ar' ? 'تم اعتماد شاهد من قبل المراجع' : 'Evidence approved by reviewer',
  ];

  const PageComponent = PAGE_COMPONENTS[page] || DashboardPage;

  if (!user) {
    return (
      <section
        className={styles.app}
        style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}
        aria-label="Logged out state"
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: C.primaryDark, marginBottom: 10 }}>
            {lang === 'ar' ? 'تم تسجيل الخروج' : 'Logged Out'}
          </h1>
          <button
            type="button"
            onClick={login}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '10px 14px',
              background: C.primary,
              color: C.white,
              cursor: 'pointer',
            }}
          >
            {lang === 'ar' ? 'تسجيل الدخول مجددا' : 'Login Again'}
          </button>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section
        className={styles.app}
        style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}
        aria-label="Loading application"
      >
        <p style={{ color: C.textLight }}>{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
      </section>
    );
  }

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className={styles.app}>
      {isTablet && sideOpen && <div className={styles.overlay} onClick={() => setSideOpen(false)} />}

      <Header
        isMobile={isMobile}
        isTablet={isTablet}
        title={lang === 'ar' ? pageTitle.label : pageTitle.labelEn}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={onSearchSubmit}
        onToggleSidebar={() => setSideOpen((prev) => !prev)}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onToggleLanguage={() => setLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
        onToggleNotifications={() => setShowNotifications((prev) => !prev)}
        notificationCount={notifications.length}
      />

      {showNotifications && (
        <div className={styles.notifications} role="status" aria-live="polite">
          <h4>{lang === 'ar' ? 'التنبيهات' : 'Notifications'}</h4>
          {notifications.map((note) => (
            <div key={note} className={styles.notificationItem}>
              {note}
            </div>
          ))}
        </div>
      )}

      <div className={styles.shell}>
        <Sidebar
          sideOpen={sideOpen}
          isTablet={isTablet}
          page={page}
          lang={lang}
          navItems={NAV_ITEMS}
          expandedGroups={expandedGroups}
          onToggleGroup={toggleGroup}
          onNavigate={navigateTo}
          user={user}
          onLogout={logout}
          filteredNavItems={filteredNavItems}
        />

        <main className={styles.content} role="main" aria-label="Portal content">
          <PageComponent isMobile={isMobile} isTablet={isTablet} lang={lang} />
        </main>
      </div>
    </div>
  );
}
