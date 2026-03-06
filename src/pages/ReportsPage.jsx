import { C } from '../utils/theme.js';
import { Icons } from '../utils/icons.jsx';

const ReportsPage = ({ isMobile, isTablet }) => {
  return (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>التقارير وحزم التدقيق — Reports & Audit Packs</h2>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(332px, 383px))", gap: 20, justifyContent: "center" }}>
      {[
        { title: "تقرير التقييم الذاتي", titleEn: "Self-Assessment Report", desc: "تقرير شامل عن حالة كل معيار مع نسبة الإنجاز والفجوات" },
        { title: "سجل الشواهد", titleEn: "Evidence Register", desc: "قائمة كاملة بجميع الشواهد المرفوعة مع البيانات الوصفية وحالة الاعتماد" },
        { title: "حزمة التدقيق الكاملة", titleEn: "Full Audit Pack (ZIP)", desc: "ملفات الشواهد المعتمدة + السجل + ملخص المراجعات + مسار التدقيق" },
        { title: "تقرير عدم الامتثال", titleEn: "Non-Compliance Report", desc: "المعايير غير المستوفاة مع خطة المعالجة والمواعيد والمسؤولين" },
        { title: "ملخص تنفيذي", titleEn: "Executive Summary", desc: "ملخص للإدارة العليا: نسب الإنجاز، الاختناقات، التوصيات" },
        { title: "تقرير أداء المراجعين", titleEn: "Reviewer SLA Report", desc: "متوسط وقت المراجعة، نسبة الرفض، أسباب الرفض الأكثر تكراراً" },
      ].map((r, i) => (
        <div key={i} style={{ background: C.cardBg, borderRadius: 10, padding: "25.6px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 383, minHeight: 143, justifyContent: "space-between", direction: "rtl" }}>
          <div style={{ flex: 1, textAlign: "right", minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
            <div style={{ fontSize: 9, color: C.accent, fontFamily: "Cairo", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.titleEn}</div>
            <div style={{ fontSize: 10, color: C.textLight, fontFamily: "Cairo", marginTop: 3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: "1.3" }}>{r.desc}</div>
          </div>
        </div>
      ))}
    </div>
  </div>
  );
};

export default ReportsPage;