import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Smartphone, Wifi, WifiOff, AlertTriangle, RefreshCw, Trash2,
  CheckCircle2, Clock, Users, ShieldAlert,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';

interface StaleTokens {
  over30Days: number;
  over60Days: number;
  over90Days: number;
}

interface FcmStats {
  totalActiveUsers: number;
  withToken: number;
  withoutToken: number;
  coveragePct: number;
  staleTokens: StaleTokens;
  activeUsersWithoutToken: number;
}

interface PushHealthProps {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

const StatTile: React.FC<{
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}> = ({ label, value, sub, icon, color, bg }) => (
  <div className={`rounded-3xl p-6 border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-start gap-4`}>
    <div className={`p-3 rounded-2xl ${bg} shrink-0`}>
      <div className={color}>{icon}</div>
    </div>
    <div className="min-w-0">
      <p className="text-2xl font-black text-gray-900 dark:text-white leading-none">{value}</p>
      <p className="text-sm font-semibold text-gray-500 dark:text-slate-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const CoverageBar: React.FC<{ pct: number }> = ({ pct }) => {
  const color =
    pct >= 80 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-amber-500' :
    'bg-rose-500';
  return (
    <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
      <div
        className={`h-3 rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
};

const PushHealth: React.FC<PushHealthProps> = ({ showToast }) => {
  const [stats, setStats]     = useState<FcmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [staleDays, setStaleDays] = useState(90);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await adminApi.get('/admin/push/fcm-health');
      if (data?.success) {
        setStats(data.stats);
        lastFetchRef.current = Date.now();
      }
    } catch {
      if (!silent) showToast('Failed to load FCM token stats', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleClearStale = useCallback(async () => {
    setClearing(true);
    setConfirmOpen(false);
    try {
      const data = await adminApi.delete(`/admin/push/fcm-stale?daysInactive=${staleDays}`);
      if (data?.success) {
        showToast(data.message || `Cleared ${data.cleared} stale tokens`, 'success');
        await fetchStats(true);
      } else {
        showToast('Failed to clear stale tokens', 'error');
      }
    } catch {
      showToast('Error clearing stale tokens', 'error');
    } finally {
      setClearing(false);
    }
  }, [staleDays, fetchStats, showToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={28} className="animate-spin text-teal-500" />
          <p className="text-sm text-gray-400 dark:text-slate-500 font-medium">Loading FCM token stats…</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle size={32} className="text-rose-400" />
        <p className="text-gray-500 dark:text-slate-400">Could not load FCM health data.</p>
        <button
          onClick={() => fetchStats()}
          className="px-5 py-2.5 bg-teal-600 text-white font-bold rounded-xl text-sm hover:bg-teal-700 transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  const coverageColor =
    stats.coveragePct >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
    stats.coveragePct >= 50 ? 'text-amber-600 dark:text-amber-400' :
    'text-rose-600 dark:text-rose-400';

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 dark:text-white">FCM Token Health</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Push notification reachability across active accounts
          </p>
        </div>
        <button
          onClick={() => fetchStats()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-gray-600 dark:text-slate-300 font-semibold rounded-2xl text-sm hover:bg-gray-100 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Coverage overview ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Push Coverage</p>
            <p className={`text-5xl font-black ${coverageColor}`}>{stats.coveragePct}%</p>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {stats.withToken.toLocaleString()} of {stats.totalActiveUsers.toLocaleString()} active users have a valid FCM token
            </p>
          </div>
          <div className="p-4 bg-teal-50 dark:bg-teal-500/10 rounded-2xl">
            <Smartphone size={28} className="text-teal-600 dark:text-teal-400" />
          </div>
        </div>
        <CoverageBar pct={stats.coveragePct} />
        <div className="flex items-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={12} />
            {stats.withToken.toLocaleString()} with token
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-500 dark:text-rose-400">
            <WifiOff size={12} />
            {stats.withoutToken.toLocaleString()} without token
          </span>
        </div>
      </div>

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Total Active Users"
          value={stats.totalActiveUsers.toLocaleString()}
          icon={<Users size={20} />}
          color="text-sky-600 dark:text-sky-400"
          bg="bg-sky-50 dark:bg-sky-500/10"
        />
        <StatTile
          label="With FCM Token"
          value={stats.withToken.toLocaleString()}
          sub="Push-reachable"
          icon={<Wifi size={20} />}
          color="text-emerald-600 dark:text-emerald-400"
          bg="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <StatTile
          label="Without Token"
          value={stats.withoutToken.toLocaleString()}
          sub="Silent — cannot receive push"
          icon={<WifiOff size={20} />}
          color="text-rose-600 dark:text-rose-400"
          bg="bg-rose-50 dark:bg-rose-500/10"
        />
        <StatTile
          label="Active w/o Token"
          value={stats.activeUsersWithoutToken.toLocaleString()}
          sub="Online in last 7 days"
          icon={<ShieldAlert size={20} />}
          color="text-amber-600 dark:text-amber-400"
          bg="bg-amber-50 dark:bg-amber-500/10"
        />
      </div>

      {/* ── Stale token buckets ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-amber-50 dark:bg-amber-500/10 rounded-xl">
            <Clock size={16} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900 dark:text-white">Stale Token Breakdown</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500">Tokens held by users inactive for N+ days — likely expired on FCM side</p>
          </div>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-slate-800">
          {[
            { label: 'Inactive 30+ days', count: stats.staleTokens.over30Days, color: 'text-amber-500' },
            { label: 'Inactive 60+ days', count: stats.staleTokens.over60Days, color: 'text-orange-500' },
            { label: 'Inactive 90+ days', count: stats.staleTokens.over90Days, color: 'text-rose-500' },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">{label}</p>
              <span className={`text-sm font-black ${color}`}>{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bulk clear ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-rose-50 dark:bg-rose-500/10 rounded-xl">
            <Trash2 size={16} className="text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900 dark:text-white">Clear Stale Tokens</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500">Removes FCM tokens from accounts that have been inactive for the chosen period</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap">Inactive for</span>
            <select
              value={staleDays}
              onChange={e => setStaleDays(Number(e.target.value))}
              className="px-3 py-2 text-sm font-semibold bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value={30}>30+ days</option>
              <option value={60}>60+ days</option>
              <option value={90}>90+ days</option>
              <option value={180}>180+ days</option>
            </select>
          </div>

          {!confirmOpen ? (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={clearing}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold rounded-xl text-sm hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all disabled:opacity-50"
            >
              <Trash2 size={14} />
              Clear Stale Tokens
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                This will remove FCM tokens from all users inactive for {staleDays}+ days. Continue?
              </span>
              <button
                onClick={handleClearStale}
                disabled={clearing}
                className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {clearing ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {clearing ? 'Clearing…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 font-bold rounded-xl text-xs hover:bg-gray-200 dark:hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {stats.staleTokens && (
          <p className="mt-3 text-xs text-gray-400 dark:text-slate-500">
            Current estimate at {staleDays}d threshold: <span className="font-bold text-gray-600 dark:text-slate-300">
              {staleDays === 30 ? stats.staleTokens.over30Days :
               staleDays === 60 ? stats.staleTokens.over60Days :
               stats.staleTokens.over90Days} tokens
            </span> would be cleared.
          </p>
        )}
      </div>

    </div>
  );
};

export default PushHealth;
