import React, { useState, useEffect } from 'react';
import {
  CheckCircle, XCircle, Eye, Loader2, AlertTriangle,
  RefreshCw, Shield, AlertCircle, ShieldAlert,
} from 'lucide-react';
import { FlaggedContent } from '../types';
import { adminApi } from '../services/adminApi';

interface Props {
  showToast?: (message: string, type: 'success' | 'error') => void;
}

const typeLabel: Record<FlaggedContent['type'], string> = {
  profile_photo: 'Profile Photo',
  story: 'Story',
  message_image: 'Message Image',
  safety_bypass: 'Safety Warning Bypassed',
};

const statusColors: Record<FlaggedContent['status'], string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
};

const ContentModeration: React.FC<Props> = ({ showToast }) => {
  const [items, setItems] = useState<FlaggedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | FlaggedContent['status']>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getFlaggedContent();
      if (res?.success) {
        setItems(res.content || []);
      } else {
        setError('Failed to load flagged content.');
        setItems([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not reach the backend.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadContent(); }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionLoading(id + action);
    try {
      await adminApi.moderateContent(id, action);
      setItems(prev =>
        prev.map(item =>
          item.id === id ? { ...item, status: action === 'approve' ? 'approved' : 'rejected' } : item,
        ),
      );
      showToast?.(action === 'approve' ? 'Content approved and kept.' : 'Content rejected and removed.', 'success');
    } catch (err: any) {
      showToast?.(err?.message || 'Action failed. Try again.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  const counts = {
    all: items.length,
    pending: items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Content Moderation</h1>
          <p className="text-gray-500 dark:text-slate-400 font-medium mt-1">
            Review AI-flagged and user-reported content
          </p>
        </div>
        <button
          onClick={loadContent}
          className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 transition-all shadow-sm"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl text-sm text-rose-700 dark:text-rose-400">
          <AlertCircle size={16} className="shrink-0" />
          <span className="font-medium">{error}</span>
          <button onClick={loadContent} className="ml-auto underline text-xs">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`p-5 rounded-2xl border text-left transition-all shadow-sm ${
              filter === s
                ? 'bg-teal-600 text-white border-teal-600 shadow-lg shadow-teal-500/20'
                : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-teal-300'
            }`}
          >
            <p className={`text-2xl font-black mb-1 ${filter === s ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
              {counts[s]}
            </p>
            <p className={`text-xs font-bold uppercase tracking-widest capitalize ${filter === s ? 'text-teal-100' : 'text-gray-500 dark:text-slate-400'}`}>
              {s === 'all' ? 'Total Flagged' : s}
            </p>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800">
          <Loader2 size={32} className="animate-spin text-teal-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800">
          <Shield size={40} className="text-teal-300 mb-3" />
          <p className="text-gray-500 dark:text-slate-400 font-semibold">
            {error ? 'Failed to load content' : 'No content in this category'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(item => (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-all group"
            >
              {item.type === 'safety_bypass' ? (
                <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-100 dark:border-amber-500/20 flex items-center gap-3">
                  <ShieldAlert size={28} className="text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Safety Alert</p>
                    <p className="text-[10px] text-amber-500 dark:text-amber-400/70 mt-0.5">
                      {item.severity === 'high' ? 'High risk' : 'Medium risk'} bypass detected
                    </p>
                  </div>
                  <div className="ml-auto">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${statusColors[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-slate-800">
                  <img
                    src={item.imageUrl || ''}
                    alt="flagged"
                    className={`w-full h-full object-cover transition-all duration-300 ${item.status === 'pending' ? 'blur-sm group-hover:blur-0' : ''}`}
                  />
                  {item.status === 'pending' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:opacity-0 transition-opacity pointer-events-none">
                      <div className="text-white text-center">
                        <Eye size={22} className="mx-auto mb-1" />
                        <span className="text-xs font-bold">Hover to preview</span>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-3 right-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${statusColors[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  {item.aiConfidence !== undefined && (
                    <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                      <AlertTriangle size={11} className="text-amber-400" />
                      <span className="text-[10px] font-black text-white">AI: {item.aiConfidence}%</span>
                    </div>
                  )}
                </div>
              )}

              <div className="p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <img src={item.userAvatar || ''} alt={item.userName} className="h-8 w-8 rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.userName)}&background=14b8a6&color=fff`; }} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{item.userName}</p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider">{typeLabel[item.type] || item.type}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-3 font-medium">{item.reason}</p>
                {item.type === 'safety_bypass' && item.contentPreview && (
                  <p className="text-[11px] text-gray-400 dark:text-slate-500 mb-3 italic bg-gray-50 dark:bg-slate-800 rounded-lg px-3 py-2 line-clamp-2">{item.contentPreview}</p>
                )}

                {item.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(item.id, 'approve')}
                      disabled={actionLoading !== null}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all disabled:opacity-50"
                    >
                      {actionLoading === item.id + 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                      {item.type === 'safety_bypass' ? 'Dismiss' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleAction(item.id, 'reject')}
                      disabled={actionLoading !== null}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 transition-all disabled:opacity-50"
                    >
                      {actionLoading === item.id + 'reject' ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                      {item.type === 'safety_bypass' ? 'Suspend User' : 'Remove'}
                    </button>
                  </div>
                )}
                {item.status !== 'pending' && (
                  <div className={`text-center py-2.5 rounded-xl text-xs font-bold ${statusColors[item.status]}`}>
                    {item.status === 'approved' ? '✓ Dismissed' : '✗ Action Taken'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContentModeration;
