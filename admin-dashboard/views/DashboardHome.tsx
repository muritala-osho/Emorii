import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDarkMode } from '../hooks/useDarkMode';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { Users, Heart, MessageSquare, TrendingUp, AlertCircle, RefreshCw, X } from 'lucide-react';
import StatCard from '../components/StatCard';
import { SkeletonStatCard } from '../components/Skeleton';
import { adminApi } from '../services/adminApi';
import LiveActivityFeed from './LiveActivityFeed';
import PageHeader from '../components/PageHeader';
import ChartTooltip from '../components/ChartTooltip';
import EmptyState from '../components/EmptyState';
import Avatar from '../components/Avatar';

interface Stats {
  totalUsers: number;
  totalMatches: number;
  totalMessages: number;
  activeToday: number;
  pendingReports: number;
  bannedUsers: number;
  verifiedUsers: number;
}

interface Activity {
  active24h: number;
  active7d: number;
  messages24h: number;
  onlineNow: number;
}

interface DailyPoint {
  name: string;
  active: number;
  matches: number;
  messages: number;
  newUsers: number;
}

interface DrillDown {
  title: string;
  filter: string;
}

interface Props {
  onNavigate?: (tab: string) => void;
}

const DashboardHome: React.FC<Props> = ({ onNavigate }) => {
  const isDarkMode = useDarkMode();

  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [dailyData, setDailyData] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reportsUsers, setReportsUsers] = useState<any[]>([]);
  const [chartRange, setChartRange] = useState<'7d' | '30d'>('7d');
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRequiredData = useRef(false);

  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);
  const [drillUsers, setDrillUsers] = useState<any[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillTotal, setDrillTotal] = useState(0);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [overviewRes, analyticsRes] = await Promise.allSettled([
        adminApi.getOverview(),
        adminApi.getAnalytics(chartRange),
      ]);

      if (overviewRes.status === 'fulfilled' && overviewRes.value?.success) {
        const o = overviewRes.value;
        if (o.stats)    setStats(o.stats);
        if (o.activity) setActivity(o.activity);
        if (Array.isArray(o.pendingReports)) setReportsUsers(o.pendingReports.slice(0, 5));
        hasLoadedRequiredData.current = true;
      }
      if (analyticsRes.status === 'fulfilled' && analyticsRes.value?.success) {
        setDailyData(analyticsRes.value.analytics?.dailyData || []);
      }

      const hasRequiredData =
        overviewRes.status === 'fulfilled' && overviewRes.value?.success;

      if (!hasRequiredData && !hasLoadedRequiredData.current) {
        setError('Unable to load live dashboard data. Please retry.');
      }
    } catch (err) {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chartRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!drillDown) return;
    setDrillLoading(true);
    setDrillUsers([]);
    setDrillTotal(0);
    adminApi.getUsers({ status: drillDown.filter, limit: 50 })
      .then((res: any) => {
        if (res.success) {
          setDrillUsers(res.users || []);
          setDrillTotal(res.pagination?.total ?? (res.users?.length ?? 0));
        }
      })
      .catch(() => {})
      .finally(() => setDrillLoading(false));
  }, [drillDown]);

  const openDrill = useCallback((title: string, filter: string) => {
    setDrillDown({ title, filter });
  }, []);

  const closeDrill = useCallback(() => setDrillDown(null), []);

  const chartData = dailyData.length > 0 ? dailyData : [];

  const miniTiles = [
    {
      label: 'Active 24h',
      value: activity ? formatNumber(activity.active24h) : '—',
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-50 dark:bg-cyan-500/5',
      border: 'border-cyan-100 dark:border-cyan-500/20',
      onClick: () => openDrill('Active in Last 24 Hours', 'active_24h'),
    },
    {
      label: 'Active 7d',
      value: activity ? formatNumber(activity.active7d) : '—',
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-500/5',
      border: 'border-teal-100 dark:border-teal-500/20',
      onClick: () => openDrill('Active in Last 7 Days', 'active_7d'),
    },
    {
      label: 'Messages 24h',
      value: activity ? formatNumber(activity.messages24h) : '—',
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-500/5',
      border: 'border-indigo-100 dark:border-indigo-500/20',
      onClick: () => openDrill('Users Who Messaged (Last 24h)', 'messages_24h'),
    },
    {
      label: 'Pending Reports',
      value: stats ? String(stats.pendingReports) : '—',
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-500/5',
      border: 'border-rose-100 dark:border-rose-500/20',
      onClick: () => onNavigate?.('reports'),
    },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      <PageHeader
        title="System Overview"
        eyebrow="Live Operations"
        subtitle="Live ecosystem metrics — auto-refreshes every 60s"
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 uppercase tracking-widest">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {activity ? `${formatNumber(activity.onlineNow)} Online` : '—'}
            </span>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-bold text-slate-500 dark:text-slate-400 hover:border-cyan-400 hover:text-cyan-600 transition-all"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </>
        }
      />

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl text-sm text-rose-700 dark:text-rose-400 font-semibold">
          <AlertCircle size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <SkeletonStatCard key={i} />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Total Citizens"
              value={stats ? formatNumber(stats.totalUsers) : '—'}
              icon={<Users />}
              color="bg-cyan-500"
              onClick={() => onNavigate?.('users')}
              sublabel="View all users →"
            />
            <StatCard
              title="Match Velocity"
              value={stats ? formatNumber(stats.totalMatches) : '—'}
              icon={<Heart />}
              color="bg-rose-500"
              onClick={() => openDrill('Users with Matches', 'has_matches')}
              sublabel="View matched users →"
            />
            <StatCard
              title="Packet Traffic"
              value={stats ? formatNumber(stats.totalMessages) : '—'}
              icon={<MessageSquare />}
              color="bg-indigo-500"
              onClick={() => openDrill('Users Who Sent Messages', 'sent_messages')}
              sublabel="View messaging users →"
            />
            <StatCard
              title="Active Today"
              value={stats ? formatNumber(stats.activeToday) : '—'}
              icon={<TrendingUp />}
              color="bg-teal-500"
              onClick={() => openDrill('Active Today', 'active_today')}
              sublabel="View active users →"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {miniTiles.map(item => (
              <button
                key={item.label}
                onClick={item.onClick}
                className={`${item.bg} border ${item.border} rounded-2xl p-5 text-left transition-all hover:opacity-80 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer w-full`}
              >
                <p className={`text-[10px] font-black uppercase tracking-widest ${item.color} mb-1`}>{item.label}</p>
                <p className={`text-2xl font-black ${item.color}`}>{item.value}</p>
              </button>
            ))}
          </div>

          <LiveActivityFeed />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Citizen Engagement Flow</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                    {chartData.length > 0 ? `Real data — last ${chartRange === '30d' ? '30 days' : '7 days'}` : 'No data yet'}
                  </p>
                </div>
                <div className="flex bg-gray-50 dark:bg-slate-800 p-1 rounded-xl border border-gray-100 dark:border-slate-700">
                  {(['7d', '30d'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setChartRange(r)}
                      className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${chartRange === r ? 'bg-white dark:bg-slate-700 text-cyan-600 shadow-sm' : 'text-slate-400 hover:text-cyan-500'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {chartData.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare size={28} />}
                  title="No activity data yet"
                  description="Data will appear as users engage with the platform"
                  className="h-80"
                  compact
                />
              ) : (
                <div className="relative h-80 w-full min-h-[320px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMatches" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#1e293b' : '#f3f4f6'} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                      <Tooltip
                        cursor={{ stroke: '#06b6d4', strokeWidth: 1.5, strokeDasharray: '4 2' }}
                        content={<ChartTooltip />}
                      />
                      <Area type="monotone" dataKey="active" name="Active Users" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#colorActive)" />
                      <Area type="monotone" dataKey="matches" name="Matches" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorMatches)" />
                      <Area type="monotone" dataKey="newUsers" name="New Users" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorNew)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="flex items-center gap-6 mt-4 flex-wrap">
                {[
                  { color: 'bg-cyan-500', label: 'Active Users' },
                  { color: 'bg-rose-500', label: 'Matches' },
                  { color: 'bg-violet-500', label: 'New Sign-ups' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${l.color}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col">
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Security Alerts</h2>
                <p className="text-xs text-rose-500 font-bold uppercase tracking-widest">
                  {stats ? `${stats.pendingReports} Pending · ${stats.bannedUsers} Banned` : 'Action Required'}
                </p>
              </div>
              <div className="flex-1 space-y-4">
                {reportsUsers.length > 0 ? reportsUsers.map((report: any) => (
                  <div key={report._id} className="group flex items-center justify-between p-5 rounded-3xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 hover:border-rose-500/30 transition-all cursor-pointer">
                    <div className="flex items-center">
                      <div className="relative">
                        <div className="h-12 w-12 rounded-2xl bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center mr-4">
                          <span className="text-rose-600 font-black text-sm">{(report.reportedUser?.name || 'U')[0]}</span>
                        </div>
                        <div className="absolute -top-1 -right-1 h-3 w-3 bg-rose-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-sm font-black dark:text-white">{report.reportedUser?.name || 'Unknown User'}</p>
                        <p className="text-[10px] text-rose-500 font-black uppercase tracking-wider">{report.reason || 'Reported'}</p>
                      </div>
                    </div>
                    <AlertCircle size={18} className="text-slate-300 group-hover:text-rose-500 transition-colors" />
                  </div>
                )) : (
                  <EmptyState
                    icon={<AlertCircle size={24} />}
                    title="No pending reports"
                    description="The queue is clear"
                    compact
                  />
                )}
              </div>
              <div className="mt-8 pt-6 border-t border-gray-100 dark:border-slate-800 grid grid-cols-2 gap-3">
                <div className="text-center p-4 bg-amber-50 dark:bg-amber-500/5 rounded-2xl border border-amber-100 dark:border-amber-500/20">
                  <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Verified</p>
                  <p className="text-xl font-black text-amber-600">{stats ? formatNumber(stats.verifiedUsers) : '—'}</p>
                </div>
                <div className="text-center p-4 bg-rose-50 dark:bg-rose-500/5 rounded-2xl border border-rose-100 dark:border-rose-500/20">
                  <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-1">Banned</p>
                  <p className="text-xl font-black text-rose-600">{stats ? formatNumber(stats.bannedUsers) : '—'}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Drill-down slide-over panel ── */}
      {drillDown && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={drillDown.title}>
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeDrill}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col animate-slideInRight">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-800 shrink-0">
              <div>
                <h2 className="text-lg font-black text-gray-900 dark:text-white leading-tight">{drillDown.title}</h2>
                {!drillLoading && (
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                    {drillTotal.toLocaleString()} user{drillTotal !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <button
                onClick={closeDrill}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-all shrink-0 ml-4"
                aria-label="Close panel"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {drillLoading ? (
                <div className="p-4 space-y-3">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/50 animate-pulse">
                      <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-slate-700 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-2/3" />
                        <div className="h-2.5 bg-gray-100 dark:bg-slate-800 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : drillUsers.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <EmptyState
                    icon={<Users size={28} />}
                    title="No users found"
                    description="No users match this filter right now"
                    compact
                  />
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {drillUsers.map((user: any) => {
                    const photo = user.photos?.[0]?.url;
                    const lastActive = user.lastActive || user.updatedAt;
                    return (
                      <div
                        key={user._id}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/50 border border-transparent hover:border-gray-200 dark:hover:border-slate-700 transition-all"
                      >
                        <Avatar
                          src={photo}
                          name={user.name}
                          size="sm"
                          shape="square"
                          status={user.onlineStatus === 'online' ? 'online' : undefined}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">
                            {user.name || 'Unknown'}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          {user.banned ? (
                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full">Banned</span>
                          ) : user.verified ? (
                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full">Verified</span>
                          ) : null}
                          <p className="text-[10px] text-slate-400 mt-1">{formatRelativeTime(lastActive)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {drillTotal > drillUsers.length && (
                    <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2 pb-1">
                      Showing {drillUsers.length} of {drillTotal.toLocaleString()} — open User Management for full list
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 shrink-0">
              <button
                onClick={() => { closeDrill(); onNavigate?.('users'); }}
                className="w-full py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm rounded-xl hover:opacity-90 transition-opacity"
              >
                Open full User Management →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardHome;
