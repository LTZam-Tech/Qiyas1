// Reports (docs/phase1/08 §6): pick a report, read it on screen, download it as Excel or print it to PDF.
// Every report is for the selected cycle, in the reader's language, stamped with "data as of".
import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useQiyas } from '../../context/QiyasSession.jsx';
import { dirOf, makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import { Empty, ErrorNote, Loading, fmtDate, pageProps, useAction, useApi } from './shared.jsx';
import s from './p1.module.css';

const fmt = (v, type, lang) => {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'percent') return `${Number(v).toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA-u-nu-latn')}%`;
  if (type === 'datetime') return fmtDate(v, lang, true);
  if (type === 'date') return fmtDate(v, lang);
  if (type === 'number') return Number(v).toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA-u-nu-latn');
  return String(v);
};

const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Opens the report alone in a print window (the app's menus are not printed); the browser saves it as PDF. */
function printReport(r, lang, labels) {
  const dir = dirOf(lang);
  const cell = (row, c) => `<td class="${c.type}"${c.type === 'code' ? ' dir="ltr"' : ''}>${esc(fmt(row[c.key], c.type, lang))}</td>`;
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(r.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif; color: #111; font-size: 10.5px; }
  h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 16px 0 6px; } .meta { color: #555; margin-bottom: 10px; }
  .sum { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; } .sum div { border: 1px solid #ccc; border-radius: 6px; padding: 6px 10px; }
  .sum b { display: block; font-size: 14px; } table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  th, td { border: 1px solid #ccc; padding: 3px 5px; text-align: start; vertical-align: top; } th { background: #0f5a5a; color: #fff; }
  tr { page-break-inside: avoid; } thead { display: table-header-group; } td.number, td.percent { text-align: end; white-space: nowrap; }
  td.code, td.datetime { white-space: nowrap; } .note { color: #555; font-style: italic; }
</style></head><body>
<h1>${esc(r.title)}</h1>${r.subtitle ? `<div>${esc(r.subtitle)}</div>` : ''}
<div class="meta">${esc(labels.cycle)}: ${esc(r.cycle?.name ?? '')} · ${esc(labels.asOf)}: ${esc(fmtDate(r.asOf, lang, true))}</div>
<div class="sum">${r.summary.map((x) => `<div>${esc(x.label)}<b>${esc(fmt(x.value, x.type, lang))}</b></div>`).join('')}</div>
${r.sections.map((sec) => `<h2>${esc(sec.title)}</h2>${sec.note ? `<p class="note">${esc(sec.note)}</p>` : ''}
${sec.rows.length ? `<table><thead><tr>${sec.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
<tbody>${sec.rows.map((row) => `<tr>${sec.columns.map((c) => cell(row, c)).join('')}</tr>`).join('')}</tbody></table>` : `<p class="note">${esc(labels.empty)}</p>`}`).join('')}
<script>window.onload = () => { window.print(); };</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

function Params({ lang, report, value, onChange }) {
  const t = makeT(lang);
  const q = useQiyas();
  const needsRequirement = report.params.includes('cycleRequirementId');
  const { data: readiness } = useApi(() => (needsRequirement && q.cycleId ? api.get(`/cycles/${q.cycleId}/readiness`) : Promise.resolve(null)), [needsRequirement, q.cycleId]);
  const requirements = useMemo(() => (readiness?.perspectives ?? []).flatMap((p) => p.axes.flatMap((a) => a.standards.flatMap((st) => st.requirements))), [readiness]);
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value || undefined });
  if (!report.params.length) return null;
  return (
    <div className={s.row} style={{ marginTop: 10 }}>
      {needsRequirement && (
        <label className={s.field} style={{ minWidth: 260, flex: 1 }}>{t('المتطلب', 'Requirement', 'شرط')}
          <select className="q-input" value={value.cycleRequirementId ?? ''} onChange={set('cycleRequirementId')}>
            <option value="">{t('اختر متطلبًا', 'Choose a requirement', 'شرط منتخب کریں')}</option>
            {requirements.map((r) => <option key={r.id} value={r.id}>{`⁦${r.code}⁩ — ${(lang === 'ar' ? r.text.ar : lang === 'ur' ? r.text.ur || r.text.ar : r.text.en).slice(0, 90)}`}</option>)}
          </select>
        </label>
      )}
      {report.params.includes('from') && (
        <label className={s.field}>{t('من', 'From', 'سے')}<input className="q-input" type="date" value={value.from ?? ''} onChange={set('from')} /></label>
      )}
      {report.params.includes('to') && (
        <label className={s.field}>{t('إلى', 'To', 'تک')}<input className="q-input" type="date" value={value.to ?? ''} onChange={set('to')} /></label>
      )}
      {report.params.includes('entityType') && (
        <label className={s.field}>{t('نوع السجل', 'Record type', 'ریکارڈ کی قسم')}
          <input className="q-input" dir="ltr" value={value.entityType ?? ''} onChange={set('entityType')} placeholder="task, evidence_link…" />
        </label>
      )}
      {report.params.includes('action') && (
        <label className={s.field}>{t('الإجراء يبدأ بـ', 'Action starts with', 'عمل کا آغاز')}
          <input className="q-input" dir="ltr" value={value.action ?? ''} onChange={set('action')} placeholder="evidence." />
        </label>
      )}
    </div>
  );
}
Params.propTypes = { lang: PropTypes.string.isRequired, report: PropTypes.object.isRequired, value: PropTypes.object.isRequired, onChange: PropTypes.func.isRequired };

function ReportView({ lang, report }) {
  const t = makeT(lang);
  return (
    <section className="q-card q-card-pad">
      <h2 className="q-section-title">{report.title}</h2>
      {report.subtitle && <p dir="auto" style={{ marginTop: 4 }}>{report.subtitle}</p>}
      <p className={s.sub}>{t('الدورة', 'Cycle', 'دور')}: {report.cycle?.name} · {t('البيانات حتى', 'Data as of', 'ڈیٹا بمطابق')}: <bdi>{fmtDate(report.asOf, lang, true)}</bdi></p>
      <div className={s.row} style={{ margin: '12px 0' }}>
        {report.summary.map((x) => (
          <div key={x.label} className="q-card" style={{ padding: '10px 14px', minWidth: 140 }}>
            <div className={s.kpiLabel}>{x.label}</div>
            <div style={{ fontWeight: 700, fontSize: '1.15rem' }} dir="auto">{fmt(x.value, x.type, lang)}</div>
          </div>
        ))}
      </div>
      {report.sections.map((sec) => (
        <div key={sec.key} style={{ marginTop: 18 }}>
          <h3 className="q-section-title" style={{ fontSize: '0.95rem' }}>{sec.title} <span className={s.sub}>({sec.rows.length})</span></h3>
          {sec.note && <p className={s.sub}>{sec.note}</p>}
          {sec.rows.length === 0 ? <p className={s.sub}>{t('لا توجد بيانات', 'No data', 'کوئی ڈیٹا نہیں')}</p> : (
            <div className="q-table-wrap" style={{ maxHeight: 420, overflow: 'auto', marginTop: 6 }}>
              <table className="q-table">
                <thead><tr>{sec.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {sec.rows.slice(0, 500).map((row, i) => (
                    <tr key={i}>
                      {sec.columns.map((c) => (
                        <td key={c.key} dir={c.type === 'code' ? 'ltr' : 'auto'} style={c.type === 'number' || c.type === 'percent' ? { textAlign: 'end', whiteSpace: 'nowrap' } : c.type === 'text' ? { minWidth: 160 } : { whiteSpace: 'nowrap' }}>
                          {c.type === 'code' ? <span className="q-code">{fmt(row[c.key], c.type, lang)}</span> : fmt(row[c.key], c.type, lang)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sec.rows.length > 500 && <p className={s.sub}>{t('تُعرض أول 500 صف؛ نزّل ملف Excel للكل.', 'Showing the first 500 rows; download Excel for all.', 'پہلی 500 قطاریں؛ سب کے لیے Excel ڈاؤن لوڈ کریں۔')}</p>}
        </div>
      ))}
    </section>
  );
}
ReportView.propTypes = { lang: PropTypes.string.isRequired, report: PropTypes.object.isRequired };

export default function ReportsPage({ lang }) {
  const t = makeT(lang);
  const q = useQiyas();
  const { data: reports, error, loading } = useApi(() => api.get('/reports', { lang }), [lang]);
  const [chosen, setChosen] = useState(null);
  const [params, setParams] = useState({});
  const [view, setView] = useState(null);
  const act = useAction();
  const report = (reports ?? []).find((r) => r.code === chosen);
  const query = (format) => ({ cycleId: q.cycleId, lang, format, ...params });
  const missing = report?.params.includes('cycleRequirementId') && !params.cycleRequirementId;
  const labels = { cycle: t('الدورة', 'Cycle', 'دور'), asOf: t('البيانات حتى', 'Data as of', 'ڈیٹا بمطابق'), empty: t('لا توجد بيانات', 'No data', 'کوئی ڈیٹا نہیں') };

  const pick = (code) => { setChosen(code); setParams({}); setView(null); };
  const show = () => act.run(() => api.get(`/reports/${chosen}`, query('view')), setView);
  const excel = () => act.run(() => api.download(`/reports/${chosen}?${new URLSearchParams(Object.entries(query('xlsx')).filter(([, v]) => v))}`, `${report.title}.xlsx`));
  const print = () => act.run(async () => {
    const r = view ?? await api.get(`/reports/${chosen}`, query('view'));
    setView(r);
    if (!printReport(r, lang, labels)) throw new Error(t('اسمح بالنوافذ المنبثقة للطباعة', 'Allow pop-ups to print', 'پرنٹ کے لیے پاپ اپ کی اجازت دیں'));
  });

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('التقارير', 'Reports', 'رپورٹس')}</h1>
          <p className="q-page-sub">{t(
            'كل تقرير للدورة المختارة وبلغتك، ويُصدَّر إلى Excel أو يُطبع PDF. الأرقام من البيانات الحية لحظة الإنشاء.',
            'Every report is for the selected cycle and in your language, exported to Excel or printed to PDF. Figures are live at the moment it is generated.',
            'ہر رپورٹ منتخب دور کی اور آپ کی زبان میں ہے، Excel میں برآمد یا PDF میں پرنٹ ہوتی ہے۔ اعداد و شمار بنانے کے وقت کے ہیں۔',
          )}</p>
        </div>
      </div>
      <ErrorNote error={error} lang={lang} />
      {loading && !reports ? <Loading lang={lang} /> : (reports ?? []).length === 0 ? <Empty lang={lang} title={t('لا توجد تقارير متاحة لدورك', 'No reports for your role', 'آپ کے کردار کے لیے کوئی رپورٹ نہیں')} /> : (
        <div className={s.grid2} style={{ gap: 12 }}>
          {reports.map((r) => (
            <button key={r.code} type="button" className="q-card q-card-pad" aria-pressed={chosen === r.code} onClick={() => pick(r.code)}
              style={{ textAlign: 'start', borderColor: chosen === r.code ? 'var(--primary)' : undefined, boxShadow: chosen === r.code ? '0 0 0 1px var(--primary)' : undefined }}>
              <span className={s.title}>{r.title}</span>
              <span className={s.sub} style={{ display: 'block', marginTop: 4 }}>{r.description}</span>
            </button>
          ))}
        </div>
      )}
      {report && (
        <section className="q-card q-card-pad">
          <div className={s.between}>
            <span className={s.title}>{report.title} · <span className={s.sub}>{q.cycle?.name}</span></span>
            <div className={s.row}>
              <button type="button" className="q-btn q-btn-primary" disabled={act.busy || missing} onClick={show}>{t('عرض', 'View', 'دیکھیں')}</button>
              <button type="button" className="q-btn q-btn-secondary" disabled={act.busy || missing} onClick={excel}>Excel</button>
              <button type="button" className="q-btn q-btn-secondary" disabled={act.busy || missing} onClick={print}>{t('طباعة / PDF', 'Print / PDF', 'پرنٹ / PDF')}</button>
            </div>
          </div>
          <Params lang={lang} report={report} value={params} onChange={(v) => { setParams(v); setView(null); }} />
          <ErrorNote error={act.error} lang={lang} />
        </section>
      )}
      {act.busy && !view && <Loading lang={lang} />}
      {view && view.code === chosen && <ReportView lang={lang} report={view} />}
    </div>
  );
}
ReportsPage.propTypes = pageProps;
