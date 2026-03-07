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
  const {
    user,
    login,
    logout,
    isLoading: authLoading,
    isAuthenticating,
  } = useAuth();
  
  // Read language from URL path (/en/ or /ar/)
  const getLanguageFromPath = () => {
    const path = window.location.pathname;
    if (path.startsWith('/en/') || path === '/en') return 'en';
    if (path.startsWith('/ar/') || path === '/ar') return 'ar';
    
    // If at root path, detect browser language or default to Arabic
    if (path === '/' || path === '') {
      const browserLang = navigator.language?.toLowerCase();
      return browserLang?.startsWith('ar') ? 'ar' : 'en'; // default to English for non-Arabic browsers
    }
    
    return 'ar'; // default to Arabic
  };

  // Read page from query params (?page=tasks)
  const getPageFromQuery = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('page') || PAGES.dashboard;
  };

  const [lang, setLang] = useState(getLanguageFromPath);
  const [page, setPage] = useState(getPageFromQuery);
  const [sideOpen, setSideOpen] = useState(vw > BREAKPOINTS.tablet);
  const [expandedGroups, setExpandedGroups] = useState(new Set(['management']));
  const [searchQuery, setSearchQuery] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  usePageLoad(page);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 320);
    return () => clearTimeout(timer);
  }, []);

  // Sync URL with language and page state (also handles initial redirect from root)
  useEffect(() => {
    const currentPath = window.location.pathname;
    const newPath = `/${lang}/`;
    const params = page !== PAGES.dashboard ? `?page=${page}` : '';
    const newUrl = newPath + params;
    
    // Use replace for initial load at root, push for subsequent changes
    const isRootPath = currentPath === '/' || currentPath === '';
    if (window.location.pathname + window.location.search !== newUrl) {
      if (isRootPath) {
        window.history.replaceState({}, '', newUrl);
      } else {
        window.history.pushState({}, '', newUrl);
      }
    }
  }, [lang, page]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setLang(getLanguageFromPath());
      setPage(getPageFromQuery());
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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
    // URL will be updated by the useEffect that watches [lang, page]
    if (isMobile) {
      setSideOpen(false);
    }
    setShowNotifications(false);
  };

  const toggleLanguage = () => {
    const newLang = lang === 'ar' ? 'en' : 'ar';
    setLang(newLang);
    // URL will be updated by the useEffect that watches [lang, page]
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

  if (!user) {
    return <LoginPage onLogin={login} isLoading={isAuthenticating} lang={lang} />;
  }

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
        onToggleLanguage={toggleLanguage}
        onToggleNotifications={() => setShowNotifications((prev) => !prev)}
        notificationCount={notifications.length}
        lang={lang}
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
