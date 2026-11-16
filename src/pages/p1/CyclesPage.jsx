// Measurement cycles: create a cycle on an active DGA version, open it, close it at the end
// (BR-FW, BR-BNK-01: closing makes its evidence bank read-only). Consultants and administrators.
import { useState } from 'react';
import { useQiyas } from '../../context/QiyasSession.jsx';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import useToast from '../../hooks/useToast.js';
import { Empty, ErrorNote, Loading, Pager, fmtDate, pageProps, pickText, useAction, useApi, usePager } from './shared.jsx';
import s from './p1.module.css';

const STATUS = {
  planning: ['قيد الإعداد', 'Planning', 'تیاری میں', 'q-tone-neutral'],
  active: ['مفتوحة', 'Open', 'جاری', 'q-tone-success'],
  closed: ['مغلقة', 'Closed', 'بند', 'q-tone-warning'],
  archived: ['مؤرشفة', 'Archived', 'محفوظ شدہ', 'q-tone-neutral'],
};

export default function CyclesPage({ lang }) {
  const t = makeT(lang);
  const q = useQiyas();
  const isAdmin = q.hasRole('ADM');
  const cycles = useApi(() => api.get('/cycles'), []);
  const frameworks = useApi(() => api.get('/frameworks'), []);
  const pager = usePager(cycles.data);
  const act = useAction();
  const { toast, showToast } = useToast();
  const year = new Date().getFullYear();
  const active = (frameworks.data ?? []).filter((f) => f.status === 'active');
  const [form, setForm] = useState({ frameworkVersionId: '', year, name: '', startsOn: `${year}-01-01`, endsOn: `${year}-12-31`, internalTargetOn: '' });
  const fv = active.find((f) => f.id === form.frameworkVersionId) ?? active[0];
  const name = form.name || (fv ? `Qiyas ${form.year} / v${fv.version}` : '');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const after = (msg) => () => { showToast(msg); cycles.reload(); q.refresh(); };

  const create = (e) => {
    e.preventDefault();
    act.run(() => api.post('/cycles', {
      frameworkVersionId: fv.id, year: Number(form.year), name, startsOn: form.startsOn, endsOn: form.endsOn, internalTargetOn: form.internalTargetOn || null,
    }), after(t('أُنشئت الدورة؛ افتحها لبدء العمل', 'Cycle created; open it to start work', 'دور بن گیا؛ کام شروع کرنے کے لیے اسے کھولیں')));
  };
  const move = (c, event) => {
    let reason;
    if (event === 'reopen') {
      reason = window.prompt(t('سبب إعادة الفتح (إلزامي):', 'Why reopen it? (required)', 'دوبارہ کھولنے کی وجہ (لازمی):'));
      if (!reason) return;
    }
    if (event === 'close' && !window.confirm(t('إغلاق الدورة يجعل بنك أدلتها للقراءة فقط. متابعة؟', 'Closing the cycle makes its evidence bank read-only. Continue?', 'دور بند کرنے سے اس کا ثبوت بینک صرف پڑھنے کے لیے ہو جاتا ہے۔ جاری رکھیں؟'))) return;
    act.run(() => api.post(`/cycles/${c.id}/transition`, { event, reason }), after(t('تم التحديث', 'Updated', 'اپ ڈیٹ ہو گیا')));
  };

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('دورات القياس', 'Measurement cycles', 'پیمائشی ادوار')}</h1>
          <p className="q-page-sub">{t(
            'كل دورة تستخدم إصدارًا معتمدًا من معايير الهيئة ولها بنك أدلة مستقل. تُفتح للعمل وتُغلق بعد الرفع فيصبح بنكها للقراءة فقط.',
            'Each cycle uses one active version of the DGA standards and has its own evidence bank. Open it for work; close it after submission and its bank becomes read-only.',
            'ہر دور DGA معیارات کا ایک فعال ورژن استعمال کرتا ہے اور اس کا اپنا ثبوت بینک ہوتا ہے۔ کام کے لیے کھولیں؛ جمع کرانے کے بعد بند کریں تو بینک صرف پڑھنے کے لیے ہو جاتا ہے۔',
          )}</p>
        </div>
      </div>

      <form className="q-card q-card-pad" onSubmit={create}>
        <h2 className="q-section-title" style={{ marginBottom: 10 }}>{t('دورة جديدة', 'New cycle', 'نیا دور')}</h2>
        {frameworks.loading && !frameworks.data ? <Loading lang={lang} /> : !active.length ? (
          <p className={s.sub}>{t('لا يوجد إصدار معتمد من المعايير.', 'No active version of the standards.', 'معیارات کا کوئی فعال ورژن نہیں۔')}</p>
        ) : (
          <div className={s.grid2}>
            <label className={s.field}>{t('إصدار المعايير', 'Standards version', 'معیارات کا ورژن')}
              <select className="q-input" value={fv?.id ?? ''} onChange={set('frameworkVersionId')}>
                {active.map((f) => <option key={f.id} value={f.id}>{`${pickText(lang, { ar: f.title_ar, en: f.title_en })} — v${f.version}`}</option>)}
              </select>
            </label>
            <label className={s.field}>{t('السنة', 'Year', 'سال')}
              <input className="q-input" type="number" min="2000" max="2100" value={form.year} onChange={set('year')} />
            </label>
            <label className={s.field}>{t('الاسم', 'Name', 'نام')}
              <input className="q-input" dir="auto" value={name} onChange={set('name')} required />
            </label>
            <label className={s.field}>{t('الموعد الداخلي المستهدف (اختياري)', 'Internal target date (optional)', 'اندرونی ہدف کی تاریخ (اختیاری)')}
              <input className="q-input" type="date" value={form.internalTargetOn} onChange={set('internalTargetOn')} />
            </label>
            <label className={s.field}>{t('تبدأ في', 'Starts on', 'آغاز')}
              <input className="q-input" type="date" value={form.startsOn} onChange={set('startsOn')} required />
            </label>
            <label className={s.field}>{t('تنتهي في', 'Ends on', 'اختتام')}
              <input className="q-input" type="date" value={form.endsOn} onChange={set('endsOn')} required />
            </label>
          </div>
        )}
        <ErrorNote error={act.error} lang={lang} />
        {active.length > 0 && <div style={{ marginTop: 12 }}><button type="submit" className="q-btn q-btn-primary" disabled={act.busy || !name}>{t('إنشاء الدورة', 'Create cycle', 'دور بنائیں')}</button></div>}
      </form>

      <section className="q-card">
        {cycles.loading && !cycles.data ? <Loading lang={lang} /> : (cycles.data ?? []).length === 0 ? (
          <Empty lang={lang} title={t('لا توجد دورات بعد', 'No cycles yet', 'ابھی کوئی دور نہیں')} />
        ) : (
          <div className="q-table-wrap">
            <table className="q-table">
              <thead>
                <tr>
                  <th>{t('الدورة', 'Cycle', 'دور')}</th><th>{t('المعايير', 'Standards', 'معیارات')}</th><th>{t('الفترة', 'Period', 'مدت')}</th>
                  <th>{t('الحالة', 'Status', 'حالت')}</th><th>{t('بنك الأدلة', 'Evidence bank', 'ثبوت کا بینک')}</th><th />
                </tr>
              </thead>
              <tbody>
                {pager.items.map((c) => {
                  const [ar, en, ur, tone] = STATUS[c.status] ?? STATUS.planning;
                  return (
                    <tr key={c.id}>
                      <td className="q-cell-strong" dir="auto">{c.name}</td>
                      <td><span className="q-code">v{c.version}</span></td>
                      <td className="q-cell-muted"><bdi>{fmtDate(c.starts_on, lang)}</bdi> – <bdi>{fmtDate(c.ends_on, lang)}</bdi></td>
                      <td><span className={`q-badge ${tone}`}>{t(ar, en, ur)}</span></td>
                      <td className="q-cell-muted">{c.bank_status === 'open' ? t('مفتوح', 'Open', 'کھلا') : t('للقراءة فقط', 'Read-only', 'صرف پڑھنے کے لیے')}</td>
                      <td>
                        <div className={s.row}>
                          {c.status === 'planning' && <button type="button" className="q-btn q-btn-primary q-btn-sm" disabled={act.busy} onClick={() => move(c, 'open')}>{t('فتح', 'Open', 'کھولیں')}</button>}
                          {c.status === 'active' && <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={act.busy} onClick={() => move(c, 'close')}>{t('إغلاق', 'Close', 'بند کریں')}</button>}
                          {c.status === 'closed' && isAdmin && <button type="button" className="q-btn q-btn-ghost q-btn-sm" disabled={act.busy} onClick={() => move(c, 'reopen')}>{t('إعادة فتح', 'Reopen', 'دوبارہ کھولیں')}</button>}
                          {c.status === 'closed' && isAdmin && <button type="button" className="q-btn q-btn-ghost q-btn-sm" disabled={act.busy} onClick={() => move(c, 'archive')}>{t('أرشفة', 'Archive', 'محفوظ کریں')}</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager pager={pager} lang={lang} />
      </section>
      {toast && <div className="q-toast" role="status">{toast}</div>}
    </div>
  );
}
CyclesPage.propTypes = pageProps;
