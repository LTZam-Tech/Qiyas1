import { memo } from 'react';
import PropTypes from 'prop-types';
import { C } from '../utils/theme.js';

const ProgressBar = memo(({ value, height = 6, color }) => (
  <div
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.min(Math.max(value, 0), 100)}
    style={{ width: "100%", height, background: C.lightMid, borderRadius: height / 2, overflow: "hidden" }}
  >
    <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color || (value >= 80 ? C.green : value >= 50 ? C.orange : C.red), borderRadius: height / 2, transition: "width 0.5s ease" }} />
  </div>
));

ProgressBar.propTypes = {
  value: PropTypes.number.isRequired,
  height: PropTypes.number,
  color: PropTypes.string,
};

export default ProgressBar;