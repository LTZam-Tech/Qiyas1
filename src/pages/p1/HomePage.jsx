import PropTypes from 'prop-types';
// Home: what needs my attention now, and how ready the organization is (docs/phase1/08).
import { useQiyas } from '../../context/QiyasSession.jsx';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import { getDisplayName } from '../../utils/user.js';
import { Deadline, Empty, ErrorNote, Loading, StatusBadge, TASK_STATUS, pageProps, pickText, useApi } from './shared.jsx';
import s from './p1.module.css';

const pct = (v) => (v == null ? '—' : `${v}%`);

export default function HomePage({ lang, onNavigate }) {
  const t = makeT(lang);
  const q = useQiyas();
  const { cycleId } = q;
  const isQc = q.hasRole('QC');
  const isDm = q.hasRole('DM');
  const showPosting = q.can('submission.view_queue');
  // Only people who own work (managers, employees) get a personal task list.
  const ownsWork = q.hasRole('EMP') || isDm;

  const { data, error, loading } = useApi(async () => {
    const [readiness, mine, dept, queue, inbox, notPosted] = await Promise.all([
      cycleId ? api.get(`/cycles/${cycleId}/readiness`) : null,
      ownsWork ? api.get('/tasks', { cycleId, mine: true }) : [],
      isDm ? api.get('/tasks', { cycleId, status: 'awaiting_assignment' }) : [],
      isQc ? api.get('/review-queue', { cycleId }) : [],
      isQc || isDm ? api.get('/inbox') : { clarifications: [], extensions: [] },
      showPosting && cycleId ? api.get(`/cycles/${cycleId}/submission-queue`, { status: 'not_posted' }) : [],
    ]);
    return { readiness, mine, dept, queue, inbox, notPosted };
  }, [cycleId]);

  const name = getDisplayName({ full_name: q.me?.user?.name, full_name_en: q.me?.user?.name }, lang).split(' ')[0];
  const open = (data?.mine ?? []).filter((x) => !['completed', 'cancelled'].includes(x.execution_status));
  const overdue = open.filter((x) => x.deadline?.isOverdue).length;
  const c = data?.readiness?.cycle;

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t(`مرحبًا، ${name}`, `Welcome, ${name}`, `خوش آمدید، ${name}`)}</h1>
          <p className="q-page-sub">{q.cycle ? q.cycle.name : t('لا توجد دورة قياس بعد', 'No measurement cycle yet', 'ابھی کوئی پیمائشی دور نہیں')}</p>
        </div>
        {q.cycles.length > 1 && (
          <label className={s.field} style={{ minWidth: 220 }}>
            {t('دورة القياس', 'Measurement cycle', 'پیمائشی دور')}
            <select className="q-input" value={cycleId ?? ''} onChange={(e) => q.setCycleId(e.target.value)}>
              {q.cycles.map((cy) => <option key={cy.id} value={cy.id}>{cy.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <ErrorNote error={error} lang={lang} />
      {loading && !data ? <Loading lang={lang} /> : data && (
        <>
          <div className={s.grid4}>
            <Kpi label={t('جاهزية الدورة', 'Cycle readiness', 'دور کی تیاری')} value={pct(c?.readinessPct)}
              hint={c ? t(`${c.ready} من ${c.applicable} متطلبًا`, `${c.ready} of ${c.applicable} requirements`, `${c.applicable} میں سے ${c.ready} شرائط`) : ''} />
            {showPosting && <Kpi label={t('المرفوع على منصة الهيئة', 'Posted to DGA', 'DGA پر پوسٹ شدہ')} value={pct(c?.postingPct)}
              hint={t(`${data.notPosted.length} مقبول لم يُرفع`, `${data.notPosted.length} accepted, not posted`, `${data.notPosted.length} منظور شدہ، پوسٹ نہیں ہوئے`)} onClick={() => onNavigate('submission')} />}
            {ownsWork && <Kpi label={t('مهامي المفتوحة', 'My open tasks', 'میرے جاری کام')} value={open.length}
              hint={overdue ? t(`${overdue} متأخرة`, `${overdue} overdue`, `${overdue} تاخیر کا شکار`) : t('لا تأخير', 'Nothing overdue', 'کوئی تاخیر نہیں')} tone={overdue ? 'danger' : undefined} onClick={() => onNavigate('tasks')} />}
            {isQc && <Kpi label={t('بانتظار المراجعة', 'Waiting for review', 'جائزے کے منتظر')} value={data.queue.length} onClick={() => onNavigate('review')} />}
            {(isQc || isDm) && <Kpi label={t('طلبات واردة', 'Inbox', 'موصول درخواستیں')} value={data.inbox.clarifications.length + data.inbox.extensions.length} onClick={() => onNavigate('inbox')} />}
            {isDm && <Kpi label={t('بانتظار إسنادك', 'Waiting for you to assign', 'آپ کی تفویض کے منتظر')} value={data.dept.length} tone={data.dept.length ? 'warning' : undefined} onClick={() => onNavigate('tasks')} />}
          </div>

          <div className={s.split}>
            {ownsWork && <section className="q-card">
              <div className="q-card-head">
                <h2 className="q-section-title">{t('مهامي', 'My tasks', 'میرے کام')}</h2>
                <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => onNavigate('tasks')}>{t('عرض الكل', 'View all', 'سب دیکھیں')}</button>
              </div>
              {open.length === 0 ? <Empty lang={lang} title={t('لا توجد مهام مفتوحة لديك', 'You have no open tasks', 'آپ کا کوئی جاری کام نہیں')} /> : (
                <ul className={s.list}>
                  {open.slice(0, 6).map((task) => (
                    <li key={task.id} className={s.listItem}>
                      <div className={s.listMain}>
                        <button type="button" className={s.linkBtn} dir="auto" onClick={() => onNavigate('task', task.id)}>{task.title}</button>
                        <span className={s.sub}>{task.standard_codes.join('، ')} · {pickText(lang, { ar: task.department_ar, en: task.department_en })}</span>
                      </div>
                      <div className={s.row}>
                        <StatusBadge map={TASK_STATUS} value={task.execution_status} lang={lang} />
                        <Deadline deadline={task.deadline} lang={lang} compact />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>}

            <section className="q-card">
              <div className="q-card-head"><h2 className="q-section-title">{t('الجاهزية حسب المنظور', 'Readiness by perspective', 'تناظر کے لحاظ سے تیاری')}</h2></div>
              <ul className={s.list}>
                {(data.readiness?.perspectives ?? []).map((p) => (
                  <li key={p.id} className={s.listItem} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className={s.between}>
                      <span className={s.title} style={{ fontSize: '0.88rem' }}>{pickText(lang, p.name)}</span>
                      <span className={s.sub}>{pct(p.rollup?.readinessPct)}</span>
                    </div>
                    <div className={s.bar}><div className={s.barFill} style={{ width: `${p.rollup?.readinessPct ?? 0}%` }} /></div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
HomePage.propTypes = pageProps;

function Kpi({ label, value, hint, tone, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`q-card q-card-pad ${s.kpi} ${onClick ? 'q-card-interactive' : ''}`}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue} style={tone ? { color: `var(--${tone})` } : undefined}>{value}</span>
      {hint && <span className={s.sub}>{hint}</span>}
    </Tag>
  );
}
Kpi.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  hint: PropTypes.string,
  tone: PropTypes.string,
  onClick: PropTypes.func,
};
