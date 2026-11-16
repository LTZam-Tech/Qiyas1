// The task workspace: requirements, evidence, people, time and history in one place.
// Buttons follow `task.can`, computed by the server for the person viewing.
import { useState } from 'react';
import PropTypes from 'prop-types';
import { useQiyas } from '../../context/QiyasSession.jsx';
import { dirOf, makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import useToast from '../../hooks/useToast.js';
import {
  Deadline, Empty, ErrorNote, Loading, READINESS, REVIEW_STATUS, StatusBadge, SUBMISSION_STATUS, TASK_STATUS,
  Pager, fmtDate, pageProps, pickText, useAction, useApi, usePager,
} from './shared.jsx';
import s from './p1.module.css';

const endOfDay = (d) => new Date(`${d}T23:59:59`).toISOString();

export default function TaskPage({ lang, id, onNavigate }) {
  const t = makeT(lang);
  const q = useQiyas();
  const { data: task, error, loading, reload } = useApi(() => api.get(`/tasks/${id}`), [id]);
  const act = useAction();
  const { toast, showToast } = useToast();
  const done = (msg) => () => {
    showToast(msg);
    reload();
    q.refresh();
  };
  const evidencePager = usePager(task?.evidence);
  const historyPager = usePager(task?.history);

  if (!id) return <div className="q-page"><Empty lang={lang} /></div>;
  if (loading && !task) return <div className="q-page"><Loading lang={lang} /></div>;
  if (error) return <div className="q-page"><ErrorNote error={error} lang={lang} /><button type="button" className="q-btn q-btn-secondary" onClick={() => onNavigate('tasks')}>{t('العودة إلى المهام', 'Back to tasks', 'کاموں پر واپس')}</button></div>;

  const me = q.me.user.id;
  const drafts = task.evidence.filter((e) => e.review_status === 'draft');
  const reqText = (r) => pickText(lang, { ar: r.text_ar, en: r.text_en, ur: r.text_ur });

  const prompt = (ar, en, ur) => window.prompt(t(ar, en, ur));
  const escalate = () => {
    const reason = prompt('سبب التصعيد (إلزامي):', 'Reason for escalating (required):', 'بڑھانے کی وجہ (لازمی):');
    if (reason) act.run(() => api.post(`/tasks/${id}/escalate`, { reason }), done(t('صُعّدت المهمة إلى مدير الإدارة', 'Escalated to the department manager', 'کام شعبے کے مینیجر کو بڑھا دیا گیا')));
  };
  const cancel = () => {
    const reason = prompt('سبب الإلغاء (إلزامي):', 'Reason for cancelling (required):', 'منسوخی کی وجہ (لازمی):');
    if (reason) act.run(() => api.post(`/assignments/${task.assignment_id}/cancel`, { reason }), done(t('أُلغيت المهمة', 'Task cancelled', 'کام منسوخ')));
  };

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => onNavigate('tasks')}>{dirOf(lang) === 'rtl' ? '→' : '←'} {t('المهام', 'Tasks', 'کام')}</button>
          <h1 className="q-page-title" dir="auto">{task.title}</h1>
          <div className={s.row} style={{ marginTop: 6 }}>
            <StatusBadge map={TASK_STATUS} value={task.execution_status} lang={lang} />
            {task.is_escalated && <span className="q-badge q-tone-danger">{t('مُصعّدة', 'Escalated', 'بڑھایا گیا')}</span>}
            <span className={s.sub}>{pickText(lang, { ar: task.department_ar, en: task.department_en })}</span>
          </div>
        </div>
        <div className="q-page-actions">
          {task.can.start && <button type="button" className="q-btn q-btn-primary" disabled={act.busy} onClick={() => act.run(() => api.post(`/tasks/${id}/start`), done(t('بدأ العمل', 'Work started', 'کام شروع ہو گیا')))}>{t('بدء العمل', 'Start work', 'کام شروع کریں')}</button>}
          {task.can.escalate && <button type="button" className="q-btn q-btn-warning" disabled={act.busy} onClick={escalate}>{t('تصعيد', 'Escalate', 'بڑھائیں')}</button>}
          {task.can.cancel && <button type="button" className="q-btn q-btn-danger" disabled={act.busy} onClick={cancel}>{t('إلغاء المهمة', 'Cancel task', 'کام منسوخ کریں')}</button>}
        </div>
      </div>

      <ErrorNote error={act.error} lang={lang} />

      <div className={s.grid4}>
        <Fact label={t('الموعد', 'Deadline', 'آخری تاریخ')}><Deadline deadline={task.deadline} lang={lang} /></Fact>
        <Fact label={t('المسؤول الحالي', 'Current owner', 'موجودہ ذمہ دار')}>{task.owner_name}</Fact>
        <Fact label={t('المُسند إليه أولًا', 'First assigned to', 'پہلی تفویض')}>{task.original_assignee_name ?? '—'}</Fact>
        <Fact label={t('موعد إسناد المدير', 'Manager assigns by', 'مینیجر تفویض کرے بذریعہ')}>{fmtDate(task.manager_due_at, lang)}</Fact>
      </div>
      {task.instructions && <div className="q-card q-card-pad"><span className={s.kpiLabel}>{t('التعليمات', 'Instructions', 'ہدایات')}</span><p style={{ marginTop: 6 }} dir="auto">{task.instructions}</p></div>}

      <div className={s.split}>
        <div className={s.stack}>
          <section className="q-card">
            <div className="q-card-head"><h2 className="q-section-title">{t('المتطلبات والأدلة المطلوبة', 'Requirements and required proof', 'شرائط اور درکار ثبوت')}</h2></div>
            <ul className={s.list}>
              {task.requirements.map((r) => (
                <li key={r.id} className={s.listItem} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div className={s.between}>
                    <span className={s.title}><span className="q-code">{r.standard_code}</span> <span dir="auto">{reqText(r)}</span></span>
                    <StatusBadge map={READINESS} value={r.readiness} lang={lang} />
                  </div>
                  {r.conditions.length > 0 && (
                    <ul style={{ paddingInlineStart: 20, fontSize: '0.85rem', color: 'var(--text-2)' }}>
                      {r.conditions.map((c) => <li key={c.code}>{pickText(lang, c)}</li>)}
                    </ul>
                  )}
                  {r.proof_items.map((p) => (
                    <span key={p.id} className={s.chip}>{t('دليل مطلوب:', 'Proof required:', 'درکار ثبوت:')} {pickText(lang, p)}</span>
                  ))}
                </li>
              ))}
            </ul>
          </section>

          <section className="q-card">
            <div className="q-card-head">
              <h2 className="q-section-title">{t('الأدلة', 'Evidence', 'ثبوت')}</h2>
              {task.can.workEvidence && drafts.length > 0 && (
                <button type="button" className="q-btn q-btn-primary q-btn-sm" disabled={act.busy}
                  onClick={() => act.run(() => api.post(`/tasks/${id}/submit`), done(t('أُرسلت الأدلة للمراجعة', 'Evidence sent for review', 'ثبوت جائزے کے لیے بھیج دیا گیا')))}>
                  {t(`إرسال ${drafts.length} للمراجعة`, `Submit ${drafts.length} for review`, `${drafts.length} جائزے کے لیے جمع کریں`)}
                </button>
              )}
            </div>
            {task.evidence.length === 0 ? <Empty lang={lang} title={t('لم تُرفع أدلة بعد', 'No evidence yet', 'ابھی کوئی ثبوت نہیں')} /> : (
              <ul className={s.list}>
                {evidencePager.items.map((e) => (
                  <li key={e.id} className={s.listItem}>
                    <div className={s.listMain}>
                      <span className={s.title}><span dir="auto">{e.title}</span> <span className={s.sub}>v{e.version_no}</span></span>
                      <span className={s.sub}>{e.original_filename ?? e.external_url} · {e.uploaded_by_name} · {fmtDate(e.uploaded_at, lang)}</span>
                      {e.last_decision?.comment && <span className={s.sub} dir="auto" style={{ color: e.last_decision.decision === 'reject' ? 'var(--danger)' : undefined }}>“{e.last_decision.comment}”</span>}
                    </div>
                    <div className={s.row}>
                      <StatusBadge map={REVIEW_STATUS} value={e.review_status} lang={lang} />
                      {e.submission_status && <StatusBadge map={SUBMISSION_STATUS} value={e.submission_status} lang={lang} />}
                      {e.original_filename && e.scan_status === 'clean' && (
                        <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => api.download(`/evidence-versions/${e.version_id}/download`, e.original_filename)}>{t('تنزيل', 'Download')}</button>
                      )}
                      {e.external_url && <a className="q-btn q-btn-ghost q-btn-sm" href={e.external_url} target="_blank" rel="noreferrer noopener">{t('فتح الرابط', 'Open link', 'لنک کھولیں')}</a>}
                      {task.can.workEvidence && ['draft', 'submitted'].includes(e.review_status) && (
                        <button type="button" className="q-btn q-btn-ghost q-btn-sm" disabled={act.busy} onClick={() => act.run(() => api.post(`/evidence-links/${e.id}/withdraw`), done(t('سُحب الدليل', 'Evidence withdrawn', 'ثبوت واپس لے لیا گیا')))}>{t('سحب', 'Withdraw', 'واپس لیں')}</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Pager pager={evidencePager} lang={lang} />
            {task.can.workEvidence && <UploadForm lang={lang} task={task} onDone={done(t('رُفع الدليل وأُضيف كمسودة', 'Evidence uploaded as a draft', 'ثبوت مسودے کے طور پر اپ لوڈ ہو گیا'))} />}
          </section>
          {task.can.workEvidence && <SuggestedEvidence lang={lang} task={task} onDone={done} />}
        </div>

        <div className={s.stack}>
          {task.can.assign && <AssignPanel lang={lang} task={task} onDone={done(t('أُسندت المهمة', 'Task assigned', 'کام تفویض ہو گیا'))} />}
          <Clarifications lang={lang} task={task} me={me} canAnswerAll={q.hasRole('QC')} managed={q.managedDepartments} onDone={done(t('تم', 'Done', 'ہو گیا'))} />
          <TimePanel lang={lang} task={task} isQc={q.hasRole('QC')} onDone={done(t('تم', 'Done', 'ہو گیا'))} />
          <section className="q-card q-card-pad">
            <h2 className="q-section-title" style={{ marginBottom: 10 }}>{t('السجل', 'History', 'تاریخچہ')}</h2>
            <ul className={s.timeline}>
              {historyPager.items.map((h, i) => (
                <li key={i}>
                  <div>{historyText(t, h)}</div>
                  <div className={s.sub}>{fmtDate(h.at, lang, true)}{h.note ? ` · ${h.note}` : ''}</div>
                </li>
              ))}
              {task.escalations.map((e, i) => (
                <li key={`e${i}`} style={{ borderColor: 'var(--danger)' }}>
                  <div>{e.kind === 'manual' ? t('تصعيد يدوي', 'Manual escalation', 'دستی طور پر بڑھایا گیا') : t('تصعيد تلقائي', 'Automatic escalation', 'خودکار طور پر بڑھایا گیا')}: {e.from_name} → {e.to_name}</div>
                  <div className={s.sub}>{fmtDate(e.at, lang, true)} · {e.reason}</div>
                </li>
              ))}
            </ul>
            <Pager pager={historyPager} lang={lang} />
          </section>
        </div>
      </div>
      {toast && <div className="q-toast" role="status">{toast}</div>}
    </div>
  );
}
TaskPage.propTypes = { ...pageProps, id: PropTypes.string };

function historyText(t, h) {
  const map = {
    publish: t(`أُرسلت إلى ${h.to_name}`, `Sent to ${h.to_name}`, `${h.to_name} کو بھیجا گیا`),
    assign: t(`أُسندت إلى ${h.to_name}`, `Assigned to ${h.to_name}`, `${h.to_name} کو تفویض`),
    self_assign: t(`تولّاها ${h.to_name} بنفسه`, `${h.to_name} took it personally`, `${h.to_name} نے خود لیا`),
    reassign: t(`نُقلت من ${h.from_name} إلى ${h.to_name}`, `Moved from ${h.from_name} to ${h.to_name}`, `${h.from_name} سے ${h.to_name} کو منتقل`),
    escalation: t(`صُعّدت إلى ${h.to_name}`, `Escalated to ${h.to_name}`, `${h.to_name} کو بڑھایا گیا`),
    rework_return: t(`أُعيدت إلى ${h.to_name} للتعديل`, `Returned to ${h.to_name} for rework`, `ترمیم کے لیے ${h.to_name} کو واپس`),
  };
  return map[h.reason_kind] ?? h.reason_kind;
}

function Fact({ label, children }) {
  return <div className="q-card q-card-pad"><span className={s.kpiLabel}>{label}</span><div style={{ marginTop: 4, fontWeight: 600 }}>{children}</div></div>;
}
Fact.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node };

// Files a consultant imported or carried over for this task's requirements (BNK-5): using one links it as a draft.
function SuggestedEvidence({ lang, task, onDone }) {
  const t = makeT(lang);
  const { data, reload } = useApi(() => api.get(`/tasks/${task.id}/suggestions`), [task.id, task.evidence.length]);
  const act = useAction();
  const pager = usePager(data);
  if (!data?.length) return null;
  const source = (x) => (x.source === 'carry_over'
    ? t('من الدورة السابقة', 'From the previous cycle', 'پچھلے دور سے')
    : t('من استيراد مجلد', 'From a folder import', 'فولڈر امپورٹ سے'));
  return (
    <section className="q-card">
      <div className="q-card-head">
        <h2 className="q-section-title">{t('أدلة مقترحة', 'Suggested evidence', 'تجویز کردہ ثبوت')}</h2>
        <span className={s.sub}>{t('راجعها قبل استخدامها؛ تُرسل للمراجعة كأي دليل.', 'Check each one before using it; it is reviewed like any evidence.', 'استعمال سے پہلے ہر ایک کو دیکھیں؛ اس کا جائزہ عام ثبوت کی طرح ہوتا ہے۔')}</span>
      </div>
      <ErrorNote error={act.error} lang={lang} />
      <ul className={s.list}>
        {pager.items.map((x) => (
          <li key={x.id} className={s.listItem}>
            <div className={s.listMain}>
              <span className={s.title}><span dir="auto">{x.title}</span></span>
              <span className={s.sub}>
                <span className="q-code" style={{ marginInlineEnd: 6 }}>{x.requirement_code}</span>
                {x.proof_item_code && <span className="q-code" style={{ marginInlineEnd: 6 }}>{x.proof_item_code}</span>}
                {source(x)} · {x.suggested_by}
                {x.source_detail?.path && <> · <span dir="auto">{x.source_detail.path}</span></>}
                {x.source_detail?.fromRequirement && <> · {t('كان', 'was', 'پہلے')} <span className="q-code">{x.source_detail.fromRequirement}</span></>}
              </span>
            </div>
            <div className={s.row}>
              {x.original_filename && (
                <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => act.run(() => api.download(`/evidence-versions/${x.version_id}/download`, x.original_filename))}>{t('تنزيل', 'Download', 'ڈاؤن لوڈ')}</button>
              )}
              <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={act.busy || x.already_linked}
                onClick={() => act.run(() => api.post(`/suggestions/${x.id}/use`, { taskId: task.id }), () => { reload(); onDone(t('أُضيف كمسودة', 'Added as a draft', 'مسودے کے طور پر شامل ہو گیا'))(); })}>
                {t('استخدام', 'Use', 'استعمال کریں')}
              </button>
              <button type="button" className="q-btn q-btn-ghost q-btn-sm" disabled={act.busy}
                onClick={() => act.run(() => api.post(`/suggestions/${x.id}/dismiss`, { taskId: task.id }), reload)}>
                {t('تجاهل', 'Dismiss', 'نظر انداز کریں')}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Pager pager={pager} lang={lang} />
    </section>
  );
}
SuggestedEvidence.propTypes = { lang: PropTypes.string.isRequired, task: PropTypes.object.isRequired, onDone: PropTypes.func.isRequired };

function UploadForm({ lang, task, onDone }) {
  const t = makeT(lang);
  const [mode, setMode] = useState('file');
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ title: '', url: '', requirementId: task.requirements[0]?.id ?? '', proofItemId: task.requirements[0]?.proof_items[0]?.id ?? '' });
  const act = useAction();
  const req = task.requirements.find((r) => r.id === form.requirementId);
  const submit = (e) => {
    e.preventDefault();
    act.run(async () => {
      const fd = new FormData();
      fd.append('title', form.title);
      if (mode === 'file') fd.append('file', file);
      else fd.append('externalUrl', form.url);
      const up = await api.upload(`/tasks/${task.id}/evidence`, fd);
      if (up.scanStatus !== 'clean') throw new Error(t('حُجز الملف بواسطة فحص الفيروسات.', 'The file was quarantined by the virus scan.', 'وائرس اسکین نے فائل روک دی۔'));
      await api.post(`/evidence-versions/${up.versionId}/links`, { taskId: task.id, cycleRequirementId: form.requirementId, proofItemId: form.proofItemId || null });
    }, () => {
      setFile(null);
      setForm((f) => ({ ...f, title: '', url: '' }));
      onDone();
    });
  };
  return (
    <form className={`q-card-body ${s.form}`} style={{ borderTop: '1px solid var(--border)' }} onSubmit={submit}>
      <div className="q-seg" role="group" aria-label={t('نوع الدليل', 'Evidence type', 'ثبوت کی قسم')}>
        <button type="button" aria-pressed={mode === 'file'} onClick={() => setMode('file')}>{t('ملف', 'File', 'فائل')}</button>
        <button type="button" aria-pressed={mode === 'link'} onClick={() => setMode('link')}>{t('رابط', 'Link', 'لنک')}</button>
      </div>
      <div className={s.grid2}>
        <label className={s.field}>{t('عنوان الدليل', 'Evidence title', 'ثبوت کا عنوان')}
          <input className="q-input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        {mode === 'file' ? (
          <label className={s.field} style={{ position: 'relative' }}>{t('الملف', 'File', 'فائل')}
            {/* the browser's own file button is not translated; this label opens it */}
            <input type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.csv,.zip"
              style={{ position: 'absolute', insetInlineStart: 0, bottom: 0, width: 1, height: 1, opacity: 0 }} />
            <span className="q-input" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} dir="auto">
              {file ? file.name : t('اختر ملفًا…', 'Choose a file…', 'فائل منتخب کریں…')}
            </span>
          </label>
        ) : (
          <label className={s.field}>{t('الرابط', 'Link', 'لنک')}
            <input className="q-input" type="url" required placeholder="https://" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </label>
        )}
        <label className={s.field}>{t('المتطلب', 'Requirement', 'شرط')}
          <select className="q-input" value={form.requirementId} onChange={(e) => {
            const r = task.requirements.find((x) => x.id === e.target.value);
            setForm({ ...form, requirementId: e.target.value, proofItemId: r?.proof_items[0]?.id ?? '' });
          }}>
            {task.requirements.map((r) => <option key={r.id} value={r.id}>{`\u2066${r.code}\u2069`}</option>)}
          </select>
        </label>
        <label className={s.field}>{t('الدليل المطلوب', 'Required proof', 'درکار ثبوت')}
          <select className="q-input" value={form.proofItemId} onChange={(e) => setForm({ ...form, proofItemId: e.target.value })}>
            <option value="">{t('عام للمتطلب', 'General for the requirement', 'شرط کے لیے عمومی')}</option>
            {(req?.proof_items ?? []).map((p) => <option key={p.id} value={p.id}>{`\u2066${p.code}\u2069`}</option>)}
          </select>
        </label>
      </div>
      <ErrorNote error={act.error} lang={lang} />
      <div><button type="submit" className="q-btn q-btn-secondary" disabled={act.busy}>{t('رفع كمسودة', 'Upload as draft', 'مسودے کے طور پر اپ لوڈ کریں')}</button></div>
    </form>
  );
}
UploadForm.propTypes = { lang: PropTypes.string.isRequired, task: PropTypes.object.isRequired, onDone: PropTypes.func.isRequired };

function AssignPanel({ lang, task, onDone }) {
  const t = makeT(lang);
  const { data: members } = useApi(() => api.get(`/departments/${task.department_id}/members`), [task.department_id]);
  const [assignee, setAssignee] = useState('');
  const act = useAction();
  return (
    <section className="q-card q-card-pad">
      <h2 className="q-section-title">{t('إسناد المهمة', 'Assign the task', 'کام تفویض کریں')}</h2>
      <p className={s.sub} style={{ margin: '4px 0 10px' }}>{t('لموظف في الإدارة، أو تولَّها بنفسك.', 'To an employee of the department, or take it yourself.', 'شعبے کے کسی ملازم کو، یا خود لیں۔')}</p>
      <div className={s.form}>
        <select className="q-input" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label={t('المُسند إليه', 'Assignee', 'ذمہ دار')}>
          <option value="">{t('اختر شخصًا', 'Choose a person', 'شخص منتخب کریں')}</option>
          {(members ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.membership === 'manager' ? ` (${t('أنا', 'me', 'میں')})` : ''}</option>)}
        </select>
        <ErrorNote error={act.error} lang={lang} />
        <button type="button" className="q-btn q-btn-primary" disabled={!assignee || act.busy} onClick={() => act.run(() => api.post(`/tasks/${task.id}/assign`, { assigneeId: assignee }), onDone)}>{t('إسناد', 'Assign', 'تفویض کریں')}</button>
      </div>
    </section>
  );
}
AssignPanel.propTypes = { lang: PropTypes.string.isRequired, task: PropTypes.object.isRequired, onDone: PropTypes.func.isRequired };

function Clarifications({ lang, task, me, canAnswerAll, managed, onDone }) {
  const t = makeT(lang);
  const [question, setQuestion] = useState('');
  const [replies, setReplies] = useState({});
  const act = useAction();
  const canAnswer = (c) => c.status === 'open' && (canAnswerAll || (managed.includes(task.department_id) && c.requester_role === 'EMP' && c.requested_by !== me));
  return (
    <section className="q-card q-card-pad">
      <h2 className="q-section-title" style={{ marginBottom: 10 }}>{t('طلبات التوضيح', 'Clarifications', 'وضاحتیں')}</h2>
      <div className={s.stack}>
        {task.clarifications.length === 0 && <span className={s.sub}>{t('لا توجد طلبات توضيح', 'No clarifications', 'کوئی وضاحت نہیں')}</span>}
        {task.clarifications.map((c) => (
          <div key={c.id} className={s.thread}>
            <div className={s.between}>
              <span className={s.sub}>{c.requester_name}</span>
              <span className={`q-badge q-tone-${c.status === 'open' ? 'warning' : 'neutral'}`}>
                {c.status === 'open' ? t('بانتظار الرد', 'Waiting for an answer', 'جواب کا منتظر') : c.status === 'answered' ? t('تم الرد', 'Answered', 'جواب دے دیا گیا') : t('مغلق', 'Closed', 'بند')}
              </span>
            </div>
            {c.messages.map((m, i) => (
              <div key={i} className={s.msg}>
                <div className={s.msgMeta}>{m.author_name} · {fmtDate(m.created_at, lang, true)}</div>
                <div dir="auto">{m.body}</div>
              </div>
            ))}
            {(canAnswer(c) || (c.requested_by === me && c.status === 'answered')) && (
              <div className={s.row}>
                <input className="q-input" style={{ flex: 1 }} value={replies[c.id] ?? ''} onChange={(e) => setReplies({ ...replies, [c.id]: e.target.value })}
                  placeholder={canAnswer(c) ? t('اكتب الرد...', 'Write the answer...', 'جواب لکھیں...') : t('سؤال متابعة...', 'Follow-up question...', 'مزید سوال...')} />
                <button type="button" className="q-btn q-btn-primary q-btn-sm" disabled={!replies[c.id]?.trim() || act.busy}
                  onClick={() => act.run(() => api.post(`/clarifications/${c.id}/${canAnswer(c) ? 'answer' : 'follow-up'}`, { body: replies[c.id] }), () => { setReplies({ ...replies, [c.id]: '' }); onDone(); })}>
                  {canAnswer(c) ? t('رد', 'Answer', 'جواب دیں') : t('إرسال', 'Send', 'بھیجیں')}
                </button>
                {c.requested_by === me && c.status === 'answered' && (
                  <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => act.run(() => api.post(`/clarifications/${c.id}/close`), onDone)}>{t('إغلاق', 'Close', 'بند کریں')}</button>
                )}
              </div>
            )}
          </div>
        ))}
        {task.can.askClarification && (
          <div className={s.form}>
            <textarea className={`q-input ${s.textarea}`} value={question} onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('اطرح سؤالك على المستشار. يتوقف موعدك حتى يصلك الرد.', 'Ask the consultant. Your deadline pauses until you get an answer.', 'کنسلٹنٹ سے پوچھیں۔ جواب ملنے تک آپ کی آخری تاریخ رکی رہے گی۔')} />
            <ErrorNote error={act.error} lang={lang} />
            <div><button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={!question.trim() || act.busy}
              onClick={() => act.run(() => api.post(`/tasks/${task.id}/clarifications`, { question }), () => { setQuestion(''); onDone(); })}>{t('طلب توضيح', 'Ask for clarification', 'وضاحت طلب کریں')}</button></div>
          </div>
        )}
      </div>
    </section>
  );
}
Clarifications.propTypes = {
  lang: PropTypes.string.isRequired, task: PropTypes.object.isRequired, me: PropTypes.string.isRequired,
  canAnswerAll: PropTypes.bool, managed: PropTypes.arrayOf(PropTypes.string).isRequired, onDone: PropTypes.func.isRequired,
};

function TimePanel({ lang, task, isQc, onDone }) {
  const t = makeT(lang);
  const [date, setDate] = useState('');
  const [why, setWhy] = useState('');
  const act = useAction();
  const formal = task.can.requestExtension;
  const canAsk = task.can.askForMoreTime || formal;
  const statusText = {
    asked: t('بانتظار المدير', 'Waiting for the manager', 'مینیجر کا منتظر'), forwarded: t('أُحيل للمستشار', 'Forwarded to the consultant', 'کنسلٹنٹ کو بھیجا گیا'),
    declined: t('رفضه المدير', 'Declined by the manager', 'مینیجر نے مسترد کیا'), pending: t('بانتظار المستشار', 'Waiting for the consultant', 'کنسلٹنٹ کا منتظر'),
    approved: t('مُعتمد', 'Approved', 'منظور'), rejected: t('مرفوض', 'Rejected', 'مسترد'), withdrawn: t('مسحوب', 'Withdrawn', 'واپس'), cancelled: t('ملغى', 'Cancelled', 'منسوخ'),
  };
  return (
    <section className="q-card q-card-pad">
      <h2 className="q-section-title" style={{ marginBottom: 10 }}>{t('الوقت الإضافي', 'More time', 'مزید وقت')}</h2>
      <div className={s.stack}>
        {task.extensions.map((e) => (
          <div key={e.id} className={s.msg}>
            <div className={s.between}>
              <span className={s.msgMeta}>{e.requested_by_name} · {fmtDate(e.requested_due_at, lang)}</span>
              <span className="q-badge q-tone-neutral">{statusText[e.status] ?? e.status}</span>
            </div>
            <div dir="auto">{e.justification}</div>
            {e.decision_reason && <div className={s.sub} dir="auto">“{e.decision_reason}”</div>}
            {isQc && e.level === 'formal' && e.status === 'pending' && (
              <div className={s.row} style={{ marginTop: 8 }}>
                <button type="button" className="q-btn q-btn-success q-btn-sm" disabled={act.busy} onClick={() => act.run(() => api.post(`/extensions/${e.id}/approve`, {}), onDone)}>{t('اعتماد', 'Approve', 'منظور کریں')}</button>
                <button type="button" className="q-btn q-btn-danger q-btn-sm" disabled={act.busy} onClick={() => {
                  const reason = window.prompt(t('سبب الرفض (إلزامي):', 'Reason for rejecting (required):', 'مسترد کرنے کی وجہ (لازمی):'));
                  if (reason) act.run(() => api.post(`/extensions/${e.id}/reject`, { reason }), onDone);
                }}>{t('رفض', 'Reject', 'مسترد کریں')}</button>
              </div>
            )}
          </div>
        ))}
        {canAsk && (
          <div className={s.form}>
            <span className={s.sub}>{formal
              ? t('طلب تمديد رسمي يقرره المستشار. لا يتغير الموعد الأصلي.', 'A formal extension request, decided by the consultant. The original deadline is kept.', 'باضابطہ توسیع کی درخواست، جس کا فیصلہ کنسلٹنٹ کرے گا۔ اصل آخری تاریخ برقرار رہے گی۔')
              : t('اطلب من مديرك وقتًا إضافيًا؛ وهو يحيله إلى المستشار أو يعتذر.', 'Ask your manager for more time; they forward it to the consultant or decline.', 'اپنے مینیجر سے مزید وقت مانگیں؛ وہ اسے کنسلٹنٹ کو بھیجیں گے یا معذرت کریں گے۔')}</span>
            <input className="q-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('التاريخ المطلوب', 'Requested date', 'مطلوبہ تاریخ')} />
            <input className="q-input" value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t('السبب', 'Reason', 'وجہ')} />
            <ErrorNote error={act.error} lang={lang} />
            <div><button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={!date || why.trim().length < 3 || act.busy}
              onClick={() => act.run(() => api.post(`/tasks/${task.id}/${formal ? 'extensions' : 'more-time'}`, { requestedDueAt: endOfDay(date), justification: why }), () => { setDate(''); setWhy(''); onDone(); })}>
              {formal ? t('طلب تمديد', 'Request extension', 'توسیع کی درخواست') : t('اطلب وقتًا إضافيًا', 'Ask for more time', 'مزید وقت مانگیں')}
            </button></div>
          </div>
        )}
      </div>
    </section>
  );
}
TimePanel.propTypes = { lang: PropTypes.string.isRequired, task: PropTypes.object.isRequired, isQc: PropTypes.bool, onDone: PropTypes.func.isRequired };
