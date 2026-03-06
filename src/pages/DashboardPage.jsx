import PropTypes from 'prop-types';
import { C, cardGradients } from '../utils/theme.js';
import { PERSPECTIVES, RECENT_ACTIVITIES } from '../utils/data.js';
import StatCard from '../components/StatCard.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { Icons } from '../utils/icons.jsx';

const DashboardPage = ({ isMobile }) => {
  const totalStd = 95;
  const full = 55, partial = 27, non = 13;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>المؤشرات الرئيسية للأداء — Key Performance Indicators</h2>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(332px, 383px))", gap: 20, justifyContent: "center" }}>
        <StatCard label="إجمالي المعايير" value={totalStd} sub="Total Standards" gradient={cardGradients.purple} icon="catalog" isMobile={isMobile} change={0} />
        <StatCard label="التزام كلي" value={full} sub="Full Compliance" gradient={cardGradients.green} icon="check" isMobile={isMobile} change={12.3} />
        <StatCard label="التزام جزئي" value={partial} sub="Partial" gradient={cardGradients.accent} icon="clock" isMobile={isMobile} change={8.5} />
        <StatCard label="عدم الالتزام" value={`${non}`} sub="Non Compliance" gradient={cardGradients.teal} icon="x" isMobile={isMobile} change={5.2} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <div style={{ background: C.cardBg, borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>نسبة الإنجاز حسب المنظور — Completion by Perspective</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PERSPECTIVES.length > 0 ? PERSPECTIVES.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: C.textLight, width: 28, textAlign: "center", fontFamily: "Cairo", fontWeight: 700 }}>{p.completion}%</span>
                <div style={{ flex: 1 }}><ProgressBar value={p.completion} height={8} /></div>
                <span style={{ fontSize: 12, color: C.textDark, minWidth: 140, textAlign: "right", fontFamily: "Cairo" }}>{p.name}</span>
              </div>
            )) : (
              <p style={{ color: C.textLight, textAlign: 'center' }}>لا توجد بيانات للمناظير حاليا</p>
            )}
          </div>
        </div>

        <div style={{ background: C.cardBg, borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: C.primaryDark, fontFamily: "Cairo" }}>النشاطات الأخيرة — Recent Activity</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {RECENT_ACTIVITIES.length > 0 ? RECENT_ACTIVITIES.map((a, i) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < RECENT_ACTIVITIES.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.type === "approve" ? C.green : a.type === "reject" ? C.red : a.type === "revision" ? C.orange : C.primary, flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: C.textDark, fontFamily: "Cairo" }}><strong>{a.user}</strong> — {a.action}</div>
                  <div style={{ fontSize: 11, color: C.textLight, fontFamily: "Cairo" }}>المعيار {a.standard} | {a.time}</div>
                </div>
              </div>
            )) : (
              <p style={{ color: C.textLight, textAlign: 'center' }}>لا توجد نشاطات حديثة</p>
            )}
          </div>
        </div>
      </div>

      <div style={{ background: C.redLight, borderRadius: 10, padding: 16, border: `1px solid ${C.red}20`, display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ color: C.red, flexShrink: 0, marginTop: 2 }}>{Icons.alert}</span>
        <div style={{ textAlign: "right", fontFamily: "Cairo" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.red }}>تنبيهات الاختناقات — Bottleneck Alerts</div>
          <div style={{ fontSize: 12, color: C.textDark, marginTop: 4 }}>4 معايير بحالة "عدم التزام" لم يُرفع لها أي شاهد بعد (5.10.3, 5.13.5, 5.22.2, 5.23.1) — 12 مهمة متأخرة عن الموعد المحدد — متوسط وقت المراجعة: 4.2 أيام</div>
        </div>
      </div>
    </div>
  );
};

DashboardPage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
};

export default DashboardPage;