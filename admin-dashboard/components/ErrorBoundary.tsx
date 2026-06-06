import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-12 animate-fadeIn">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-[3rem] border border-rose-100 dark:border-rose-900/50 shadow-card p-12 text-center">
          <div className="p-6 bg-rose-50 dark:bg-rose-500/10 rounded-3xl inline-flex mb-8">
            <AlertTriangle size={40} className="text-rose-500" />
          </div>

          <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-3 tracking-tight">
            Something went wrong
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 font-medium mb-2">
            An unexpected error occurred in this module. Your session and data are safe.
          </p>
          {this.state.error && (
            <div className="mt-4 mb-8 p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Error detail</p>
              <p className="text-xs font-mono text-rose-500 break-all leading-relaxed">
                {this.state.error.message}
              </p>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white font-bold rounded-2xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-500/20 active:scale-95"
            >
              <RefreshCw size={16} />
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-6 py-3 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-all border border-gray-200 dark:border-slate-700"
            >
              <Home size={16} />
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
