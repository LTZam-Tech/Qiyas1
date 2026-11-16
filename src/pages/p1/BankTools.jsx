// Consultant tools on the evidence bank page: folder import (BNK-7) and carry-over from an earlier cycle (BNK-5).
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useQiyas } from '../../context/QiyasSession.jsx';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import { ErrorNote, Pager, useAction, useApi, usePager } from './shared.jsx';
import s from './p1.module.css';

const IGNORED = /(^|\/)(\.[^/]*|~\$[^/]*|thumbs\.db|desktop\.ini)$|\.(lnk|tmp|ini|db|url)$/i;
const OUTCOME = {
  suggested: ['اقتُرح لمتطلب', 'Suggested for a requirement', 'شرط کے لیے تجویز', 'q-tone-success'],
  duplicate: ['موجود مسبقًا', 'Already in the bank', 'پہلے سے موجود', 'q-tone-neutral'],
  unmatched: ['يحتاج تحديد المعيار', 'Needs a standard', 'معیار درکار', 'q-tone-warning'],
  rejected: ['مرفوض', 'Rejected', 'مسترد', 'q-tone-danger'],
  quarantined: ['محجور (فحص الفيروسات)', 'Quarantined (virus scan)', 'قرنطینہ (وائرس اسکین)', 'q-tone-danger'],
  skipped: ['تم تخطيه', 'Skipped', 'چھوڑ دیا گیا', 'q-tone-neutral'],
};

/**
 * Imports a whole evidence folder (as prepared for the DGA portal) into the current bank.
 * Codes in folder and file names (5.3.2.7 = requirement R7 of 5.3.2) become suggestions for the task owners.
 */
export function FolderImport({ lang }) {
  const t = makeT(lang);
  const q = useQiyas();
  const input = useRef(null);
  const [files, setFiles] = useState([]);
  const [codesVersion, setCodesVersion] = useState('');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { data: frameworks } = useApi(() => api.get('/frameworks'), []);
  useEffect(() => { input.current?.setAttribute('webkitdirectory', ''); }, []);
  const usable = files.filter((f) => !IGNORED.test(f.webkitRelativePath || f.name));
  const mb = (usable.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(1);
  const folder = (files[0]?.webkitRelativePath || '').split('/')[0];

  const start = async () => {
    setError(null);
    setResult(null);
    try {
      const { batchId } = await api.post(`/cycles/${q.cycleId}/imports`, { label: folder || 'Folder import', codesFrameworkVersionId: codesVersion || undefined });
      let done = 0;
      setProgress({ done, total: usable.length });
      const queue = [...usable];
      const worker = async () => {
        while (queue.length) {
          const f = queue.shift();
          const form = new FormData();
          form.append('relativePath', f.webkitRelativePath || f.name);
          form.append('file', f);
          try { await api.upload(`/imports/${batchId}/files`, form); } catch (e) { setError(e); }
          done += 1;
          setProgress({ done, total: usable.length });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      await api.post(`/imports/${batchId}/finish`);
      setResult(await api.get(`/imports/${batchId}`));
      setFiles([]);
      if (input.current) input.current.value = '';
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
    }
  };

  return (
    <section className="q-card q-card-pad">
      <h2 className="q-section-title" style={{ marginBottom: 6 }}>{t('استيراد مجلد أدلة', 'Import an evidence folder', 'ثبوت کا فولڈر امپورٹ کریں')}</h2>
      <p className={s.sub} style={{ marginBottom: 10 }}>{t(
        'يُقرأ رمز المتطلب من أسماء المجلدات والملفات (مثل 5.3.2.7 = المتطلب 7 من المعيار 5.3.2). تُضاف الملفات إلى البنك وتظهر كأدلة مقترحة لأصحاب المهام، ولا يُربط شيء تلقائيًا. يراجعها مستشار آخر.',
        'The requirement is read from folder and file names (e.g. 5.3.2.7 = requirement 7 of standard 5.3.2). Files go into the bank and appear as suggested evidence to the task owners; nothing is linked automatically. Another consultant reviews them.',
        'شرط فولڈر اور فائل کے ناموں سے پڑھی جاتی ہے (مثلاً 5.3.2.7 = معیار 5.3.2 کی شرط 7)۔ فائلیں بینک میں جاتی ہیں اور کام کے ذمہ داروں کو تجویز کردہ ثبوت کے طور پر نظر آتی ہیں؛ کچھ بھی خود بخود منسلک نہیں ہوتا۔ ان کا جائزہ کوئی دوسرا مشیر لیتا ہے۔',
      )}</p>
      <div className={s.row}>
        <input ref={input} type="file" multiple hidden onChange={(e) => { setFiles([...(e.target.files ?? [])]); setResult(null); }} />
        <button type="button" className="q-btn q-btn-secondary" disabled={Boolean(progress)} onClick={() => input.current?.click()}>
          {t('اختيار مجلد', 'Choose a folder', 'فولڈر منتخب کریں')}
        </button>
        {folder && <span className={s.sub} dir="auto">{folder} · {t(`${files.length} ملفًا`, `${files.length} files`, `${files.length} فائلیں`)}</span>}
        {(frameworks ?? []).length > 1 && (
          <label className={s.row} style={{ fontSize: '0.85rem' }}>{t('الرموز حسب إصدار المعايير', 'Codes follow standards version', 'کوڈ معیارات کے ورژن کے مطابق')}
            <select className="q-input" style={{ width: 'auto' }} value={codesVersion} onChange={(e) => setCodesVersion(e.target.value)}>
              <option value="">{q.cycle?.version} ({t('إصدار الدورة', 'cycle version', 'دور کا ورژن')})</option>
              {frameworks.filter((f) => f.id !== q.cycle?.framework_version_id).map((f) => <option key={f.id} value={f.id}>{f.version}</option>)}
            </select>
          </label>
        )}
        {usable.length > 0 && !progress && (
          <button type="button" className="q-btn q-btn-primary" onClick={start}>
            {t(`استيراد ${usable.length} ملفًا (${mb} م.ب)`, `Import ${usable.length} files (${mb} MB)`, `${usable.length} فائلیں امپورٹ کریں (${mb} MB)`)}
          </button>
        )}
      </div>
      {progress && (
        <div style={{ marginTop: 12 }}>
          <div className={s.bar}><div className={s.barFill} style={{ width: `${(100 * progress.done) / Math.max(progress.total, 1)}%` }} /></div>
          <span className={s.sub}>{t(`${progress.done} من ${progress.total}`, `${progress.done} of ${progress.total}`, `${progress.total} میں سے ${progress.done}`)}</span>
        </div>
      )}
      <ErrorNote error={error} lang={lang} />
      {result && <ImportResult lang={lang} result={result} />}
    </section>
  );
}
FolderImport.propTypes = { lang: PropTypes.string.isRequired };

/** Why a file was not suggested, in the reader's language. */
function why(t, i) {
  if (i.outcome === 'unmatched') {
    if (!i.detected_code) return t('لا يوجد رمز معيار في اسم المجلد أو الملف؛ اربطه من المهمة', 'No standard code in the folder or file name; link it from the task', 'فولڈر یا فائل کے نام میں معیار کا کوڈ نہیں؛ کام سے منسلک کریں');
    if (i.detected_code.split('.').length === 2) return t(`المحور ${i.detected_code} فقط معروف؛ اربطه من المهمة`, `Only the axis ${i.detected_code} is known; link it from the task`, `صرف محور ${i.detected_code} معلوم ہے؛ کام سے منسلک کریں`);
    return t(`${i.detected_code} لا يطابق متطلبًا في هذه الدورة`, `${i.detected_code} matches no requirement of this cycle`, `${i.detected_code} اس دور کی کسی شرط سے مطابقت نہیں رکھتا`);
  }
  if (i.outcome === 'rejected') return t('نوع الملف أو حجمه غير مسموح', 'File type or size not allowed', 'فائل کی قسم یا سائز کی اجازت نہیں');
  if (i.outcome === 'duplicate') return t('الملف نفسه موجود في البنك', 'The same file is already in the bank', 'یہی فائل پہلے سے بینک میں ہے');
  return null;
}

function ImportResult({ lang, result }) {
  const t = makeT(lang);
  const [all, setAll] = useState(false);
  const shown = result.items.filter((i) => all || !['suggested', 'duplicate', 'skipped'].includes(i.outcome));
  const pager = usePager(shown);
  return (
    <div style={{ marginTop: 12 }}>
      <div className={s.row}>
        {Object.entries(OUTCOME).filter(([k]) => result.totals[k]).map(([k, [ar, en, ur, tone]]) => (
          <span key={k} className={`q-badge ${tone}`}>{t(ar, en, ur)}: {result.totals[k]}</span>
        ))}
        <span className={s.sub}>{t(`${result.totals.suggestions} اقتراحًا`, `${result.totals.suggestions} suggestions`, `${result.totals.suggestions} تجاویز`)}</span>
        <label className={s.row} style={{ fontSize: '0.85rem' }}>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />{t('عرض كل الملفات', 'Show all files', 'تمام فائلیں دکھائیں')}
        </label>
      </div>
      {shown.length > 0 && (
        <ul className={s.list} style={{ maxHeight: 320, overflow: 'auto', marginTop: 8 }}>
          {pager.items.map((i) => (
            <li key={i.id} className={s.listItem} style={{ padding: '8px 4px' }}>
              <div className={s.listMain}>
                <span className={s.sub} dir="auto">{i.relative_path}</span>
                {why(t, i) && <span className={s.sub} title={i.message ?? ''}>{why(t, i)}</span>}
              </div>
              <div className={s.row}>
                {i.detected_code && <span className="q-code">{i.detected_code}</span>}
                <span className={`q-badge ${OUTCOME[i.outcome][3]}`}>{t(OUTCOME[i.outcome][0], OUTCOME[i.outcome][1], OUTCOME[i.outcome][2])}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager pager={pager} lang={lang} />
    </div>
  );
}
ImportResult.propTypes = { lang: PropTypes.string.isRequired, result: PropTypes.object.isRequired };

/** Brings an earlier cycle's accepted evidence into this cycle as suggestions; acceptance never carries over (BR-BNK-04). */
export function CarryOver({ lang }) {
  const t = makeT(lang);
  const q = useQiyas();
  const others = q.cycles.filter((c) => c.id !== q.cycleId);
  const [source, setSource] = useState(others[0]?.id ?? '');
  const { data, error, reload } = useApi(() => (source ? api.get(`/cycles/${q.cycleId}/carry-over`, { sourceCycleId: source }) : Promise.resolve(null)), [source, q.cycleId]);
  const act = useAction();
  const [done, setDone] = useState(null);
  const pending = (data?.items ?? []).filter((i) => !i.alreadyCarried);
  const pager = usePager(pending);
  return (
    <section className="q-card q-card-pad">
      <h2 className="q-section-title" style={{ marginBottom: 6 }}>{t('ترحيل أدلة دورة سابقة', 'Carry over evidence from an earlier cycle', 'پچھلے دور کے ثبوت منتقل کریں')}</h2>
      <p className={s.sub} style={{ marginBottom: 10 }}>{t(
        'تُنسخ الأدلة المقبولة إلى بنك هذه الدورة وتُقترح على المتطلبات المقابلة (عبر جدول المقابلة بين الإصدارات). لا ينتقل القبول؛ تُراجع من جديد.',
        "Accepted evidence is copied into this cycle's bank and suggested for the matching requirements (through the crosswalk between versions). Acceptance does not carry over; it is reviewed again.",
        'منظور شدہ ثبوت اس دور کے بینک میں نقل ہوتے ہیں اور متعلقہ شرائط کے لیے تجویز کیے جاتے ہیں (ورژنز کے درمیان مطابقت کی جدول کے ذریعے)۔ منظوری منتقل نہیں ہوتی؛ دوبارہ جائزہ ہوتا ہے۔',
      )}</p>
      <div className={s.row}>
        <select className="q-input" style={{ width: 'auto' }} value={source} onChange={(e) => { setSource(e.target.value); setDone(null); }} aria-label={t('الدورة المصدر', 'Source cycle', 'ماخذ دور')}>
          {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {data && (
          <span className={s.sub}>{t(
            `${data.totals.evidence} دليلًا مقبولًا · ${data.totals.withTargets} لها متطلب مقابل · ${data.totals.alreadyCarried} مُرحّلة سابقًا`,
            `${data.totals.evidence} accepted · ${data.totals.withTargets} with a matching requirement · ${data.totals.alreadyCarried} already carried over`,
            `${data.totals.evidence} منظور شدہ · ${data.totals.withTargets} کی متعلقہ شرط موجود · ${data.totals.alreadyCarried} پہلے منتقل`,
          )}</span>
        )}
        {pending.length > 0 && (
          <button type="button" className="q-btn q-btn-primary" disabled={act.busy}
            onClick={() => act.run(() => api.post(`/cycles/${q.cycleId}/carry-over`, { sourceCycleId: source }), (r) => { setDone(r); reload(); })}>
            {t(`ترحيل ${pending.length}`, `Carry over ${pending.length}`, `${pending.length} منتقل کریں`)}
          </button>
        )}
      </div>
      <ErrorNote error={error ?? act.error} lang={lang} />
      {done && (
        <p className={s.sub} style={{ marginTop: 8 }}>{t(
          `رُحّل ${done.carried} دليلًا مع ${done.suggestions} اقتراحًا؛ ${done.withoutTarget} بلا متطلب مقابل في هذا الإصدار.`,
          `Carried over ${done.carried} with ${done.suggestions} suggestions; ${done.withoutTarget} have no matching requirement in this version.`,
          `${done.carried} منتقل ہوئے، ${done.suggestions} تجاویز کے ساتھ؛ ${done.withoutTarget} کی اس ورژن میں کوئی متعلقہ شرط نہیں۔`,
        )}</p>
      )}
      {pending.length > 0 && (
        <ul className={s.list} style={{ maxHeight: 260, overflow: 'auto', marginTop: 8 }}>
          {pager.items.map((i) => (
            <li key={i.versionId} className={s.listItem} style={{ padding: '8px 4px' }}>
              <span className={s.title} dir="auto">{i.title}</span>
              <span className={s.sub}>
                {i.from.map((c) => <bdi key={c} dir="ltr" className="q-code" style={{ marginInlineEnd: 4 }}>{c}</bdi>)}
                {t(' ← ', ' → ', ' ← ')}
                {i.to.length ? i.to.map((x) => <bdi key={x.code} dir="ltr" className="q-code" style={{ marginInlineEnd: 4 }}>{x.code}</bdi>) : t('لا مقابل', 'no match', 'کوئی مطابقت نہیں')}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pager pager={pager} lang={lang} />
    </section>
  );
}
CarryOver.propTypes = { lang: PropTypes.string.isRequired };
