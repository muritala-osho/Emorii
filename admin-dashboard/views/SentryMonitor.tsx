import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  AlertTriangle, ShieldCheck, Activity, RefreshCw, ExternalLink, Bug, Clock,
  Users as UsersIcon, AlertCircle, Settings as SettingsIcon, CheckCircle2,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';

type Range = '24h' | '7d' | '14d' | '30d';

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: string;
  count: number;
  userCount: number;
  lastSeen: string;
  firstSeen: string;
  status: string;
  permalink: string;
}

interface SentryOverview {
  org: string;
  project: { name?: string; slug: string; platform?: string; status?: string };
  range: Range;
  summary: {
    totalErrors: number;
    totalSessions: number;
    crashFreeRate: number | null;
    unresolvedIssues: number;
  };
  errorSeries: { ts: string; count: number }[];
  topIssues: SentryIssue[];
  generatedAt: string;
  cached?: boolean;
}

const RANGES: { value: Range; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
];

const REFRESH_MS = 30_000;

const LEVEL_COLORS: Record<string, string> = {
  fatal: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  error: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  debug: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
};

function formatNumber(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function timeAgo(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const SentryMonitor: React.FC = () => {
  const [data, setData] = useState<SentryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [config, setConfig] = useState<{ org: string | null; project: string | null; requiredEnv: string[] } | null>(null);
  const [range, setRange] = useState<Range>('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await adminApi.getSentryConfig();
      if (res?.success) {
        setConfigured(Boolean(res.configured));
        setConfig({ org: res.org, project: res.project, requiredEnv: res.requiredEnv });
      }
    } catch {
      setConfigured(false);
    }
  }, []);

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await adminApi.getSentryOverview(range);
      if (res?.success) {
        setData(res as SentryOverview);
        setConfigured(true);
        setLastUpdated(new Date());
      } else {
        if (res?.configured === false) setConfigured(false);
        setError(res?.message || 'Failed to load Sentry data');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load Sentry data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useEffect(() => {
    if (configured) loadOverview(false);
  }, [configured, range, loadOverview]);

  useEffect(() => {
    if (!autoRefresh || !configured) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => loadOverview(true), REFRESH_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, configured, loadOverview]);

  if (configured === false) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-amber-200 dark:border-amber-500/30 p-8 shadow-card">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10">
              <SettingsIcon size={24} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">Sentry Not Configured</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-5 leading-relaxed">
                Add your Sentry credentials to the backend environment to start tracking error rates,
                crash-free sessions, and top issues right inside Emorii.
              </p>

              <div className="space-y-2 mb-5">
                {(config?.requiredEnv || ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']).map(key => (
                  <div key={key} className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-700">
                    <code className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400">{key}</code>
                    <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Missing</span>
                  </div>
                ))}
              </div>

              <div className="bg-gray-50 dark:bg-slate-800/60 rounded-2xl p-4 text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
                <strong className="text-gray-900 dark:text-white block mb-1.5">How to get these values</strong>
                Create an internal integration in <strong>Sentry → Settings → Developer Settings</strong> with
                project:read and event:read scopes. Use the org slug for <code>SENTRY_ORG</code> and the
                project slug for <code>SENTRY_PROJECT</code>.
              </div>

              <button
                onClick={() => { loadConfig(); }}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
              >
                <RefreshCw size={14} /> Re-check Configuration
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Error Monitoring</h2>
            {data?.project?.slug && (
              <span className="text-[10px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 px-2 py-1 rounded-md">
                {data.project.name || data.project.slug}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest">
              Live · Sentry
            </span>
            {lastUpdated && (
              <span className="text-gray-400 dark:text-slate-500 font-medium">
                · updated {timeAgo(lastUpdated.toISOString())}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl p-1">
            {RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                  range === r.value
                    ? 'bg-teal-600 text-white'
                    : 'text-gray-500 dark:text-slate-400 hover:text-teal-600'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            className={`p-2.5 rounded-xl border transition-all ${
              autoRefresh
                ? 'bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/30 text-teal-600 dark:text-teal-400'
                : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-400'
            }`}
          >
            <Activity size={14} />
          </button>
          <button
            onClick={() => loadOverview(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl text-gray-500 dark:text-slate-400 hover:text-teal-600 transition-all text-[11px] font-bold uppercase tracking-widest disabled:opacity-60"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
          {data?.org && data?.project?.slug && (
            <a
              href={`https://sentry.io/organizations/${data.org}/projects/${data.project.slug}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
            >
              Open in Sentry <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-2xl">
          <AlertCircle size={16} className="text-rose-500 shrink-0" />
          <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Errors"
          value={loading ? '—' : formatNumber(data?.summary.totalErrors || 0)}
          sublabel={`In the last ${range}`}
          icon={<Bug size={20} />}
          tone="rose"
        />
        <KpiCard
          title="Crash-Free Sessions"
          value={
            loading
              ? '—'
              : data?.summary.crashFreeRate !== null && data?.summary.crashFreeRate !== undefined
                ? `${(data.summary.crashFreeRate * 100).toFixed(2)}%`
                : 'N/A'
          }
          sublabel={data?.summary.totalSessions ? `${formatNumber(data.summary.totalSessions)} sessions` : 'No session data'}
          icon={<ShieldCheck size={20} />}
          tone="emerald"
        />
        <KpiCard
          title="Unresolved Issues"
          value={loading ? '—' : formatNumber(data?.summary.unresolvedIssues || 0)}
          sublabel="Top 10 shown below"
          icon={<AlertTriangle size={20} />}
          tone="amber"
        />
        <KpiCard
          title="Affected Users"
          value={loading ? '—' : formatNumber(data?.topIssues.reduce((s, i) => s + i.userCount, 0) || 0)}
          sublabel="Across top issues"
          icon={<UsersIcon size={20} />}
          tone="indigo"
        />
      </div>

      {/* Error Trend Chart */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-card border border-gray-100 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-black text-gray-900 dark:text-white tracking-tight">Error Volume</h3>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 font-medium mt-0.5">
              Accepted error events over the selected range
            </p>
          </div>
          {data?.cached && (
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-md">
              Cached
            </span>
          )}
        </div>
        <div className="h-64">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-400">Loading…</div>
          ) : (data?.errorSeries.length ?? 0) === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400">
              <CheckCircle2 size={32} className="text-emerald-500" />
              <p className="text-xs font-semibold">No errors in this range. Nice.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={(data?.errorSeries || []).map(p => ({
                ...p,
                label: new Date(p.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: range === '24h' ? '2-digit' : undefined }),
              }))}>
                <defs>
                  <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} stroke="rgba(148,163,184,0.3)" />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} stroke="rgba(148,163,184,0.3)" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)',
                    borderRadius: 12, fontSize: 11, color: '#fff',
                  }}
                />
                <Area type="monotone" dataKey="count" stroke="#f43f5e" strokeWidth={2} fill="url(#errGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Issues */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-card border border-gray-100 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-gray-900 dark:text-white tracking-tight">Top Issues</h3>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 font-medium mt-0.5">
              Sorted by frequency in the last {range}
            </p>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
            {data?.topIssues.length ?? 0} shown
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-gray-400">Loading issues…</div>
        ) : (data?.topIssues.length ?? 0) === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
            <CheckCircle2 size={36} className="text-emerald-500" />
            <p className="text-sm font-bold text-gray-700 dark:text-slate-300">No unresolved issues</p>
            <p className="text-xs">Your app is clean. Keep it that way.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {data?.topIssues.map(issue => (
              <a
                key={issue.id}
                href={issue.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="shrink-0 mt-0.5">
                  <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${LEVEL_COLORS[issue.level] || LEVEL_COLORS.error}`}>
                    {issue.level}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                      {issue.title}
                    </p>
                    {issue.shortId && (
                      <span className="text-[10px] font-mono font-black text-gray-400 dark:text-slate-500 shrink-0">{issue.shortId}</span>
                    )}
                  </div>
                  {issue.culprit && (
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 font-mono truncate">{issue.culprit}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">
                    <span className="flex items-center gap-1"><Bug size={10} /> {formatNumber(issue.count)} events</span>
                    <span className="flex items-center gap-1"><UsersIcon size={10} /> {formatNumber(issue.userCount)} users</span>
                    <span className="flex items-center gap-1"><Clock size={10} /> {timeAgo(issue.lastSeen)}</span>
                  </div>
                </div>
                <ExternalLink size={14} className="text-gray-300 dark:text-slate-600 group-hover:text-teal-500 mt-1 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const TONE_MAP: Record<string, { bg: string; text: string; border: string }> = {
  rose:    { bg: 'bg-rose-50 dark:bg-rose-500/10',       text: 'text-rose-600 dark:text-rose-400',       border: 'hover:border-rose-100 dark:hover:border-rose-500/20' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'hover:border-emerald-100 dark:hover:border-emerald-500/20' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-500/10',     text: 'text-amber-600 dark:text-amber-400',     border: 'hover:border-amber-100 dark:hover:border-amber-500/20' },
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-500/10',   text: 'text-indigo-600 dark:text-indigo-400',   border: 'hover:border-indigo-100 dark:hover:border-indigo-500/20' },
};

const KpiCard: React.FC<{
  title: string; value: string; sublabel?: string; icon: React.ReactNode; tone: keyof typeof TONE_MAP;
}> = ({ title, value, sublabel, icon, tone }) => {
  const styles = TONE_MAP[tone];
  return (
    <div className={`bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-card border border-gray-100 dark:border-slate-800 flex items-start justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${styles.border}`}>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-2">{title}</p>
        <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight tabular-nums">{value}</h3>
        {sublabel && <p className="text-[10px] text-slate-400 font-medium mt-1">{sublabel}</p>}
      </div>
      <div className={`p-3.5 rounded-2xl ${styles.bg} shrink-0 ml-4`}>
        {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<{ className: string }>, { className: styles.text })}
      </div>
    </div>
  );
};

export default SentryMonitor;
