import { useState } from "react";
import PropTypes from 'prop-types';
import { C } from '../utils/theme.js';
import { Icons } from '../utils/icons.jsx';
import { PERSPECTIVES, STANDARDS_SAMPLE } from '../utils/data.js';
import Badge from '../components/Badge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';

const CatalogPage = ({ isMobile }) => {
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>فهرس المعايير — Standards Catalog Navigator</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PERSPECTIVES.length > 0 ? PERSPECTIVES.map((p) => (
          <div key={p.id} style={{ background: C.cardBg, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" }}>
            <button type="button" onClick={() => setExpanded(expanded === p.id ? null : p.id)} aria-expanded={expanded === p.id} aria-label={`تبديل عرض المنظور ${p.code}`} style={{ display: "flex", width: "100%", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", borderRight: `4px solid ${p.completion >= 80 ? C.green : p.completion >= 50 ? C.orange : C.red}`, borderLeft: "none", borderTop: "none", borderBottom: "none", background: "transparent" }}>
              <span style={{ transform: expanded === p.id ? "rotate(90deg)" : "rotate(180deg)", transition: "transform 0.2s", color: C.textLight, display: "flex" }}>{Icons.chevron}</span>
              <div style={{ flex: 1, textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>{p.code} — {p.name}</div>
                <div style={{ fontSize: 11, color: C.textLight, fontFamily: "Cairo" }}>{p.nameEn} | {p.axes} محاور | {p.standards} معيار</div>
              </div>
              <div style={{ width: isMobile ? 80 : 120 }}><ProgressBar value={p.completion} height={6} /></div>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.primaryDark, width: isMobile ? 30 : 40, textAlign: "center", fontFamily: "Cairo" }}>{p.completion}%</span>
            </button>
            {expanded === p.id && (
              <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  {STANDARDS_SAMPLE.filter((s) => s.perspId === p.id).map((s) => {
                    const pct = s.reqCount > 0 ? Math.round((s.approved / s.reqCount) * 100) : 0;
                    return (
                      <div key={s.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: C.bg, borderRadius: 6 }}>
                        <Badge status={s.status} />
                        <div style={{ flex: 1, textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.textDark, fontFamily: "Cairo" }}>{s.code} — {s.title}</div>
                          <div style={{ fontSize: 11, color: C.textLight, fontFamily: "Cairo" }}>{s.titleEn}</div>
                        </div>
                        <div style={{ width: isMobile ? 60 : 80 }}><ProgressBar value={pct} height={5} /></div>
                        <span style={{ fontSize: 11, color: C.textLight, fontFamily: "Cairo", width: isMobile ? 50 : 60, textAlign: "center" }}>{s.approved}/{s.reqCount} شاهد</span>
                      </div>
                    );
                  })}
                  {STANDARDS_SAMPLE.filter((s) => s.perspId === p.id).length === 0 && <div style={{ fontSize: 12, color: C.textLight, padding: 10, textAlign: "center", fontFamily: "Cairo" }}>لا توجد معايير مسجلة حالياً في هذا المنظور</div>}
                </div>
              </div>
            )}
          </div>
        )) : (
          <div style={{ background: C.cardBg, borderRadius: 10, padding: 20, textAlign: 'center', color: C.textLight }}>
            لا توجد بيانات معايير حاليا
          </div>
        )}
      </div>
    </div>
  );
};

CatalogPage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
};

export default CatalogPage;