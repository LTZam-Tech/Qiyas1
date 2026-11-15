import PropTypes from 'prop-types';
import { Icons } from '../utils/icons.jsx';
import styles from './StatCard.module.css';

// KPI tile: tone-colored icon chip, label, big number, optional hint line.
const StatCard = ({ label, value, icon, tone = 'brand', hint, onClick, active = false }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`q-card ${styles.card} ${onClick ? styles.clickable : ''} ${active ? styles.active : ''}`}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
    >
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {icon && <span className={`q-icon-chip q-tone-${tone} ${styles.chip}`}>{Icons[icon]}</span>}
      </div>
      <div className={styles.value}>{value}</div>
      {hint ? <div className={styles.hint}>{hint}</div> : null}
    </Tag>
  );
};

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.string,
  tone: PropTypes.oneOf(['brand', 'success', 'warning', 'danger', 'info', 'neutral', 'gold']),
  hint: PropTypes.node,
  onClick: PropTypes.func,
  active: PropTypes.bool,
};

export default StatCard;
