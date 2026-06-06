import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import './index.css';

// Sentry must be initialised before the React tree renders so it can wrap
// routing, capture render errors, and instrument fetch/XHR automatically.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.MODE !== 'development',
    tracesSampleRate: 0.15,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <Sentry.ErrorBoundary
    fallback={
      <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
        <h2>Something went wrong</h2>
        <p>The dashboard encountered an unexpected error. The team has been notified.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    }
  >
    <React.StrictMode>
      <App />
      <Analytics />
    </React.StrictMode>
  </Sentry.ErrorBoundary>
);
