import { useState, useEffect, useCallback } from "react";
import { C } from './utils/theme.js';
import { Icons } from './utils/icons.jsx';
import { NAV_ITEMS } from './utils/data.js';
import DashboardPage from './pages/DashboardPage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import EvidencePage from './pages/EvidencePage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';

const PAGES = { 
  dashboard: DashboardPage, 
  catalog: CatalogPage, 
  tasks: TasksPage, 
  evidence: EvidencePage, 
  review: ReviewPage, 
  reports: ReportsPage,
  'evidence-list': EvidencePage,
  'approvals': ReviewPage,
  'analytics': ReportsPage,
};

export default function App() {
  const getWidth = () => (typeof window === "undefined" ? 1280 : window.innerWidth);
  const [page, setPage] = useState("dashboard");
  const [vw, setVw] = useState(getWidth());
  const [sideOpen, setSideOpen] = useState(getWidth() > 1024);
  const [expandedGroups, setExpandedGroups] = useState(new Set(["management"]));
  const [mobileMenu, setMobileMenu] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const onResize = useCallback(() => {
    const w = getWidth();
    setVw(w);
    if (w <= 1024) setSideOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [onResize]);

  const isMobile = vw <= 768;
  const isTablet = vw <= 1024;

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) newSet.delete(groupKey);
      else newSet.add(groupKey);
      return newSet;
    });
  };

  const navigateTo = (item) => {
    setPage(item.key);
    if (isMobile) {
      setSideOpen(false);
      setMobileMenu(null);
    }
  };

  const PageComponent = PAGES[page] || DashboardPage;

  return (
    <div dir="rtl" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", width: "100%", fontFamily: "Cairo, sans-serif", background: C.bg, direction: "rtl", position: "relative" }}>
      {isTablet && sideOpen && <div onClick={() => setSideOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 4 }} />}

      <header style={{ background: C.deep, padding: isMobile ? "10px 12px" : "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: 12, minHeight: isMobile ? 60 : 72, width: "100%", zIndex: 5, borderBottom: `2px solid ${C.primaryDark}`, borderBottomLeftRadius: isTablet ? 0 : 20, borderBottomRightRadius: 0, marginRight: !isTablet ? (sideOpen ? 200 : 70) : 0, transition: isTablet ? "none" : "margin-right 0.3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
          {isTablet && <button type="button" onClick={() => setSideOpen((v) => !v)} style={{ border: "none", background: "transparent", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: C.white, fontSize: 20 }}>☰</button>}
          <div style={{ fontSize: 16, fontWeight: 800, color: C.white, fontFamily: "Cairo" }}>📘</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20, flex: 1, justifyContent: "space-between", minWidth: 0 }}>
          <div style={{ display: isMobile ? "none" : "flex", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.white, fontFamily: "Cairo", whiteSpace: "nowrap" }}>{NAV_ITEMS.find(i => i.key === page)?.label || "لوحة التحكم"}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", background: C.white, borderRadius: 25, padding: "8px 16px", gap: 8, flex: 1, minWidth: 0, maxWidth: 400 }}>
            <input type="text" placeholder="ابحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 13, fontFamily: "Cairo", textAlign: "right", minWidth: 0 }} />
            <span style={{ color: C.textLight, fontSize: 14, flexShrink: 0 }}>🔍</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" style={{ width: 40, height: 40, borderRadius: "50%", background: "transparent", border: `1px solid ${C.soft}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.primary, cursor: "pointer", fontSize: 18 }}>☀️</button>
            <button type="button" style={{ width: 40, height: 40, borderRadius: "50%", background: "transparent", border: `1px solid ${C.soft}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.primary, cursor: "pointer", fontSize: 18 }}>🌍</button>
            <button type="button" style={{ width: 40, height: 40, borderRadius: "50%", background: "transparent", border: `1px solid ${C.soft}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.primary, cursor: "pointer", fontSize: 18, position: "relative" }}>
              🔔
              <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, background: C.red, borderRadius: "50%" }} />
            </button>
          </div>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, position: "relative" }}>
        <aside style={{ width: isTablet ? (sideOpen ? 200 : 0) : sideOpen ? 200 : 70, background: C.deep, transition: "width 0.3s ease", overflow: "visible", flexShrink: 0, display: "flex", flexDirection: "column", position: isTablet ? "fixed" : "relative", right: 0, top: isTablet ? (isMobile ? 68 : 82) : 0, marginTop: !isTablet ? 10 : 0, bottom: 0, zIndex: 10, borderTopLeftRadius: 22, borderBottomLeftRadius: 22, borderTopRightRadius: 0, borderBottomRightRadius: 16, borderLeft: `1px solid ${C.primaryDark}`, height: isTablet ? `calc(100vh - ${isMobile ? 68 : 82}px)` : "auto", marginRight: 0 }}>

        {sideOpen && !isMobile && (<div style={{ position: "absolute", top: `-100px`, right: 0, width: 116, height: 100, background: C.deep, borderRadius: "22px 0 0 18px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50, zIndex: 20 }}>
          {/* University logo - replace with actual logo */}
        </div>)}


        <nav style={{ flex: 1, padding: "18px 0 8px", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {NAV_ITEMS.map((item) => (
            <div key={item.key}>
              {item.isGroup ? (<>
                <button type="button" onClick={() => toggleGroup(item.key)} style={{ display: "flex", width: "calc(100% - 10px)", margin: "4px 5px", borderRadius: 12, alignItems: "center", justifyContent: sideOpen ? "flex-start" : "center", gap: sideOpen ? 10 : 0, padding: "12px 8px", cursor: "pointer", color: expandedGroups.has(item.key) ? C.white : C.soft, background: expandedGroups.has(item.key) ? C.primary : "transparent", borderRight: expandedGroups.has(item.key) ? `4px solid ${C.accent}` : "4px solid transparent", border: "none", transition: "all 0.2s" }}>
                  <span style={{ display: "flex", flexShrink: 0, fontSize: 20 }}>{Icons[item.iconKey]}</span>
                  {sideOpen && (<><div style={{ textAlign: "right", flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 500, fontFamily: "Tajawal, sans-serif, Arial, sans-serif", lineHeight: "24px", direction: "rtl" }}>{item.label}</div>
                    <div style={{ fontSize: 14, opacity: 0.6, fontFamily: "Tajawal, sans-serif, Arial, sans-serif", lineHeight: "24px", direction: "rtl" }}>{item.labelEn}</div>
                  </div>
                  <span style={{ fontSize: 14 }}>▼</span></>)}
                </button>
                {sideOpen && expandedGroups.has(item.key) && !isMobile && (<div style={{ display: "flex", flexDirection: "column", background: C.primaryDark, borderRadius: 12, margin: "4px 5px" }}>
                  {item.children?.map((child) => (
                    <button key={child.key} type="button" onClick={() => navigateTo(child)} style={{ display: "flex", width: "calc(100% - 10px)", margin: "3px 5px", borderRadius: 10, alignItems: "center", gap: 8, padding: "10px 16px", cursor: "pointer", color: page === child.key ? C.white : C.soft, background: page === child.key ? `${C.primary}40` : "transparent", borderRight: page === child.key ? `4px solid ${C.accent}` : "4px solid transparent", border: "none", fontFamily: "Tajawal, sans-serif, Arial, sans-serif" }}>
                      <span style={{ fontSize: 16 }}>{Icons[child.iconKey]}</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 500, lineHeight: "24px", direction: "rtl" }}>{child.label}</div>
                        <div style={{ fontSize: 14, opacity: 0.6, lineHeight: "24px", direction: "rtl" }}>{child.labelEn}</div>
                      </div>
                    </button>
                  ))}
                </div>)}
              </>) : (<button type="button" onClick={() => navigateTo(item)} style={{ display: "flex", width: "calc(100% - 10px)", margin: "4px 5px", borderRadius: 12, alignItems: "center", justifyContent: sideOpen ? "flex-start" : "center", gap: sideOpen ? 10 : 0, padding: "12px 8px", cursor: "pointer", color: page === item.key ? C.white : C.soft, background: page === item.key ? C.primary : "transparent", borderRight: page === item.key ? `4px solid ${C.accent}` : "4px solid transparent", border: "none", transition: "all 0.2s" }}>
                <span style={{ display: "flex", flexShrink: 0, fontSize: 20 }}>{Icons[item.iconKey]}</span>
                {sideOpen && (<div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 500, fontFamily: "Tajawal, sans-serif, Arial, sans-serif", lineHeight: "24px", direction: "rtl" }}>{item.label}</div>
                  <div style={{ fontSize: 14, opacity: 0.6, fontFamily: "Tajawal, sans-serif, Arial, sans-serif", lineHeight: "24px", direction: "rtl" }}>{item.labelEn}</div>
                </div>)}
              </button>)}
            </div>
          ))}
        </nav>

        {!isMobile && (<button type="button" onClick={() => setSideOpen(!sideOpen)} style={{ padding: 12, borderTop: `1px solid ${C.primaryDark}`, cursor: "pointer", color: C.soft, fontSize: 16, fontFamily: "Tajawal, sans-serif, Arial, sans-serif", fontWeight: 500, lineHeight: "24px", direction: "rtl", background: "transparent", border: "none", minHeight: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>{sideOpen ? "◀ تصغير" : "▶"}</button>)}

        <div style={{ borderTop: `1px solid ${C.primaryDark}`, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: sideOpen ? "flex-start" : "center", gap: 10, padding: "8px", borderRadius: 6, background: `${C.primary}20` }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, flexShrink: 0, fontSize: 18 }}>👤</div>
            {sideOpen && (<div style={{ textAlign: "right", fontSize: 16, color: C.soft, fontFamily: "Tajawal, sans-serif, Arial, sans-serif", fontWeight: 500, lineHeight: "24px", direction: "rtl" }}>
              <div style={{ fontWeight: 500, color: C.white, fontSize: 16, lineHeight: "24px" }}>المسؤول</div>
              <div style={{ fontSize: 14, lineHeight: "24px", opacity: 0.7 }}>Admin User</div>
            </div>)}
          </div>
          <button type="button" onClick={() => alert("Logout")} style={{ display: "flex", alignItems: "center", justifyContent: sideOpen ? "flex-start" : "center", gap: sideOpen ? 8 : 0, padding: "8px", borderRadius: 6, background: "transparent", border: `1px solid ${C.red}`, color: C.red, cursor: "pointer", fontSize: 11, fontFamily: "Cairo" }}>
            <span style={{ fontSize: 18 }}>🚪</span>
            {sideOpen && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {isMobile && mobileMenu && (<>
          <div onClick={() => setMobileMenu(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 15 }} />
          <div style={{ position: "fixed", top: 120, right: 20, background: C.deep, borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 20, minWidth: 200, border: `1px solid ${C.primaryDark}` }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.primaryDark}`, display: "flex", alignItems: "center", gap: 8, color: C.white, fontFamily: "Cairo", fontWeight: 600 }}>
              <span style={{ fontSize: 18 }}>{Icons[mobileMenu.iconKey]}</span>
              {mobileMenu.label}
            </div>
            {mobileMenu.children?.map((child) => (
              <button key={child.key} onClick={() => navigateTo(child)} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "10px 16px", cursor: "pointer", color: page === child.key ? C.white : C.soft, background: page === child.key ? `${C.primary}40` : "transparent", border: "none", fontSize: 12, fontFamily: "Cairo", borderBottom: `1px solid ${C.primaryDark}` }}>
                <span style={{ fontSize: 16 }}>{Icons[child.iconKey]}</span>
                {child.label}
              </button>
            ))}
          </div>
        </>)}

        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? 10 : isTablet ? 14 : 18, width: "100%", boxSizing: "border-box" }}>
          <PageComponent isMobile={isMobile} isTablet={isTablet} />
        </div>
      </main>
      </div>
    </div>
  );
}
