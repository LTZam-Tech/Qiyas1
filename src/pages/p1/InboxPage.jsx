// Inbox: open clarifications, extension requests to decide, employees' requests for more time.
import { useQiyas } from '../../context/QiyasSession.jsx';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import useToast from '../../hooks/useToast.js';
import { Empty, ErrorNote, Loading, fmtDate, pageProps, useAction, useApi } from './shared.jsx';
import s from './p1.module.css';

export default function InboxPage({ lang, onNavigate }) {
  const t = makeT(lang);
  const q = useQiyas();
  const { data, error, loading, reload } = useApi(() => api.get('/inbox'), []);
  const act = useAction();
  const { toast, showToast } = useToast();
  const done = (msg) => () => { showToast(msg); reload(); };
  const ask = (ar, en, ur) => window.prompt(t(ar, en, ur));

  const formal = (data?.extensions ?? []).filter((e) => e.level === 'formal');
  const asks = (data?.extensions ?? []).filter((e) => e.level === 'employee_ask');

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('الطلبات الواردة', 'Inbox', 'موصول درخواستیں')}</h1>
          <p className="q-page-sub">{t('أسئلة تنتظر ردًا، وطلبات وقت إضافي تنتظر قرارًا.', 'Questions waiting for an answer and requests for more time waiting for a decision.', 'جواب کے منتظر سوالات اور فیصلے کی منتظر مزید وقت کی درخواستیں۔')}</p>
        </div>
      </div>
      <ErrorNote error={error ?? act.error} lang={lang} />
      {loading && !data ? <Loading lang={lang} /> : (
        <div className={s.grid2}>
          <section className="q-card">
            <div className="q-card-head"><h2 className="q-section-title">{t('طلبات التوضيح', 'Clarifications', 'وضاحتیں')} ({data.clarifications.length})</h2></div>
            {data.clarifications.length === 0 ? <Empty lang={lang} title={t('لا توجد أسئلة مفتوحة', 'No open questions', 'کوئی کھلا سوال نہیں')} /> : (
              <ul className={s.list}>
                {data.clarifications.map((c) => (
                  <li key={c.id} className={s.listItem}>
                    <div className={s.listMain}>
                      <button type="button" className={s.linkBtn} onClick={() => onNavigate('task', c.task_id)}>{c.task_title}</button>
                      <span dir="auto">{c.last_message}</span>
                      <span className={s.sub}>{c.requester_name} · {t('الرد مطلوب قبل', 'Answer by', 'جواب درکار بذریعہ')} {fmtDate(c.response_due_at, lang)}</span>
                    </div>
                    <button type="button" className="q-btn q-btn-secondary q-btn-sm" onClick={() => onNavigate('task', c.task_id)}>{t('رد', 'Answer', 'جواب دیں')}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className={s.stack}>
            {q.hasRole('QC') && (
              <section className="q-card">
                <div className="q-card-head"><h2 className="q-section-title">{t('طلبات التمديد', 'Extension requests', 'توسیع کی درخواستیں')} ({formal.length})</h2></div>
                {formal.length === 0 ? <Empty lang={lang} title={t('لا توجد طلبات', 'No requests', 'کوئی درخواست نہیں')} /> : (
                  <ul className={s.list}>
                    {formal.map((e) => (
                      <li key={e.id} className={s.listItem}>
                        <div className={s.listMain}>
                          <button type="button" className={s.linkBtn} onClick={() => onNavigate('task', e.task_id)}>{e.task_title}</button>
                          <span dir="auto">{e.justification}</span>
                          <span className={s.sub}>{e.requested_by_name} · {t('حتى', 'until', 'تک')} {fmtDate(e.requested_due_at, lang)}</span>
                        </div>
                        <div className={s.row}>
                          <button type="button" className="q-btn q-btn-success q-btn-sm" disabled={act.busy} onClick={() => act.run(() => api.post(`/extensions/${e.id}/approve`, {}), done(t('اعتُمد التمديد', 'Extension approved', 'توسیع منظور')))}>{t('اعتماد', 'Approve', 'منظور کریں')}</button>
                          <button type="button" className="q-btn q-btn-danger q-btn-sm" disabled={act.busy} onClick={() => {
                            const reason = ask('سبب الرفض (إلزامي):', 'Reason for rejecting (required):', 'مسترد کرنے کی وجہ (لازمی):');
                            if (reason) act.run(() => api.post(`/extensions/${e.id}/reject`, { reason }), done(t('رُفض الطلب', 'Request rejected', 'درخواست مسترد')));
                          }}>{t('رفض', 'Reject', 'مسترد کریں')}</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {q.hasRole('DM') && (
              <section className="q-card">
                <div className="q-card-head"><h2 className="q-section-title">{t('طلبات الموظفين لوقت إضافي', 'Employees asking for more time', 'مزید وقت مانگنے والے ملازمین')} ({asks.length})</h2></div>
                {asks.length === 0 ? <Empty lang={lang} title={t('لا توجد طلبات', 'No requests', 'کوئی درخواست نہیں')} /> : (
                  <ul className={s.list}>
                    {asks.map((e) => (
                      <li key={e.id} className={s.listItem}>
                        <div className={s.listMain}>
                          <button type="button" className={s.linkBtn} onClick={() => onNavigate('task', e.task_id)}>{e.task_title}</button>
                          <span dir="auto">{e.justification}</span>
                          <span className={s.sub}>{e.requested_by_name} · {t('حتى', 'until', 'تک')} {fmtDate(e.requested_due_at, lang)}</span>
                        </div>
                        <div className={s.row}>
                          <button type="button" className="q-btn q-btn-primary q-btn-sm" disabled={act.busy} onClick={() => act.run(() => api.post(`/extension-asks/${e.id}/forward`, {}), done(t('أُحيل الطلب إلى المستشار', 'Forwarded to the consultant', 'کنسلٹنٹ کو بھیج دیا گیا')))}>{t('إحالة للمستشار', 'Forward to consultant', 'کنسلٹنٹ کو بھیجیں')}</button>
                          <button type="button" className="q-btn q-btn-ghost q-btn-sm" disabled={act.busy} onClick={() => {
                            const reason = ask('سبب الاعتذار (إلزامي):', 'Reason for declining (required):', 'معذرت کی وجہ (لازمی):');
                            if (reason) act.run(() => api.post(`/extension-asks/${e.id}/decline`, { reason }), done(t('تم الاعتذار عن الطلب', 'Request declined', 'درخواست سے معذرت')));
                          }}>{t('اعتذار', 'Decline', 'معذرت کریں')}</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </div>
      )}
      {toast && <div className="q-toast" role="status">{toast}</div>}
    </div>
  );
}
InboxPage.propTypes = pageProps;
