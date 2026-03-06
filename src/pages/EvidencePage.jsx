import PropTypes from 'prop-types';
import { C } from '../utils/theme.js';
import { Icons } from '../utils/icons.jsx';
import { STANDARDS_SAMPLE } from '../utils/data.js';
import Badge from '../components/Badge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';

const EvidencePage = ({ isMobile }) => {
  return (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>خزنة الأدلة — Evidence Locker</h2>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(332px, 383px))", gap: 20, justifyContent: "center" }}>
      {STANDARDS_SAMPLE.length > 0 ? STANDARDS_SAMPLE.slice(0, 6).map((s) => {
        const pct = Math.round((s.approved / s.reqCount) * 100);
        return (
          <div key={s.code} style={{ background: C.cardBg, borderRadius: 10, padding: "25.6px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderTop: `3px solid ${s.status === "non" ? C.red : s.status === "partial" ? C.orange : C.green}`, width: "100%", maxWidth: 383, minHeight: 143, display: "flex", flexDirection: "column", justifyContent: "space-between", direction: "rtl" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><Badge status={s.status} /><span style={{ fontSize: 15, fontWeight: 800, color: C.primaryDark, fontFamily: "Cairo" }}>{s.code}</span></div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.textDark, fontFamily: "Cairo", textAlign: "right", marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: C.textLight, fontFamily: "Cairo", textAlign: "right", marginBottom: 10 }}>{s.titleEn}</div>
            <ProgressBar value={pct} height={6} />
            <div style={{ fontSize: 11, color: C.textLight, fontFamily: "Cairo", textAlign: "center", marginTop: 6 }}>{s.approved} / {s.reqCount} شاهد معتمد — {pct}%</div>
          </div>
        );
      }) : (
        <div style={{ background: C.cardBg, borderRadius: 10, padding: 16, color: C.textLight, textAlign: 'center' }}>
          لا توجد ادلة مرفوعة حاليا
        </div>
      )}
    </div>
    <button type="button" aria-label="رفع شاهد جديد" style={{ border: `2px dashed ${C.border}`, borderRadius: 10, padding: 40, textAlign: "center", background: C.light, cursor: "pointer", width: "100%", fontFamily: "inherit" }}>
      <div style={{ color: C.primary, marginBottom: 10, display: "flex", justifyContent: "center" }}>{Icons.upload}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>رفع شاهد جديد — Upload New Evidence</div>
      <div style={{ fontSize: 12, color: C.textLight, fontFamily: "Cairo", marginTop: 4 }}>اسحب الملفات هنا أو اضغط للاختيار — PDF, PNG, XLSX, DOCX</div>
      <div style={{ fontSize: 11, color: C.accent, fontFamily: "Cairo", marginTop: 8 }}>تسمية الملف: [StandardCode]_[SystemName]_[ScreenName]_[YYYYMMDD].ext</div>
    </button>
  </div>
  );
};

EvidencePage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
};

export default EvidencePage;