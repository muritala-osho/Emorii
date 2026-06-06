import React, { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import {
  Gavel, Clock, CheckCircle, XCircle, User, Mail, Calendar,
  AlertTriangle, MessageSquare, Loader2, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Appeal {
  _id: string;
  name: string;
  email: string;
  banned: boolean;
  suspended: boolean;
  bannedAt?: string;
  suspendedUntil?: string;
  appeal: {
    status: 'pending' | 'approved' | 'rejected' | 'none';
    message: string;
    submittedAt: string;
    reviewedAt?: string;
    adminResponse?: string;
  };
}

interface AppealCardProps {
  appeal: Appeal;
  onReview: (userId: string, action: 'approve' | 'reject', response: string) => Promise<void>;
  theme: 'light' | 'dark';
}

const AppealCard: React.FC<AppealCardProps> = ({ appeal, onReview, theme }) => {
  const [expanded, setExpanded] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isDark = theme === 'dark';

  const handleSubmit = async () => {
    if (!action) return;
    setSubmitting(true);
    await onReview(appeal._id, action, response);
    setSubmitting(false);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
    } shadow-sm hover:shadow-md`}>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white font-black text-lg shrink-0">
              {appeal.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {appeal.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Mail size={12} className="text-gray-400" />
                <span className="text-xs text-gray-400">{appeal.email}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {appeal.banned && (
              <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-lg border border-rose-200 dark:border-rose-500/20">
                Banned
              </span>
            )}
            {appeal.suspended && !appeal.banned && (
              <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-lg border border-amber-200 dark:border-amber-500/20">
                Suspended
              </span>
            )}
            <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-500/20 flex items-center gap-1">
              <Clock size={11} /> Pending Review
            </span>
          </div>
        </div>

        <div className={`mt-4 p-4 rounded-xl text-sm leading-relaxed ${
          isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-50 text-gray-700'
        }`}>
          <div className="flex items-center gap-1.5 mb-2">
            <MessageSquare size={13} className="text-teal-500" />
            <span className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
              Appeal Message
            </span>
          </div>
          <p className="line-clamp-3">{appeal.appeal.message}</p>
          {appeal.appeal.message.length > 200 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 mt-2 text-teal-500 hover:text-teal-600 text-xs font-semibold transition-colors"
            >
              {expanded ? <><ChevronUp size={14} /> Show less</> : <><ChevronDown size={14} /> Read full message</>}
            </button>
          )}
        </div>

        {expanded && (
          <div className={`mt-2 p-4 rounded-xl text-sm leading-relaxed ${
            isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-50 text-gray-700'
          }`}>
            <p>{appeal.appeal.message}</p>
          </div>
        )}

        <div className="flex items-center gap-3 mt-4">
          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-gray-400" />
            <span className="text-xs text-gray-400">
              Submitted {formatDate(appeal.appeal.submittedAt)}
            </span>
          </div>
          {appeal.bannedAt && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-rose-400" />
              <span className="text-xs text-gray-400">
                Banned {formatDate(appeal.bannedAt)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={`border-t px-6 py-5 ${isDark ? 'border-slate-800 bg-slate-800/40' : 'border-gray-100 bg-gray-50/80'}`}>
        <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
          Admin Decision
        </p>

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setAction('approve')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
              action === 'approve'
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : isDark
                  ? 'border-slate-700 text-slate-300 hover:border-emerald-500 hover:text-emerald-400'
                  : 'border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-600'
            }`}
          >
            <CheckCircle size={16} />
            Approve — Restore Access
          </button>
          <button
            onClick={() => setAction('reject')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
              action === 'reject'
                ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/20'
                : isDark
                  ? 'border-slate-700 text-slate-300 hover:border-rose-500 hover:text-rose-400'
                  : 'border-gray-200 text-gray-600 hover:border-rose-400 hover:text-rose-600'
            }`}
          >
            <XCircle size={16} />
            Reject Appeal
          </button>
        </div>

        {action && (
          <div className="space-y-3 animate-fadeIn">
            <textarea
              value={response}
              onChange={e => setResponse(e.target.value)}
              placeholder={
                action === 'approve'
                  ? 'Optional: Add a note to include in the approval email...'
                  : 'Required: Explain why this appeal was rejected...'
              }
              rows={3}
              className={`w-full px-4 py-3 rounded-xl text-sm resize-none outline-none border focus:ring-2 focus:ring-teal-500 transition-all ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
              }`}
            />
            {action === 'reject' && !response.trim() && (
              <p className="text-xs text-amber-500 flex items-center gap-1">
                <AlertTriangle size={12} /> A reason is required when rejecting an appeal.
              </p>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting || (action === 'reject' && !response.trim())}
              className={`w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 ${
                action === 'approve'
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20'
              }`}
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> Processing...</>
              ) : (
                <><Gavel size={16} /> Confirm {action === 'approve' ? 'Approval' : 'Rejection'}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface AppealsProps {
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const Appeals: React.FC<AppealsProps> = ({ showToast }) => {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isDark = document.documentElement.classList.contains('dark');

  const fetchAppeals = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await adminApi.getAppeals();
      setAppeals(data.appeals || []);
    } catch {
      showToast('Failed to load appeals', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAppeals(); }, []);

  const handleReview = async (userId: string, action: 'approve' | 'reject', response: string) => {
    try {
      await adminApi.reviewAppeal(userId, action, response);
      showToast(
        action === 'approve'
          ? 'Appeal approved — account restored and email sent.' : 'Appeal rejected — user notified.',
        'success'
      );
      setAppeals(prev => prev.filter(a => a._id !== userId));
    } catch {
      showToast('Failed to process appeal. Please try again.', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            Appeals Queue
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Review ban and suspension appeals submitted by users
          </p>
        </div>
        <button
          onClick={() => fetchAppeals(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 transition-all"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Appeals', value: appeals.length, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/5', border: 'border-blue-100 dark:border-blue-500/20' },
          { label: 'Ban Appeals', value: appeals.filter(a => a.banned).length, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/5', border: 'border-rose-100 dark:border-rose-500/20' },
          { label: 'Suspension Appeals', value: appeals.filter(a => a.suspended && !a.banned).length, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/5', border: 'border-amber-100 dark:border-amber-500/20' },
        ].map(stat => (
          <div key={stat.label} className={`${stat.bg} border ${stat.border} rounded-2xl p-5`}>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest mt-1">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-teal-500 mb-4" />
          <p className="text-sm text-gray-400 dark:text-slate-500">Loading appeals...</p>
        </div>
      ) : appeals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800">
          <div className="h-16 w-16 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle size={28} className="text-emerald-500" />
          </div>
          <h3 className="text-lg font-black text-gray-900 dark:text-white mb-2">All Caught Up!</h3>
          <p className="text-sm text-gray-400 dark:text-slate-500 text-center max-w-xs">
            There are no pending appeals to review right now. New submissions will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {appeals.map(appeal => (
            <AppealCard
              key={appeal._id}
              appeal={appeal}
              onReview={handleReview}
              theme={isDark ? 'dark' : 'light'}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Appeals;
