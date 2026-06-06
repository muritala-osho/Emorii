import React, { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import {
  TrendingDown, AlertTriangle, Users, Zap, RefreshCw,
  Loader2, Clock, Mail, Bell, Gift, CheckCircle, BarChart3,
} from 'lucide-react';

interface ChurnUser {
  _id: string;
  name: string;
  email: string;
  lastActive: string;
  churnScore: number;
  churnInterventionTier: string;
  churnInterventionSentAt?: string;
  premium?: { isActive: boolean; plan: string };
}

interface Distribution {
  healthy: number;
  atRisk: number;
  highRisk: number;
  critical: number;
}

const TIER_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  push:  { label: 'Push sent',       color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-500/10',   icon: <Bell size={12} /> },
  email: { label: 'Email sent',      color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10', icon: <Mail size={12} /> },
  boost: { label: 'Boost granted',   color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', icon: <Gift size={12} /> },
  none:  { label: 'No action yet',   color: 'text-gray-500 dark:text-slate-400',  bg: 'bg-gray-50 dark:bg-slate-800',     icon: <Clock size={12} /> },
};

const riskBand = (score: number) => {
  if (score >= 0.80) return { label: 'Critical',  color: 'text-rose-600 dark:text-rose-400',   bg: 'bg-rose-50 dark:bg-rose-500/10',   bar: 'bg-rose-500' };
  if (score >= 0.65) return { label: 'High Risk', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10', bar: 'bg-orange-500' };
  if (score >= 0.50) return { label: 'At Risk',   color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10',   bar: 'bg-amber-400' };
  return { label: 'Healthy', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', bar: 'bg-emerald-500' };
};

const timeSince = (dateStr: string) => {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
};

interface ChurnIntelligenceProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const ChurnIntelligence: React.FC<ChurnIntelligenceProps> = ({ showToast }) => {
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [topChurners, setTopChurners] = useState<ChurnUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const data = await adminApi.getChurnOverview();
      setDistribution(data.distribution);
      setTopChurners(data.topChurners || []);
    } catch {
      showToast('Failed to load churn data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const total = distribution
    ? distribution.healthy + distribution.atRisk + distribution.highRisk + distribution.critical
    : 0;

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <TrendingDown size={24} className="text-rose-500" />
            Churn Intelligence
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            ML-powered churn risk scores and automated retention interventions
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 transition-all"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-500/5 dark:to-cyan-500/5 border border-teal-100 dark:border-teal-500/20 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Zap size={18} className="text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-teal-800 dark:text-teal-300 mb-1">How the engine works</p>
            <p className="text-xs text-teal-700 dark:text-teal-400 leading-relaxed">
              Every 6 hours the churn model scores all active users using 6 behavioural signals:
              days since last active, uncontacted matches, match rate, swipe volume decline,
              message inactivity, and notification engagement. Scores above 0.50 trigger
              automatic interventions — push-only (0.50), push+email (0.65), or free boost+email (0.80).
              Premium users get a 40% dampening factor applied to their score.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-teal-500 mb-4" />
          <p className="text-sm text-gray-400 dark:text-slate-500">Loading churn data...</p>
        </div>
      ) : (
        <>
          {/* Distribution Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: 'healthy',  label: 'Healthy',   value: distribution?.healthy  || 0, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/5', border: 'border-emerald-100 dark:border-emerald-500/20', bar: 'bg-emerald-500', score: '< 0.50' },
              { key: 'atRisk',   label: 'At Risk',   value: distribution?.atRisk   || 0, color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-500/5',   border: 'border-amber-100 dark:border-amber-500/20',   bar: 'bg-amber-400', score: '0.50–0.65' },
              { key: 'highRisk', label: 'High Risk', value: distribution?.highRisk || 0, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/5', border: 'border-orange-100 dark:border-orange-500/20', bar: 'bg-orange-500', score: '0.65–0.80' },
              { key: 'critical', label: 'Critical',  value: distribution?.critical || 0, color: 'text-rose-600 dark:text-rose-400',    bg: 'bg-rose-50 dark:bg-rose-500/5',    border: 'border-rose-100 dark:border-rose-500/20',    bar: 'bg-rose-500',   score: '≥ 0.80' },
            ].map(band => (
              <div key={band.key} className={`${band.bg} border ${band.border} rounded-2xl p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-black uppercase tracking-widest ${band.color}`}>{band.label}</span>
                  <span className="text-[10px] font-mono text-gray-400 dark:text-slate-500">{band.score}</span>
                </div>
                <p className={`text-3xl font-black ${band.color}`}>{band.value.toLocaleString()}</p>
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-gray-400 dark:text-slate-500 mb-1">
                    <span>{pct(band.value)}% of users</span>
                    <span>{band.value}</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${band.bar} rounded-full transition-all`} style={{ width: `${pct(band.value)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Risk breakdown bar */}
          {total > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={16} className="text-gray-400" />
                <span className="text-sm font-bold text-gray-900 dark:text-white">User Risk Distribution</span>
                <span className="text-xs text-gray-400 ml-auto">{total.toLocaleString()} total users</span>
              </div>
              <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
                {pct(distribution?.healthy || 0) > 0  && <div className="bg-emerald-500 transition-all" style={{ width: `${pct(distribution?.healthy  || 0)}%` }} title={`Healthy: ${pct(distribution?.healthy || 0)}%`} />}
                {pct(distribution?.atRisk   || 0) > 0  && <div className="bg-amber-400 transition-all"   style={{ width: `${pct(distribution?.atRisk    || 0)}%` }} title={`At Risk: ${pct(distribution?.atRisk || 0)}%`} />}
                {pct(distribution?.highRisk || 0) > 0  && <div className="bg-orange-500 transition-all"  style={{ width: `${pct(distribution?.highRisk   || 0)}%` }} title={`High Risk: ${pct(distribution?.highRisk || 0)}%`} />}
                {pct(distribution?.critical || 0) > 0  && <div className="bg-rose-500 transition-all"    style={{ width: `${pct(distribution?.critical   || 0)}%` }} title={`Critical: ${pct(distribution?.critical || 0)}%`} />}
              </div>
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                {[
                  { color: 'bg-emerald-500', label: 'Healthy', pct: pct(distribution?.healthy || 0) },
                  { color: 'bg-amber-400',   label: 'At Risk',   pct: pct(distribution?.atRisk   || 0) },
                  { color: 'bg-orange-500',  label: 'High Risk', pct: pct(distribution?.highRisk || 0) },
                  { color: 'bg-rose-500',    label: 'Critical',  pct: pct(distribution?.critical || 0) },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                    <span className="text-xs text-gray-500 dark:text-slate-400">{item.label} <strong className="text-gray-900 dark:text-white">{item.pct}%</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Churners Table */}
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-500" />
                <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">
                  Highest Risk Users
                </h2>
              </div>
              <span className="text-xs text-gray-400 dark:text-slate-500">Score ≥ 0.65 · sorted by risk</span>
            </div>

            {topChurners.length === 0 ? (
              <div className="flex flex-col items-center py-16">
                <CheckCircle size={28} className="text-emerald-500 mb-3" />
                <p className="text-sm font-bold text-gray-900 dark:text-white">All good!</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">No high-risk churners found right now.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-50 dark:border-slate-800">
                      {['User', 'Churn Score', 'Last Active', 'Intervention', 'Plan'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topChurners.map((u, i) => {
                      const band = riskBand(u.churnScore);
                      const tier = TIER_META[u.churnInterventionTier || 'none'] || TIER_META.none;
                      return (
                        <tr key={u._id} className={`border-b border-gray-50 dark:border-slate-800 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors ${i === topChurners.length - 1 ? 'border-b-0' : ''}`}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white text-xs font-black shrink-0">
                                {u.name.charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{u.name}</p>
                                <p className="text-xs text-gray-400 dark:text-slate-500">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-20">
                                <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className={`h-full ${band.bar} rounded-full`} style={{ width: `${Math.round(u.churnScore * 100)}%` }} />
                                </div>
                              </div>
                              <span className={`text-xs font-black font-mono ${band.color}`}>
                                {Math.round(u.churnScore * 100)}%
                              </span>
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${band.color} ${band.bg}`}>
                                {band.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-gray-500 dark:text-slate-400">
                            {timeSince(u.lastActive)}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${tier.color} ${tier.bg}`}>
                              {tier.icon} {tier.label}
                            </span>
                            {u.churnInterventionSentAt && (
                              <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                                {timeSince(u.churnInterventionSentAt)}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {u.premium?.isActive ? (
                              <span className="px-2 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-lg border border-amber-100 dark:border-amber-500/20 capitalize">
                                {u.premium.plan}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400 dark:text-slate-500">Free</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Intervention Guide */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                icon: <Bell size={20} className="text-blue-500" />,
                title: 'Tier 1 — Push Nudge',
                score: 'Score 0.50–0.65',
                desc: 'A subtle push notification: "You have new likes" or "Your profile is getting attention." Lightweight — fires often.',
                bg: 'bg-blue-50 dark:bg-blue-500/5',
                border: 'border-blue-100 dark:border-blue-500/20',
              },
              {
                icon: <Mail size={20} className="text-violet-500" />,
                title: 'Tier 2 — Push + Email',
                score: 'Score 0.65–0.80',
                desc: 'A re-engagement push plus a "We miss you" email. Both fire together for maximum recall.',
                bg: 'bg-violet-50 dark:bg-violet-500/5',
                border: 'border-violet-100 dark:border-violet-500/20',
              },
              {
                icon: <Gift size={20} className="text-amber-500" />,
                title: 'Tier 3 — Free Boost',
                score: 'Score ≥ 0.80',
                desc: 'A free 24-hour profile boost is granted + push + email. The boost flag is read on next login. Reserved for critical risk only.',
                bg: 'bg-amber-50 dark:bg-amber-500/5',
                border: 'border-amber-100 dark:border-amber-500/20',
              },
            ].map(tier => (
              <div key={tier.title} className={`${tier.bg} border ${tier.border} rounded-2xl p-5`}>
                <div className="flex items-center gap-2 mb-2">
                  {tier.icon}
                  <p className="text-sm font-black text-gray-900 dark:text-white">{tier.title}</p>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">{tier.score}</p>
                <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">{tier.desc}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ChurnIntelligence;
