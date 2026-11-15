// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collectStrings } from '../../scripts/i18n-strings.mjs';
import UR from './ur.js';
import { LANGUAGES, dirOf, makePick, makeT, pickName } from './index.js';

describe('translations', () => {
  const { needed, dynamic } = collectStrings();

  it('has an Urdu translation for every English UI string', () => {
    const missing = [...needed].filter(([en]) => !UR[en]).map(([en, loc]) => `${en}  (${loc})`);
    expect(missing).toEqual([]);
  });

  it('passes Urdu explicitly for strings built at runtime', () => {
    expect(dynamic).toEqual([]);
  });

  it('has no empty or untranslated Urdu entries', () => {
    const bad = Object.entries(UR).filter(([en, ur]) => !ur || !ur.trim() || ur === en).map(([en]) => en);
    expect(bad).toEqual([]);
  });
});

describe('i18n helpers', () => {
  it('lists Arabic, English and Urdu with the right direction', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['ar', 'en', 'ur']);
    expect([dirOf('ar'), dirOf('en'), dirOf('ur')]).toEqual(['rtl', 'ltr', 'rtl']);
  });

  it('translates UI copy per language', () => {
    expect(makeT('ar')('إلغاء', 'Cancel')).toBe('إلغاء');
    expect(makeT('en')('إلغاء', 'Cancel')).toBe('Cancel');
    expect(makeT('ur')('إلغاء', 'Cancel')).toBe('منسوخ کریں');
    expect(makeT('ur')('٣ ملفات', '3 files', '3 فائلیں')).toBe('3 فائلیں');
  });

  it('falls back to English, never to an empty string', () => {
    expect(makeT('ur')('نص', 'Some unknown text')).toBe('Some unknown text');
    expect(makePick('ur')('عنوان', undefined)).toBe('عنوان');
    expect(makePick('en')('', '')).toBeUndefined();
  });

  it('shows names in Arabic script for Urdu', () => {
    expect(pickName('ur', 'سارة الشمري', 'Sarah Alshammari')).toBe('سارة الشمري');
    expect(pickName('en', 'سارة الشمري', 'Sarah Alshammari')).toBe('Sarah Alshammari');
  });
});
