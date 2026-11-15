import { pickName } from '../i18n/index.js';

export const ROLE_LABELS = {
  admin: { ar: 'مدير النظام', en: 'Administrator' },
  dean: { ar: 'العميد', en: 'Dean' },
  consultant: { ar: 'مستشار الجودة', en: 'Quality consultant' },
  employee: { ar: 'موظف', en: 'Employee' },
};
// Rendered with t(role.ar, role.en), so Urdu comes from the dictionary.

/** Phase 1 roles (docs/phase1/02-roles-and-permissions.md). */
export const PHASE1_ROLE_LABELS = {
  QC: { ar: 'مستشار قياس', en: 'Qiyas Consultant', ur: 'قیاس کنسلٹنٹ' },
  DM: { ar: 'مدير الإدارة', en: 'Department Manager', ur: 'شعبے کا مینیجر' },
  EMP: { ar: 'موظف', en: 'Employee', ur: 'ملازم' },
  DSO: { ar: 'مسؤول الرفع على منصة الهيئة', en: 'DGA Submission Officer', ur: 'DGA سبمیشن آفیسر' },
  EXE: { ar: 'الإدارة العليا', en: 'Executive Viewer', ur: 'اعلیٰ انتظامیہ' },
  ADM: { ar: 'مدير النظام', en: 'System Administrator', ur: 'سسٹم ایڈمنسٹریٹر' },
};

export const getDisplayName = (user, lang) => {
  if (!user) return '';
  const ar = user.full_name || user.fullName || user.name_ar;
  const en = user.full_name_en || user.fullNameEn || user.name_en;
  return pickName(lang, ar, en) || user.email || '';
};

export const getInitials = (name) =>
  String(name || '?')
    .replace(/^(د\.|dr\.?)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
