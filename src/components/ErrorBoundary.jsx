import React from "react";
import PropTypes from "prop-types";
import { dirOf, makeT } from "../i18n/index.js";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || "Unknown error" };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary captured:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      const lang = this.props.lang || 'ar';
      const t = makeT(lang);
      return (
        <section role="alert" lang={lang} dir={dirOf(lang)} className="q-state" style={{ minHeight: "100vh", background: "var(--bg)" }}>
          <span className="q-state-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>!</span>
          <h1 className="q-state-title" style={{ fontSize: "1.3rem" }}>
            {t('حدث خطأ غير متوقع', 'Something went wrong')}
          </h1>
          <p className="q-muted" style={{ maxWidth: 480 }}>{this.state.errorMessage}</p>
          <button type="button" className="q-btn q-btn-primary" onClick={this.reset}>
            {t('حاول مرة أخرى', 'Try again')}
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  lang: PropTypes.oneOf(['ar', 'en', 'ur']),
};

export default ErrorBoundary;
