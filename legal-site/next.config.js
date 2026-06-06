/** @type {import('next').NextConfig} */

// Security headers applied to every response from the legal site.
//
// CSP note: Next.js 15 requires 'unsafe-inline' for scripts in its default
// Pages Router mode — the framework injects inline <script> tags for hydration
// (__NEXT_DATA__, route prefetch hints, etc.). A nonce-based CSP would require
// a custom server or middleware rewrite; for a read-only legal site with zero
// user input the XSS risk is negligible. The remaining directives still give
// meaningful protection:
//   • frame-ancestors 'none'     — blocks clickjacking iframes
//   • connect-src                — prevents data exfiltration via fetch/XHR
//   • script-src (no eval)       — blocks eval()-based attacks even with inline
//   • upgrade-insecure-requests  — forces HTTPS sub-requests
const CSP = [
  "default-src 'none'",
  // 'unsafe-inline' required for Next.js hydration scripts.
  // 'unsafe-eval' is intentionally absent — not needed in production builds.
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://cdn.vercel-insights.com",
  // Next.js injects critical CSS inline; libraries may too.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // Vercel Speed Insights and Analytics make outbound requests to these origins.
  "connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  // Belt-and-suspenders clickjacking protection alongside CSP frame-ancestors.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevents browsers from MIME-sniffing a response away from its declared type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Only send the origin (not the full URL) in Referer headers on cross-origin requests.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Strict-Transport-Security: tell browsers to only use HTTPS for 1 year.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // Disable browser features not needed on a static legal site.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
