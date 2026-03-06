import { useState, useMemo } from "react";
import { C } from '../utils/theme.js';
import { TASKS_DATA } from '../utils/data.js';
import Badge from '../components/Badge.jsx';

const TasksPage = ({ isMobile, isTablet }) => {
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(() => (filter === "all" ? TASKS_DATA : TASKS_DATA.filter((t) => t.status === filter)), [filter]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["all", "الكل"], ["active", "نشط"], ["submitted", "مُقدَّم"], ["revision", "مراجعة"], ["approved", "معتمد"]].map(([k, l]) => (
            <button type="button" aria-label={`فلترة المهام: ${l}`} key={k} onClick={() => setFilter(k)} style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${filter === k ? C.primary : C.border}`, background: filter === k ? C.primary : C.cardBg, color: filter === k ? C.white : C.textMid, fontSize: 12, fontFamily: "Cairo", fontWeight: 600, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>إدارة المهام — Task Management</h2>
      </div>
      <div style={{ background: C.cardBg, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: isMobile ? 600 : 820, borderCollapse: "collapse", fontFamily: "Cairo" }}>
          <thead><tr style={{ background: C.primary }}>{["الأولوية", "الحالة", "الموعد النهائي", "المسؤول", "الشاهد المطلوب", "المعيار"].map((h) => <th key={h} style={{ padding: "10px 12px", color: C.white, fontSize: 12, fontWeight: 700, textAlign: "right", fontFamily: "Cairo" }}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={t.id} style={{ background: i % 2 === 0 ? C.white : C.bg, borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "10px 12px", textAlign: "center" }}><Badge status={t.priority} /></td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}><Badge status={t.status} /></td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: C.textDark, textAlign: "center", direction: "ltr" }}>{t.due}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: C.textDark, textAlign: "right" }}>{t.assignee}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: C.textDark, textAlign: "right" }}>{t.req}</td>
                <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: C.primaryDark, textAlign: "center" }}>{t.code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TasksPage;