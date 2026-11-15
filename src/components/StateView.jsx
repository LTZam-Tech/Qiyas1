import PropTypes from 'prop-types';
import { Icons } from '../utils/icons.jsx';

// One component for empty, error and loading states so every page behaves the same.
export default function StateView({ kind = 'empty', title, message, icon, action }) {
  if (kind === 'loading') {
    return (
      <div className="q-state" role="status" aria-live="polite">
        <div style={{ display: 'grid', gap: 10, width: 'min(420px, 100%)' }}>
          <div className="q-skeleton" style={{ height: 14, width: '60%' }} />
          <div className="q-skeleton" style={{ height: 14 }} />
          <div className="q-skeleton" style={{ height: 14, width: '80%' }} />
        </div>
        {message ? <span className="q-faint" style={{ fontSize: '0.85rem' }}>{message}</span> : null}
      </div>
    );
  }

  const isError = kind === 'error';
  return (
    <div className={`q-state ${isError ? 'q-state-error' : ''}`} role={isError ? 'alert' : undefined}>
      <span className="q-state-icon">{Icons[icon || (isError ? 'alertCircle' : 'inbox')]}</span>
      {title ? <div className="q-state-title">{title}</div> : null}
      {message ? <div>{message}</div> : null}
      {action || null}
    </div>
  );
}

StateView.propTypes = {
  kind: PropTypes.oneOf(['empty', 'error', 'loading']),
  title: PropTypes.string,
  message: PropTypes.node,
  icon: PropTypes.string,
  action: PropTypes.node,
};
