import { memo } from 'react';
import PropTypes from 'prop-types';
import { BADGE_MAP } from '../utils/data.js';

const Badge = memo(({ status, lang = 'ar' }) => {
  const m = BADGE_MAP[status] || BADGE_MAP.active;
  const label = lang === 'ar' ? m.label_ar : m.label_en;
  return <span className={`q-badge q-tone-${m.tone}`}>{label}</span>;
});

Badge.displayName = 'Badge';

Badge.propTypes = {
  status: PropTypes.string.isRequired,
  lang: PropTypes.oneOf(['ar', 'en']),
};

export default Badge;
