import { useEffect, useMemo, useState } from 'react';
import { C } from './utils/theme.js';
import { NAV_ITEMS } from './utils/data.js';
import { filterNavByRole, canAccessPage } from './utils/permissions.js';
import { BREAKPOINTS, PAGES } from './constants/index.js';
import useResponsive from './hooks/useResponsive.js';
import usePageLoad from './hooks/usePageLoad.js';
import useAuth from './context/useAuth.js';
import LoginPage from './pages/LoginPage.jsx';
import Header from './components/layout/Header.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import styles from './components/layout/Layout.module.css';
import DashboardPage from './pages/DashboardPage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import EvidencePage from './pages/EvidencePage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ErrorLogPage from './pages/ErrorLogPage.jsx';

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
  'error-logs': ErrorLogPage,
};

export default function App() {
  const { isMobile, isTablet, vw } = useResponsive();
  const { user: authUser, logout, isLoading: authLoading } = useAuth();
  // LOGIN TEMPORARILY DISABLED — use a mock dean user so sidebar/role logic works
  const MOCK_USER = useMemo(
    () => ({ id: 'mock', email: 'dean@university.edu', name: 'Dr. Ahmed Al-Qahtani', role: 'dean' }),
    [],
  );
  const user = authUser ?? MOCK_USER;
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
    // Check if user has access to this page
    if (!canAccessPage(item.key, user?.role)) {
      console.warn(`Access denied to page: ${item.key}`);
      return;
    }
    
    setPage(item.key);
    if (isMobile) {
      setSideOpen(false);
    }
    setShowNotifications(false);
  };

  // Filter navigation based on user role
  const roleBasedNavItems = useMemo(() => {
    if (!user?.role) return [];
    return filterNavByRole(NAV_ITEMS, user.role);
  }, [user]);

  const onSearchSubmit = (event) => {
    event.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    const flattened = roleBasedNavItems.flatMap((item) => [item, ...(item.children || [])]);
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

    return roleBasedNavItems.filter((item) => {
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
  }, [searchQuery, roleBasedNavItems]);

  const pageTitle =
    NAV_ITEMS.flatMap((item) => [item, ...(item.children || [])]).find((item) => item.key === page) ||
    NAV_ITEMS[0];

  const notifications = [
    lang === 'ar' ? 'تم رفع شاهد جديد للمعيار 5.10.3' : 'New evidence uploaded for standard 5.10.3',
    lang === 'ar' ? '3 مهام تقترب من الموعد النهائي' : '3 tasks are close to deadline',
    lang === 'ar' ? 'تم اعتماد شاهد من قبل المراجع' : 'Evidence approved by reviewer',
  ];

  const PageComponent = PAGE_COMPONENTS[page] || DashboardPage;

  // LOGIN TEMPORARILY DISABLED — uncomment to re-enable authentication gate
  // if (!user) {
  //   return <LoginPage onLogin={login} isLoading={isAuthenticating} />;
  // }

  if (isLoading || authLoading) {
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
          navItems={roleBasedNavItems}
          expandedGroups={expandedGroups}
          onToggleGroup={toggleGroup}
          onNavigate={navigateTo}
          user={user}
          onLogout={logout}
          filteredNavItems={filteredNavItems}
        />

        <main className={styles.content} role="main" aria-label="Portal content">
          <PageComponent isMobile={isMobile} isTablet={isTablet} lang={lang} user={user} />
        </main>
      </div>
    </div>
  );
}
