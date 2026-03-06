import { memo } from 'react';
import PropTypes from 'prop-types';
import { BADGE_MAP } from '../utils/data.js';

const Badge = memo(({ status }) => {
  const m = BADGE_MAP[status] || BADGE_MAP.active;
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: m.bg, color: m.color, fontFamily: "Cairo" }}>{m.label}</span>;
});

Badge.propTypes = {
  status: PropTypes.string.isRequired,
};

export default Badge;