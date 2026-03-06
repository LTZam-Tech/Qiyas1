import PropTypes from 'prop-types';
import { C } from '../utils/theme.js';
import { Icons } from '../utils/icons.jsx';

const StatCard = ({ label, value, icon, gradient, change }) => {
  const gradientBg = gradient || 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)';

  return (
    <div
      style={{
        background: gradientBg,
        borderRadius: 16,
        padding: '25.6px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
        position: 'relative',
        cursor: 'pointer',
        width: '100%',
        maxWidth: 383,
        minHeight: 143,
        justifyContent: 'space-between',
        direction: 'rtl',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 45, color: C.white, opacity: 0.9 }}>{Icons[icon]}</div>
        <span
          style={{
            fontSize: 11,
            color: C.white,
            fontFamily: 'Cairo',
            background: 'rgba(255,255,255,0.2)',
            padding: '3px 8px',
            borderRadius: 12,
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>

      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.white, fontFamily: 'Cairo', textAlign: 'right' }}>
          {value}
        </div>
        {change && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontFamily: 'Cairo', marginTop: 4 }}>
            {change > 0 ? '?' : '?'} {Math.abs(change)}%
          </div>
        )}
      </div>
    </div>
  );
};

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.string.isRequired,
  gradient: PropTypes.string,
  change: PropTypes.number,
};

export default StatCard;
