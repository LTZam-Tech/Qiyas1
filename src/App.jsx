import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { BREAKPOINTS } from './constants/index.js';
import BrandMark from './components/BrandMark.jsx';
import { DEFAULT_LANG, LANG_CODES, detectPreferredLang, dirOf, isSupportedLang, makeT, rememberLang } from './i18n/index.js';
import useResponsive from './hooks/useResponsive.js';
import usePageLoad from './hooks/usePageLoad.js';
import useAuth from './context/useAuth.js';
import { QiyasSessionProvider, useQiyas } from './context/QiyasSession.jsx';
import { api } from './services/qiyasApi.js';
import LoginPage from './pages/LoginPage.jsx';
import Header from './components/layout/Header.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import styles from './components/layout/Layout.module.css';
import { allowedKeys, findEntry, navFor } from './pages/p1/nav.js';
import HomePage from './pages/p1/HomePage.jsx';
import TasksPage from './pages/p1/TasksPage.jsx';
import TaskPage from './pages/p1/TaskPage.jsx';
import InboxPage from './pages/p1/InboxPage.jsx';
import ReviewQueuePage from './pages/p1/ReviewQueuePage.jsx';
import CataloguePage from './pages/p1/CataloguePage.jsx';
import SubmissionPage from './pages/p1/SubmissionPage.jsx';
import BankPage from './pages/p1/BankPage.jsx';
import AdminPage from './pages/p1/AdminPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ErrorLogPage from './pages/ErrorLogPage.jsx';

const PAGE_COMPONENTS = {
  home: HomePage,
  tasks: TasksPage,
  task: TaskPage,
  inbox: InboxPage,
  review: ReviewQueuePage,
  catalogue: CataloguePage,
  submission: SubmissionPage,
  bank: BankPage,
  admin: AdminPage,
  reports: ReportsPage,
  'error-logs': ErrorLogPage,
};

const THEME_KEY = 'qiyas_theme';
const readInitialDark = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

// Language from the URL path (/ar/, /en/, /ur/); the root path uses the saved choice or the browser.
const getLanguageFromPath = () => {
  const first = window.location.pathname.split('/').filter(Boolean)[0];
  if (isSupportedLang(first)) return first;
  if (!first) return detectPreferredLang();
  return DEFAULT_LANG;
};

// Page and record id from the query (?page=task&id=…)
const getRouteFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  return { page: params.get('page') || 'home', id: params.get('id') || null };
};

export default function App() {
  const { user, login, logout, isAuthenticating } = useAuth();
  const [lang, setLang] = useState(getLanguageFromPath);
  const [isDark, setIsDark] = useState(readInitialDark);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirOf(lang);
    rememberLang(lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Storage may be unavailable (private mode); the theme still applies for this session.
    }
  }, [isDark]);

  const changeLanguage = useCallback((code) => {
    if (!LANG_CODES.includes(code)) return;
    setLang(code);
    // Saved to the profile so notifications and emails use it too.
    if (user) api.put('/me/language', { language: code }).catch(() => undefined);
  }, [user]);

  if (!user) {
    return <LoginPage onLogin={login} isLoading={isAuthenticating} lang={lang} onChangeLanguage={changeLanguage} />;
  }

  return (
    <QiyasSessionProvider enabled>
      <Shell
        lang={lang}
        setLang={setLang}
        changeLanguage={changeLanguage}
        isDark={isDark}
        toggleTheme={() => setIsDark((v) => !v)}
        user={user}
        logout={logout}
      />
    </QiyasSessionProvider>
  );
}

function Shell({ lang, setLang, changeLanguage, isDark, toggleTheme, user, logout }) {
  const { isMobile, isTablet, vw } = useResponsive();
  const session = useQiyas();
  const t = makeT(lang);
  const [route, setRoute] = useState(getRouteFromQuery);
  const [sideOpen, setSideOpen] = useState(vw > BREAKPOINTS.tablet);
  const [searchQuery, setSearchQuery] = useState('');
  usePageLoad(route.page);

  const [prevIsTablet, setPrevIsTablet] = useState(isTablet);
  if (prevIsTablet !== isTablet) {
    setPrevIsTablet(isTablet);
    setSideOpen(!isTablet);
  }

  const nav = useMemo(() => (session.me ? navFor(session) : []), [session]);
  const allowed = useMemo(() => allowedKeys(nav), [nav]);
  const page = allowed.has(route.page) ? route.page : 'home';

  // Keep the URL in sync with language and page.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (page !== 'home') qs.set('page', page);
    if (route.id && page === route.page) qs.set('id', route.id);
    const newUrl = `/${lang}/${qs.toString() ? `?${qs}` : ''}`;
    if (window.location.pathname + window.location.search !== newUrl) {
      const root = window.location.pathname === '/' || window.location.pathname === '';
      window.history[root ? 'replaceState' : 'pushState']({}, '', newUrl);
    }
  }, [lang, page, route]);

  useEffect(() => {
    const onPop = () => {
      setLang(getLanguageFromPath());
      setRoute(getRouteFromQuery());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setLang]);

  const navigate = (key, id = null) => {
    setRoute({ page: key, id });
    setSearchQuery('');
    window.scrollTo({ top: 0 });
    if (isTablet) setSideOpen(false);
  };

  // Page search matches a menu entry's name in any language.
  const matches = (n, q) => [n.label, n.labelEn, n.labelUr].some((x) => x?.toLowerCase().includes(q));
  const query = searchQuery.trim().toLowerCase();
  const filteredNavItems = !query ? [] : nav
    .map((n) => (n.isGroup ? (matches(n, query) ? n : { ...n, children: n.children.filter((c) => matches(c, query)) }) : matches(n, query) ? n : null))
    .filter((n) => n && (!n.isGroup || n.children.length));
  const onSearchSubmit = (e) => {
    e.preventDefault();
    const first = filteredNavItems.flatMap((n) => (n.isGroup ? n.children : [n]))[0];
    if (first) navigate(first.key);
  };

  const { item: entry, group } = findEntry(nav, page);
  const pageTitle = entry ? t(entry.label, entry.labelEn, entry.labelUr) : '';
  const sectionTitle = group ? t(group.label, group.labelEn, group.labelUr) : undefined;
  const docTitle = `${pageTitle} · ${t('قياس', 'Qiyas')}`;
  useEffect(() => {
    document.title = docTitle;
  }, [docTitle]);

  if (session.loading || (!session.me && !session.error)) {
    return (
      <section className={styles.loading} aria-label="Loading application">
        <div className={styles.loadingInner}>
          <span className={styles.loadingMark}><BrandMark size={52} /></span>
          <span>{t('جاري التحميل...', 'Loading...')}</span>
        </div>
      </section>
    );
  }
  if (session.error) {
    return (
      <section className="q-state" style={{ minHeight: '100vh' }} role="alert">
        <p className="q-state-title">{t('تعذر الاتصال بخدمة قياس', 'Could not reach the Qiyas service', 'قیاس سروس سے رابطہ نہیں ہو سکا')}</p>
        <p>{session.error.message}</p>
        <div className="q-page-actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="q-btn q-btn-primary" onClick={session.refresh}>{t('حاول مرة أخرى', 'Try again')}</button>
          <button type="button" className="q-btn q-btn-secondary" onClick={logout}>{t('تسجيل الخروج', 'Log out')}</button>
        </div>
      </section>
    );
  }

  const PageComponent = PAGE_COMPONENTS[page] || HomePage;
  const activeKey = page === 'task' ? 'tasks' : page;

  return (
    <div dir={dirOf(lang)} lang={lang} className={styles.app}>
      {isTablet && sideOpen && <div className={styles.overlay} onClick={() => setSideOpen(false)} />}
      <Sidebar
        sideOpen={sideOpen}
        isTablet={isTablet}
        page={activeKey}
        lang={lang}
        navItems={nav}
        onNavigate={(n) => navigate(n.key)}
        user={user}
        roles={session.me.roles.map((g) => g.role)}
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
          onToggleSidebar={() => setSideOpen((v) => !v)}
          onToggleTheme={toggleTheme}
          onChangeLanguage={changeLanguage}
          isDark={isDark}
          lang={lang}
          onNavigate={navigate}
        />
        <main className={styles.content} aria-label={pageTitle}>
          <PageComponent key={`${page}:${route.id ?? ''}`} lang={lang} isMobile={isMobile} id={route.id} onNavigate={navigate} />
        </main>
      </div>
    </div>
  );
}

Shell.propTypes = {
  lang: PropTypes.string.isRequired,
  setLang: PropTypes.func.isRequired,
  changeLanguage: PropTypes.func.isRequired,
  isDark: PropTypes.bool,
  toggleTheme: PropTypes.func.isRequired,
  user: PropTypes.object.isRequired,
  logout: PropTypes.func.isRequired,
};
