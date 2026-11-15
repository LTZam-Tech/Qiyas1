/* eslint-disable react-refresh/only-export-components */
// Shared pieces for Phase 1 screens: loading data, status badges, deadlines, dates.
import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { localeOf, makeT } from '../../i18n/index.js';

/** Loads data from the API; reload() fetches again. */
export function useApi(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
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
