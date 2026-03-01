import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — catches unhandled rendering errors and
 * displays a recovery UI instead of crashing the entire application.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-bg-primary text-text-primary">
          <div className="text-center space-y-4 max-w-md px-6">
            <div className="w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center mx-auto">
              <span className="text-2xl">⚠</span>
            </div>
            <h2 className="text-lg font-semibold">出现错误</h2>
            <p className="text-sm text-text-muted leading-relaxed">
              发生了意外错误。你可以尝试重试或重新加载页面。
            </p>
            {this.state.error && (
              <pre className="text-xs text-error bg-bg-elevated rounded-lg p-3 text-left overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-accent text-text-inverse text-sm rounded-lg hover:bg-accent-hover transition-colors"
              >
                重试
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-bg-elevated border border-border text-text-primary text-sm rounded-lg hover:bg-bg-hover transition-colors"
              >
                重新加载
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
