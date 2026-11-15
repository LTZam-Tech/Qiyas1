// Central i18n for Qiyas.
//
// Components keep writing their copy inline as t('Arabic', 'English'), so the
// two source languages live next to the markup that uses them. Every other
// language is a dictionary keyed by the English source string (the gettext
// "msgid" approach), e.g. src/i18n/ur.js. Strings built at runtime (with
// numbers or names in them) pass their translation as a third argument:
//   t(`${n} ملف`, `${n} files`, `${n} فائلیں`)
//
// src/i18n/coverage.test.js fails if any t() string has no Urdu translation.

import UR from './ur.js';

export const LANGUAGES = [
  { code: 'ar', dir: 'rtl', locale: 'ar-SA', native: 'العربية', english: 'Arabic', short: 'ع' },
  { code: 'en', dir: 'ltr', locale: 'en-GB', native: 'English', english: 'English', short: 'EN' },
  { code: 'ur', dir: 'rtl', locale: 'ur-PK', native: 'اردو', english: 'Urdu', short: 'اُر' },
];

export const DEFAULT_LANG = 'ar';
export const LANG_CODES = LANGUAGES.map((l) => l.code);
export const LANG_STORAGE_KEY = 'qiyas_lang';

export const isSupportedLang = (code) => LANG_CODES.includes(code);
export const getLanguage = (code) => LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
export const isRTL = (code) => getLanguage(code).dir === 'rtl';
export const dirOf = (code) => getLanguage(code).dir;
export const localeOf = (code) => getLanguage(code).locale;

const DICTIONARIES = { ur: UR };
const reported = new Set();

const fromDictionary = (lang, en) => {
  const hit = DICTIONARIES[lang]?.[en];
  if (hit) return hit;
  if (import.meta.env?.DEV && en && !reported.has(`${lang}:${en}`)) {
    reported.add(`${lang}:${en}`);
    console.warn(`[i18n] Missing ${lang} translation for: "${en}"`);
  }
  return undefined;
};

/**
 * UI copy. t(ar, en, ur?) → the string for `lang`.
 * Missing translations fall back to English, never to an empty string.
 */
export function makeT(lang) {
  return (ar, en, ur) => {
    if (lang === 'ar') return ar ?? en;
    if (lang === 'en') return en ?? ar;
    return ur ?? fromDictionary(lang, en) ?? en ?? ar;
  };
}

/**
 * Data values (titles from the API or data files) that may be missing in
 * either language. Translated through the dictionary when we know the text,
 * silently falls back otherwise. Returns undefined when both are empty.
 */
export function makePick(lang) {
  return (ar, en, ur) => {
    if (lang === 'ar') return ar || en || undefined;
    if (lang === 'en') return en || ar || undefined;
    return ur || (en && DICTIONARIES[lang]?.[en]) || en || ar || undefined;
  };
}

/**
 * People's names. Urdu is written in the Arabic script, so an Arabic name is
 * the right spelling for Urdu readers.
 */
export function pickName(lang, ar, en) {
  if (lang === 'en') return en || ar || '';
  return ar || en || '';
}

/** Detect the language for a first visit: saved choice, then the browser. */
export function detectPreferredLang() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (isSupportedLang(saved)) return saved;
  } catch {
    // storage unavailable
  }
  const browser = (typeof navigator !== 'undefined' && navigator.languages) || [];
  for (const tag of browser) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (isSupportedLang(base)) return base;
  }
  return DEFAULT_LANG;
}

export function rememberLang(code) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, code);
  } catch {
    // storage unavailable
  }
}
