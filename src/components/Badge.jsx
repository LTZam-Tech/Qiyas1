import { memo } from 'react';
import PropTypes from 'prop-types';
import { BADGE_MAP } from '../utils/data.js';
import { makeT } from '../i18n/index.js';

const Badge = memo(({ status, lang = 'ar' }) => {
  const m = BADGE_MAP[status] || BADGE_MAP.active;
  const label = makeT(lang)(m.label_ar, m.label_en);
  return <span className={`q-badge q-tone-${m.tone}`}>{label}</span>;
});

Badge.displayName = 'Badge';

Badge.propTypes = {
  status: PropTypes.string.isRequired,
  lang: PropTypes.oneOf(['ar', 'en', 'ur']),
};

export default Badge;
