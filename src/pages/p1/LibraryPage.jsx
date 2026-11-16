// Regulations library: laws, decisions, circulars, DGA controls, policies and guides,
// with the standards that cite them. The release ships the list only; each entity uploads its own copies.
import { useRef, useState } from 'react';
import { useQiyas } from '../../context/QiyasSession.jsx';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import useToast from '../../hooks/useToast.js';
import { Empty, ErrorNote, Loading, Pager, pageProps, useAction, usePagedApi } from './shared.jsx';
import s from './p1.module.css';

const LIBRARY_KINDS = {
  law: ['نظام', 'Law', 'قانون'],
  regulation: ['لائحة وتنظيم', 'Regulation', 'ضابطہ'],
  royal_decree: ['مرسوم ملكي', 'Royal decree', 'شاہی فرمان'],
  royal_order: ['أمر سامٍ', 'Royal order', 'شاہی حکم'],
  decision: ['قرار', 'Decision', 'فیصلہ'],
  circular: ['تعميم', 'Circular', 'سرکلر'],
  directive: ['توجيه', 'Directive', 'ہدایت'],
  controls: ['ضوابط', 'Controls', 'ضوابط'],
  policy: ['سياسات', 'Policy', 'پالیسی'],
  guide: ['دليل', 'Guide', 'رہنما کتاب'],
  framework: ['معايير قياس', 'Qiyas standards', 'قیاس معیارات'],
  user_guide: ['دليل مستخدم', 'User guide', 'صارف رہنما'],
  report: ['تقرير', 'Report', 'رپورٹ'],
  presentation: ['عرض تقديمي', 'Presentation', 'پیشکش'],
  other: ['أخرى', 'Other', 'دیگر'],
};

const kindLabel = (t, kind) => t(...(LIBRARY_KINDS[kind] ?? LIBRARY_KINDS.other));

function AddDocument({ lang, onAdded }) {
  const t = makeT(lang);
  const q = useQiyas();
  const [form, setForm] = useState({ kind: 'policy', titleAr: '', titleEn: '', version: '', codes: '' });
  const act = useAction();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    const standardCodes = form.codes.split(/[\s,،]+/).filter(Boolean);
    act.run(() => api.post('/library', {
      kind: form.kind, titleAr: form.titleAr, titleEn: form.titleEn, version: form.version || undefined,
      standardCodes: standardCodes.length ? standardCodes : undefined, frameworkVersionId: standardCodes.length ? q.cycle?.framework_version_id : undefined,
    }), () => { setForm({ kind: 'policy', titleAr: '', titleEn: '', version: '', codes: '' }); onAdded(); });
  };
  return (
    <form className="q-card q-card-pad" onSubmit={submit}>
      <h2 className="q-section-title" style={{ marginBottom: 10 }}>{t('إضافة وثيقة خاصة بالجهة', 'Add an entity document', 'ادارے کی دستاویز شامل کریں')}</h2>
      <div className={s.row}>
        <select className="q-input" style={{ width: 'auto' }} value={form.kind} onChange={set('kind')} aria-label={t('النوع', 'Type', 'قسم')}>
          {Object.keys(LIBRARY_KINDS).map((k) => <option key={k} value={k}>{kindLabel(t, k)}</option>)}
        </select>
        <input className="q-input" style={{ flex: 2, minWidth: 200 }} dir="rtl" required value={form.titleAr} onChange={set('titleAr')} placeholder={t('العنوان بالعربية', 'Title in Arabic', 'عربی میں عنوان')} />
        <input className="q-input" style={{ flex: 2, minWidth: 200 }} dir="ltr" required value={form.titleEn} onChange={set('titleEn')} placeholder={t('العنوان بالإنجليزية', 'Title in English', 'انگریزی میں عنوان')} />
        <input className="q-input" style={{ width: 90 }} value={form.version} onChange={set('version')} placeholder={t('الإصدار', 'Version', 'ورژن')} />
        <input className="q-input" style={{ flex: 1, minWidth: 160 }} dir="ltr" value={form.codes} onChange={set('codes')} placeholder={t('رموز المعايير، مثل 5.9.1', 'Standard codes, e.g. 5.9.1', 'معیار کے کوڈ، جیسے 5.9.1')} />
        <button type="submit" className="q-btn q-btn-primary" disabled={act.busy}>{t('إضافة', 'Add', 'شامل کریں')}</button>
      </div>
      <ErrorNote error={act.error} lang={lang} />
    </form>
  );
}
AddDocument.propTypes = { lang: pageProps.lang, onAdded: pageProps.onNavigate };

export default function LibraryPage({ lang }) {
  const t = makeT(lang);
  const q = useQiyas();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [reload, setReload] = useState(0);
  const fileInput = useRef(null);
  const [uploadFor, setUploadFor] = useState(null);
  const frameworkVersionId = q.cycle?.framework_version_id;
  const list = usePagedApi((page, pageSize) => api.get('/library', { text: search || undefined, kind: kind || undefined, frameworkVersionId, page, pageSize }), [search, kind, reload, frameworkVersionId]);
  const { error, loading } = list;
  const data = list.items;
  const act = useAction();
  const { toast, showToast } = useToast();
  const manage = q.can('library.manage');

  const pickFile = (doc) => { setUploadFor(doc); fileInput.current?.click(); };
  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !uploadFor) return;
    const form = new FormData();
    form.append('file', f);
    act.run(() => api.upload(`/library/${uploadFor.id}/file`, form), () => { showToast(t('رُفع الملف', 'File uploaded', 'فائل اپ لوڈ ہو گئی')); setReload((n) => n + 1); });
  };

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('مكتبة الأنظمة والأدلة', 'Regulations library', 'قوانین اور رہنما کتب کی لائبریری')}</h1>
          <p className="q-page-sub">{t('الأنظمة والقرارات والتعاميم والضوابط والأدلة، مع المعايير التي تستند إليها. تُرفع نسخ الوثائق من الجهة نفسها.',
            'Laws, decisions, circulars, controls and guides, with the standards that cite them. Each entity uploads its own copies of the documents.',
            'قوانین، فیصلے، سرکلر، ضوابط اور رہنما کتب، ان معیارات کے ساتھ جو ان کا حوالہ دیتے ہیں۔ ہر ادارہ دستاویزات کی اپنی نقول اپ لوڈ کرتا ہے۔')}</p>
        </div>
      </div>
      <form className="q-card q-card-pad" onSubmit={(e) => { e.preventDefault(); setSearch(text); }}>
        <div className={s.row}>
          <input className="q-input" style={{ flex: 1, minWidth: 200 }} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={t('ابحث بالعنوان أو الرقم أو التاريخ', 'Search by title, number or date', 'عنوان، نمبر یا تاریخ سے تلاش کریں')} />
          <select className="q-input" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('النوع', 'Type', 'قسم')}>
            <option value="">{t('كل الأنواع', 'All types', 'تمام اقسام')}</option>
            {Object.keys(LIBRARY_KINDS).map((k) => <option key={k} value={k}>{kindLabel(t, k)}</option>)}
          </select>
          <button type="submit" className="q-btn q-btn-primary">{t('بحث', 'Search', 'تلاش')}</button>
        </div>
      </form>
      {manage && <AddDocument lang={lang} onAdded={() => setReload((n) => n + 1)} />}
      <ErrorNote error={error ?? act.error} lang={lang} />
      <input ref={fileInput} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={onFile} />
      <section className="q-card">
        {loading && !data ? <Loading lang={lang} /> : (data ?? []).length === 0 ? <Empty lang={lang} title={t('لا توجد وثائق', 'No documents', 'کوئی دستاویز نہیں')} /> : (
          <ul className={s.list}>
            {data.map((d) => {
              const cited = d.standards.filter((x) => x.relation === 'cited');
              const related = d.standards.filter((x) => x.relation === 'related');
              return (
                <li key={d.id} className={s.listItem} style={{ alignItems: 'flex-start' }}>
                  <div className={s.listMain}>
                    <span className={s.title} dir="auto">{lang === 'ar' ? d.title_ar : d.title_en}{d.version ? <span className={s.sub}> · v{d.version}</span> : null}</span>
                    <span className={s.sub} dir="auto">
                      <span className="q-badge q-tone-neutral" style={{ marginInlineEnd: 6 }}>{kindLabel(t, d.kind)}</span>
                      {d.origin === 'client' && <span className="q-badge q-tone-info" style={{ marginInlineEnd: 6 }}>{t('خاصة بالجهة', 'Entity document', 'ادارے کی دستاویز')}</span>}
                      {d.issued_on && <span style={{ marginInlineEnd: 6 }}>{d.issued_on}</span>}
                      {lang !== 'ar' && <span>{d.title_ar}</span>}
                    </span>
                    {cited.length > 0 && (
                      <span className={s.sub}>{t('تستند إليه المعايير:', 'Cited by:', 'ان معیارات میں حوالہ:')}{' '}
                        {cited.map((x) => <span key={x.standardId} className="q-code" style={{ marginInlineEnd: 4 }} title={x.detail ?? ''}>{x.code}</span>)}
                      </span>
                    )}
                    {related.length > 0 && (
                      <span className={s.sub}>{t('ذات صلة:', 'Related:', 'متعلقہ:')}{' '}
                        {related.slice(0, 12).map((x) => <span key={x.standardId} className="q-code" style={{ marginInlineEnd: 4 }}>{x.code}</span>)}
                        {related.length > 12 && <span>+{related.length - 12}</span>}
                      </span>
                    )}
                  </div>
                  <div className={s.row}>
                    {d.has_file && (
                      <button type="button" className="q-btn q-btn-secondary q-btn-sm" onClick={() => act.run(() => api.download(`/library/${d.id}/file`, d.original_filename ?? 'document.pdf'))}>
                        {t('تنزيل', 'Download', 'ڈاؤن لوڈ')}
                      </button>
                    )}
                    {!d.has_file && !manage && <span className={s.sub}>{t('لم تُرفع نسخة بعد', 'No copy uploaded yet', 'ابھی کوئی نقل اپ لوڈ نہیں ہوئی')}</span>}
                    {manage && (
                      <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={act.busy} onClick={() => pickFile(d)}>
                        {d.has_file ? t('استبدال الملف', 'Replace file', 'فائل تبدیل کریں') : t('رفع نسخة الجهة', 'Upload our copy', 'ہماری نقل اپ لوڈ کریں')}
                      </button>
                    )}
                  </div>
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
LibraryPage.propTypes = pageProps;
