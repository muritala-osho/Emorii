const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { isAdmin } = require('../middleware/supportAccess');

const SENTRY_API_BASE = 'https://sentry.io/api/0';
const CACHE_TTL_MS = 30_000;

const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCached(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

function sentryConfigured() {
  return Boolean(
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT
  );
}

async function sentryFetch(path, query = {}) {
  const url = new URL(`${SENTRY_API_BASE}${path}`);
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach(item => url.searchParams.append(k, String(item)));
    else url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Sentry API ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

router.get('/config', protect, isAdmin, (req, res) => {
  res.json({
    success: true,
    configured: sentryConfigured(),
    org: process.env.SENTRY_ORG || null,
    project: process.env.SENTRY_PROJECT || null,
    requiredEnv: ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'],
  });
});

router.get('/overview', protect, isAdmin, async (req, res) => {
  if (!sentryConfigured()) {
    return res.status(503).json({
      success: false,
      configured: false,
      message: 'Sentry is not configured. Set SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT.',
    });
  }

  const org = process.env.SENTRY_ORG;
  const project = (req.query.project || process.env.SENTRY_PROJECT).toString();
  const statsPeriod = (req.query.range || '24h').toString();

  const cacheKey = `overview:${org}:${project}:${statsPeriod}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, configured: true, cached: true, ...cached });

  try {
    const [eventStatsRes, issuesRes, sessionsRes, projectMeta] = await Promise.allSettled([
      sentryFetch(`/organizations/${org}/stats_v2/`, {
        project: project,
        field: 'sum(quantity)',
        category: 'error',
        interval: statsPeriod === '24h' ? '1h' : '1d',
        statsPeriod,
        groupBy: 'outcome',
      }),
      sentryFetch(`/projects/${org}/${project}/issues/`, {
        query: 'is:unresolved',
        sort: 'freq',
        statsPeriod,
        limit: 10,
      }),
      sentryFetch(`/organizations/${org}/sessions/`, {
        project: project,
        field: ['sum(session)', 'crash_free_rate(session)'],
        statsPeriod,
        interval: statsPeriod === '24h' ? '1h' : '1d',
      }).catch(() => null),
      sentryFetch(`/projects/${org}/${project}/`).catch(() => null),
    ]);

    const errorSeries = [];
    let totalErrors = 0;
    let acceptedErrors = 0;
    if (eventStatsRes.status === 'fulfilled' && eventStatsRes.value?.intervals) {
      const intervals = eventStatsRes.value.intervals;
      const groups = eventStatsRes.value.groups || [];
      const acceptedGroup = groups.find(g => g.by?.outcome === 'accepted');
      const seriesData = acceptedGroup?.series?.['sum(quantity)'] || [];
      intervals.forEach((ts, i) => {
        const count = Number(seriesData[i] || 0);
        errorSeries.push({ ts, count });
        totalErrors += count;
      });
      acceptedErrors = totalErrors;
    }

    const topIssues = [];
    if (issuesRes.status === 'fulfilled' && Array.isArray(issuesRes.value)) {
      for (const issue of issuesRes.value.slice(0, 10)) {
        topIssues.push({
          id: issue.id,
          shortId: issue.shortId,
          title: issue.title || issue.metadata?.value || issue.metadata?.type || 'Untitled',
          culprit: issue.culprit || '',
          level: issue.level || 'error',
          count: Number(issue.count || 0),
          userCount: Number(issue.userCount || 0),
          lastSeen: issue.lastSeen,
          firstSeen: issue.firstSeen,
          status: issue.status,
          permalink: issue.permalink,
        });
      }
    }

    let crashFreeRate = null;
    let totalSessions = 0;
    if (sessionsRes.status === 'fulfilled' && sessionsRes.value?.groups) {
      const totals = sessionsRes.value.groups[0]?.totals || {};
      const rate = totals['crash_free_rate(session)'];
      crashFreeRate = rate !== undefined && rate !== null ? Number(rate) : null;
      totalSessions = Number(totals['sum(session)'] || 0);
    }

    const projectInfo = projectMeta.status === 'fulfilled' && projectMeta.value
      ? {
          name: projectMeta.value.name,
          slug: projectMeta.value.slug,
          platform: projectMeta.value.platform,
          status: projectMeta.value.status,
        }
      : { slug: project };

    const data = {
      org,
      project: projectInfo,
      range: statsPeriod,
      summary: {
        totalErrors: acceptedErrors,
        totalSessions,
        crashFreeRate,
        unresolvedIssues: topIssues.length,
      },
      errorSeries,
      topIssues,
      generatedAt: new Date().toISOString(),
    };

    setCached(cacheKey, data);
    res.json({ success: true, configured: true, cached: false, ...data });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      configured: true,
      message: err.message || 'Failed to load Sentry data',
    });
  }
});

module.exports = router;
