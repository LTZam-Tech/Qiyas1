// Shared review queue for consultants: claim, inspect, accept or reject with comments (D9: never your own uploads).
import { useState } from 'react';
import { useQiyas } from '../../context/QiyasSession.jsx';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import useToast from '../../hooks/useToast.js';
import { Empty, ErrorNote, Loading, Pager, REVIEW_STATUS, StatusBadge, fmtDate, pageProps, pickText, useAction, usePagedApi } from './shared.jsx';
import s from './p1.module.css';

export default function ReviewQueuePage({ lang, onNavigate }) {
  const t = makeT(lang);
  const q = useQiyas();
  const me = q.me.user.id;
  const list = usePagedApi((page, pageSize) => api.get('/review-queue', { cycleId: q.cycleId, page, pageSize }), [q.cycleId]);
  const { error, loading, reload } = list;
  const data = list.items;
  const act = useAction();
  const { toast, showToast } = useToast();
  const [comments, setComments] = useState({});
  const done = (msg) => () => { showToast(msg); reload(); };

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('مراجعة الأدلة', 'Evidence review', 'ثبوت کا جائزہ')}</h1>
          <p className="q-page-sub">{t('قائمة مشتركة بين المستشارين. استلم الدليل قبل مراجعته؛ لا يراجع أحد ما رفعه بنفسه.', 'A queue shared by all consultants. Claim an item before reviewing it; nobody reviews what they uploaded.', 'تمام کنسلٹنٹس کی مشترکہ فہرست۔ جائزے سے پہلے ثبوت لیں؛ کوئی اپنا اپ لوڈ کردہ ثبوت نہیں جانچتا۔')}</p>
        </div>
      </div>
      <ErrorNote error={error ?? act.error} lang={lang} />
      <section className="q-card">
        {loading && !data ? <Loading lang={lang} /> : data.length === 0 ? <Empty lang={lang} title={t('لا يوجد ما ينتظر المراجعة', 'Nothing is waiting for review', 'کچھ بھی جائزے کا منتظر نہیں')} /> : (
          <ul className={s.list}>
            {data.map((l) => {
              const mine = l.claimed_by === me;
              const overdue = l.review_due_at && new Date(l.review_due_at) < new Date();
              return (
                <li key={l.id} className={s.listItem} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                  <div className={s.between}>
                    <div className={s.listMain}>
                      <span className={s.title}><span className="q-code">{l.standard_code}</span> <span dir="auto">{l.title}</span> <span className={s.sub}>v{l.version_no}</span></span>
                      <span className={s.sub}>
                        {l.original_filename ?? l.external_url} · {l.uploaded_by_name} · {pickText(lang, { ar: l.department_ar, en: l.department_en })}
                      </span>
                      <span className={s.sub} style={overdue ? { color: 'var(--danger)' } : undefined}>{t('المراجعة مطلوبة قبل', 'Review by', 'جائزہ درکار بذریعہ')} {fmtDate(l.review_due_at, lang)}</span>
                    </div>
                    <div className={s.row}>
                      <StatusBadge map={REVIEW_STATUS} value={l.review_status} lang={lang} />
                      {l.claimed_by && !mine && <span className={s.chip}>{t('يراجعه', 'Being reviewed by', 'جائزہ لے رہے ہیں')} {l.claimed_by_name}</span>}
                      {l.original_filename && <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => api.download(`/evidence-versions/${l.version_id}/download`, l.original_filename)}>{t('تنزيل', 'Download')}</button>}
                      {l.external_url && <a className="q-btn q-btn-ghost q-btn-sm" href={l.external_url} target="_blank" rel="noreferrer noopener">{t('فتح الرابط', 'Open link', 'لنک کھولیں')}</a>}
                      {l.task_id && <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => onNavigate('task', l.task_id)}>{t('المهمة', 'Task', 'کام')}</button>}
                    </div>
                  </div>
                  {l.cycleOpen === false ? (
                    <span className={s.sub}>{t('الدورة مغلقة وللقراءة فقط؛ يمكن لمدير النظام إعادة فتحها.', 'The cycle is closed and read-only; an administrator can reopen it.', 'یہ دور بند ہے اور صرف پڑھنے کے لیے ہے؛ سسٹم ایڈمنسٹریٹر اسے دوبارہ کھول سکتا ہے۔')}</span>
                  ) : !l.can_review ? (
                    <span className={s.sub}>{t('رفعتَ هذا الدليل بنفسك؛ يراجعه مستشار آخر.', 'You uploaded this evidence; another consultant reviews it.', 'یہ ثبوت آپ نے اپ لوڈ کیا؛ دوسرا کنسلٹنٹ اس کا جائزہ لے گا۔')}</span>
                  ) : l.review_status === 'submitted' ? (
                    <div><button type="button" className="q-btn q-btn-primary q-btn-sm" disabled={act.busy} onClick={() => act.run(() => api.post(`/evidence-links/${l.id}/claim`), done(t('استلمتَ الدليل للمراجعة', 'You claimed it for review', 'آپ نے جائزے کے لیے لے لیا')))}>{t('استلام للمراجعة', 'Claim for review', 'جائزے کے لیے لیں')}</button></div>
                  ) : mine ? (
                    <div className={s.row}>
                      <input className="q-input" style={{ flex: 1, minWidth: 200 }} value={comments[l.id] ?? ''} onChange={(e) => setComments({ ...comments, [l.id]: e.target.value })}
                        placeholder={t('ملاحظة (إلزامية عند الرفض، 10 أحرف على الأقل)', 'Comment (required to reject, at least 10 characters)', 'تبصرہ (مسترد کرنے کے لیے لازمی، کم از کم 10 حروف)')} />
                      <button type="button" className="q-btn q-btn-success q-btn-sm" disabled={act.busy} onClick={() => act.run(() => api.post(`/evidence-links/${l.id}/accept`, { comment: comments[l.id] || undefined }), done(t('قُبل الدليل', 'Evidence accepted', 'ثبوت منظور')))}>{t('قبول', 'Accept', 'منظور کریں')}</button>
                      <button type="button" className="q-btn q-btn-danger q-btn-sm" disabled={act.busy || (comments[l.id] ?? '').trim().length < 10} onClick={() => act.run(() => api.post(`/evidence-links/${l.id}/reject`, { comment: comments[l.id] }), done(t('رُفض الدليل وأُعيدت المهمة للمدير', 'Rejected and returned to the manager', 'مسترد کر کے مینیجر کو واپس')))}>{t('رفض', 'Reject', 'مسترد کریں')}</button>
                      <button type="button" className="q-btn q-btn-ghost q-btn-sm" disabled={act.busy} onClick={() => act.run(() => api.post(`/evidence-links/${l.id}/release`), done(t('أُعيد إلى القائمة', 'Returned to the queue', 'فہرست میں واپس')))}>{t('إرجاع للقائمة', 'Release', 'واپس کریں')}</button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <Pager pager={list} lang={lang} />
      </section>
      {toast && <div className="q-toast" role="status">{toast}</div>}
    </div>
  );
}
ReviewQueuePage.propTypes = pageProps;
