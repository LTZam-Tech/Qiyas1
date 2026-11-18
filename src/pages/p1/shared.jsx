/* eslint-disable react-refresh/only-export-components */
// Shared pieces for Phase 1 screens: loading data, status badges, deadlines, dates.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { localeOf, makeT } from '../../i18n/index.js';

/** Loads data from the API; reload() fetches again. */
export function useApi(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const loaderRef = useRef(loader);
  // Keep the latest loader without writing a ref during render; layout effects run before the
  // loading effect below, so it always calls the current loader.
  useLayoutEffect(() => {
    loaderRef.current = loader;
  });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    loaderRef.current()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState((s) => ({ data: s.data, error, loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload };
}

export const PAGE_SIZES = [10, 25, 50];

/**
 * Loads one page of a server list: loader(page, pageSize) calls an endpoint with ?page&pageSize
 * and gets { items, total, page, pageSize }. Going back to page 1 whenever `deps` change keeps
 * filters and paging consistent.
 */
export function usePagedApi(loader, deps, initialSize = PAGE_SIZES[0]) {
  const depsKey = JSON.stringify(deps);
  // the page belongs to one set of filters: changing a filter starts again at page 1
  const [pager, setPager] = useState({ page: 1, pageSize: initialSize, key: depsKey });
  const page = pager.key === depsKey ? pager.page : 1;
  const { pageSize } = pager;
  const api = useApi(() => loader(page, pageSize), [depsKey, page, pageSize]);
  const data = api.data;
  return {
    ...api,
    items: data?.items ?? null,
    total: data?.total ?? 0,
    page,
    pageSize,
    setPage: (n) => setPager({ page: n, pageSize, key: depsKey }),
    setPageSize: (n) => setPager({ page: 1, pageSize: n, key: depsKey }),
  };
}

/** Pages an array already on screen (short lists inside a page). */
export function usePager(rows, initialSize = PAGE_SIZES[0]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const total = rows?.length ?? 0;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, last);
  return {
    items: (rows ?? []).slice((current - 1) * pageSize, current * pageSize),
    total, page: current, pageSize,
    setPage, setPageSize: (n) => { setPageSize(n); setPage(1); },
  };
}

/** "Showing 11–20 of 312" with previous / next and the page size. Hidden while everything fits on one page. */
export function Pager({ pager, lang }) {
  const t = makeT(lang);
  const { page, pageSize, total, setPage, setPageSize } = pager;
  if (total <= PAGE_SIZES[0] && page === 1) return null;
  const last = Math.max(1, Math.ceil(total / pageSize), page);
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const nf = (n) => n.toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA-u-nu-latn');
  return (
    <nav className="q-pager" aria-label={t('التنقل بين الصفحات', 'Pagination', 'صفحات')}>
      <span className="q-pager-info">
        {t(`عرض ${nf(from)}–${nf(to)} من ${nf(total)}`, `Showing ${nf(from)}–${nf(to)} of ${nf(total)}`, `${nf(total)} میں سے ${nf(from)}–${nf(to)}`)}
      </span>
      <label className="q-pager-size">
        {t('لكل صفحة', 'Per page', 'فی صفحہ')}
        <select className="q-input" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="q-pager-nav">
        <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('السابق', 'Previous', 'پچھلا')}</button>
        <span className="q-pager-count">{t(`${nf(page)} / ${nf(last)}`, `${nf(page)} / ${nf(last)}`, `${nf(page)} / ${nf(last)}`)}</span>
        <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={page >= last} onClick={() => setPage(page + 1)}>{t('التالي', 'Next', 'اگلا')}</button>
      </div>
    </nav>
  );
}
Pager.propTypes = {
  pager: PropTypes.shape({ page: PropTypes.number, pageSize: PropTypes.number, total: PropTypes.number, setPage: PropTypes.func, setPageSize: PropTypes.func }).isRequired,
  lang: PropTypes.string.isRequired,
};

/** Runs an action, shows its error, and reports success through onDone. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn, onDone) => {
    setBusy(true);
    setError(null);
    try {
      const out = await fn();
      onDone?.(out);
      return out;
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clear: () => setError(null) };
}

export const fmtDate = (value, lang, withTime = false) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(localeOf(lang), withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Picks the text for the current language from {ar, en, ur} objects or row columns. */
export const pickText = (lang, obj) => (obj ? obj[lang] || obj.en || obj.ar || '' : '');

const S = (tone, ar, en, ur) => ({ tone, ar, en, ur });
export const TASK_STATUS = {
  draft: S('neutral', 'مسودة', 'Draft', 'مسودہ'),
  awaiting_assignment: S('warning', 'بانتظار الإسناد', 'Awaiting assignment', 'تفویض کا منتظر'),
  assigned: S('info', 'مُسندة', 'Assigned', 'تفویض شدہ'),
  in_progress: S('brand', 'قيد التنفيذ', 'In progress', 'جاری'),
  submitted: S('info', 'مقدّمة للمراجعة', 'Submitted for review', 'جائزے کے لیے جمع'),
  rework_required: S('danger', 'تحتاج تعديلًا', 'Rework required', 'ترمیم درکار'),
  completed: S('success', 'مكتملة', 'Completed', 'مکمل'),
  cancelled: S('neutral', 'ملغاة', 'Cancelled', 'منسوخ'),
};
export const REVIEW_STATUS = {
  draft: S('neutral', 'مسودة', 'Draft', 'مسودہ'),
  submitted: S('info', 'بانتظار المراجعة', 'Awaiting review', 'جائزے کا منتظر'),
  under_review: S('brand', 'قيد المراجعة', 'Under review', 'زیرِ جائزہ'),
  accepted: S('success', 'مقبول', 'Accepted', 'منظور شدہ'),
  rejected: S('danger', 'مرفوض', 'Rejected', 'مسترد'),
  withdrawn: S('neutral', 'مسحوب', 'Withdrawn', 'واپس لیا گیا'),
  revoked: S('danger', 'أُلغي القبول', 'Acceptance revoked', 'منظوری واپس'),
  superseded: S('neutral', 'استُبدل بنسخة أحدث', 'Replaced by newer version', 'نئے ورژن سے تبدیل'),
};
export const SUBMISSION_STATUS = {
  not_posted: S('warning', 'لم يُرفع بعد', 'Not posted yet', 'ابھی پوسٹ نہیں ہوا'),
  posted: S('success', 'مرفوع على منصة الهيئة', 'Posted to DGA', 'DGA پر پوسٹ شدہ'),
};
export const READINESS = {
  not_applicable: S('neutral', 'لا ينطبق', 'Not applicable', 'لاگو نہیں'),
  not_started: S('neutral', 'لم يبدأ', 'Not started', 'شروع نہیں ہوا'),
  in_progress: S('warning', 'قيد العمل', 'In progress', 'جاری'),
  ready: S('success', 'جاهز', 'Ready', 'تیار'),
};

export function StatusBadge({ map, value, lang }) {
  const s = map[value] ?? S('neutral', value, value, value);
  return <span className={`q-badge q-tone-${s.tone}`}>{makeT(lang)(s.ar, s.en, s.ur)}</span>;
}
StatusBadge.propTypes = { map: PropTypes.object.isRequired, value: PropTypes.string, lang: PropTypes.string.isRequired };

/** Current deadline with original, paused and overdue markers (D1, D5). */
export function Deadline({ deadline, lang, compact = false }) {
  const t = makeT(lang);
  if (!deadline) return <span>—</span>;
  const moved = new Date(deadline.current).getTime() !== new Date(deadline.original).getTime();
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <bdi>{fmtDate(deadline.current, lang)}</bdi>
        {deadline.isPaused && <span className="q-badge q-tone-info">{t('متوقف مؤقتًا', 'Paused', 'عارضی طور پر رکا ہوا')}</span>}
        {deadline.isOverdue && <span className="q-badge q-tone-danger">{t('متأخرة', 'Overdue', 'تاخیر')}</span>}
      </span>
      {moved && !compact && (
        <span className="q-faint" style={{ fontSize: '0.78rem' }}>
          {t('الموعد الأصلي:', 'Original deadline:', 'اصل آخری تاریخ:')} <bdi>{fmtDate(deadline.original, lang)}</bdi>
        </span>
      )}
    </span>
  );
}
Deadline.propTypes = { deadline: PropTypes.object, lang: PropTypes.string.isRequired, compact: PropTypes.bool };

export function ErrorNote({ error, lang }) {
  if (!error) return null;
  const t = makeT(lang);
  return (
    <div role="alert" className="q-card q-card-pad" style={{ borderColor: 'var(--danger)', background: 'var(--danger-soft)', color: 'var(--danger)' }}>
      {error.status === 403 ? t('ليست لديك صلاحية لهذا الإجراء.', 'You do not have permission to do this.', 'آپ کو اس کی اجازت نہیں ہے۔') : error.message}
    </div>
  );
}
ErrorNote.propTypes = { error: PropTypes.object, lang: PropTypes.string.isRequired };

export function Loading({ lang }) {
  return <div className="q-state" aria-busy="true">{makeT(lang)('جاري التحميل...', 'Loading...')}</div>;
}
Loading.propTypes = { lang: PropTypes.string.isRequired };

export function Empty({ lang, title, message }) {
  return (
    <div className="q-state">
      <p className="q-state-title">{title ?? makeT(lang)('لا توجد عناصر', 'Nothing here', 'یہاں کچھ نہیں')}</p>
      {message && <p>{message}</p>}
    </div>
  );
}
Empty.propTypes = { lang: PropTypes.string.isRequired, title: PropTypes.string, message: PropTypes.string };

export const pageProps = { lang: PropTypes.oneOf(['ar', 'en', 'ur']).isRequired, isMobile: PropTypes.bool, onNavigate: PropTypes.func.isRequired };
