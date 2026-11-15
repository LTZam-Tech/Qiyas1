// Evidence banks: search any cycle's bank; consultants reuse earlier evidence as a starting point (BR-BNK).
import { useState } from 'react';
import { useQiyas } from '../../context/QiyasSession.jsx';
import { makeT } from '../../i18n/index.js';
import { api } from '../../services/qiyasApi.js';
import useToast from '../../hooks/useToast.js';
import { Empty, ErrorNote, Loading, REVIEW_STATUS, StatusBadge, pageProps, useAction, useApi } from './shared.jsx';
import { CarryOver, FolderImport } from './BankTools.jsx';
import s from './p1.module.css';

export default function BankPage({ lang }) {
  const t = makeT(lang);
  const q = useQiyas();
  const [bankCycle, setBankCycle] = useState(q.cycleId ?? '');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [acceptedOnly, setAcceptedOnly] = useState(true);
  const { data, error, loading } = useApi(() => (bankCycle ? api.get(`/cycles/${bankCycle}/bank`, { text: search || undefined, acceptedOnly }) : Promise.resolve([])), [bankCycle, search, acceptedOnly]);
  const act = useAction();
  const { toast, showToast } = useToast();
  const canReuse = q.can('bank.reuse') && q.cycleId && bankCycle !== q.cycleId;

  return (
    <div className="q-page">
      <div className="q-page-head">
        <div>
          <h1 className="q-page-title">{t('بنك الأدلة', 'Evidence bank', 'ثبوت کا بینک')}</h1>
          <p className="q-page-sub">{t('لكل دورة بنكها المستقل. يمكن إعادة استخدام أدلة سابقة كنقطة بداية، وتُراجع من جديد.', 'Each cycle has its own bank. Earlier evidence can be reused as a starting point, and is reviewed again.', 'ہر دور کا اپنا بینک ہے۔ پرانے ثبوت نقطۂ آغاز کے طور پر دوبارہ استعمال ہو سکتے ہیں، اور ان کا دوبارہ جائزہ ہوتا ہے۔')}</p>
        </div>
      </div>
      {q.can('bank.import') && q.cycle?.bank_status === 'open' && <FolderImport lang={lang} />}
      {q.can('bank.reuse') && q.cycle?.bank_status === 'open' && q.cycles.length > 1 && <CarryOver lang={lang} />}
      <form className="q-card q-card-pad" onSubmit={(e) => { e.preventDefault(); setSearch(text); }}>
        <div className={s.row}>
          <select className="q-input" style={{ width: 'auto' }} value={bankCycle} onChange={(e) => setBankCycle(e.target.value)} aria-label={t('الدورة', 'Cycle', 'دور')}>
            {q.cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="q-input" style={{ flex: 1, minWidth: 200 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('ابحث بالعنوان أو اسم الملف', 'Search by title or file name', 'عنوان یا فائل کے نام سے تلاش کریں')} />
          <label className={s.row} style={{ fontSize: '0.85rem' }}><input type="checkbox" checked={acceptedOnly} onChange={(e) => setAcceptedOnly(e.target.checked)} />{t('المقبولة فقط', 'Accepted only', 'صرف منظور شدہ')}</label>
          <button type="submit" className="q-btn q-btn-primary">{t('بحث', 'Search', 'تلاش')}</button>
        </div>
      </form>
      <ErrorNote error={error ?? act.error} lang={lang} />
      <section className="q-card">
        {loading && !data ? <Loading lang={lang} /> : (data ?? []).length === 0 ? <Empty lang={lang} title={t('لا توجد نتائج', 'No results', 'کوئی نتیجہ نہیں')} /> : (
          <ul className={s.list}>
            {data.map((v) => (
              <li key={`${v.versionId}:${v.standardCode}`} className={s.listItem}>
                <div className={s.listMain}>
                  <span className={s.title}>{v.title} <span className={s.sub}>v{v.versionNo}</span></span>
                  <span className={s.sub}>{v.standardCode ?? t('غير مربوط', 'Not linked', 'منسلک نہیں')}</span>
                </div>
                <div className={s.row}>
                  {v.reviewStatus && <StatusBadge map={REVIEW_STATUS} value={v.reviewStatus} lang={lang} />}
                  {canReuse && (
                    <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={act.busy}
                      onClick={() => act.run(() => api.post('/bank/reuse', { sourceVersionId: v.versionId, targetCycleId: q.cycleId }), () => showToast(t('نُسخ إلى بنك الدورة الحالية؛ يحتاج مراجعة جديدة', 'Copied into the current cycle\'s bank; it needs a new review', 'موجودہ دور کے بینک میں کاپی ہو گیا؛ نئے جائزے کی ضرورت ہے')))}>
                      {t('إعادة استخدام في الدورة الحالية', 'Reuse in current cycle', 'موجودہ دور میں دوبارہ استعمال کریں')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {toast && <div className="q-toast" role="status">{toast}</div>}
    </div>
  );
}
BankPage.propTypes = pageProps;
