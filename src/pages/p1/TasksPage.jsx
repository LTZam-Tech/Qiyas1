// Tasks I own, and (by role) my department's or the whole cycle's tasks.
import { useMemo, useState } from 'react';
import { useQiyas } from '../../context/QiyasSession.jsx';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import { Deadline, Empty, ErrorNote, Loading, StatusBadge, TASK_STATUS, pageProps, pickText, useApi } from './shared.jsx';
import s from './p1.module.css';

const FILTERS = ['open', 'awaiting_assignment', 'rework_required', 'submitted', 'completed', 'all'];

export default function TasksPage({ lang, isMobile, onNavigate }) {
  const t = makeT(lang);
  const q = useQiyas();
  const scope = q.me?.permissions?.['task.view'] ?? [];
  const wide = scope.includes('all') || scope.includes('dept');
  const [tab, setTab] = useState('mine');
  const [filter, setFilter] = useState('open');
  const { data, error, loading } = useApi(() => api.get('/tasks', { cycleId: q.cycleId, mine: tab === 'mine' ? true : undefined }), [q.cycleId, tab]);

  const rows = useMemo(() => (data ?? []).filter((x) => {
    if (filter === 'all') return true;
    if (filter === 'open') return !['completed', 'cancelled'].includes(x.execution_status);
    return x.execution_status === filter;
  }), [data, filter]);

  const filterLabel = {
    open: t('المفتوحة', 'Open', 'جاری'), awaiting_assignment: t('بانتظار الإسناد', 'Awaiting assignment', 'تفویض کا منتظر'),
    rework_required: t('تحتاج تعديلًا', 'Rework required', 'ترمیم درکار'), submitted: t('قيد المراجعة', 'In review', 'جائزے میں'),
    completed: t('مكتملة', 'Completed', 'مکمل'), all: t('الكل', 'All', 'سب'),
  };

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('المهام', 'Tasks', 'کام')}</h1>
          <p className="q-page-sub">{t('كل مهمة تطلب أدلة لمتطلب أو أكثر بموعد محدد.', 'Each task asks for evidence on one or more requirements by a deadline.', 'ہر کام ایک مقررہ تاریخ تک ایک یا زیادہ شرائط کا ثبوت مانگتا ہے۔')}</p>
        </div>
      </div>
      {wide && (
        <div className={s.tabs} role="tablist">
          <button type="button" role="tab" className={s.tab} aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>{t('مهامي', 'My tasks', 'میرے کام')}</button>
          <button type="button" role="tab" className={s.tab} aria-selected={tab === 'visible'} onClick={() => setTab('visible')}>
            {scope.includes('all') ? t('كل المهام', 'All tasks', 'تمام کام') : t('مهام إدارتي', 'My department', 'میرا شعبہ')}
          </button>
        </div>
      )}
      <div className="q-seg" role="group" aria-label={t('تصفية حسب الحالة', 'Filter by status')}>
        {FILTERS.map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{filterLabel[f]}</button>)}
      </div>
      <ErrorNote error={error} lang={lang} />
      <section className="q-card">
        {loading && !data ? <Loading lang={lang} /> : rows.length === 0 ? <Empty lang={lang} title={t('لا توجد مهام هنا', 'No tasks here', 'یہاں کوئی کام نہیں')} /> : isMobile ? (
          <ul className={s.list}>
            {rows.map((task) => (
              <li key={task.id} className={s.listItem} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <button type="button" className={s.linkBtn} onClick={() => onNavigate('task', task.id)}>{task.title}</button>
                <div className={s.between}><StatusBadge map={TASK_STATUS} value={task.execution_status} lang={lang} /><Deadline deadline={task.deadline} lang={lang} compact /></div>
                <span className={s.sub}>{task.owner_name} · {pickText(lang, { ar: task.department_ar, en: task.department_en })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="q-table-wrap">
            <table className="q-table">
              <thead>
                <tr>
                  <th>{t('المهمة', 'Task', 'کام')}</th>
                  <th>{t('المعايير', 'Standards', 'معیارات')}</th>
                  <th>{t('الإدارة', 'Department', 'شعبہ')}</th>
                  <th>{t('المسؤول الحالي', 'Current owner', 'موجودہ ذمہ دار')}</th>
                  <th>{t('الحالة', 'Status', 'صورتحال')}</th>
                  <th>{t('الموعد', 'Deadline', 'آخری تاریخ')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <button type="button" className={s.linkBtn} dir="auto" onClick={() => onNavigate('task', task.id)}>{task.title}</button>
                      {task.is_escalated && <span className="q-badge q-tone-danger" style={{ marginInlineStart: 8 }}>{t('مُصعّدة', 'Escalated', 'بڑھایا گیا')}</span>}
                    </td>
                    <td>{task.standard_codes.map((c) => <span key={c} className="q-code" style={{ marginInlineEnd: 4 }}>{c}</span>)}</td>
                    <td className="q-cell-muted">{pickText(lang, { ar: task.department_ar, en: task.department_en })}</td>
                    <td>{task.owner_name}</td>
                    <td><StatusBadge map={TASK_STATUS} value={task.execution_status} lang={lang} /></td>
                    <td><Deadline deadline={task.deadline} lang={lang} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
TasksPage.propTypes = pageProps;
