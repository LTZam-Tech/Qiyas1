import { pickName } from '../i18n/index.js';

export const ROLE_LABELS = {
  admin: { ar: 'مدير النظام', en: 'Administrator' },
  dean: { ar: 'العميد', en: 'Dean' },
  consultant: { ar: 'مستشار الجودة', en: 'Quality consultant' },
  employee: { ar: 'موظف', en: 'Employee' },
};
// Rendered with t(role.ar, role.en), so Urdu comes from the dictionary.

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
