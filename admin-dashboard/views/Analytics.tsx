import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import * as lucideReact from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { getLocationIntel } from '../services/geminiServices';
import PageHeader from '../components/PageHeader';
import ChartTooltip from '../components/ChartTooltip';
import EmptyState from '../components/EmptyState';

const GENDER_COLORS: Record<string, string> = {
  male: '#06b6d4',
  female: '#f43f5e',
  'non-binary': '#8b5cf6',
  other: '#6b7280',
};
const DEFAULT_COLORS = ['#06b6d4', '#f43f5e', '#8b5cf6', '#6b7280', '#f59e0b'];

const normalizeGenderName = (name: string) => {
  const value = String(name || 'other').trim().toLowerCase();
  if (['male', 'man', 'men', 'm'].includes(value)) return 'Male';
  if (['female', 'woman', 'women', 'f'].includes(value)) return 'Female';
  if (['non-binary', 'nonbinary', 'non binary', 'nb'].includes(value)) return 'Non-binary';
  return 'Other';
};

const normalizeGenderData = (items: GenderPoint[] = []) => {
  const grouped = items.reduce<Record<string, number>>((acc, item) => {
    const label = normalizeGenderName(item.name);
    acc[label] = (acc[label] || 0) + Number(item.value || 0);
    return acc;
  }, {});

  return Object.entries(grouped).map(([name, value]) => ({ name, value }));
};

interface DailyPoint {
  name: string;
  active: number;
  matches: number;
  messages: number;
  newUsers: number;
}

interface GenderPoint { name: string; value: number }
interface AgePoint    { name: string; value: number }

const Analytics: React.FC = () => {
  const [mapQuery, setMapQuery] = useState('');
  const [mapResult, setMapResult] = useState<{ text: string; groundingChunks: any[] } | null>(null);
  const [isMapLoading, setIsMapLoading] = useState(false);

  const [dailyData, setDailyData] = useState<DailyPoint[]>([]);
  const [genderData, setGenderData] = useState<GenderPoint[]>([]);
  const [ageData, setAgeData] = useState<AgePoint[]>([]);
  const [totals, setTotals] = useState<{ totalUsers: number; verifiedUsers: number; premiumUsers: number } | null>(null);
  const [analyticsKPIs, setAnalyticsKPIs] = useState<{ profileViewsMonth: number; avgMatchRate: string | number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, demoRes] = await Promise.allSettled([
        adminApi.getAnalytics(),
        adminApi.getUserDemographics(),
      ]);

      if (analyticsRes.status === 'fulfilled' && analyticsRes.value?.success) {
        setDailyData(analyticsRes.value.analytics?.dailyData || []);
        setTotals(analyticsRes.value.analytics?.totals || null);
        if (analyticsRes.value.analytics?.avgMatchRate !== undefined) {
          setAnalyticsKPIs({
            profileViewsMonth: analyticsRes.value.analytics.profileViewsMonth ?? 0,
            avgMatchRate: analyticsRes.value.analytics.avgMatchRate ?? 0,
          });
        }
      } else {
        setError('Analytics data unavailable. Backend may be starting up.');
      }

      if (demoRes.status === 'fulfilled' && demoRes.value?.success) {
        setGenderData(normalizeGenderData(demoRes.value.demographics?.genderData || []));
        setAgeData(demoRes.value.demographics?.ageData || []);
      }
    } catch (e) {
      setError('Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMapSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapQuery.trim()) return;
    setIsMapLoading(true);
    let coords: { latitude: number; longitude: number } | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {}
    const res = await getLocationIntel(mapQuery, coords);
    setMapResult(res);
    setIsMapLoading(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <PageHeader
        title="Intelligence Node"
        eyebrow="Analytics"
        subtitle="Real-time behavioral trends and geospatial intelligence"
        actions={
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:border-cyan-400 hover:text-cyan-600 transition-all"
          >
            <lucideReact.RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl text-sm text-rose-700 dark:text-rose-400 font-semibold">
          <lucideReact.AlertCircle size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {/* KPI Summary Cards */}
      {!loading && totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Users',    value: (totals.totalUsers || 0).toLocaleString(),    color: 'text-cyan-600 dark:text-cyan-400',   bg: 'bg-cyan-50 dark:bg-cyan-500/5',   border: 'border-cyan-100 dark:border-cyan-500/20' },
            { label: 'Verified Users', value: (totals.verifiedUsers || 0).toLocaleString(), color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/5', border: 'border-emerald-100 dark:border-emerald-500/20' },
            { label: 'Premium Users',  value: (totals.premiumUsers || 0).toLocaleString(),  color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-500/5',  border: 'border-amber-100 dark:border-amber-500/20' },
            { label: 'Avg Match Rate', value: `${analyticsKPIs?.avgMatchRate ?? 0}%`,       color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/5', border: 'border-violet-100 dark:border-violet-500/20' },
          ].map(k => (
            <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl p-5`}>
              <p className={`text-[10px] font-black uppercase tracking-widest ${k.color} mb-1`}>{k.label}</p>
              <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* 7-Day Activity Chart + Gender Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-black dark:text-white">Platform Velocity</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                {dailyData.length > 0 ? 'Real data — last 7 days' : 'Awaiting data'}
              </p>
            </div>
            <div className="p-3 bg-teal-50 dark:bg-teal-500/10 rounded-2xl text-teal-600">
              <lucideReact.TrendingUp size={22} />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-56">
              <lucideReact.Loader2 size={28} className="animate-spin text-cyan-500" />
            </div>
          ) : dailyData.length === 0 ? (
            <EmptyState icon={<lucideReact.BarChart3 size={28} />} title="No activity data yet" compact className="h-56" />
          ) : (
            <div className="relative h-64 w-full min-h-[256px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                  <Tooltip cursor={{ stroke: '#14b8a6', strokeWidth: 1.5, strokeDasharray: '4 2' }} content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }} />
                  <Line type="monotone" dataKey="active"   name="Active Users" stroke="#14b8a6" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="newUsers" name="New Sign-ups"  stroke="#06b6d4" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="matches"  name="Matches"       stroke="#f43f5e" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Gender Split */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-black mb-6 dark:text-white">Gender Split</h3>
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <lucideReact.Loader2 size={24} className="animate-spin text-cyan-500" />
              </div>
            ) : genderData.length === 0 ? (
              <EmptyState icon={<lucideReact.Users size={24} />} title="No user data" compact className="h-48" />
            ) : (
              <>
                <div className="relative h-48 w-full min-h-[192px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={genderData}
                        innerRadius={50}
                        outerRadius={78}
                        paddingAngle={6}
                        dataKey="value"
                      >
                        {genderData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={GENDER_COLORS[entry.name.toLowerCase()] ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip formatter={(v, n) => [String(v), n]} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 justify-center">
                  {genderData.map((entry, i) => (
                    <span key={entry.name} className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GENDER_COLORS[entry.name.toLowerCase()] ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }} />
                      {entry.name} <strong className="text-gray-700 dark:text-white">{entry.value}</strong>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Age Distribution */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-black mb-6 dark:text-white">Age Distribution</h3>
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <lucideReact.Loader2 size={24} className="animate-spin text-cyan-500" />
              </div>
            ) : ageData.every(d => d.value === 0) ? (
              <EmptyState icon={<lucideReact.Users size={20} />} title="No age data" compact className="h-40" />
            ) : (
              <div className="relative h-40 w-full min-h-[160px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={ageData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 9, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 9, fontWeight: 700 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="Users" fill="#06b6d4" radius={[6, 6, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Regional Intelligence (AI-powered) */}
      <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-gray-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-cyan-50 dark:bg-cyan-500/10 rounded-3xl text-cyan-600">
              <lucideReact.Globe size={26} />
            </div>
            <div>
              <h2 className="text-2xl font-black dark:text-white">Regional Intelligence</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">AI-Powered Geospatial Grounding</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleMapSearch} className="relative mb-8">
          <input
            type="text"
            value={mapQuery}
            onChange={(e) => setMapQuery(e.target.value)}
            placeholder="e.g. 'Safety report on nightlife venues in Lagos Island...'"
            className="w-full pl-8 pr-40 py-6 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-[2rem] focus:ring-4 focus:ring-brand-500/10 outline-none text-sm font-black dark:text-white transition-all"
          />
          <button
            type="submit"
            disabled={isMapLoading}
            className="absolute right-3 top-3 bottom-3 px-8 bg-brand-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-50 flex items-center shadow-lg"
          >
            {isMapLoading
              ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              : <><lucideReact.Sparkles size={16} className="mr-2" />Audit Hub</>
            }
          </button>
        </form>

        <div className="min-h-[200px] relative overflow-hidden rounded-[2rem] bg-slate-50 dark:bg-slate-800/30 p-8 border border-slate-100 dark:border-slate-800/50">
          {!mapResult && !isMapLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12 opacity-50">
              <lucideReact.MapPin size={48} className="text-brand-300 mb-4" />
              <p className="text-base font-black text-slate-400 uppercase tracking-widest">Geospatial Sync Pending</p>
              <p className="text-xs text-slate-400 max-w-xs mt-2">Enter regional parameters above to bridge real-world intelligence.</p>
            </div>
          )}
          {isMapLoading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-6 bg-white dark:bg-slate-800 rounded-full w-2/3" />
              <div className="h-24 bg-white dark:bg-slate-800 rounded-2xl w-full" />
              <div className="flex gap-4">
                <div className="h-10 bg-white dark:bg-slate-800 rounded-xl w-1/3" />
                <div className="h-10 bg-white dark:bg-slate-800 rounded-xl w-1/3" />
              </div>
            </div>
          )}
          {mapResult && (
            <div className="space-y-6 animate-fadeIn">
              <div className="p-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-[2rem] border border-brand-100 dark:border-brand-500/10 shadow-sm">
                <p className="text-base text-gray-700 dark:text-slate-200 leading-relaxed font-bold">{mapResult.text}</p>
              </div>
              {mapResult.groundingChunks.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mapResult.groundingChunks.map((chunk: any, i: number) =>
                    chunk.maps?.uri ? (
                      <a
                        key={i}
                        href={chunk.maps.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-5 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl hover:border-brand-500 hover:shadow-lg transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <lucideReact.MapPin size={16} className="text-brand-500" />
                          <span className="text-xs font-black dark:text-white truncate max-w-[180px] uppercase tracking-wider">{chunk.maps.title || 'Unknown'}</span>
                        </div>
                        <lucideReact.ExternalLink size={14} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                      </a>
                    ) : null
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
