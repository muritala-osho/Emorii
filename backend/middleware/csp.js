'use strict';

// ─── Admin dashboard CSP ──────────────────────────────────────────────────────
// All JS/CSS assets are served from the same origin (Vite bundle, no CDN).
// API calls and Socket.IO use same-origin URLs, so connect-src 'self' covers
// both. Extra origins can be added via ADMIN_EXTRA_CONNECT_ORIGINS env var for
// deployments where dashboard and API live on different subdomains.
// img-src includes https: — user profile photos may be hosted on an external CDN.
// style-src includes 'unsafe-inline' — React's style prop sets element.style
// directly (DOM API, not CSP-controlled), but some libraries inject <style> tags;
// this keeps them working while script-src stays strict.
function buildAdminCsp(extraConnectOrigins) {
  const connectParts = ["'self'", 'wss:', ...extraConnectOrigins];
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    `connect-src ${connectParts.join(' ')}`,
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src blob:",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
}

// ─── Agora WebView bridge CSP ─────────────────────────────────────────────────
// Two intentional relaxations from the strict policy above:
//
//  1. script-src includes https://download.agora.io  — the Agora RTC SDK is
//     loaded from that CDN. The <script> tag already carries an SRI hash for
//     subresource integrity; the browser verifies the hash before executing.
//
//  2. 'unsafe-inline' for scripts — React Native WebView's injectJavaScript()
//     executes arbitrary JS inside the page (it's the bridge channel between
//     native and web). Without 'unsafe-inline', injected scripts are silently
//     blocked on both iOS (JavaScriptCore) and Android (V8 / Chromium) when a
//     strict script-src is present. There is no nonce-compatible alternative for
//     injected code in the current WebView API.
//
// connect-src https: wss: — Agora signal and media servers use HTTPS/WSS on
// Agora-owned domains which change with SDK version, so a wildcard is safer than
// trying to enumerate them.
const AGORA_CSP = [
  "default-src 'none'",
  "script-src 'self' https://download.agora.io 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https: wss: blob:",
  "media-src 'self' blob: mediastream:",
  "worker-src blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join('; ');

// ─── Middleware ───────────────────────────────────────────────────────────────
module.exports = function cspMiddleware(req, res, next) {
  const extraConnectOrigins = process.env.ADMIN_EXTRA_CONNECT_ORIGINS
    ? process.env.ADMIN_EXTRA_CONNECT_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [];

  const p = req.path;

  if (p.startsWith('/admin-web')) {
    res.setHeader('Content-Security-Policy', buildAdminCsp(extraConnectOrigins));
  } else if (p.startsWith('/public') || p.includes('agora-call')) {
    res.setHeader('Content-Security-Policy', AGORA_CSP);
  }
  // /api/* routes return JSON — no document context, CSP is irrelevant.

  next();
};
