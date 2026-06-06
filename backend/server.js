const Sentry = require('@sentry/node');

// Sentry must be initialised as early as possible — before any other imports
// that touch Express, DB, or Redis — so it can instrument them automatically.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.15 : 0,
    enabled: !!process.env.SENTRY_DSN,
  });
}

const logger = require('./utils/logger');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false });

// ── Startup environment validation ───────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'MONGODB_URI'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`[startup] FATAL: Missing required environment variables: ${missingEnv.join(', ')}. Server will not start.`);
  process.exit(1);
}
// ─────────────────────────────────────────────────────────────────────────────


const { sendExpoPushNotification } = require('./utils/pushNotifications');
const Message = require('./models/Message');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const matchRoutes = require('./routes/match');
const friendRoutes = require('./routes/friends');
const chatRoutes = require('./routes/chat');
const callRoutes = require('./routes/call');
const uploadRoutes = require('./routes/upload');
const verificationRoutes = require('./routes/verification');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const legalRoutes = require('./routes/legal');
const accountRoutes = require('./routes/account');
const blockRoutes = require('./routes/block');
const adminRoutes = require('./routes/admin');
const storiesRoutes = require('./routes/stories');
const aiRoutes = require('./routes/ai');
const radarRoutes = require('./routes/radar');
const agoraRoutes = require('./routes/agora');
const activityRoutes = require('./routes/activity');
const promptsRoutes = require('./routes/prompts');
const icebreakersRoutes = require('./routes/icebreakers');
const quizRoutes = require('./routes/quiz');
const boostRoutes = require('./routes/boost');
const profileCompletionRoutes = require('./routes/profileCompletion');
const supportRoutes = require('./routes/support');

const successStoriesRoutes = require('./routes/successStories');
const subscriptionRoutes = require('./routes/subscription');
const muteRoutes = require('./routes/mute');
const sessionsRoutes = require('./routes/sessions');

const compression = require('compression');
const helmet = require('helmet');
const hpp = require('hpp');

const app = express();
// M-10: Trust proxy depth is configurable via TRUST_PROXY_DEPTH (default: 1).
// Set to 2 if your stack adds two proxy layers (e.g. Cloudflare + Render),
// so req.ip resolves to the real client IP and IP-based rate limiters key
// correctly. Misconfigured depth → all traffic appears from a proxy IP →
// rate limiting becomes per-proxy rather than per-client (useless).
const TRUST_PROXY_DEPTH = parseInt(process.env.TRUST_PROXY_DEPTH || '1', 10);
app.set('trust proxy', TRUST_PROXY_DEPTH);
const server = http.createServer(app);

// Increase timeouts for large file uploads (voice notes, photos, videos)
server.headersTimeout = 5 * 60 * 1000;  // 5 minutes
server.requestTimeout = 5 * 60 * 1000;  // 5 minutes
server.timeout = 5 * 60 * 1000;         // 5 minutes
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];

if (IS_PROD && ALLOWED_ORIGINS.length === 0) {
  // H-2: Promoted from warn to error — ALLOWED_ORIGINS missing in production
  // silently blocks the admin dashboard (web clients get CORS-rejected) while
  // the API still starts (mobile apps use no-origin requests which always pass).
  // This creates a confusing "API works but dashboard is broken" situation.
  console.error(
    '[CORS] ERROR: ALLOWED_ORIGINS is not set in production. ' +
    'The admin dashboard and all web clients will be CORS-blocked. ' +
    'Set ALLOWED_ORIGINS to a comma-separated list of trusted origins ' +
    '(e.g. https://admin.yourdomain.com,https://yourdomain.com).'
  );
  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = require('@sentry/node');
      Sentry.captureMessage(
        'CORS misconfiguration: ALLOWED_ORIGINS not set in production',
        'error'
      );
    } catch (_) {}
  }
}

const isOriginAllowed = (origin) => {
  // Origin-less requests (mobile apps, server-to-server, curl) carry no
  // browser credential-context, so they cannot be CSRF'd via Origin checks.
  if (!origin) return true;
  // Dev mode without an allow-list: permissive.
  if (!IS_PROD && ALLOWED_ORIGINS.length === 0) return true;
  // Exact-match against the configured allow-list only.
  return ALLOWED_ORIGINS.includes(origin);
};

const io = socketIO(server, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Socket.IO CORS: origin not allowed'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
    allowEIO3: true
  },
  pingInterval: 25000,
  pingTimeout: 10000,
  maxHttpBufferSize: 64 * 1024  // 64 KB — sufficient for any chat/presence event; limits amplification attacks
});

app.set('io', io);

// Optional Redis setup for socket scaling / shared state
let redisClient;
let redisPubClient;
let redisSubClient;

const setUserBusy = async (userId, isBusy) => {
  if (!redisClient || !userId) return;
  try {
    const key = `busy:${userId}`;
    if (isBusy) {
      // Keep busy state for 5 minutes by default to avoid stale state
      await redisClient.set(key, '1', { EX: 60 * 5 });
    } else {
      await redisClient.del(key);
    }
  } catch (err) {
    logger.error('Redis busy flag error:', err);
  }
};

const isUserBusy = async (userId) => {
  if (!redisClient || !userId) return false;
  try {
    const value = await redisClient.get(`busy:${userId}`);
    return !!value;
  } catch (err) {
    logger.error('Redis busy flag read error:', err);
    return false;
  }
};

const setupRedisAdapter = async () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return;
  }

  try {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');

    redisClient = createClient({ url: redisUrl });
    redisClient.on('error', (err) => logger.error('Redis client error:', err));
    await redisClient.connect();

    redisPubClient = redisClient.duplicate();
    redisSubClient = redisClient.duplicate();
    await Promise.all([redisPubClient.connect(), redisSubClient.connect()]);

    io.adapter(createAdapter(redisPubClient, redisSubClient));
    logger.log('Socket.IO Redis adapter enabled');
  } catch (err) {
    logger.error('Failed to initialize Redis adapter:', err);
  }
};

setupRedisAdapter();

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // CSP is managed by our own cspMiddleware below, which applies
  // route-specific policies (strict for admin dashboard, relaxed for the
  // Agora WebView bridge page). Helmet's built-in CSP is disabled to avoid
  // a duplicate/conflicting header.
  contentSecurityPolicy: false,
}));

// Route-aware Content-Security-Policy (see backend/middleware/csp.js)
const cspMiddleware = require('./middleware/csp');
app.use(cspMiddleware);

app.use(compression());
app.use(cors(corsOptions));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    logger.log(`${req.method} ${req.url}`);
    next();
  });
} else {
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/notifications') || req.url.startsWith('/api/engagement')) {
      logger.log(`${req.method} ${req.url}`);
    }
    next();
  });
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach(key => {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      sanitizeObject(obj[key]);
    }
  });
};
app.use((req, res, next) => {
  sanitizeObject(req.body);
  sanitizeObject(req.params);
  // req.query: sanitize a plain copy — Express parses query strings into a
  // prototype-less object, so we can safely mutate string values in place.
  // This closes the gap where NoSQL operators like $gt/$ne in query strings
  // bypass the body sanitizer (e.g. ?age[$gt]=0 style attacks).
  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query);
  }
  next();
});

const xssSanitize = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === 'string') {
      obj[key] = obj[key]
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    } else if (typeof obj[key] === 'object') {
      xssSanitize(obj[key]);
    }
  });
};
app.use((req, res, next) => {
  if (req.body) xssSanitize(req.body);
  if (req.query && typeof req.query === 'object') xssSanitize(req.query);
  next();
});

app.use(hpp());

const { authLimiter, otpLimiter, forgotPasswordLimiter, adminLimiter, apiLimiter, uploadLimiter, messageLimiter } = require('./middleware/rateLimiter');
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/verify-otp', otpLimiter);
app.use('/api/auth/resend-otp', otpLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth/reset-password', forgotPasswordLimiter);
app.use('/api/admin', adminLimiter);

const { protect } = require('./middleware/auth');
// Serve the admin dashboard SPA from the built dist/ folder.
// Static assets (JS, CSS, fonts) are served without auth — the React SPA handles
// client-side auth itself, and all /api/admin/* routes remain JWT-protected.
// An optional X-Frame-Options header prevents the dashboard from being iframe'd.
const adminDashboardDir = path.join(__dirname, '..', 'admin-dashboard', 'dist');
const adminDashboardFallback = path.join(__dirname, '..', 'admin-dashboard');

const resolvedAdminDir = require('fs').existsSync(adminDashboardDir)
  ? adminDashboardDir
  : adminDashboardFallback;

// Guard the admin dashboard static files behind ADMIN_WEB_SECRET.
// Admins gain access by POSTing the secret via an HTML login form, which sets
// a short-lived HTTP-only cookie. The key is submitted in the POST body and
// never appears in the URL, browser history, or server access logs.
// If no secret is configured the dashboard is disabled entirely.

// ── Cookie helper ─────────────────────────────────────────────────────────────
// Parses the Cookie header without requiring cookie-parser. Splits on the FIRST
// '=' only so values containing '=' (e.g. base64 secrets) are preserved.
function parseAdminCookies(req) {
  const rawCookies = req.headers.cookie || '';
  const result = {};
  for (const part of rawCookies.split(';')) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue; // skip malformed or empty-key entries
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    try { result[k] = decodeURIComponent(v); } catch { result[k] = v; }
  }
  return result;
}

// ── Timing-safe cookie comparison ─────────────────────────────────────────────
function adminCookieValid(cookies, secret) {
  const provided = cookies['adm_access'];
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return require('crypto').timingSafeEqual(a, b);
}

// ── Cookie setter ──────────────────────────────────────────────────────────────
function setAdminCookie(res, secret) {
  const cookieOpts = [
    `adm_access=${encodeURIComponent(secret)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=28800',
    'Path=/admin-web',
  ].join('; ');
  res.setHeader('Set-Cookie', cookieOpts);
}

// ── Login form HTML ────────────────────────────────────────────────────────────
const ADMIN_LOGIN_FORM = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Admin Login</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         display:flex;align-items:center;justify-content:center;min-height:100vh;
         margin:0;background:#f4f4f5}
    .card{background:#fff;border-radius:8px;padding:2rem;width:100%;max-width:360px;
          box-shadow:0 2px 12px rgba(0,0,0,.12)}
    h2{margin:0 0 1.25rem;font-size:1.25rem;color:#111}
    label{display:block;font-size:.875rem;color:#444;margin-bottom:.375rem}
    input{width:100%;padding:.625rem .75rem;border:1px solid #d1d5db;
          border-radius:6px;font-size:1rem;outline:none}
    input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
    button{margin-top:1rem;width:100%;padding:.7rem;background:#6366f1;color:#fff;
           border:none;border-radius:6px;font-size:1rem;cursor:pointer}
    button:hover{background:#4f46e5}
    .err{color:#dc2626;font-size:.85rem;margin-top:.5rem;display:none}
  </style>
</head>
<body>
  <div class="card">
    <h2>Admin Dashboard</h2>
    <form method="POST" action="/admin-web/auth">
      <label for="key">Access key</label>
      <input id="key" name="key" type="password" autocomplete="current-password"
             placeholder="Enter your admin secret" required autofocus>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;

const ADMIN_DISABLED_PAGE = `<!doctype html>
<html><body style="font-family:sans-serif;padding:2rem">
<h2>Admin dashboard disabled</h2>
<p>Set the <code>ADMIN_WEB_SECRET</code> environment variable to enable access.</p>
</body></html>`;

// ── Guard middleware ───────────────────────────────────────────────────────────
const adminWebGuard = (req, res, next) => {
  const secret = process.env.ADMIN_WEB_SECRET;
  if (!secret) {
    return res.status(503).send(ADMIN_DISABLED_PAGE);
  }
  const cookies = parseAdminCookies(req);
  if (adminCookieValid(cookies, secret)) return next();
  // Not authenticated — show login form
  return res.status(401).send(ADMIN_LOGIN_FORM);
};

// POST /admin-web/auth — receives the key in the request body (not the URL).
// Must be registered BEFORE the static-file / guard middleware so it is
// reachable without a valid cookie.
app.post('/admin-web/auth',
  express.urlencoded({ extended: false, limit: '1kb' }),
  (req, res) => {
    const secret = process.env.ADMIN_WEB_SECRET;
    if (!secret) return res.status(503).send(ADMIN_DISABLED_PAGE);

    const provided = (req.body && typeof req.body.key === 'string') ? req.body.key : '';
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    const valid = a.length === b.length && require('crypto').timingSafeEqual(a, b);

    if (!valid) {
      // Re-show login form with an error hint embedded.
      return res.status(401).send(ADMIN_LOGIN_FORM.replace(
        'class="err"',
        'class="err" style="display:block"'
      ).replace('</form>', '<p class="err" style="display:block">Invalid access key.</p></form>'));
    }

    setAdminCookie(res, secret);
    return res.redirect(302, '/admin-web');
  }
);

app.use('/admin-web', adminWebGuard, (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(resolvedAdminDir, { index: 'index.html' }));

app.get('/admin-web/*path', adminWebGuard, (req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const indexPath = path.join(resolvedAdminDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).json({ success: false, message: 'Admin dashboard not found' });
  });
});

const connectionString = process.env.MONGODB_URI || process.env.DATABASE_URL;
if (connectionString && connectionString.startsWith('mongodb')) {
  if (connectionString.startsWith('mongodb')) {
    // Divide pool size by cluster worker count so total connections stay within
    // Atlas/shared MongoDB limits (e.g. 4 workers × 25 = 100, same as before).
    const numWorkers = parseInt(process.env.WEB_CONCURRENCY || '1', 10);
    const mongoMaxPool = Math.max(10, Math.floor(100 / numWorkers));
    const mongoMinPool = Math.max(2, Math.floor(10 / numWorkers));
    mongoose.connect(connectionString, {
      maxPoolSize: mongoMaxPool,
      minPoolSize: mongoMinPool,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
      .then(async () => {
        logger.log('MongoDB connected');
        try {
          const User = require('./models/User');
          const result = await User.updateMany(
            { emailVerified: true, expireAt: { $ne: null } },
            { $unset: { expireAt: 1 } }
          );
          if (result.modifiedCount > 0) {
            logger.log(`Cleared expireAt for ${result.modifiedCount} verified users`);
          }
          try {
            const collection = mongoose.connection.collection('users');
            const indexes = await collection.indexes();
            const ttlIndex = indexes.find(idx => idx.key && idx.key.expireAt === 1 && idx.expireAfterSeconds !== undefined);
            if (ttlIndex && ttlIndex.expireAfterSeconds !== 86400) {
              await collection.dropIndex(ttlIndex.name);
              await collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 86400 });
              logger.log('Updated TTL index to 24 hours');
            }
          } catch (idxErr) {
            logger.log('TTL index check skipped:', idxErr.message);
          }

          try {
            // Guard: only run the expensive updateMany if documents still need backfilling.
            // Without this, every cold start runs a full collection scan.
            const needsBackfill = await User.countDocuments({
              verified: true,
              verificationStatus: 'approved',
              $or: [{ isFaceVerified: { $exists: false } }, { isFaceVerified: false }],
            });
            if (needsBackfill > 0) {
              const backfillResult = await User.updateMany(
                {
                  verified: true,
                  verificationStatus: 'approved',
                  $or: [{ isFaceVerified: { $exists: false } }, { isFaceVerified: false }],
                },
                { $set: { isFaceVerified: true } }
              );
              logger.log(`Backfilled isFaceVerified=true for ${backfillResult.modifiedCount} approved users`);
            }
          } catch (backfillErr) {
            logger.error('isFaceVerified backfill failed:', backfillErr.message);
          }

        } catch (migrationErr) {
          logger.log('Migration check skipped:', migrationErr.message);
        }
      })
      .catch(err => {
        logger.error('MongoDB connection error:', err);
        process.exit(1);
      });
  }
} else {
  logger.warn('No MongoDB URI found — database unavailable.');
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Emorii API is running' });
});

app.get('/api/health/redis', protect, async (req, res) => {
  try {
    const redisUtil = require('./utils/redis');
    const alive = await redisUtil.ping();
    const urlSet = !!process.env.REDIS_URL;
    res.json({
      connected: alive,
      urlConfigured: urlSet,
      message: alive
        ? 'Redis is connected and responding'
        : urlSet
          ? 'REDIS_URL is set but Redis is not reachable'
          : 'REDIS_URL environment variable is not set',
    });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

app.get('/api/app-version', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.json({
    latestVersion:  '1.0.0',
    minimumVersion: '1.0.0',
    forceUpdate:    false,
    message:        'A new version of Emorii is available with improvements and bug fixes.',
    androidUrl:     'https://play.google.com/store/apps/details?id=com.emorii.app',
    iosUrl:         'https://apps.apple.com/app/emorii/id0000000000',
  });
});

app.get('/health', (req, res) => {
  const settings = adminRoutes.getSettings ? adminRoutes.getSettings() : {};
  if (settings.maintenanceMode) {
    return res.status(503).json({
      status: 'maintenance',
      maintenance: true,
      message: 'Emorii is under maintenance.',
      timestamp: Date.now(),
    });
  }
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: Date.now(),
  });
});

app.use((req, res, next) => {
  const settings = adminRoutes.getSettings ? adminRoutes.getSettings() : {};
  if (!settings.maintenanceMode) return next();
  if (req.path.startsWith('/api/admin') || req.path.startsWith('/api/auth')) return next();
  return res.status(503).json({
    success: false,
    maintenance: true,
    message: 'Emorii is currently undergoing maintenance. Please try again shortly.',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/chat', messageLimiter, chatRoutes);
app.use('/api/call', callRoutes);
app.use('/api/upload', uploadLimiter, uploadRoutes);
app.use('/api/verification', verificationRoutes);
app.post('/upload-verification-video', protect, (req, res, next) => {
  req.url = '/upload-verification-video';
  verificationRoutes(req, res, next);
});
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/block', blockRoutes);
app.use('/api/admin', adminRoutes);
const auditLogRoutes = require('./routes/auditLog');
app.use('/api/admin/audit-log', auditLogRoutes);
const scheduledBroadcastRoutes = require('./routes/scheduledBroadcasts');
app.use('/api/admin/scheduled-broadcasts', scheduledBroadcastRoutes);
const adminSentryRoutes = require('./routes/adminSentry');
app.use('/api/admin/sentry', adminSentryRoutes);
const safetyAuditRoutes = require('./routes/safetyAudit');
app.use('/api/safety', safetyAuditRoutes);
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/api/stories', storiesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/radar', radarRoutes);
app.use('/api/agora', agoraRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/prompts', promptsRoutes);
app.use('/api/icebreakers', icebreakersRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/boost', boostRoutes);
app.use('/api/profile-completion', profileCompletionRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/success-stories', successStoriesRoutes);
app.use('/api/subscription', express.json({ limit: '5mb' }), subscriptionRoutes);
const engagementRoutes = require('./routes/engagement');
app.use('/api/engagement', engagementRoutes);
const spotifyRoutes = require('./routes/spotify');
app.use('/api/spotify', spotifyRoutes);
app.use('/api/mute', muteRoutes);
app.use('/api/sessions', sessionsRoutes);
app.get('/auth/spotify/callback', (req, res) => {
  const qs = Object.keys(req.query).map(k => `${k}=${encodeURIComponent(req.query[k])}`).join('&');
  res.redirect(`/api/spotify/callback${qs ? '?' + qs : ''}`);
});

app.get('/', (req, res) => {
  // L-1: Only expose endpoint listing in development — unnecessary information
  // disclosure in production. Mobile/web clients never rely on this root endpoint.
  if (IS_PROD) {
    return res.json({ status: 'ok' });
  }
  res.json({ 
    status: 'ok', 
    message: 'Emorii Backend API',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users'
    }
  });
});

const onlineUsers = new Map();
// Users in the background still have an active socket but cannot see messages,
// so push notifications must still be delivered to them.
const backgroundedUsers = new Set();
const User = require('./models/User');

app.set('io', io);
app.set('onlineUsers', onlineUsers);
app.set('backgroundedUsers', backgroundedUsers);

const updateUserOnlineStatus = async (userId, status) => {
  try {
    const updateData = { onlineStatus: status };
    if (status === 'offline') {
      updateData.lastActive = new Date();
    }
    await User.findByIdAndUpdate(userId, updateData);
  } catch (error) {
    logger.error('Failed to update user online status:', error);
  }
};

// Emit a `user:status` presence event only when the user has not hidden
// their online status via privacy settings, and only to their matches —
// not broadcast to every connected socket (O(N²) at scale).
const emitUserStatusIfAllowed = async (userId, isOnline) => {
  try {
    const u = await User.findById(userId).select('privacySettings').lean();
    const showOnline =
      !u || !u.privacySettings || u.privacySettings.showOnlineStatus !== false;
    if (!showOnline) return;

    const Match = require('./models/Match');
    const userMatches = await Match.find({ users: userId, status: 'active' })
      .select('users')
      .lean();

    const payload = { userId: userId.toString(), isOnline };
    const seen = new Set();
    for (const match of userMatches) {
      for (const uid of match.users) {
        const recipientId = uid.toString();
        if (recipientId !== userId.toString() && !seen.has(recipientId)) {
          seen.add(recipientId);
          io.to(recipientId).emit('user:status', payload);
        }
      }
    }
  } catch (error) {
    logger.error('Presence privacy check failed:', error);
  }
};

io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (token) {
    try {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      const userId = decoded.id || decoded._id;
      if (userId) {
        socket.userId = userId.toString();
        onlineUsers.set(socket.userId, socket.id);
        socket.join(socket.userId);
        updateUserOnlineStatus(socket.userId, 'online').catch((e) =>
          logger.error('[Socket] updateUserOnlineStatus failed:', e?.message)
        );
        emitUserStatusIfAllowed(socket.userId, true).catch((e) =>
          logger.error('[Socket] emitUserStatusIfAllowed failed:', e?.message)
        );

        (async () => {
          try {
            const Message = require('./models/Message');
            const pending = await Message
              .find({ receiver: socket.userId, status: 'sent', seen: false })
              .sort({ createdAt: -1 })
              .limit(200)
              .select('_id sender matchId')
              .lean();
            if (!pending.length) return;

            const ids = pending.map(m => m._id);
            await Message.updateMany(
              { _id: { $in: ids } },
              { $set: { status: 'delivered', deliveredAt: new Date() } }
            );

            // Notify each unique sender (one event per message so the
            // sender's bubble can be matched 1:1 by messageId).
            for (const m of pending) {
              const senderId = m.sender ? m.sender.toString() : null;
              if (!senderId) continue;
              const payload = {
                messageId: m._id,
                chatId: m.matchId,
                matchId: m.matchId ? m.matchId.toString() : undefined,
                status: 'delivered',
              };
              io.to(senderId).emit('chat:message-delivered', payload);
            }
          } catch (e) {
            logger.error('[Connect] deliver-on-reconnect flush failed:', e?.message || e);
          }
        })();
      }
    } catch (err) {
      logger.warn('[Socket] Invalid auth token — disconnecting:', err?.message);
      socket.disconnect(true);
      return;
    }
  }

  if (!socket.userId) {
    socket.disconnect(true);
    return;
  }

  socket.on('user:online', () => {
    if (socket.userId) {
      onlineUsers.set(socket.userId, socket.id);
      backgroundedUsers.delete(socket.userId);
      emitUserStatusIfAllowed(socket.userId, true).catch((e) =>
        logger.error('[Socket] emitUserStatusIfAllowed failed:', e?.message)
      );
      updateUserOnlineStatus(socket.userId, 'online').catch((e) =>
        logger.error('[Socket] updateUserOnlineStatus failed:', e?.message)
      );
    }
  });

  socket.on('user:background', () => {
    if (socket.userId) {
      backgroundedUsers.add(socket.userId);
    }
  });

  socket.on('user:foreground', () => {
    if (socket.userId) {
      backgroundedUsers.delete(socket.userId);
    }
  });

  socket.on('chat:join', async (chatId) => {
    if (!chatId || !socket.userId) return;
    try {
      const Match = require('./models/Match');
      const match = await Match.findById(chatId).select('users').lean();
      if (!match) return;
      const isParticipant = match.users.some(uid => uid.toString() === socket.userId);
      if (isParticipant) {
        socket.join(chatId);
      }
    } catch (err) {
      // Silently reject invalid join attempts
    }
  });

  socket.on('chat:message', (data) => {
    // M-11: This socket handler RELAYS messages in real-time but does NOT
    // persist them to MongoDB. Persistence is the responsibility of the caller
    // via POST /api/chat (routes/chat.js). If a client sends via socket without
    // also calling the HTTP route, the message is lost on disconnect/reload.
    // All official app clients call both; a buggy or malicious client that
    // skips the HTTP call will see ephemeral-only delivery. To fully close this
    // gap, move persistence here or remove the relay and let routes/chat.js
    // emit the socket event server-side after writing to the DB.
    if (!data.chatId || !socket.userId) return;
    if (data.senderId && data.senderId !== socket.userId) return;
    // Enforce that the sender is a member of the target room.
    // chat:join already validates participant status, so room membership
    // is the source of truth — prevents message injection into foreign chats.
    if (!socket.rooms.has(data.chatId)) return;
    const messageData = {
      ...data,
      senderId: socket.userId,
      _id: data._id || data.id || Date.now().toString(),
      createdAt: data.createdAt || new Date().toISOString(),
      status: 'sent',
    };
    io.to(data.chatId).emit('chat:new-message', messageData);
    if (data.receiverId) {
      io.to(data.receiverId).emit('chat:new-message', messageData);
    }
  });

  socket.on('chat:typing', (data) => {
    // Require confirmed room membership — chat:join validates Match participation,
    // so rooms.has() is the authoritative O(1) gate here and in similar relay events.
    if (data.chatId && socket.userId && socket.rooms.has(data.chatId)) {
      socket.to(data.chatId).emit('chat:user-typing', {
        userId: socket.userId,
        isTyping: data.isTyping !== false,
        chatId: data.chatId
      });
    }
  });

  const handleMarkRead = async (data) => {
    if (!data || !data.chatId || !socket.userId) return;

    try {
      const filter = {
        matchId: data.chatId,
        receiver: socket.userId,
        seen: false
      };
      if (data.messageId) {
        filter._id = data.messageId;
      }

      const seenAt = new Date();
      await Message.updateMany(filter, {
        $set: { seen: true, seenAt, status: 'seen' }
      });

      const seenAtIso = seenAt.toISOString();
      const payload = {
        chatId:    data.chatId,
        matchId:   data.chatId,
        userId:    socket.userId,
        readBy:    socket.userId,
        messageId: data.messageId,
        readAt:    seenAtIso,
        seenAt:    seenAtIso,
      };

      io.to(data.chatId).emit('chat:message-read', payload);

      try {
        const Match = require('./models/Match');
        const match = await Match.findById(data.chatId).select('users').lean();
        if (match?.users?.length) {
          for (const uid of match.users) {
            const uidStr = uid.toString();
            if (uidStr !== socket.userId) {
              io.to(uidStr).emit('chat:message-read', payload);
            }
          }
        }
      } catch (innerErr) {
        logger.error('Error broadcasting read receipt to sender room:', innerErr);
      }
    } catch (err) {
      logger.error('Error marking messages as read:', err);
    }
  };

  socket.on('chat:mark-read', handleMarkRead);
  socket.on('chat:read', handleMarkRead);
  socket.on('message:read', handleMarkRead);

  socket.on('chat:delivered', (data) => {
    // Room membership gate — same pattern as chat:typing.
    if (data.chatId && data.messageId && socket.userId && socket.rooms.has(data.chatId)) {
      io.to(data.chatId).emit('chat:message-status', {
        messageId: data.messageId,
        status: 'delivered'
      });
    }
  });

  socket.on('chat:recording-voice', (data) => {
    if (data.chatId && socket.userId && socket.rooms.has(data.chatId)) {
      socket.to(data.chatId).emit('chat:recording-voice', {
        userId: socket.userId,
        isRecording: data.isRecording
      });
    }
  });

  socket.on('chat:screenshot-protection', async (data) => {
    // Require room membership + derive updatedBy from socket identity (never trust client).
    if (!data.chatId || !socket.userId || !socket.rooms.has(data.chatId)) return;
    try {
      const Match = require('./models/Match');
      const enabled = data.enabled === true; // coerce to strict boolean
      await Match.findByIdAndUpdate(data.chatId, { screenshotProtection: enabled });
      io.to(data.chatId).emit('chat:screenshot-protection-updated', {
        chatId: data.chatId,
        enabled,
        updatedBy: socket.userId   // server-derived, not client-supplied
      });
    } catch (e) {
      logger.error('Screenshot protection update error:', e);
    }
  });

  async function saveCallMessage(callerId, receiverId, callType, callStatus, duration = null) {
    try {
      const Match = require('./models/Match');
      const Message = require('./models/Message');
      const mongoose = require('mongoose');

      if (!callerId || !receiverId) return null;

      const isValidObjectId = (id) => id && /^[a-fA-F0-9]{24}$/.test(id.toString());

      if (!isValidObjectId(callerId) || !isValidObjectId(receiverId)) {
        logger.warn('Invalid ObjectId for call message:', callerId, receiverId);
        return null;
      }

      const callerObjectId = new mongoose.Types.ObjectId(callerId.toString());
      const receiverObjectId = new mongoose.Types.ObjectId(receiverId.toString());

      const match = await Match.findOne({
        users: { $all: [callerObjectId, receiverObjectId] },
        status: 'active'
      });
      
      if (!match) return null;
      
      const callDuration = duration || 0;
      const message = await Message.create({
        matchId: match._id,
        sender: callerObjectId,
        receiver: receiverObjectId,
        type: 'call',
        callType: callType,
        callStatus: callStatus,
        callDuration: callDuration,
        content: callStatus === 'completed' && callDuration > 0
          ? `${callType === 'video' ? 'Video' : 'Voice'} call - ${Math.floor(callDuration / 60)}:${String(callDuration % 60).padStart(2, '0')}`
          : callStatus === 'missed' 
            ? `Missed ${callType === 'video' ? 'video' : 'voice'} call`
            : `${callType === 'video' ? 'Video' : 'Voice'} call declined`
      });
      
      const messageData = {
        _id: message._id,
        matchId: match._id,
        sender: callerId.toString(),
        receiver: receiverId.toString(),
        type: 'call',
        callType,
        callStatus,
        callDuration: callDuration,
        content: message.content,
        createdAt: message.createdAt
      };
      
      io.to(callerId.toString()).emit('chat:new-message', messageData);
      io.to(receiverId.toString()).emit('chat:new-message', messageData);
      
      return message;
    } catch (err) {
      logger.error('Error saving call message:', err);
      return null;
    }
  }

  async function sendMissedCallPush(callerId, receiverId, callType) {
    try {
      if (!callerId || !receiverId) return;
      const User = require('./models/User');
      const Notification = require('./models/Notification');
      const [caller, receiver] = await Promise.all([
        User.findById(callerId).select('name photos profilePicture'),
        User.findById(receiverId).select(
          'pushToken pushNotificationsEnabled muteSettings notificationPreferences'
        ),
      ]);
      if (!receiver) return;
      const callerName = caller?.name || 'Someone';
      const rawPhoto = caller?.photos?.[0];
      const callerPhoto = (typeof rawPhoto === 'string' ? rawPhoto : rawPhoto?.url || rawPhoto?.uri || '')
        || caller?.profilePicture
        || '';
      const isVideo = callType === 'video';
      const notifTitle = `Missed ${isVideo ? 'video' : 'voice'} call from ${callerName}`;
      const notifBody = `Tap to call back`;

      await Notification.create({
        recipient: receiverId,
        sender: callerId,
        type: 'call',
        title: notifTitle,
        body: notifBody,
        data: {
          type: 'missed_call',
          screen: 'ChatDetail',
          callerId: callerId.toString(),
          callerName: callerName,
          callerPhoto: callerPhoto,
          callType,
        },
      });

      const { sendSmartNotification } = require('./utils/pushNotifications');
      await sendSmartNotification(
        receiver,
        {
          title: notifTitle,
          body: notifBody,
          ...(callerPhoto && callerPhoto.startsWith('https://')
            ? { richContent: { image: callerPhoto }, mutableContent: true }
            : {}),
          data: {
            type: 'missed_call',
            screen: 'ChatDetail',
            callerId: callerId.toString(),
            callerName: callerName,
            callerPhoto: callerPhoto,
            callType,
          },
        },
        'message',
        callerId.toString(),
      );
    } catch (err) {
      logger.error('[MissedCallPush] failed:', err?.message || err);
    }
  }

  socket.on('call:initiate', async (data) => {
    const { targetUserId, callData, callerInfo } = data;
    // Validate targetUserId is a real ObjectId and the caller is authenticated.
    const isValidObjId = (id) => id && /^[a-fA-F0-9]{24}$/.test(String(id));
    if (!targetUserId || !isValidObjId(targetUserId) || !socket.userId) return;
    if (targetUserId === socket.userId) return; // cannot call yourself
    {
      const callerId = socket.userId; // always from socket, never from client callerInfo

      const targetBusy = await isUserBusy(targetUserId);
      if (targetBusy) {
        io.to(callerId).emit('call:busy', { targetUserId });
        logger.log(`User ${targetUserId} is busy, notifying ${callerId}`);
        return;
      }

      await setUserBusy(callerId, true);

      socket.pendingCall = {
        targetUserId,
        callerId,
        callType: callData?.callType || 'voice',
        startTime: Date.now()
      };

      // Track the incoming call on the callee's socket so we can validate
      // call:accept / call:decline / call:busy without trusting client data.
      const calleeSocketId = onlineUsers.get(targetUserId);
      if (calleeSocketId) {
        const calleeSocket = io.sockets.sockets.get(calleeSocketId);
        if (calleeSocket) {
          calleeSocket.incomingCall = { callerId, callType: callData?.callType || 'voice' };
        }
      }

      // After 40 s with no call:accept or call:decline, treat the call as timed
      // out and clear all state.  This is the most important safety net for the
      // "user busy" desync:
      //
      //   • The callee's app is killed (common on Samsung/Xiaomi/OPPO).
      //   • FCM wakes the callee's device — Notifee shows the full-screen UI.
      //   • The callee never answers (missed) or the 35 s timeoutAfter fires.
      //   • The callee's socket NEVER connects (still killed, no network event).
      //   • Without this timeout, busy:callerId stays set in Redis for the full
      //     5-minute TTL, blocking every subsequent call attempt with "user busy".
      //
      // The Redis TTL (5 min) is a last-resort safety net; this 40 s timer is
      // the primary cleanup for the normal missed-call path.
      setTimeout(async () => {
        if (socket.pendingCall && socket.pendingCall.targetUserId === targetUserId) {
          socket.pendingCall = null;
          // Clear caller's busy flag — the callee never answered so the call
          // attempt is over from the server's perspective.
          await setUserBusy(callerId, false).catch(() => {});
          // Also clear callee's busy flag in case it was set.
          await setUserBusy(targetUserId, false).catch(() => {});
          logger.log(`[Call] 40s timeout — busy flags cleared for caller ${callerId} and callee ${targetUserId}`);
        }
      }, 40000);

      io.to(targetUserId).emit('call:incoming', {
        callData,
        callerInfo: {
          ...callerInfo,
          id: callerId
        },
        callerId: callerId
      });
      logger.log(`[Call] Initiated from ${callerId} to ${targetUserId}`);

      try {
        const callType = callData?.callType || 'voice';
        const notifType = callType === 'video' ? 'video_call' : 'voice_call';
        const targetUser = await User.findById(targetUserId).select(
          'pushToken voipPushToken fcmToken pushNotificationsEnabled muteSettings notificationPreferences'
        );
        const callerName = callerInfo?.name || 'Someone';
        const callerPhoto = callerInfo?.photo || '';

        let sentNativeChannel = false;

        if (targetUser?.voipPushToken) {
          try {
            const { sendVoipPush } = require('./utils/voipPush');
            await sendVoipPush(targetUser.voipPushToken, {
              callerId,
              callerName,
              callerPhoto,
              callType,
              callData,
            });
            sentNativeChannel = true;
          } catch (voipErr) {
            logger.error('[VoIP Push] Error:', voipErr?.message || voipErr);
          }
        }

        if (targetUser?.fcmToken) {
          try {
            const { sendCallDataMessage } = require('./utils/fcmPush');
            const fcmResult = await sendCallDataMessage(targetUser.fcmToken, {
              callerId,
              callerName,
              callerPhoto,
              callType,
              callData,
              userId: targetUserId,
            });
            if (fcmResult) {
              sentNativeChannel = true;
              logger.log('[Call] FCM data message sent to', targetUserId);
            } else if (fcmResult === null) {
              logger.warn('[Call] FCM skipped — Firebase Admin not initialized.');
            } else {
              logger.warn('[Call] FCM send failed — stale or invalid token for user', targetUserId);
            }
          } catch (fcmErr) {
            logger.error('[Call] FCM data message error:', fcmErr?.message || fcmErr);
          }
        } else if (!targetUser?.voipPushToken) {
          logger.warn('[Call] No FCM token for user', targetUserId, '— Android native call unavailable.');
        }

        const isTargetOnline = onlineUsers.has(targetUserId);
        if (!sentNativeChannel && targetUser?.pushToken) {
          try {
            const { sendSmartNotification } = require('./utils/pushNotifications');
            await sendSmartNotification(
              targetUser,
              {
                title: `Incoming ${callType === 'video' ? 'video' : 'voice'} call`,
                body: `${callerName} is calling you…`,
                priority: 'high',
                channelId: 'calls',
                data: {
                  type: 'call',
                  callerId,
                  callType,
                  callData,
                  callerName,
                  callerPhoto,
                  senderId: callerId,
                  senderName: callerName,
                  senderPhoto: callerPhoto,
                },
              },
              notifType,
              callerId,
            );
            logger.log('[Call] Expo push fallback sent to', targetUserId);
          } catch (expoErr) {
            logger.error('[Call] Expo push fallback error:', expoErr?.message || expoErr);
          }
        }

        if (!sentNativeChannel && !isTargetOnline && !targetUser?.pushToken) {
          logger.warn(`[Call] Undeliverable — no push tokens and not online for user ${targetUserId}.`);
        }
      } catch (err) {
        logger.error('Failed to send call push notification:', err);
      }
    }
  });

  socket.on('call:accept', async (data) => {
    // Validate against server-tracked incoming call — reject spoofed callerId.
    const incoming = socket.incomingCall;
    if (!incoming || !socket.userId) return;
    const { callerId } = incoming;
    socket.incomingCall = null;

    const callType = incoming.callType || data?.callData?.callType || 'audio';
    socket.activeCall = { callerId, startTime: Date.now(), callType };
    await setUserBusy(socket.userId, true);
    await setUserBusy(callerId, true);

    const callerSocketId = onlineUsers.get(callerId);
    if (callerSocketId) {
      const callerSocket = io.sockets.sockets.get(callerSocketId);
      if (callerSocket) {
        callerSocket.activeCall = { callerId: socket.userId, startTime: Date.now(), callType };
        callerSocket.pendingCall = null;
      }
    }
    io.to(callerId).emit('call:accepted', { acceptedBy: socket.userId, callData: data?.callData });
    logger.log(`[Call] Accepted — receiver ${socket.userId}, caller ${callerId}`);
  });

  socket.on('call:decline', async (data) => {
    // Validate against server-tracked incoming call.
    const incoming = socket.incomingCall;
    if (!incoming || !socket.userId) return;
    const { callerId, callType } = incoming;
    socket.incomingCall = null;

    await saveCallMessage(callerId, socket.userId, callType || 'audio', 'declined');
    socket.pendingCall = null;
    await setUserBusy(socket.userId, false);
    await setUserBusy(callerId, false);

    const callerSocketId = onlineUsers.get(callerId);
    if (callerSocketId) {
      const callerSocket = io.sockets.sockets.get(callerSocketId);
      if (callerSocket) callerSocket.pendingCall = null;
    }
    io.to(callerId).emit('call:declined', { declinedBy: socket.userId });
    logger.log(`[Call] Declined by ${socket.userId}`);
  });

  socket.on('call:busy', async (data) => {
    // Validate against server-tracked incoming call.
    const incoming = socket.incomingCall;
    if (!incoming || !socket.userId) return;
    const { callerId } = incoming;
    socket.incomingCall = null;
    socket.pendingCall = null;

    const callerSocketId = onlineUsers.get(callerId);
    if (callerSocketId) {
      const callerSocket = io.sockets.sockets.get(callerSocketId);
      if (callerSocket) callerSocket.pendingCall = null;
    }
    io.to(callerId).emit('call:busy', { targetUserId: socket.userId });
    logger.log(`[Call] User ${socket.userId} busy — notified caller ${callerId}`);
  });

  socket.on('call:end', async (data) => {
    if (!socket.userId) return;
    // Derive the counterpart from server-tracked state — never trust client data.
    // socket.activeCall.callerId stores "the other party" regardless of who initiated.
    const activeCall  = socket.activeCall;
    const pendingCall = socket.pendingCall;
    const counterpartId = activeCall?.callerId ?? pendingCall?.targetUserId;
    if (!counterpartId) return;

    const callType   = activeCall?.callType || pendingCall?.callType || 'audio';
    const wasAnswered = !!activeCall;
    const duration   = wasAnswered && activeCall?.startTime
      ? Math.max(0, Math.round((Date.now() - activeCall.startTime) / 1000))
      : null;

    if (wasAnswered && duration != null) {
      await saveCallMessage(socket.userId, counterpartId, callType, 'completed', duration);
    } else if (!wasAnswered) {
      await saveCallMessage(socket.userId, counterpartId, callType, 'missed');
    }

    socket.activeCall = null;
    socket.pendingCall = null;
    await setUserBusy(socket.userId, false);
    await setUserBusy(counterpartId, false);

    const targetSocketId = onlineUsers.get(counterpartId);
    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.activeCall = null;
        targetSocket.pendingCall = null;
      }
    }

    io.to(counterpartId).emit('call:ended', { endedBy: socket.userId });

    if (!wasAnswered) {
      sendMissedCallPush(socket.userId, counterpartId, callType || 'audio').catch((e) =>
        logger.error('[MissedCallPush] error:', e?.message || e)
      );
      try {
        const { sendCancelCallDataMessage } = require('./utils/fcmPush');
        const callee = await User.findById(counterpartId).select('fcmToken');
        if (callee?.fcmToken) {
          await sendCancelCallDataMessage(callee.fcmToken, { callerId: socket.userId, userId: counterpartId });
        }
      } catch (cancelErr) {
        logger.error('[CancelCallFCM] error:', cancelErr?.message || cancelErr);
      }
    }
  });
  
  socket.on('call:missed', async (data) => {
    const { targetUserId, callType } = data;
    if (targetUserId && socket.userId) {
      socket.pendingCall = null;
      socket.activeCall = null;
      await setUserBusy(socket.userId, false);
      await setUserBusy(targetUserId, false);

      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.pendingCall = null;
          targetSocket.activeCall = null;
        }
      }
      await saveCallMessage(socket.userId, targetUserId, callType || 'audio', 'missed');
      logger.log(`[Call] Missed — ${socket.userId} to ${targetUserId}`);

      sendMissedCallPush(socket.userId, targetUserId, callType || 'audio').catch((e) =>
        logger.error('[MissedCallPush] error:', e?.message || e)
      );

      try {
        const { sendCancelCallDataMessage } = require('./utils/fcmPush');
        const callee = await User.findById(targetUserId).select('fcmToken');
        if (callee?.fcmToken) {
          await sendCancelCallDataMessage(callee.fcmToken, { callerId: socket.userId, userId: targetUserId });
        }
      } catch (cancelErr) {
        logger.error('[CancelCallFCM/missed] error:', cancelErr?.message || cancelErr);
      }
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      setUserBusy(socket.userId, false).catch(() => {});
    }

    if (socket.pendingCall) {
      const targetId = socket.pendingCall.targetUserId;
      if (targetId) {
        const targetSocketId = onlineUsers.get(targetId);
        if (targetSocketId) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) {
            targetSocket.pendingCall = null;
            targetSocket.activeCall = null;
          }
        }
      }
    }
    if (socket.activeCall) {
      const otherUserId = socket.activeCall.callerId;
      if (otherUserId) {
        setUserBusy(otherUserId, false).catch(() => {});
        io.to(otherUserId).emit('call:ended', { endedBy: socket.userId });
        const otherSocketId = onlineUsers.get(otherUserId);
        if (otherSocketId) {
          const otherSocket = io.sockets.sockets.get(otherSocketId);
          if (otherSocket) {
            otherSocket.activeCall = null;
            otherSocket.pendingCall = null;
          }
        }
      }
    }
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      backgroundedUsers.delete(socket.userId);
      emitUserStatusIfAllowed(socket.userId, false).catch(() => {});
      updateUserOnlineStatus(socket.userId, 'offline').catch(() => {});
    } else {
      for (let [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          backgroundedUsers.delete(userId);
          emitUserStatusIfAllowed(userId, false).catch(() => {});
          updateUserOnlineStatus(userId, 'offline').catch(() => {});
          break;
        }
      }
    }
    logger.log('User disconnected:', socket.id);
  });
});

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3001;
const startServer = () => {
  const serverInstance = server.listen(PORT, '0.0.0.0', async () => {
    logger.log(`Backend running on port ${PORT}`);
    const { startScheduledJobs, startBusyWatchdog } = require('./utils/scheduledJobs');
    startScheduledJobs();
    startBusyWatchdog(onlineUsers, redisClient);
    const { startBroadcastScheduler } = require('./jobs/broadcastScheduler');
    startBroadcastScheduler();
  });

  serverInstance.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      logger.log('Address in use, retrying...');
      setTimeout(() => {
        serverInstance.close();
        startServer();
      }, 1000);
    }
  });
};

startServer();

setInterval(() => {}, 60000);

module.exports = { app, io };