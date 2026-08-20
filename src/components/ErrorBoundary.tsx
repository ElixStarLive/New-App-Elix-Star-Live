import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught error:", error, errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[100dvh] bg-[rgba(0,0,0,0.35)] text-white flex items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="w-20 h-20 bg-white/20 rounded-full mx-auto mb-6 flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-white/70" />
            </div>
            <h1 className="text-2xl font-bold mb-3">Oops! Something went wrong</h1>
            <p className="text-white/60 mb-6">We&apos;re sorry for the inconvenience. Please try reloading the page.</p>
            {this.state.error && (
              <details className="mb-6 p-4 border border-white/20 rounded-xl text-left">
                <summary className="cursor-pointer text-sm font-mono text-white/60">
                  {import.meta.env.DEV ? "Error details" : "Technical details"}
                </summary>
                <p className="text-sm font-mono text-white/60 mt-2 break-all">{this.state.error.message}</p>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center gap-2 px-6 py-3 bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] rounded-full font-bold"
              >
                <RefreshCw className="w-5 h-5" />
                Reload
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-6 py-3 bg-transparent text-white rounded-full font-bold"
              >
                <Home className="w-5 h-5" />
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
