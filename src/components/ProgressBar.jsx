import { memo } from 'react';
import PropTypes from 'prop-types';

// Bar color follows the value unless a color is passed:
// >= 80 success, >= 50 brand teal, >= 25 warning, else danger.
const toneForValue = (value) => {
  if (value >= 80) return 'var(--success)';
  if (value >= 50) return 'var(--brand-500)';
  if (value >= 25) return 'var(--warning)';
  return 'var(--danger)';
};

const ProgressBar = memo(({ value, height = 6, color, label }) => {
  const clamped = Math.min(Math.max(Number(value) || 0, 0), 100);
  return (
    <div
      className="q-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
      style={{ height }}
    >
      <span style={{ width: `${clamped}%`, background: color || toneForValue(clamped) }} />
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';

ProgressBar.propTypes = {
  value: PropTypes.number.isRequired,
  height: PropTypes.number,
  color: PropTypes.string,
  label: PropTypes.string,
};

export default ProgressBar;
