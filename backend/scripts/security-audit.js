#!/usr/bin/env node
/**
 * Emorii Security Audit Script
 * Run before every deploy: node backend/scripts/security-audit.js
 *
 * Checks:
 *  1. Dependency vulnerabilities (npm audit)
 *  2. Hardcoded secrets / API keys
 *  3. Unprotected routes (missing protect middleware)
 *  4. Potential IDOR patterns (param routes without ownership checks)
 *  5. JWT config validation
 *  6. Rate limiter coverage on sensitive endpoints
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '../routes');
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let findings = [];
let warnings = [];
let passed = [];

function fail(label, detail) {
  findings.push({ label, detail });
}

function warn(label, detail) {
  warnings.push({ label, detail });
}

function pass(label) {
  passed.push(label);
}

console.log(`\n${BOLD}${CYAN}==============================`);
console.log('  Emorii Security Audit');
console.log(`==============================${RESET}\n`);

// ─── 1. Dependency Vulnerabilities ───────────────────────────────────────────
console.log(`${BOLD}[1] Checking npm dependencies for known vulnerabilities...${RESET}`);
try {
  const auditOutput = execSync('npm audit --json 2>/dev/null', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });
  const audit = JSON.parse(auditOutput);
  const vulns = audit.metadata?.vulnerabilities || {};
  const critical = vulns.critical || 0;
  const high = vulns.high || 0;
  const moderate = vulns.moderate || 0;

  if (critical > 0) fail('NPM Audit', `${critical} CRITICAL vulnerabilities found. Run: npm audit fix`);
  if (high > 0) fail('NPM Audit', `${high} HIGH vulnerabilities found. Run: npm audit fix`);
  if (moderate > 0) warn('NPM Audit', `${moderate} moderate vulnerabilities found.`);
  if (critical === 0 && high === 0 && moderate === 0) pass('npm audit: no critical/high/moderate vulnerabilities');
} catch (e) {
  try {
    const output = execSync('npm audit 2>&1', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });
    if (/critical|high/i.test(output)) {
      fail('NPM Audit', 'Critical or high vulnerabilities detected. Run npm audit for details.');
    } else {
      warn('NPM Audit', 'Could not parse JSON output; review npm audit manually.');
    }
  } catch (_) {
    warn('NPM Audit', 'npm audit failed to run. Ensure you are in the backend directory.');
  }
}

// ─── 2. Hardcoded Secrets ────────────────────────────────────────────────────
console.log(`${BOLD}[2] Scanning for hardcoded secrets...${RESET}`);
const secretPatterns = [
  { pattern: /['"`][A-Za-z0-9+\/]{32,}={0,2}['"`]/, label: 'Possible hardcoded base64 secret' },
  { pattern: /sk_live_[A-Za-z0-9]+/, label: 'Stripe live secret key' },
  { pattern: /sk_test_[A-Za-z0-9]+/, label: 'Stripe test secret key' },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/, label: 'Google API key' },
  { pattern: /(?:password|secret|apikey|api_key)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'Hardcoded credential assignment' },
  { pattern: /mongodb\+srv:\/\/[^:]+:[^@]+@/, label: 'MongoDB URI with credentials hardcoded' },
];

const SKIP_DIRS = new Set(['node_modules', '.git', '__tests__', 'test', 'tests', 'scripts']);

function walkDir(dir, ext, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory() && !SKIP_DIRS.has(file)) {
      walkDir(fullPath, ext, callback);
    } else if (fullPath.endsWith(ext)) {
      callback(fullPath);
    }
  });
}

let secretHits = 0;
walkDir(path.join(__dirname, '..'), '.js', (filePath) => {
  if (filePath.includes('node_modules') || filePath.includes('security-audit.js')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    secretPatterns.forEach(({ pattern, label }) => {
      if (pattern.test(line)) {
        fail('Hardcoded Secret', `${label} at ${path.relative(path.join(__dirname, '../..'), filePath)}:${i + 1}`);
        secretHits++;
      }
    });
  });
});
if (secretHits === 0) pass('No hardcoded secrets detected');

// ─── 3. Unprotected Routes ───────────────────────────────────────────────────
console.log(`${BOLD}[3] Checking for unprotected routes...${RESET}`);

const ALLOWED_PUBLIC = [
  'POST /ticket',
  'POST /contact',
  'GET /challenge',
  'GET /plans',
  'POST /signup',
  'POST /login',
  'POST /verify-otp',
  'POST /resend-otp',
  'POST /forgot-password',
  'POST /reset-password',
  'POST /appeal',
];

const routeFileNames = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
let unprotectedCount = 0;

routeFileNames.forEach(fileName => {
  const filePath = path.join(ROUTES_DIR, fileName);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    const routeMatch = line.match(/router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (!routeMatch) return;

    const method = routeMatch[1].toUpperCase();
    const routePath = routeMatch[2];

    const contextLines = lines.slice(i, Math.min(i + 3, lines.length)).join(' ');
    const hasProtect = /protect/.test(contextLines);
    const isPublicRoute = ALLOWED_PUBLIC.some(r => {
      const [m, p] = r.split(' ');
      return method === m && routePath.includes(p.replace(/^\//, ''));
    });

    if (!hasProtect && !isPublicRoute) {
      warn('Unprotected Route', `${method} ${routePath} in ${fileName}:${i + 1} — verify this is intentionally public`);
      unprotectedCount++;
    }
  });
});

if (unprotectedCount === 0) pass('All non-whitelisted routes appear to use protect middleware');

// ─── 4. IDOR Pattern Scan ────────────────────────────────────────────────────
console.log(`${BOLD}[4] Scanning for potential IDOR patterns...${RESET}`);
const IDOR_PARAM_PATTERNS = [/:userId/, /:id/, /:matchId/, /:ticketId/, /:reportId/];
let idorHits = 0;

routeFileNames.forEach(fileName => {
  const filePath = path.join(ROUTES_DIR, fileName);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    const routeMatch = line.match(/router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (!routeMatch) return;

    const method = routeMatch[1].toUpperCase();
    const routePath = routeMatch[2];

    const hasIdParam = IDOR_PARAM_PATTERNS.some(p => p.test(routePath));
    if (!hasIdParam) return;

    const block = content.slice(content.indexOf(line));
    const funcEnd = block.indexOf('\n});');
    const funcBody = block.slice(0, funcEnd > 0 ? funcEnd : 800);

    const hasOwnershipCheck = [
      /req\.user\._id/,
      /req\.user\.id/,
      /isAdmin/,
      /isAdminOrAgent/,
      /match\.users/,
      /ticket\.userId/,
      /String\(.*\)\s*!==\s*String\(/,
      /\$all.*req\.user/,
    ].some(p => p.test(funcBody));

    if (!hasOwnershipCheck) {
      warn('Potential IDOR', `${method} ${routePath} in ${fileName}:${i + 1} — confirm ownership/authorization check exists`);
      idorHits++;
    }
  });
});

if (idorHits === 0) pass('No obvious IDOR patterns without ownership checks found');

// ─── 5. JWT Configuration ────────────────────────────────────────────────────
console.log(`${BOLD}[5] Checking JWT configuration...${RESET}`);
const authFile = path.join(__dirname, '../routes/auth.js');
if (fs.existsSync(authFile)) {
  const content = fs.readFileSync(authFile, 'utf8');
  const expiryMatch = content.match(/expiresIn.*?["'`](\d+)([dhmsy])/);
  if (expiryMatch) {
    const value = parseInt(expiryMatch[1]);
    const unit = expiryMatch[2];
    if (unit === 'd' && value > 7) {
      fail('JWT Expiry', `Token expiry is ${value} days. Recommended: 7 days or less.`);
    } else {
      pass(`JWT expiry is ${value}${unit} (acceptable)`);
    }
  }
  if (!content.includes('JWT_SECRET')) {
    fail('JWT Secret', 'JWT_SECRET not referenced from environment variables.');
  } else {
    pass('JWT_SECRET loaded from environment');
  }
}

// ─── 6. Rate Limiter Coverage ────────────────────────────────────────────────
console.log(`${BOLD}[6] Checking rate limiter coverage on sensitive endpoints...${RESET}`);
const sensitiveEndpoints = [
  { file: 'auth.js', route: '/login', limiter: 'authLimiter' },
  { file: 'auth.js', route: '/signup', limiter: 'authLimiter' },
  { file: 'auth.js', route: '/forgot-password', limiter: 'forgotPasswordLimiter' },
  { file: 'auth.js', route: '/verify-otp', limiter: 'otpLimiter' },
  { file: 'support.js', route: '/ticket', limiter: 'supportTicketLimiter' },
];

sensitiveEndpoints.forEach(({ file, route, limiter }) => {
  const filePath = path.join(ROUTES_DIR, file);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const routeIdx = Math.max(
    content.indexOf(`'${route}'`),
    content.indexOf(`"${route}"`),
    content.indexOf(`\`${route}\``)
  );
  const context = content.slice(Math.max(0, routeIdx - 100), routeIdx + 600);
  if (context.includes(limiter)) {
    pass(`Rate limiter (${limiter}) present on ${file}:${route}`);
  } else {
    fail('Missing Rate Limiter', `${limiter} not found on ${route} in ${file}`);
  }
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}${CYAN}====== AUDIT SUMMARY ======${RESET}`);
console.log(`${GREEN}${BOLD}PASSED (${passed.length}):${RESET}`);
passed.forEach(p => console.log(`  ${GREEN}✔ ${p}${RESET}`));

if (warnings.length > 0) {
  console.log(`\n${YELLOW}${BOLD}WARNINGS (${warnings.length}):${RESET}`);
  warnings.forEach(w => console.log(`  ${YELLOW}⚠ [${w.label}] ${w.detail}${RESET}`));
}

if (findings.length > 0) {
  console.log(`\n${RED}${BOLD}CRITICAL FINDINGS (${findings.length}):${RESET}`);
  findings.forEach(f => console.log(`  ${RED}✖ [${f.label}] ${f.detail}${RESET}`));
  console.log(`\n${RED}${BOLD}Audit FAILED. Fix all critical findings before deploying.${RESET}\n`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}${BOLD}Audit PASSED. Safe to deploy.${RESET}\n`);
  process.exit(0);
}
