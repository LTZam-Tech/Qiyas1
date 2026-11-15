// IltizamTech brand colors, exposed as CSS variables so inline styles
// follow light/dark mode automatically. Raw values live in src/index.css.
export const C = {
  primary: 'var(--primary)',
  primaryDark: 'var(--primary-hover)',
  deep: 'var(--brand-800)',
  accent: 'var(--brand-400)',
  gold: 'var(--gold-500)',
  soft: 'var(--brand-200)',
  light: 'var(--primary-soft)',
  lightMid: 'var(--track)',
  white: 'var(--surface)',
  bg: 'var(--bg)',
  textDark: 'var(--text)',
  textMid: 'var(--text-2)',
  textLight: 'var(--text-3)',
  green: 'var(--success)',
  greenLight: 'var(--success-soft)',
  orange: 'var(--warning)',
  orangeLight: 'var(--warning-soft)',
  red: 'var(--danger)',
  redLight: 'var(--danger-soft)',
  blue: 'var(--info)',
  blueLight: 'var(--info-soft)',
  border: 'var(--border)',
  cardBg: 'var(--surface)',
};

// Semantic tones used by StatCard / icon chips (see .q-tone-* in styles/ui.css).
export const TONES = ['brand', 'success', 'warning', 'danger', 'info', 'neutral', 'gold'];
