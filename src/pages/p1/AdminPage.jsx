// Administration (BR-ADM): people and roles, departments, deadline policies, organization.
import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { env } from '../../config/env.js';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import useToast from '../../hooks/useToast.js';
import { PHASE1_ROLE_LABELS } from '../../utils/user.js';
import { Empty, ErrorNote, Loading, pageProps, pickText, useAction, useApi } from './shared.jsx';
import s from './p1.module.css';

const ROLES = ['QC', 'DM', 'EMP', 'DSO', 'EXE', 'ADM'];

export default function AdminPage({ lang }) {
  const t = makeT(lang);
  const [tab, setTab] = useState('people');
  const { toast, showToast } = useToast();
  const tabs = [
    ['people', t('الأشخاص والأدوار', 'People & roles', 'افراد اور کردار')],
    ['departments', t('الإدارات', 'Departments', 'شعبے')],
    ['deadlines', t('المواعيد', 'Deadlines', 'آخری تاریخیں')],
    ['organization', t('الجهة', 'Organization', 'ادارہ')],
  ];
  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('الإدارة', 'Administration', 'انتظامیہ')}</h1>
          <p className="q-page-sub">{t('كل تغيير هنا يُسجَّل في سجل التدقيق.', 'Every change here is recorded in the audit log.', 'یہاں ہر تبدیلی آڈٹ لاگ میں درج ہوتی ہے۔')}</p>
        </div>
      </div>
      <div className={s.tabs} role="tablist">
        {tabs.map(([k, label]) => <button key={k} type="button" role="tab" className={s.tab} aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === 'people' && <People lang={lang} notify={showToast} />}
      {tab === 'departments' && <Departments lang={lang} notify={showToast} />}
      {tab === 'deadlines' && <Deadlines lang={lang} notify={showToast} />}
      {tab === 'organization' && <Organization lang={lang} notify={showToast} />}
      {toast && <div className="q-toast" role="status">{toast}</div>}
    </div>
  );
}
AdminPage.propTypes = pageProps;

const sub = { lang: PropTypes.string.isRequired, notify: PropTypes.func.isRequired };
const roleName = (t, code) => { const r = PHASE1_ROLE_LABELS[code]; return r ? t(r.ar, r.en, r.ur) : code; };

function People({ lang, notify }) {
  const t = makeT(lang);
  const users = useApi(() => api.get('/admin/users'), []);
  const depts = useApi(() => api.get('/departments'), []);
  const [form, setForm] = useState({ userId: '', role: 'EMP', departmentId: '' });
  const act = useAction();
  const deptName = (id) => { const d = (depts.data ?? []).find((x) => x.id === id); return d ? pickText(lang, { ar: d.name_ar, en: d.name_en }) : ''; };
  const scoped = form.role === 'DM' || form.role === 'EMP';
  const grant = () => act.run(() => api.post('/admin/role-grants', { userId: form.userId, role: form.role, departmentId: scoped ? form.departmentId : null }), () => { notify(t('مُنح الدور', 'Role granted', 'کردار دے دیا گیا')); users.reload(); });
  const revoke = (id) => act.run(() => api.del(`/admin/role-grants/${id}`), () => { notify(t('سُحب الدور', 'Role removed', 'کردار واپس لے لیا گیا')); users.reload(); });
  return (
    <div className={s.stack}>
      <section className="q-card q-card-pad">
        <h2 className="q-section-title" style={{ marginBottom: 10 }}>{t('منح دور', 'Grant a role', 'کردار دیں')}</h2>
        <div className={s.row}>
          <select className="q-input" style={{ width: 'auto' }} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} aria-label={t('الشخص', 'Person', 'شخص')}>
            <option value="">{t('اختر شخصًا', 'Choose a person', 'شخص منتخب کریں')}</option>
            {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="q-input" style={{ width: 'auto' }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} aria-label={t('الدور', 'Role', 'کردار')}>
            {ROLES.map((r) => <option key={r} value={r}>{roleName(t, r)}</option>)}
          </select>
          {scoped && (
            <select className="q-input" style={{ width: 'auto' }} value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} aria-label={t('الإدارة', 'Department', 'شعبہ')}>
              <option value="">{t('اختر الإدارة', 'Choose a department', 'شعبہ منتخب کریں')}</option>
              {(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{pickText(lang, { ar: d.name_ar, en: d.name_en })}</option>)}
            </select>
          )}
          <button type="button" className="q-btn q-btn-primary" disabled={!form.userId || (scoped && !form.departmentId) || act.busy} onClick={grant}>{t('منح', 'Grant', 'دیں')}</button>
        </div>
        <p className={s.sub} style={{ marginTop: 8 }}>{t('لا يجمع شخص واحد بين دور المستشار ودور مسؤول الرفع.', 'One person can never be both Qiyas Consultant and DGA Submission Officer.', 'ایک شخص کبھی بھی کنسلٹنٹ اور سبمیشن آفیسر دونوں نہیں ہو سکتا۔')}</p>
        <ErrorNote error={act.error} lang={lang} />
      </section>
      <section className="q-card">
        {users.loading && !users.data ? <Loading lang={lang} /> : (
          <div className="q-table-wrap">
            <table className="q-table">
              <thead><tr><th>{t('الاسم', 'Name', 'نام')}</th><th>{t('البريد', 'Email', 'ای میل')}</th><th>{t('الأدوار', 'Roles', 'کردار')}</th></tr></thead>
              <tbody>
                {(users.data ?? []).map((u) => (
                  <tr key={u.id}>
                    <td className="q-cell-strong">{u.name}</td>
                    <td className="q-cell-muted"><bdi>{u.email}</bdi></td>
                    <td>
                      <div className={s.row}>
                        {u.grants.map((g) => (
                          <span key={g.id} className={s.chip}>
                            {roleName(t, g.role)}{g.departmentId ? ` · ${deptName(g.departmentId)}` : ''}
                            <button type="button" aria-label={t('سحب الدور', 'Remove role', 'کردار واپس لیں')} onClick={() => revoke(g.id)} style={{ color: 'var(--danger)' }}>×</button>
                          </span>
                        ))}
                      </div>
                    </td>
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
People.propTypes = sub;

function Departments({ lang, notify }) {
  const t = makeT(lang);
  const depts = useApi(() => api.get('/departments'), []);
  const users = useApi(() => api.get('/admin/users'), []);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ code: '', nameAr: '', nameEn: '' });
  const act = useAction();
  const create = () => act.run(() => api.post('/admin/departments', form), () => { notify(t('أُنشئت الإدارة', 'Department created', 'شعبہ بن گیا')); setForm({ code: '', nameAr: '', nameEn: '' }); depts.reload(); });
  return (
    <div className={s.stack}>
      <section className="q-card q-card-pad">
        <h2 className="q-section-title" style={{ marginBottom: 10 }}>{t('إدارة جديدة', 'New department', 'نیا شعبہ')}</h2>
        <div className={s.row}>
          <input className="q-input" style={{ width: 120 }} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t('الرمز', 'Code', 'کوڈ')} />
          <input className="q-input" style={{ flex: 1, minWidth: 160 }} dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder={t('الاسم بالعربية', 'Arabic name', 'عربی نام')} />
          <input className="q-input" style={{ flex: 1, minWidth: 160 }} dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder={t('الاسم بالإنجليزية', 'English name', 'انگریزی نام')} />
          <button type="button" className="q-btn q-btn-primary" disabled={!form.code || !form.nameAr || !form.nameEn || act.busy} onClick={create}>{t('إنشاء', 'Create', 'بنائیں')}</button>
        </div>
        <ErrorNote error={act.error} lang={lang} />
      </section>
      <section className="q-card">
        {depts.loading && !depts.data ? <Loading lang={lang} /> : (depts.data ?? []).length === 0 ? <Empty lang={lang} /> : (
          <ul className={s.list}>
            {depts.data.map((d) => (
              <li key={d.id} className={s.listItem} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <button type="button" className={s.between} onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id}>
                  <span className={s.title}><span className="q-code">{d.code}</span> {pickText(lang, { ar: d.name_ar, en: d.name_en })}</span>
                  <span className={s.sub}>{d.manager ? `${t('المدير:', 'Manager:', 'مینیجر:')} ${d.manager.name}` : t('بلا مدير', 'No manager', 'مینیجر نہیں')}</span>
                </button>
                {open === d.id && <DepartmentMembers lang={lang} dept={d} users={users.data ?? []} notify={notify} onChanged={depts.reload} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
Departments.propTypes = sub;

function DepartmentMembers({ lang, dept, users, notify, onChanged }) {
  const t = makeT(lang);
  const members = useApi(() => api.get(`/departments/${dept.id}/members`), [dept.id]);
  const [pick, setPick] = useState('');
  const act = useAction();
  const after = (msg) => () => { notify(msg); members.reload(); onChanged(); };
  return (
    <div className={s.stack} style={{ paddingTop: 10 }}>
      <ul className={s.list}>
        {(members.data ?? []).map((m) => (
          <li key={m.id} className={s.listItem} style={{ padding: '8px 0' }}>
            <span>{m.name} {m.membership === 'manager' && <span className="q-badge q-tone-brand">{t('مدير', 'Manager', 'مینیجر')}</span>}</span>
            {m.membership !== 'manager' && (
              <div className={s.row}>
                <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => act.run(() => api.put(`/admin/departments/${dept.id}/manager`, { userId: m.id }), after(t('عُيّن مديرًا', 'Made manager', 'مینیجر بنا دیا گیا')))}>{t('تعيين مديرًا', 'Make manager', 'مینیجر بنائیں')}</button>
                <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => act.run(() => api.del(`/admin/departments/${dept.id}/members/${m.id}`), after(t('أُزيل من الإدارة', 'Removed from the department', 'شعبے سے ہٹا دیا گیا')))}>{t('إزالة', 'Remove', 'ہٹائیں')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className={s.row}>
        <select className="q-input" style={{ width: 'auto' }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('إضافة عضو', 'Add a member', 'رکن شامل کریں')}>
          <option value="">{t('إضافة شخص إلى الإدارة', 'Add a person to the department', 'شعبے میں شخص شامل کریں')}</option>
          {users.filter((u) => !(members.data ?? []).some((m) => m.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={!pick || act.busy} onClick={() => act.run(() => api.post(`/admin/departments/${dept.id}/members`, { userId: pick }), after(t('أُضيف إلى الإدارة', 'Added to the department', 'شعبے میں شامل')))}>{t('إضافة', 'Add', 'شامل کریں')}</button>
        {!dept.manager && pick && <button type="button" className="q-btn q-btn-primary q-btn-sm" onClick={() => act.run(() => api.put(`/admin/departments/${dept.id}/manager`, { userId: pick }), after(t('عُيّن مديرًا', 'Made manager', 'مینیجر بنا دیا گیا')))}>{t('تعيين مديرًا', 'Make manager', 'مینیجر بنائیں')}</button>}
      </div>
      <ErrorNote error={act.error} lang={lang} />
    </div>
  );
}
DepartmentMembers.propTypes = { ...sub, dept: PropTypes.object.isRequired, users: PropTypes.array.isRequired, onChanged: PropTypes.func.isRequired };

function Deadlines({ lang, notify }) {
  const t = makeT(lang);
  const { data, error, loading, reload } = useApi(() => api.get('/admin/sla-policies'), []);
  const [edits, setEdits] = useState({});
  const act = useAction();
  const names = {
    manager_assignment: t('إسناد المدير للمهمة', 'Manager assigns the task', 'مینیجر کا کام تفویض کرنا'),
    implementation: t('التنفيذ (يحدده المستشار لكل إسناد)', 'Implementation (set per assignment)', 'عمل درآمد (ہر تفویض کے لیے مقرر)'),
    clarification_response: t('رد المستشار على التوضيح', 'Consultant answers a clarification', 'کنسلٹنٹ کا وضاحت کا جواب'),
    extension_decision: t('قرار المستشار في التمديد', 'Consultant decides an extension', 'کنسلٹنٹ کا توسیع کا فیصلہ'),
    review: t('مراجعة المستشار للدليل', 'Consultant reviews evidence', 'کنسلٹنٹ کا ثبوت کا جائزہ'),
    posting: t('رفع الدليل على منصة الهيئة', 'Posting to DGA', 'DGA پر پوسٹ کرنا'),
  };
  const value = (p, k) => edits[p.timer_kind]?.[k] ?? p[k];
  const save = (p) => {
    const e = edits[p.timer_kind] ?? {};
    const days = (v) => String(v).split(',').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x >= 0);
    act.run(() => api.patch(`/admin/sla-policies/${p.timer_kind}`, {
      ...(e.duration_business_days !== undefined && { durationBusinessDays: e.duration_business_days === '' ? null : Number(e.duration_business_days) }),
      ...(e.reminder_days !== undefined && { reminderDays: days(e.reminder_days) }),
      ...(e.is_active !== undefined && { isActive: e.is_active }),
    }), () => { notify(t('حُفظ', 'Saved', 'محفوظ ہو گیا')); setEdits({ ...edits, [p.timer_kind]: undefined }); reload(); });
  };
  return (
    <section className="q-card">
      <ErrorNote error={error ?? act.error} lang={lang} />
      {loading && !data ? <Loading lang={lang} /> : (
        <div className="q-table-wrap">
          <table className="q-table">
            <thead><tr><th>{t('الموعد', 'Deadline', 'آخری تاریخ')}</th><th>{t('أيام عمل', 'Working days', 'کام کے دن')}</th><th>{t('تذكير قبل (أيام)', 'Remind before (days)', 'پہلے یاد دہانی (دن)')}</th><th>{t('مفعّل', 'Active', 'فعال')}</th><th /></tr></thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.timer_kind}>
                  <td className="q-cell-strong">{names[p.timer_kind] ?? p.timer_kind}</td>
                  <td>{p.timer_kind === 'implementation' ? '—' : (
                    <input className="q-input" style={{ width: 90 }} type="number" min="0" value={value(p, 'duration_business_days') ?? ''} onChange={(e) => setEdits({ ...edits, [p.timer_kind]: { ...edits[p.timer_kind], duration_business_days: e.target.value } })} />
                  )}</td>
                  <td><input className="q-input" style={{ width: 120 }} value={Array.isArray(value(p, 'reminder_days')) ? value(p, 'reminder_days').join(', ') : value(p, 'reminder_days')} onChange={(e) => setEdits({ ...edits, [p.timer_kind]: { ...edits[p.timer_kind], reminder_days: e.target.value } })} /></td>
                  <td><input type="checkbox" checked={Boolean(value(p, 'is_active'))} onChange={(e) => setEdits({ ...edits, [p.timer_kind]: { ...edits[p.timer_kind], is_active: e.target.checked } })} aria-label={t('مفعّل', 'Active', 'فعال')} /></td>
                  <td><button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={!edits[p.timer_kind] || act.busy} onClick={() => save(p)}>{t('حفظ', 'Save', 'محفوظ کریں')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
Deadlines.propTypes = sub;

function Organization({ lang, notify }) {
  const t = makeT(lang);
  const [form, setForm] = useState(null);
  const branding = useApi(() => api.get('/public/branding'), []);
  const act = useAction();
  const fileInput = useRef(null);
  const current = form ?? (branding.data ? { nameAr: branding.data.nameAr ?? '', nameEn: branding.data.nameEn ?? '', defaultLanguage: branding.data.defaultLanguage ?? 'ar' } : { nameAr: '', nameEn: '', defaultLanguage: 'ar' });
  const set = (k) => (e) => setForm({ ...current, [k]: e.target.value });
  const logoUrl = branding.data?.hasLogo ? `${env.apiBaseUrl.replace(/\/v1\/?$/, '/v2')}/public/branding/logo?v=${branding.data.version}` : null;
  const upload = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const data = new FormData();
    data.append('file', f);
    act.run(() => api.upload('/admin/settings/logo', data), () => { notify(t('حُفظ الشعار', 'Logo saved', 'لوگو محفوظ ہو گیا')); branding.reload(); });
  };
  return (
    <section className={`q-card q-card-pad ${s.form}`} style={{ maxWidth: 560 }}>
      <p className={s.sub}>{t('يظهر الاسم والشعار في صفحة الدخول وفي التقارير. لكل جهة إعداداتها؛ لا تُضمَّن في الإصدار.',
        'The name and logo appear on the sign-in page and in reports. Each entity sets its own; they are not part of the release.',
        'نام اور لوگو سائن ان صفحے اور رپورٹس میں نظر آتے ہیں۔ ہر ادارہ اپنا مقرر کرتا ہے؛ یہ ریلیز کا حصہ نہیں۔')}</p>
      <label className={s.field}>{t('اسم الجهة بالعربية', 'Organization name (Arabic)', 'ادارے کا نام (عربی)')}<input className="q-input" dir="rtl" value={current.nameAr} onChange={set('nameAr')} /></label>
      <label className={s.field}>{t('اسم الجهة بالإنجليزية', 'Organization name (English)', 'ادارے کا نام (انگریزی)')}<input className="q-input" dir="ltr" value={current.nameEn} onChange={set('nameEn')} /></label>
      <label className={s.field}>{t('اللغة الافتراضية', 'Default language', 'طے شدہ زبان')}
        <select className="q-input" value={current.defaultLanguage} onChange={set('defaultLanguage')}>
          <option value="ar">العربية</option><option value="en">English</option><option value="ur">اردو</option>
        </select>
      </label>
      <div><button type="button" className="q-btn q-btn-primary" disabled={!current.nameAr || !current.nameEn || act.busy}
        onClick={() => act.run(() => api.put('/admin/settings', current), () => { notify(t('حُفظت الإعدادات', 'Settings saved', 'ترتیبات محفوظ ہو گئیں')); setForm(null); branding.reload(); })}>{t('حفظ', 'Save', 'محفوظ کریں')}</button></div>
      <div className={s.field}>{t('الشعار (PNG أو JPEG أو WebP، حتى 1 م.ب)', 'Logo (PNG, JPEG or WebP, up to 1 MB)', 'لوگو (PNG، JPEG یا WebP، 1 MB تک)')}
        <div className={s.row}>
          {logoUrl && <img src={logoUrl} alt="" style={{ height: 48, maxWidth: 160, objectFit: 'contain', background: 'var(--surface-2)', borderRadius: 8, padding: 4 }} />}
          <input ref={fileInput} type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={upload} />
          <button type="button" className="q-btn q-btn-secondary" disabled={act.busy || !branding.data?.nameAr} onClick={() => fileInput.current?.click()}>
            {logoUrl ? t('تغيير الشعار', 'Change logo', 'لوگو تبدیل کریں') : t('رفع الشعار', 'Upload logo', 'لوگو اپ لوڈ کریں')}
          </button>
          {logoUrl && (
            <button type="button" className="q-btn q-btn-ghost" disabled={act.busy} onClick={() => act.run(() => api.del('/admin/settings/logo'), () => branding.reload())}>
              {t('إزالة', 'Remove', 'ہٹائیں')}
            </button>
          )}
        </div>
      </div>
      <ErrorNote error={act.error} lang={lang} />
    </section>
  );
}
Organization.propTypes = sub;
