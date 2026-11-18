// DGA submission: accepted evidence grouped by standard; the officer marks it posted or not posted.
import { useMemo, useState } from 'react';
import { useQiyas } from '../../context/QiyasSession.jsx';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import useToast from '../../hooks/useToast.js';
import { Empty, ErrorNote, Loading, Pager, SUBMISSION_STATUS, StatusBadge, fmtDate, pageProps, pickText, useAction, usePagedApi } from './shared.jsx';
import s from './p1.module.css';

export default function SubmissionPage({ lang }) {
  const t = makeT(lang);
  const q = useQiyas();
  const canPost = q.can('submission.mark_posted');
  const [tab, setTab] = useState('not_posted');
  const [selected, setSelected] = useState(() => new Set());
  const [reference, setReference] = useState('');
  const list = usePagedApi((page, pageSize) => (q.cycleId ? api.get(`/cycles/${q.cycleId}/submission-queue`, { status: tab, page, pageSize }) : Promise.resolve({ items: [], total: 0 })), [q.cycleId, tab]);
  const { error, loading, reload } = list;
  const data = list.items;
  // C5: a closed cycle is read-only, so posting and unposting are not offered
  const cycleClosed = (data ?? []).some((l) => l.cycleOpen === false);
  const officer = canPost && !cycleClosed;
  const act = useAction();
  const { toast, showToast } = useToast();

  const groups = useMemo(() => {
    const m = new Map();
    for (const l of data ?? []) {
      if (!m.has(l.standard_code)) m.set(l.standard_code, { code: l.standard_code, title: { ar: l.standard_ar, en: l.standard_en }, items: [] });
      m.get(l.standard_code).items.push(l);
    }
    return [...m.values()];
  }, [data]);

  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const post = () => act.run(() => api.post('/submission/post', { linkIds: [...selected], dgaReference: reference || undefined }), () => {
    showToast(t('سُجّل الرفع على منصة الهيئة', 'Recorded as posted to DGA', 'DGA پر پوسٹ کے طور پر درج'));
    setSelected(new Set());
    setReference('');
    reload();
  });
  const unpost = (id) => {
    const reason = window.prompt(t('سبب الإرجاع إلى «لم يُرفع» (إلزامي):', 'Why mark it not posted? (required)', 'اسے پوسٹ نہ شدہ کیوں کریں؟ (لازمی)'));
    if (reason) act.run(() => api.post(`/evidence-links/${id}/unpost`, { reason }), () => { showToast(t('تم التحديث', 'Updated', 'اپ ڈیٹ ہو گیا')); reload(); });
  };

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('الرفع على منصة الهيئة', 'DGA submission', 'DGA پر جمع کرانا')}</h1>
          <p className="q-page-sub">{t('الأدلة المقبولة داخليًا. يرفعها المسؤول على منصة الهيئة ثم يسجّلها هنا.', 'Evidence accepted internally. The officer posts it on the DGA portal, then records it here.', 'اندرونی طور پر منظور شدہ ثبوت۔ آفیسر اسے DGA پورٹل پر پوسٹ کر کے یہاں درج کرتا ہے۔')}</p>
        </div>
      </div>
      <div className={s.tabs} role="tablist">
        <button type="button" role="tab" className={s.tab} aria-selected={tab === 'not_posted'} onClick={() => { setTab('not_posted'); setSelected(new Set()); }}>{t('لم يُرفع بعد', 'Not posted yet', 'ابھی پوسٹ نہیں ہوا')}</button>
        <button type="button" role="tab" className={s.tab} aria-selected={tab === 'posted'} onClick={() => { setTab('posted'); setSelected(new Set()); }}>{t('مرفوع', 'Posted', 'پوسٹ شدہ')}</button>
      </div>
      <ErrorNote error={error ?? act.error} lang={lang} />
      {cycleClosed && <p className={s.sub} role="note">{t('الدورة مغلقة وللقراءة فقط؛ يمكن لمدير النظام إعادة فتحها.', 'The cycle is closed and read-only; an administrator can reopen it.', 'یہ دور بند ہے اور صرف پڑھنے کے لیے ہے؛ سسٹم ایڈمنسٹریٹر اسے دوبارہ کھول سکتا ہے۔')}</p>}
      {officer && tab === 'not_posted' && selected.size > 0 && (
        <div className="q-card q-card-pad">
          <div className={s.row}>
            <input className="q-input" style={{ flex: 1, minWidth: 200 }} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('مرجع منصة الهيئة (اختياري)', 'DGA portal reference (optional)', 'DGA پورٹل حوالہ (اختیاری)')} />
            <button type="button" className="q-btn q-btn-primary" disabled={act.busy} onClick={post}>{t(`تسجيل ${selected.size} كمرفوع`, `Mark ${selected.size} as posted`, `${selected.size} کو پوسٹ شدہ درج کریں`)}</button>
          </div>
        </div>
      )}
      {loading && !data ? <Loading lang={lang} /> : groups.length === 0 ? <div className="q-card"><Empty lang={lang} /></div> : groups.map((g) => (
        <section key={g.code} className="q-card">
          <div className="q-card-head"><span className={s.title}><span className="q-code">{g.code}</span> {pickText(lang, g.title)}</span></div>
          <ul className={s.list}>
            {g.items.map((l) => (
              <li key={l.id} className={s.listItem}>
                <div className={s.row} style={{ flexWrap: 'nowrap' }}>
                  {officer && tab === 'not_posted' && <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={t('تحديد', 'Select', 'منتخب کریں')} />}
                  <div className={s.listMain}>
                    <span className={s.title}>{l.title}</span>
                    <span className={s.sub}>{l.original_filename ?? l.external_url} · {l.requirement_code} · {t('قُبل في', 'Accepted on', 'منظوری کی تاریخ')} {fmtDate(l.accepted_at, lang)}</span>
                    {l.posted_at && <span className={s.sub}>{l.posted_by_name} · {fmtDate(l.posted_at, lang)}{l.dga_reference ? ` · ${l.dga_reference}` : ''}</span>}
                    {officer && l.reviewed_by_me && <span className={s.sub} role="note">{t('راجعتَ هذا الدليل؛ يسجّل رفعه مسؤول رفع آخر.', 'You reviewed this evidence; another submission officer must post it.', 'آپ نے اس ثبوت کا جائزہ لیا تھا؛ اسے کوئی دوسرا سبمیشن آفیسر پوسٹ کرے گا۔')}</span>}
                  </div>
                </div>
                <div className={s.row}>
                  <StatusBadge map={SUBMISSION_STATUS} value={l.submission_status} lang={lang} />
                  {l.original_filename && <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => api.download(`/evidence-versions/${l.version_id}/download`, l.original_filename)}>{t('تنزيل', 'Download')}</button>}
                  {officer && tab === 'posted' && <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => unpost(l.id)}>{t('إرجاع إلى «لم يُرفع»', 'Mark not posted', 'پوسٹ نہ شدہ کریں')}</button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {(list.total > 10 || list.page > 1) && <div className="q-card" style={{ padding: 0 }}><Pager pager={list} lang={lang} /></div>}
      {toast && <div className="q-toast" role="status">{toast}</div>}
    </div>
  );
}
SubmissionPage.propTypes = pageProps;
