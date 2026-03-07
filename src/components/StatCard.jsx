import PropTypes from 'prop-types';
import { useState } from 'react';
import { Icons } from '../utils/icons.jsx';
import styles from './StatCard.module.css';

const StatCard = ({ label, value, icon, gradient, change }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const gradientBg = gradient || 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)';
  const hasNumericChange = typeof change === 'number' && !Number.isNaN(change);
  const changePrefix = hasNumericChange && change > 0 ? '+' : hasNumericChange && change < 0 ? '-' : '';

  const toggleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleFlip();
    }
  };

  return (
    <div
      className={styles.cardWrap}
      role="button"
      tabIndex={0}
      onClick={toggleFlip}
      onKeyDown={handleKeyDown}
      aria-label={`${label} card details`}
      aria-pressed={isFlipped}
    >
      <div className={`${styles.card} ${isFlipped ? styles.flipped : ''}`}>
        <div className={styles.face} style={{ background: gradientBg }}>
          <div className={styles.frontTop}>
            <span className={styles.label}>{label}</span>
            <div className={styles.icon}>{Icons[icon]}</div>
          </div>

          <div className={styles.value}>{value}</div>
        </div>

        <div className={`${styles.face} ${styles.back}`} style={{ background: gradientBg }}>
          <div className={styles.backTop}>
            <span className={styles.backLabel}>نسبة التغير</span>
            <div className={styles.icon}>{Icons[icon]}</div>
          </div>

          <div className={styles.change}>
            {hasNumericChange ? (
              <>
                {changePrefix}
                {Math.abs(change)}%
              </>
            ) : '0%'}
          </div>
        </div>
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
