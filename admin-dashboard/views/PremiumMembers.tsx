import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Crown, Loader2, RefreshCw, AlertCircle, Search, Apple, Smartphone, Globe, Shield,
  ChevronLeft, ChevronRight, X, Calendar, RotateCw, AlertTriangle, CheckCircle2, XCircle,
  Gift, Trash2, UserPlus, Clock,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';

type LookupUser = {
  _id: string;
  name?: string;
  email?: string;
  avatar?: string;
  premium?: { isActive?: boolean; plan?: string; source?: string | null; expiresAt?: string | null };
};

type PremiumFeatures = {
  unlimitedSwipes?: boolean; seeWhoLikesYou?: boolean; unlimitedRewinds?: boolean;
  boostPerMonth?: number; superLikesPerDay?: number; noAds?: boolean;
  advancedFilters?: boolean; readReceipts?: boolean; priorityMatches?: boolean;
  incognitoMode?: boolean;
};

type PremiumMember = {
  _id: string;
  name?: string;
  email?: string;
  avatar?: string;
  createdAt?: string;
  premium?: {
    isActive?: boolean;
    plan?: string;
    source?: 'ios' | 'android' | 'web' | 'admin' | null;
    productId?: string | null;
    receipt?: string | null;
    originalTransactionId?: string | null;
    purchaseToken?: string | null;
    environment?: 'Production' | 'Sandbox' | null;
    activatedAt?: string | null;
    restoredAt?: string | null;
    cancelledAt?: string | null;
    expiresAt?: string | null;
    autoRenewing?: boolean | null;
    lastEventType?: string | null;
    lastEventAt?: string | null;
    features?: PremiumFeatures;
  };
};

type Summary = {
  totalActive: number; ios: number; android: number; web: number;
  admin?: number;
  cancelledButActive: number; autoRenewOff: number;
  adminGrantsExpiringSoon?: number;
};

const SourceIcon: React.FC<{ source?: string | null; size?: number }> = ({ source, size = 14 }) => {
  if (source === 'ios') return <Apple size={size} className="text-slate-700 dark:text-slate-300" />;
  if (source === 'android') return <Smartphone size={size} className="text-emerald-600" />;
  if (source === 'web') return <Globe size={size} className="text-cyan-600" />;
  if (source === 'admin') return <Shield size={size} className="text-violet-600" />;
  return <Globe size={size} className="text-slate-400" />;
};

const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return '—'; }
};

const fmtDateTime = (s?: string | null) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); }
  catch { return '—'; }
};

const daysUntil = (s?: string | null): number | null => {
  if (!s) return null;
  const ms = new Date(s).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
};

const planLabel = (plan?: string | null, source?: string | null): string => {
  if (!plan || plan === 'free') return '—';
  if (plan === 'admin_grant' || source === 'admin') return 'Admin Grant';
  if (plan === 'day') return 'Daily';
  if (plan === 'week') return 'Weekly';
  if (plan === 'month') return 'Monthly';
  if (plan === 'year') return 'Yearly';
  return plan.charAt(0).toUpperCase() + plan.slice(1);
};

const PremiumMembers: React.FC = () => {
  const [members, setMembers] = useState<PremiumMember[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [source, setSource] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [autoRenew, setAutoRenew] = useState<string>('');
  const [selected, setSelected] = useState<PremiumMember | null>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getPremiumMembers({
        page, limit: 25, search: search || undefined,
        source: source || undefined,
        status: status || undefined,
        autoRenew: autoRenew || undefined,
      });
      if (res?.success) {
        setMembers(res.members || []);
        setSummary(res.summary || null);
        setTotal(res.pagination?.total || 0);
        setPages(res.pagination?.pages || 1);
      } else {
        setError(res?.message || 'Failed to load premium members.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load premium members.');
    } finally {
      setLoading(false);
    }
  }, [page, search, source, status, autoRenew]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, source, status, autoRenew]);

  const [revokeTarget, setRevokeTarget] = useState<PremiumMember | null>(null);

  const handleRevoke = async (m: PremiumMember, reason?: string) => {
    if (m.premium?.source && m.premium.source !== 'admin') {
      setToast({ kind: 'error', text: `Can't revoke a ${m.premium.source} subscription. Use the store cancel flow.` });
      return;
    }
    try {
      setRevokingId(m._id);
      const res = await adminApi.revokePremium(m._id, reason?.trim() || undefined);
      if (res?.success) {
        setToast({ kind: 'success', text: 'Premium revoked.' });
        fetchData(true);
      } else {
        setToast({ kind: 'error', text: res?.message || 'Failed to revoke.' });
      }
    } catch (err: any) {
      setToast({ kind: 'error', text: err?.message || 'Failed to revoke.' });
    } finally {
      setRevokingId(null);
    }
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (search) chips.push({ key: 'search', label: `Search: ${search}`, onClear: () => { setSearch(''); setSearchInput(''); } });
    if (source) chips.push({ key: 'source', label: `Source: ${source}`, onClear: () => setSource('') });
    if (status) chips.push({ key: 'status', label: `Status: ${status.replace(/_/g, ' ')}`, onClear: () => setStatus('') });
    if (autoRenew) chips.push({ key: 'auto', label: `Auto-renew: ${autoRenew}`, onClear: () => setAutoRenew('') });
    return chips;
  }, [search, source, status, autoRenew]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Premium Members</h1>
          <p className="text-gray-500 dark:text-slate-400 font-medium">
            Live subscription state synced from Apple & Google webhooks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGrant(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-sm"
          >
            <Gift size={15} />
            Grant Free Premium
          </button>
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 transition-all"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {toast && (
        <div className={`flex items-center gap-3 p-4 rounded-2xl text-sm font-semibold ${
          toast.kind === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
            : 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400'
        }`}>
          {toast.kind === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {toast.text}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl text-sm text-rose-700 dark:text-rose-400 font-semibold">
          <AlertCircle size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Active Total', val: summary?.totalActive ?? '—', icon: <Crown size={18} />, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
          { label: 'iOS', val: summary?.ios ?? '—', icon: <Apple size={18} />, color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-800' },
          { label: 'Android', val: summary?.android ?? '—', icon: <Smartphone size={18} />, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          { label: 'Admin Grants', val: summary?.admin ?? '—', icon: <Shield size={18} />, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-500/10' },
          { label: 'Cancel Pending', val: summary?.cancelledButActive ?? '—', icon: <AlertTriangle size={18} />, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10' },
          {
            label: 'Grants Expiring',
            val: summary?.adminGrantsExpiringSoon ?? '—',
            icon: <Clock size={18} />,
            color: (summary?.adminGrantsExpiringSoon ?? 0) > 0 ? 'text-rose-600' : 'text-rose-500',
            bg: (summary?.adminGrantsExpiringSoon ?? 0) > 0
              ? 'bg-rose-100 dark:bg-rose-500/20 ring-2 ring-rose-300 dark:ring-rose-500/40'
              : 'bg-rose-50 dark:bg-rose-500/10',
            onClick: (summary?.adminGrantsExpiringSoon ?? 0) > 0 ? () => { setStatus('admin_expiring'); setSource(''); } : undefined,
            tooltip: 'Admin-granted comps expiring within 7 days',
          },
        ].map((s, i) => {
          const clickable = !!(s as any).onClick;
          return (
            <button
              key={i}
              type="button"
              onClick={(s as any).onClick}
              disabled={!clickable}
              title={(s as any).tooltip}
              className={`bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 flex items-center gap-3 text-left ${
                clickable ? 'hover:border-rose-300 cursor-pointer transition-all' : 'cursor-default'
              }`}
            >
              <div className={`p-2.5 rounded-xl ${s.bg} ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{s.label}</p>
                <p className="text-lg font-black dark:text-white">{s.val}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <form onSubmit={onSearchSubmit} className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, transaction ID, or purchase token…"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-400"
            />
          </form>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white"
          >
            <option value="">All Sources</option>
            <option value="ios">iOS</option>
            <option value="android">Android</option>
            <option value="web">Web</option>
            <option value="admin">Admin Granted</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white"
          >
            <option value="">All Statuses</option>
            <option value="expiring_soon">Expiring in 7 days</option>
            <option value="admin_expiring">Admin grants expiring</option>
            <option value="cancelled_active">Cancelled (still active)</option>
            <option value="expired">Expired</option>
          </select>
          <select
            value={autoRenew}
            onChange={(e) => setAutoRenew(e.target.value)}
            className="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white"
          >
            <option value="">Any Renewal</option>
            <option value="true">Auto-renew On</option>
            <option value="false">Auto-renew Off</option>
          </select>
        </div>
        {filterChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filterChips.map(c => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-bold rounded-full"
              >
                {c.label}
                <button onClick={c.onClear} className="hover:opacity-70"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
        {loading && members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin text-cyan-500 mb-4" />
            <span className="text-sm font-bold text-slate-400">Loading premium members…</span>
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 opacity-60">
            <Crown size={36} className="text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-400">No premium members match your filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800/50">
                  <tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Source / Plan</th>
                    <th className="px-5 py-3">Expires</th>
                    <th className="px-5 py-3">Auto-Renew</th>
                    <th className="px-5 py-3">Last Event</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {members.map(m => {
                    const days = daysUntil(m.premium?.expiresAt);
                    const expiringSoon = days !== null && days <= 7 && days >= 0;
                    const cancelled = !!m.premium?.cancelledAt;
                    return (
                      <tr key={m._id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name || m.email || 'U')}&background=14b8a6&color=fff&bold=true`}
                              className="h-9 w-9 rounded-xl object-cover"
                              alt=""
                            />
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 dark:text-white truncate">{m.name || '—'}</p>
                              <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <SourceIcon source={m.premium?.source} />
                            <span className="text-xs font-bold text-gray-700 dark:text-slate-200 capitalize">
                              {m.premium?.source || 'unknown'}
                            </span>
                            <span className="text-[10px] text-slate-400">·</span>
                            <span className="text-xs font-bold text-teal-600 capitalize">
                              {planLabel(m.premium?.plan, m.premium?.source)}
                            </span>
                            {m.premium?.environment === 'Sandbox' && (
                              <span className="ml-1 px-1.5 py-0.5 text-[9px] font-black uppercase bg-amber-100 text-amber-700 rounded">Sandbox</span>
                            )}
                          </div>
                          {m.premium?.productId && (
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[220px]">{m.premium.productId}</p>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <p className={`text-xs font-bold ${expiringSoon ? 'text-orange-600' : 'text-gray-700 dark:text-slate-200'}`}>
                            {fmtDate(m.premium?.expiresAt)}
                          </p>
                          {days !== null && days >= 0 && (
                            <p className="text-[10px] text-slate-400">in {days} day{days === 1 ? '' : 's'}</p>
                          )}
                          {days !== null && days < 0 && (
                            <p className="text-[10px] text-rose-500">expired {Math.abs(days)}d ago</p>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {m.premium?.autoRenewing === true ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                              <RotateCw size={10} /> On
                            </span>
                          ) : m.premium?.autoRenewing === false ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300">
                              <XCircle size={10} /> Off
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 uppercase">unknown</span>
                          )}
                          {cancelled && (
                            <p className="text-[10px] text-orange-500 mt-1">cancel pending</p>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-xs font-bold text-gray-700 dark:text-slate-200 truncate max-w-[180px]">
                            {m.premium?.lastEventType || '—'}
                          </p>
                          <p className="text-[10px] text-slate-400">{fmtDateTime(m.premium?.lastEventAt)}</p>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelected(m)}
                              className="text-xs font-bold text-teal-600 hover:text-teal-700"
                            >
                              Details
                            </button>
                            {(!m.premium?.source || m.premium?.source === 'admin') && (
                              <button
                                onClick={() => setRevokeTarget(m)}
                                disabled={revokingId === m._id}
                                title="Revoke admin-granted premium"
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-40"
                              >
                                {revokingId === m._id
                                  ? <Loader2 size={13} className="animate-spin" />
                                  : <Trash2 size={13} />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-slate-800">
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Page {page} of {pages} · {total} member{total === 1 ? '' : 's'}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                  disabled={page >= pages || loading}
                  className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-teal-600">Premium Member</p>
                <h2 className="text-lg font-black dark:text-white">{selected.name || '—'}</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400">{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <Field label="Source" value={
                <span className="inline-flex items-center gap-2">
                  <SourceIcon source={selected.premium?.source} size={14} />
                  <span className="capitalize">{selected.premium?.source || 'unknown'}</span>
                  {selected.premium?.environment === 'Sandbox' && (
                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-amber-100 text-amber-700 rounded">Sandbox</span>
                  )}
                </span>
              } />
              <Field label="Plan" value={planLabel(selected.premium?.plan, selected.premium?.source)} />
              <Field label="Product ID" mono value={selected.premium?.productId || '—'} />
              <Field label="Activated" icon={<Calendar size={12} />} value={fmtDateTime(selected.premium?.activatedAt)} />
              <Field label="Restored" icon={<Calendar size={12} />} value={fmtDateTime(selected.premium?.restoredAt)} />
              <Field label="Expires" icon={<Calendar size={12} />} value={fmtDateTime(selected.premium?.expiresAt)} />
              <Field label="Cancelled" icon={<Calendar size={12} />} value={fmtDateTime(selected.premium?.cancelledAt)} />
              <Field label="Auto-Renew" value={
                selected.premium?.autoRenewing === true ? <span className="text-emerald-600 font-bold">On</span> :
                selected.premium?.autoRenewing === false ? <span className="text-rose-600 font-bold">Off</span> :
                <span className="text-slate-400">Unknown</span>
              } />
              <Field label="Last Event" value={
                <div>
                  <p>{selected.premium?.lastEventType || '—'}</p>
                  <p className="text-[10px] text-slate-400">{fmtDateTime(selected.premium?.lastEventAt)}</p>
                </div>
              } />
              {selected.premium?.originalTransactionId && (
                <Field label="Apple Original Transaction ID" mono value={selected.premium.originalTransactionId} />
              )}
              {selected.premium?.purchaseToken && (
                <Field label="Google Purchase Token" mono value={selected.premium.purchaseToken} />
              )}

              <div className="pt-3 border-t border-gray-100 dark:border-slate-800">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Active Features</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(selected.premium?.features || {}).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1.5 text-xs">
                      {v ? (
                        <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle size={12} className="text-slate-300 shrink-0" />
                      )}
                      <span className={typeof v === 'boolean' ? (v ? 'text-gray-700 dark:text-slate-200' : 'text-slate-400') : 'text-gray-700 dark:text-slate-200'}>
                        {k}{typeof v === 'number' ? `: ${v}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showGrant && (
        <GrantPremiumModal
          onClose={() => setShowGrant(false)}
          onGranted={(msg) => {
            setShowGrant(false);
            setToast({ kind: 'success', text: msg });
            fetchData(true);
          }}
          onError={(msg) => setToast({ kind: 'error', text: msg })}
        />
      )}

      {revokeTarget && (
        <RevokePremiumModal
          member={revokeTarget}
          revoking={revokingId === revokeTarget._id}
          onClose={() => setRevokeTarget(null)}
          onConfirm={(reason) => {
            handleRevoke(revokeTarget, reason);
            setRevokeTarget(null);
          }}
        />
      )}
    </div>
  );
};

const GrantPremiumModal: React.FC<{
  onClose: () => void;
  onGranted: (msg: string) => void;
  onError: (msg: string) => void;
}> = ({ onClose, onGranted, onError }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LookupUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<LookupUser | null>(null);
  const [duration, setDuration] = useState<number>(30);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Debounced lookup
  useEffect(() => {
    if (picked) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await adminApi.lookupUsers(q);
        if (!cancelled && res?.success) setResults(res.users || []);
      } catch (_) {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, picked]);

  const submit = async () => {
    if (!picked) return;
    if (!duration || duration < 1) { onError('Duration must be at least 1 day.'); return; }
    try {
      setSubmitting(true);
      const res = await adminApi.grantPremium(picked._id, {
        durationDays: duration,
        reason: reason.trim() || undefined,
      });
      if (res?.success) {
        onGranted(res.message || `Premium granted to ${picked.name || picked.email}`);
      } else {
        onError(res?.message || 'Failed to grant premium.');
      }
    } catch (err: any) {
      onError(err?.message || 'Failed to grant premium.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
              <Gift size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black dark:text-white">Grant Free Premium</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">Comp a user with paid features (VIP, refund credit, partner, etc.)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Step 1: pick user */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1">
              <UserPlus size={11} /> User
            </p>
            {picked ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20">
                <img
                  src={picked.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(picked.name || picked.email || 'U')}&background=14b8a6&color=fff&bold=true`}
                  className="h-9 w-9 rounded-xl object-cover"
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white truncate">{picked.name || '—'}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{picked.email}</p>
                  {picked.premium?.isActive && (
                    <p className="text-[10px] mt-0.5 text-amber-600 dark:text-amber-400 font-bold">
                      Already premium ({planLabel(picked.premium.plan, picked.premium.source)} via {picked.premium.source || 'unknown'}) — granting will extend their expiry date.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setPicked(null); setQuery(''); setResults([]); }}
                  className="text-xs font-bold text-rose-600 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-400"
                  />
                  {searching && (
                    <Loader2 size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  )}
                </div>
                {results.length > 0 && (
                  <div className="mt-2 max-h-56 overflow-y-auto border border-gray-100 dark:border-slate-800 rounded-xl divide-y divide-gray-100 dark:divide-slate-800">
                    {results.map((u) => (
                      <button
                        key={u._id}
                        onClick={() => setPicked(u)}
                        className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <img
                          src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || u.email || 'U')}&background=14b8a6&color=fff&bold=true`}
                          className="h-8 w-8 rounded-lg object-cover"
                          alt=""
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{u.name || '—'}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{u.email}</p>
                        </div>
                        {u.premium?.isActive && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-black uppercase">
                            {planLabel(u.premium.plan, u.premium.source)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="mt-2 text-xs text-slate-400">No users found.</p>
                )}
              </>
            )}
          </div>

          {/* Step 2: duration (single Premium plan — duration is the only knob) */}
          <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 flex items-start gap-2">
            <Crown size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Emorii Premium</p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70">
                All paid features unlocked: unlimited likes, see who likes you, 10 super-likes/day, incognito mode, advanced filters, ad-free, and more.
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Duration (days)</p>
            <div className="flex items-center gap-2 flex-wrap">
              {[7, 30, 90, 180, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    duration === d
                      ? 'bg-teal-500 text-white border-teal-500'
                      : 'bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:border-teal-300'
                  }`}
                >
                  {d === 7 ? '1 wk' : d === 30 ? '1 mo' : d === 90 ? '3 mo' : d === 180 ? '6 mo' : '1 yr'}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={3650}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
                className="w-24 px-3 py-1.5 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg text-xs text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Reason (optional, for audit log)</p>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Influencer comp, refund credit, beta tester…"
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-400"
            />
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!picked || submitting || !duration}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white disabled:opacity-50 hover:opacity-90"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
            Grant Premium for {duration}d
          </button>
        </div>
      </div>
    </div>
  );
};

const RevokePremiumModal: React.FC<{
  member: PremiumMember;
  revoking: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}> = ({ member, revoking, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-500/10 text-rose-500">
              <Trash2 size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black dark:text-white">Revoke Premium</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {member.name || member.email}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-slate-300">
            This will immediately remove admin-granted premium access for this user. Store subscriptions (Apple/Google) are not affected.
          </p>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Reason (optional, for audit log)</p>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Trial ended, abuse, manual correction…"
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-400"
              autoFocus
            />
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={revoking}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-50"
          >
            {revoking ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Revoke Premium
          </button>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: React.ReactNode; mono?: boolean; icon?: React.ReactNode }> = ({ label, value, mono, icon }) => (
  <div>
    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 flex items-center gap-1">
      {icon}{label}
    </p>
    <div className={`text-sm text-gray-900 dark:text-slate-100 ${mono ? 'font-mono break-all' : 'font-medium'}`}>
      {value}
    </div>
  </div>
);

export default PremiumMembers;
