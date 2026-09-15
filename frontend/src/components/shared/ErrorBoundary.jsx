import React from "react";
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { captureException } from "../../lib/apm.js";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to pluggable APM/Sentry reporting
    captureException(error, { componentStack: errorInfo?.componentStack });
    console.error("[ErrorBoundary caught an unhandled error]:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = "/";
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.handleReset,
        });
      }

      return (
        <div
          role="alert"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "var(--bg, #0f172a)",
            color: "var(--text, #f8fafc)",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 540,
              width: "100%",
              background: "var(--card, #1e293b)",
              border: "1px solid var(--border, #334155)",
              borderRadius: "16px",
              padding: "36px 32px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.12)",
                color: "#ef4444",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <AlertTriangle size={28} />
            </div>

            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: "0 0 10px",
                color: "var(--text, #f8fafc)",
                letterSpacing: "-0.02em",
              }}
            >
              Something went wrong
            </h2>

            <p
              style={{
                fontSize: 14,
                color: "var(--subtext, #94a3b8)",
                lineHeight: 1.6,
                margin: "0 0 24px",
              }}
            >
              We encountered an unexpected problem loading this section. Your account and
              session data are completely safe. You can try refreshing the view or returning to the dashboard.
            </p>

            {/* Action buttons */}
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                flexWrap: "wrap",
                marginBottom: 24,
              }}
            >
              <button
                onClick={this.handleReload}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  background: "var(--primary, #3b82f6)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "opacity 0.2s",
                }}
              >
                <RefreshCw size={16} /> Refresh Page
              </button>

              <button
                onClick={this.handleHome}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  background: "transparent",
                  color: "var(--text, #f8fafc)",
                  border: "1px solid var(--border, #334155)",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                <Home size={16} /> Go to Dashboard
              </button>
            </div>

            {/* Technical details toggle */}
            <div style={{ textAlign: "left", borderTop: "1px solid var(--border, #334155)", paddingTop: 16 }}>
              <button
                type="button"
                onClick={this.toggleDetails}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--subtext, #94a3b8)",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                  padding: 0,
                  margin: "0 auto",
                }}
              >
                {this.state.showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {this.state.showDetails ? "Hide technical details" : "Show technical details"}
              </button>

              {this.state.showDetails && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "12px",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "6px",
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#fca5a5",
                    maxHeight: 180,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  <div><strong>Error:</strong> {this.state.error?.toString()}</div>
                  {this.state.errorInfo?.componentStack && (
                    <div style={{ marginTop: 8, color: "#94a3b8" }}>
                      <strong>Component Stack:</strong>
                      {this.state.errorInfo.componentStack}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
