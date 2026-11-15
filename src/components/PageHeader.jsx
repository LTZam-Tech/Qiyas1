import PropTypes from 'prop-types';

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="q-page-head">
      <div>
        <h1 className="q-page-title">{title}</h1>
        {subtitle ? <p className="q-page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="q-page-actions">{actions}</div> : null}
    </header>
  );
}

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.node,
  actions: PropTypes.node,
};
