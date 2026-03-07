import React from "react";
import PropTypes from "prop-types";

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
      return (
        <section
          role="alert"
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#f8f6fb",
            padding: 24,
            textAlign: "center",
            fontFamily: "Cairo, sans-serif",
          }}
        >
          <div>
            <h1 style={{ marginBottom: 12, color: "#5C3A73" }}>{lang === 'ar' ? 'حدث خطا غير متوقع' : 'An Unexpected Error Occurred'}</h1>
            <p style={{ marginBottom: 16, color: "#7A6B8A" }}>{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={this.reset}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "10px 14px",
                background: "#80519F",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {lang === 'ar' ? 'حاول مرة اخرى' : 'Try Again'}
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  lang: PropTypes.oneOf(['ar', 'en']),
};

export default ErrorBoundary;
