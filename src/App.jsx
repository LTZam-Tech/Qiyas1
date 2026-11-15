import { useCallback, useEffect, useMemo, useState } from 'react';
import { NAV_ITEMS, PAGE_ALIASES } from './utils/data.js';
import { filterNavByRole, canAccessPage } from './utils/permissions.js';
import { APP_LOADING_DELAY_MS, BREAKPOINTS, PAGES } from './constants/index.js';
import BrandMark from './components/BrandMark.jsx';
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
import EvidenceListPage from './pages/EvidenceListPage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ErrorLogPage from './pages/ErrorLogPage.jsx';

const PAGE_COMPONENTS = {
  dashboard: DashboardPage,
  catalog: CatalogPage,
  tasks: TasksPage,
  evidence: EvidencePage,
  'evidence-list': EvidenceListPage,
  review: ReviewPage,
  reports: ReportsPage,
  approvals: ReviewPage,
  analytics: ReportsPage,
  'error-logs': ErrorLogPage,
};

const THEME_KEY = 'qiyas_theme';

const readInitialDark = () => {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.theme === 'dark';
};

// Read language from URL path (/en/ or /ar/)
const getLanguageFromPath = () => {
  const path = window.location.pathname;
  if (path.startsWith('/en/') || path === '/en') return 'en';
  if (path.startsWith('/ar/') || path === '/ar') return 'ar';
  if (path === '/' || path === '') {
    const browserLang = navigator.language?.toLowerCase();
    return browserLang?.startsWith('ar') ? 'ar' : 'en';
  }
  return 'ar';
};

// Read page from query params (?page=tasks)
const getPageFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('page') || PAGES.dashboard;
};

// Find a nav entry and the section (group) it lives in.
const findNavEntry = (key) => {
  for (const item of NAV_ITEMS) {
    if (item.key === key) return { item, group: null };
    const child = item.children?.find((c) => c.key === key);
    if (child) return { item: child, group: item };
  }
  if (PAGE_ALIASES[key]) return { item: PAGE_ALIASES[key], group: null };
  return { item: NAV_ITEMS[0], group: null };
};

export default function App() {
  const { isMobile, isTablet, vw } = useResponsive();
  const { user, login, logout, isLoading: authLoading, isAuthenticating } = useAuth();

  const [lang, setLang] = useState(getLanguageFromPath);
  const [page, setPage] = useState(getPageFromQuery);
  const [sideOpen, setSideOpen] = useState(vw > BREAKPOINTS.tablet);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDark, setIsDark] = useState(readInitialDark);
  const [isLoading, setIsLoading] = useState(true);

  usePageLoad(page);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), APP_LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Drawer closes when we drop to tablet size; sidebar re-expands on desktop.
  const [prevIsTablet, setPrevIsTablet] = useState(isTablet);
  if (prevIsTablet !== isTablet) {
    setPrevIsTablet(isTablet);
    setSideOpen(!isTablet);
  }

  // Sync URL with language and page state (also handles initial redirect from root)
  useEffect(() => {
    const currentPath = window.location.pathname;
    const params = page !== PAGES.dashboard ? `?page=${page}` : '';
    const newUrl = `/${lang}/${params}`;
    const isRootPath = currentPath === '/' || currentPath === '';
    if (window.location.pathname + window.location.search !== newUrl) {
      if (isRootPath) {
        window.history.replaceState({}, '', newUrl);
      } else {
        window.history.pushState({}, '', newUrl);
      }
    }
  }, [lang, page]);

  // Keep <html lang/dir> in sync so the whole document (including portals) flips.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

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
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Storage may be unavailable (private mode); theme still applies for this session.
    }
  }, [isDark]);

  const navigateTo = useCallback((item) => {
    if (!canAccessPage(item.key, user?.role)) {
      console.warn(`Access denied to page: ${item.key}`);
      return;
    }
    setPage(item.key);
    setSearchQuery('');
    window.scrollTo({ top: 0 });
    if (isTablet) {
      setSideOpen(false);
    }
  }, [isTablet, user?.role]);

  const toggleLanguage = useCallback(() => {
    setLang((prev) => (prev === 'ar' ? 'en' : 'ar'));
  }, []);

  const roleBasedNavItems = useMemo(() => {
    if (!user?.role) return [];
    return filterNavByRole(NAV_ITEMS, user.role);
  }, [user]);

  const matches = useCallback(
    (item, query) => item.label.toLowerCase().includes(query) || item.labelEn.toLowerCase().includes(query),
    [],
  );

  const onSearchSubmit = (event) => {
    event.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    const flattened = roleBasedNavItems.flatMap((item) => (item.isGroup ? item.children || [] : [item]));
    const match = flattened.find((item) => matches(item, query));
    if (match) navigateTo(match);
  };

  const filteredNavItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return roleBasedNavItems
      .map((item) => {
        if (!item.isGroup) return matches(item, query) ? item : null;
        const children = matches(item, query) ? item.children : item.children?.filter((c) => matches(c, query));
        return children?.length ? { ...item, children } : null;
      })
      .filter(Boolean);
  }, [searchQuery, roleBasedNavItems, matches]);

  const { item: pageEntry, group: pageGroup } = findNavEntry(page);
  const pageTitle = lang === 'ar' ? pageEntry.label : pageEntry.labelEn;
  const sectionTitle = pageGroup ? (lang === 'ar' ? pageGroup.label : pageGroup.labelEn) : undefined;

  useEffect(() => {
    document.title = user ? `${pageTitle} · ${lang === 'ar' ? 'قياس' : 'Qiyas'}` : 'Qiyas | قياس';
  }, [pageTitle, lang, user]);

  const PageComponent = PAGE_COMPONENTS[page] || DashboardPage;

  if (!user) {
    return (
      <LoginPage
        onLogin={login}
        isLoading={isAuthenticating}
        lang={lang}
        onToggleLanguage={toggleLanguage}
      />
    );
  }

  if (isLoading || authLoading) {
    return (
      <section className={styles.loading} aria-label="Loading application">
        <div className={styles.loadingInner}>
          <span className={styles.loadingMark}><BrandMark size={52} /></span>
          <span>{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</span>
        </div>
      </section>
    );
  }

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className={styles.app}>
      {isTablet && sideOpen && <div className={styles.overlay} onClick={() => setSideOpen(false)} />}

      <Sidebar
        sideOpen={sideOpen}
        isTablet={isTablet}
        page={page}
        lang={lang}
        navItems={roleBasedNavItems}
        onNavigate={navigateTo}
        user={user}
        onLogout={logout}
        filteredNavItems={filteredNavItems}
        onClose={() => setSideOpen(false)}
      />

      <div className={styles.mainWrapper}>
        <Header
          isMobile={isMobile}
          title={pageTitle}
          section={sectionTitle}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={onSearchSubmit}
          onToggleSidebar={() => setSideOpen((prev) => !prev)}
          onToggleTheme={() => setIsDark((prev) => !prev)}
          onToggleLanguage={toggleLanguage}
          isDark={isDark}
          lang={lang}
        />

        <main className={styles.content} aria-label={pageTitle}>
          <PageComponent
            key={page}
            isMobile={isMobile}
            isTablet={isTablet}
            lang={lang}
            user={user}
            onNavigate={(key) => navigateTo({ key })}
          />
        </main>
      </div>
    </div>
  );
}
