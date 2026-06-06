import React, { useState, useCallback } from 'react';
import {
  ShieldOff, Search, Loader2, RefreshCw, CheckCircle,
  AlertTriangle, User, X, ShieldCheck, Clock,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';

interface RevokeVerificationProps {
  showToast?: (message: string, type: 'success' | 'error') => void;
}

const RevokeVerification: React.FC<RevokeVerificationProps> = ({ showToast }) => {
  const [search, setSearch]             = useState('');
  const [searching, setSearching]       = useState(false);
  const [results, setResults]           = useState<any[]>([]);
  const [searched, setSearched]         = useState(false);
  const [selected, setSelected]         = useState<any | null>(null);
  const [reason, setReason]             = useState('');
  const [revoking, setRevoking]         = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [revokedIds, setRevokedIds]     = useState<Set<string>>(new Set());

  const getAvatar = (u: any) =>
    u.photos?.[0]?.url || u.photos?.[0] ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'U')}&size=200&background=14b8a6&color=fff`;

  const handleSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    setSearched(false);
    setResults([]);
    setSelected(null);
    try {
      const data = await adminApi.getUsers({ search: search.trim(), limit: 20 });
      const users: any[] = data.users || data.data?.users || [];
      const verified = users.filter((u: any) => u.isVerified || u.verified);
      setResults(verified);
      setSearched(true);
    } catch (err: any) {
      showToast?.(err?.message || 'Search failed', 'error');
    } finally {
      setSearching(false);
    }
  }, [search, showToast]);

  const handleRevoke = async () => {
    if (!selected || !reason.trim()) return;
    setRevoking(true);
    try {
      const userId = selected._id || selected.id;
      await adminApi.revokeVerification(userId, reason.trim());
      setRevokedIds(prev => new Set([...prev, userId]));
      setResults(prev => prev.filter(u => (u._id || u.id) !== userId));
      setSelected(null);
      setReason('');
      setConfirmOpen(false);
      showToast?.(`Verified badge removed for ${selected.name}.`, 'success');
    } catch (err: any) {
      showToast?.(err?.message || 'Failed to revoke badge.', 'error');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Revoke Verified Badge
          </h1>
          <p className="text-gray-500 dark:text-slate-400 font-medium flex items-center gap-2 mt-0.5">
            <ShieldOff size={14} className="text-red-400" />
            Search for a verified user and remove their badge with a reason
          </p>
        </div>
        <div className="flex items-center px-4 py-2 bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20 rounded-xl">
          <ShieldOff size={15} className="text-red-500 mr-2" />
          <span className="text-[10px] font-black text-red-700 dark:text-red-400 uppercase tracking-widest">
            Admin Only
          </span>
        </div>
      </div>

      {/* ── Search Box ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
        <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-3">
          Search verified users by name or email
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Name or email address…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 transition"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !search.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
          >
            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Search
          </button>
        </div>
      </div>

      {/* ── Results ── */}
      {searched && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
          <h2 className="text-sm font-black text-gray-700 dark:text-slate-300 uppercase tracking-widest mb-4">
            Verified Users Found — {results.length}
          </h2>

          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <ShieldCheck size={40} className="text-gray-300 dark:text-slate-600 mb-4" />
              <p className="text-gray-500 dark:text-slate-400 font-semibold">No verified users match your search.</p>
              <p className="text-gray-400 dark:text-slate-500 text-sm mt-1">
                Either they are not verified or the name/email doesn't match.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map((u: any) => {
                const uid = u._id || u.id;
                const isSelected = selected && (selected._id || selected.id) === uid;
                return (
                  <div
                    key={uid}
                    onClick={() => setSelected(isSelected ? null : u)}
                    className={`relative flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-teal-400 bg-teal-50 dark:bg-teal-500/5'
                        : 'border-gray-100 dark:border-slate-800 hover:border-teal-200 dark:hover:border-teal-700'
                    }`}
                  >
                    <img
                      src={getAvatar(u)}
                      alt={u.name}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-gray-900 dark:text-white truncate">{u.name}</p>
                        <ShieldCheck size={14} className="text-teal-500 flex-shrink-0" />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{u.email}</p>
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 border border-teal-100 dark:border-teal-500/20 rounded-full px-2 py-0.5">
                        <CheckCircle size={9} /> Verified
                      </span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center">
                        <CheckCircle size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Revoke Panel ── */}
      {selected && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-red-200 dark:border-red-500/30 p-6 space-y-5">
          <div className="flex items-start gap-4">
            <img
              src={getAvatar(selected)}
              alt={selected.name}
              className="w-14 h-14 rounded-full object-cover flex-shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-black text-gray-900 dark:text-white">{selected.name}</p>
                <ShieldCheck size={16} className="text-teal-500" />
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400">{selected.email}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
              Reason for revoking badge <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Identity verification failed upon re-review, impersonation detected…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 transition resize-none"
            />
            {!reason.trim() && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> A reason is required before revoking.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              onClick={() => { setSelected(null); setReason(''); }}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-gray-600 dark:text-slate-300 hover:border-gray-400 transition"
            >
              <X size={14} /> Cancel
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={!reason.trim() || revoking}
              className="flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
            >
              <ShieldOff size={15} />
              Revoke Badge
            </button>
          </div>
        </div>
      )}

      {/* ── Confirmation Modal ── */}
      {confirmOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-2xl p-8 max-w-md w-full space-y-5 animate-fadeIn">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 dark:bg-red-500/10 mx-auto">
              <ShieldOff size={26} className="text-red-500" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1">Confirm Badge Revocation</h3>
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                You are about to remove the verified badge from{' '}
                <span className="font-bold text-gray-800 dark:text-white">{selected.name}</span>.
                This will notify them with the reason you provided.
              </p>
            </div>

            <div className="bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20 rounded-xl p-3">
              <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-widest mb-1">Reason</p>
              <p className="text-sm text-gray-700 dark:text-slate-300">{reason}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-gray-600 dark:text-slate-300 hover:border-gray-400 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
              >
                {revoking ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                {revoking ? 'Revoking…' : 'Yes, Revoke Badge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty idle state ── */}
      {!searched && !searching && (
        <div className="flex flex-col items-center justify-center min-h-[30vh] text-center py-16">
          <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-500/5 flex items-center justify-center mb-5">
            <ShieldOff size={36} className="text-red-400" />
          </div>
          <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">No Search Yet</h3>
          <p className="text-gray-500 dark:text-slate-400 max-w-sm">
            Search for a verified user above. Only users who currently hold the verified badge will appear.
          </p>
        </div>
      )}
    </div>
  );
};

export default RevokeVerification;
