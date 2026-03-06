import { C, cardGradients } from '../utils/theme.js';
import { Icons } from '../utils/icons.jsx';
import { TASKS_DATA } from '../utils/data.js';
import Badge from '../components/Badge.jsx';
import StatCard from '../components/StatCard.jsx';

const ReviewPage = ({ isMobile, isTablet }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>المراجعة والاعتماد — Review & Approval</h2>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(332px, 383px))", gap: 20, justifyContent: "center" }}>
      <StatCard label="بانتظار المراجعة" value="18" sub="Pending Review" gradient={cardGradients.accent} icon="clock" isMobile={isMobile} />
      <StatCard label="معتمد هذا الأسبوع" value="12" sub="Approved This Week" gradient={cardGradients.green} icon="check" isMobile={isMobile} change={2.0} />
      <StatCard label="طلب مراجعة" value="7" sub="Revision Requested" gradient={cardGradients.purple} icon="review" isMobile={isMobile} />
      <StatCard label="مرفوض" value="3" sub="Rejected" gradient={cardGradients.pink} icon="x" isMobile={isMobile} />
    </div>
    <div style={{ background: C.cardBg, borderRadius: 10, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>قائمة المراجعات المعلقة — Pending Reviews Queue</h3>
      {TASKS_DATA.filter((t) => t.status === "submitted" || t.status === "revision").map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" aria-label={`اعتماد ${t.req}`} style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: C.green, color: C.white, fontSize: 11, fontFamily: "Cairo", cursor: "pointer", fontWeight: 600 }}>اعتماد</button>
            <button type="button" aria-label={`طلب مراجعة ${t.req}`} style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: C.orange, color: C.white, fontSize: 11, fontFamily: "Cairo", cursor: "pointer", fontWeight: 600 }}>مراجعة</button>
            <button type="button" aria-label={`رفض ${t.req}`} style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: C.red, color: C.white, fontSize: 11, fontFamily: "Cairo", cursor: "pointer", fontWeight: 600 }}>رفض</button>
          </div>
          <div style={{ flex: 1, textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.textDark, fontFamily: "Cairo" }}>{t.req}</div>
            <div style={{ fontSize: 11, color: C.textLight, fontFamily: "Cairo" }}>المعيار: {t.code} | المسؤول: {t.assignee}</div>
          </div>
          <Badge status={t.status} />
        </div>
      ))}
    </div>
  </div>
);

export default ReviewPage;