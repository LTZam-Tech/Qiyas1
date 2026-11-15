// Standards & readiness: the DGA catalogue of the cycle with readiness at every level.
// Consultants select requirements here and assign them to a department (BR-ASG-01),
// and mark requirements not applicable with a reason (BR-FW-06).
import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useQiyas } from '../../context/QiyasSession.jsx';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import useToast from '../../hooks/useToast.js';
import { Empty, ErrorNote, Loading, READINESS, StatusBadge, pageProps, pickText, useAction, useApi } from './shared.jsx';
import s from './p1.module.css';

const pct = (v) => (v == null ? '—' : `${v}%`);

export default function CataloguePage({ lang, onNavigate }) {
  const t = makeT(lang);
  const q = useQiyas();
  const isQc = q.can('assignment.create');
  const { data, error, loading, reload } = useApi(() => (q.cycleId ? api.get(`/cycles/${q.cycleId}/readiness`) : Promise.resolve(null)), [q.cycleId]);
  const [openIds, setOpenIds] = useState(() => new Set());
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [assigning, setAssigning] = useState(false);
  const { toast, showToast } = useToast();
  const act = useAction();

  const toggle = (id) => setOpenIds((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || !data) return data?.perspectives ?? [];
    const hit = (x) => [x.code, x.ar, x.en, x.ur].some((v) => v?.toLowerCase().includes(term));
    return data.perspectives.map((p) => ({
      ...p,
      axes: p.axes.map((a) => ({ ...a, standards: a.standards.filter((st) => hit({ code: st.code, ...st.title }) || st.requirements.some((r) => hit({ code: r.code, ...r.text }))) })).filter((a) => a.standards.length),
    })).filter((p) => p.axes.length);
  }, [data, query]);

  const markApplicability = (req) => {
    const applicable = !req.applicable;
    const reason = applicable ? undefined : window.prompt(t('سبب عدم الانطباق (إلزامي):', 'Why does this not apply? (required)', 'یہ کیوں لاگو نہیں؟ (لازمی)'));
    if (!applicable && !reason) return;
    act.run(() => api.patch(`/cycle-requirements/${req.id}/applicability`, { applicable, reason }), () => {
      showToast(t('تم التحديث', 'Updated', 'اپ ڈیٹ ہو گیا'));
      reload();
    });
  };

  if (!q.cycleId) return <div className="q-page"><Empty lang={lang} title={t('لا توجد دورة قياس', 'No measurement cycle', 'کوئی پیمائشی دور نہیں')} /></div>;

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('المعايير والجاهزية', 'Standards & readiness', 'معیارات اور تیاری')}</h1>
          <p className="q-page-sub">{t('جاهزية كل منظور ومحور ومعيار ومتطلب في هذه الدورة.', 'Readiness of every perspective, axis, standard and requirement in this cycle.', 'اس دور میں ہر تناظر، محور، معیار اور شرط کی تیاری۔')}</p>
        </div>
        <div className="q-page-actions">
          <label className="q-search">
            <span className="q-sr-only">{t('بحث', 'Search', 'تلاش')}</span>
            <input className="q-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('ابحث برمز أو نص المعيار...', 'Search by code or text...', 'کوڈ یا متن سے تلاش کریں...')} />
          </label>
          {isQc && (
            <button type="button" className="q-btn q-btn-primary" disabled={selected.size === 0} onClick={() => setAssigning(true)}>
              {t(`إسناد المحدد (${selected.size})`, `Assign selected (${selected.size})`, `منتخب تفویض کریں (${selected.size})`)}
            </button>
          )}
        </div>
      </div>

      <ErrorNote error={error ?? act.error} lang={lang} />
      {data?.cycle && (
        <div className={s.grid4}>
          <div className="q-card q-card-pad"><span className={s.kpiLabel}>{t('الجاهزية', 'Readiness', 'تیاری')}</span><div className={s.kpiValue}>{pct(data.cycle.readinessPct)}</div></div>
          <div className="q-card q-card-pad"><span className={s.kpiLabel}>{t('جاهز', 'Ready', 'تیار')}</span><div className={s.kpiValue}>{data.cycle.ready}</div></div>
          <div className="q-card q-card-pad"><span className={s.kpiLabel}>{t('قيد العمل', 'In progress', 'جاری')}</span><div className={s.kpiValue}>{data.cycle.inProgress}</div></div>
          <div className="q-card q-card-pad"><span className={s.kpiLabel}>{t('لا ينطبق', 'Not applicable', 'لاگو نہیں')}</span><div className={s.kpiValue}>{data.cycle.notApplicable}</div></div>
        </div>
      )}

      {loading && !data ? <Loading lang={lang} /> : (
        <ul className={s.tree}>
          {filtered.map((p) => (
            <li key={p.id} className="q-card">
              <button type="button" className={s.treeHead} aria-expanded={openIds.has(p.id) || Boolean(query)} onClick={() => toggle(p.id)}>
                <span className={s.title}><span className="q-code">{p.code}</span> {pickText(lang, p.name)}</span>
                <Progress value={p.rollup?.readinessPct} />
              </button>
              {(openIds.has(p.id) || query) && p.axes.map((a) => (
                <div key={a.id} style={{ borderTop: '1px solid var(--border)', padding: '8px 16px 16px' }}>
                  <div className={s.between} style={{ padding: '6px 0' }}>
                    <span className={s.title} style={{ fontSize: '0.9rem' }}><span className="q-code">{a.code}</span> {pickText(lang, a.name)}</span>
                    <Progress value={a.rollup?.readinessPct} />
                  </div>
                  {a.standards.map((st) => (
                    <div key={st.id} className="q-card" style={{ marginTop: 8 }}>
                      <div className="q-card-head" style={{ padding: '10px 14px' }}>
                        <span className={s.title} style={{ fontSize: '0.88rem' }}><span className="q-code">{st.code}</span> {pickText(lang, st.title)}</span>
                        <Progress value={st.rollup?.readinessPct} />
                      </div>
                      <ul className={s.list}>
                        {st.requirements.map((r) => (
                          <li key={r.id} className={s.listItem} style={{ padding: '10px 14px' }}>
                            <div className={s.row} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                              {isQc && (
                                <input type="checkbox" aria-label={t('تحديد المتطلب', 'Select requirement', 'شرط منتخب کریں')} disabled={!r.applicable} checked={selected.has(r.id)}
                                  onChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                              )}
                              <div className={s.listMain}>
                                <span style={{ fontSize: '0.86rem' }} dir="auto">{pickText(lang, r.text)}</span>
                                <span className={s.sub}>
                                  {r.code} · {t(`${r.coveredProofItems} من ${r.expectedProofItems} أدلة مطلوبة مقبولة`, `${r.coveredProofItems} of ${r.expectedProofItems} required proofs accepted`, `${r.expectedProofItems} میں سے ${r.coveredProofItems} مطلوبہ ثبوت منظور`)}
                                  {!r.applicable && r.notApplicableReason ? ` · ${r.notApplicableReason}` : ''}
                                </span>
                              </div>
                            </div>
                            <div className={s.row}>
                              <StatusBadge map={READINESS} value={r.readiness} lang={lang} />
                              {q.can('applicability.manage') && (
                                <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => markApplicability(r)} disabled={act.busy}>
                                  {r.applicable ? t('لا ينطبق', 'Not applicable', 'لاگو نہیں') : t('ينطبق', 'Applicable', 'لاگو ہے')}
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      {assigning && (
        <AssignDialog lang={lang} cycleId={q.cycleId} requirementIds={[...selected]} onClose={() => setAssigning(false)}
          onDone={(taskId) => {
            setAssigning(false);
            setSelected(new Set());
            showToast(t('أُسند العمل إلى الإدارة', 'Work assigned to the department', 'کام شعبے کو تفویض کر دیا گیا'));
            reload();
            if (taskId) onNavigate('task', taskId);
          }} />
      )}
      {toast && <div className="q-toast" role="status">{toast}</div>}
    </div>
  );
}
CataloguePage.propTypes = pageProps;

function Progress({ value }) {
  return (
    <span className={s.row} style={{ minWidth: 140, flexWrap: 'nowrap' }}>
      <span className={s.bar} style={{ flex: 1 }}><span className={s.barFill} style={{ display: 'block', width: `${value ?? 0}%` }} /></span>
      <span className={s.sub} style={{ minWidth: 42, textAlign: 'end' }}>{pct(value)}</span>
    </span>
  );
}
Progress.propTypes = { value: PropTypes.number };

const endOfDay = (dateStr) => new Date(`${dateStr}T23:59:59`).toISOString();

function AssignDialog({ lang, cycleId, requirementIds, onClose, onDone }) {
  const t = makeT(lang);
  const { data: departments } = useApi(() => api.get('/departments'), []);
  const [form, setForm] = useState({ departmentId: '', title: '', instructions: '', priority: 'medium', implementationDue: '', managerDue: '' });
  const act = useAction();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    act.run(async () => {
      const { assignmentId } = await api.post('/assignments', {
        cycleId, departmentId: form.departmentId, cycleRequirementIds: requirementIds, title: form.title, instructions: form.instructions || undefined,
        priority: form.priority, implementationDueAt: endOfDay(form.implementationDue), managerDueAt: endOfDay(form.managerDue),
      });
      const { taskId } = await api.post(`/assignments/${assignmentId}/publish`);
      return taskId;
    }, onDone);
  };
  return (
    <div className={s.dialogBackdrop} role="presentation" onClick={onClose}>
      <form className={`q-card q-card-pad ${s.dialog} ${s.form}`} role="dialog" aria-modal="true" aria-label={t('إسناد إلى إدارة', 'Assign to a department', 'شعبے کو تفویض کریں')} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="q-section-title">{t(`إسناد ${requirementIds.length} متطلب إلى إدارة`, `Assign ${requirementIds.length} requirement(s) to a department`, `${requirementIds.length} شرائط شعبے کو تفویض کریں`)}</h2>
        <label className={s.field}>{t('الإدارة', 'Department', 'شعبہ')}
          <select className="q-input" required value={form.departmentId} onChange={set('departmentId')}>
            <option value="">{t('اختر الإدارة', 'Choose a department', 'شعبہ منتخب کریں')}</option>
            {(departments ?? []).filter((d) => d.is_active).map((d) => (
              <option key={d.id} value={d.id} disabled={!d.manager}>{pickText(lang, { ar: d.name_ar, en: d.name_en })}{d.manager ? '' : ` (${t('بلا مدير', 'no manager', 'مینیجر نہیں')})`}</option>
            ))}
          </select>
        </label>
        <label className={s.field}>{t('عنوان المهمة', 'Task title', 'کام کا عنوان')}
          <input className="q-input" required value={form.title} onChange={set('title')} />
        </label>
        <label className={s.field}>{t('التعليمات والوصف', 'Instructions and description', 'ہدایات اور تفصیل')}
          <textarea className={`q-input ${s.textarea}`} value={form.instructions} onChange={set('instructions')} />
        </label>
        <div className={s.grid2}>
          <label className={s.field}>{t('موعد إسناد المدير للمهمة', 'Manager assigns by', 'مینیجر تفویض کرے بذریعہ')}
            <input className="q-input" type="date" required value={form.managerDue} onChange={set('managerDue')} />
          </label>
          <label className={s.field}>{t('موعد التنفيذ', 'Implementation deadline', 'عمل درآمد کی آخری تاریخ')}
            <input className="q-input" type="date" required value={form.implementationDue} onChange={set('implementationDue')} />
          </label>
        </div>
        <label className={s.field}>{t('الأولوية', 'Priority', 'ترجیح')}
          <select className="q-input" value={form.priority} onChange={set('priority')}>
            <option value="critical">{t('حرجة', 'Critical', 'انتہائی اہم')}</option>
            <option value="high">{t('عالية', 'High', 'زیادہ')}</option>
            <option value="medium">{t('متوسطة', 'Medium', 'درمیانی')}</option>
            <option value="low">{t('منخفضة', 'Low', 'کم')}</option>
          </select>
        </label>
        <ErrorNote error={act.error} lang={lang} />
        <div className={s.row} style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="q-btn q-btn-secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</button>
          <button type="submit" className="q-btn q-btn-primary" disabled={act.busy}>{t('إسناد ونشر', 'Assign and publish', 'تفویض اور شائع کریں')}</button>
        </div>
      </form>
    </div>
  );
}
AssignDialog.propTypes = {
  lang: PropTypes.string.isRequired, cycleId: PropTypes.string.isRequired, requirementIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onClose: PropTypes.func.isRequired, onDone: PropTypes.func.isRequired,
};
