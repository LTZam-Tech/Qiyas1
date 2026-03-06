import { memo } from 'react';
import { C } from '../utils/theme.js';

const ProgressBar = memo(({ value, height = 6, color }) => (
  <div style={{ width: "100%", height, background: C.lightMid, borderRadius: height / 2, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color || (value >= 80 ? C.green : value >= 50 ? C.orange : C.red), borderRadius: height / 2, transition: "width 0.5s ease" }} />
  </div>
));

export default ProgressBar;