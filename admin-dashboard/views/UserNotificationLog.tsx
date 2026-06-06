import React, { useEffect, useState, useCallback } from 'react';
import { Mail, Smartphone, CheckCircle2, XCircle, Loader2, ChevronLeft, ChevronRight, Inbox, AlertTriangle } from 'lucide-react';
import { adminApi } from '../services/adminApi';

interface NotificationLogItem {
  _id: string;
  channel: 'email' | 'push' | 'inapp' | 'socket';
  type: string;
  subject: string;
  body: string;
  status: 'sent' | 'delivered' | 'opened' | 'failed' | 'bounced' | 'suppressed';
  providerId: string | null;
  errorMessage: string | null;
  recipientEmail?: string | null;
  recipientTokenTail?: string | null;
  createdAt: string;
  meta?: any;
}

interface Stats {
  email: { sent: number; failed: number };
  push: { sent: number; failed: number };
  total: number;
}

interface Props {
  userId: string;
  userEmail?: string | null;
}

const formatTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const prettyType = (t: string) =>
  t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const StatusBadge: React.FC<{ status: NotificationLogItem['status'] }> = ({ status }) => {
  const map: Record<string, string> = {
    sent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    opened: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    failed: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    bounced: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    suppressed: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${map[status] || map.sent}`}>
      {status}
    </span>
  );
};

const ChannelIcon: React.FC<{ channel: string }> = ({ channel }) => {
  if (channel === 'push') {
    return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400"><Smartphone size={14} /></span>;
  }
  return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400"><Mail size={14} /></span>;
};

const UserNotificationLog: React.FC<Props> = ({ userId, userEmail }) => {
  const [items, setItems] = useState<NotificationLogItem[]>([]);
  const [stats, setStats] = useState<Stats>({ email: { sent: 0, failed: 0 }, push: { sent: 0, failed: 0 }, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [channel, setChannel] = useState<'all' | 'email' | 'push'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opts: any = { page, limit: 25 };
      if (channel !== 'all') opts.channel = channel;
      const data = await adminApi.getUserNotifications(userId, opts);
      setItems(data.items || []);
      setStats(data.stats || { email: { sent: 0, failed: 0 }, push: { sent: 0, failed: 0 }, total: 0 });
      setPages(data.pages || 1);
    } catch (e: any) {
      setError(e?.message || 'Failed to load notification history');
    } finally {
      setLoading(false);
    }
  }, [userId, page, channel]);

  useEffect(() => { load(); }, [load]);

  const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number | string; sub?: string; tone?: 'good' | 'bad' | 'neutral' }> = ({ icon, label, value, sub, tone = 'neutral' }) => {
    const toneMap = {
      good: 'text-emerald-600 dark:text-emerald-400',
      bad: 'text-rose-600 dark:text-rose-400',
      neutral: 'text-slate-700 dark:text-slate-200',
    };
    return (
      <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
        </div>
        <p className={`text-2xl font-black ${toneMap[tone]}`}>{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Inbox size={12} className="text-slate-400" />} label="Total Sent" value={stats.total} />
        <StatCard icon={<Mail size={12} className="text-sky-500" />} label="Emails" value={stats.email.sent} sub={`${stats.email.failed} failed`} tone="good" />
        <StatCard icon={<Smartphone size={12} className="text-violet-500" />} label="Push" value={stats.push.sent} sub={`${stats.push.failed} failed`} tone="good" />
        <StatCard icon={<AlertTriangle size={12} className="text-rose-500" />} label="Failures" value={(stats.email.failed || 0) + (stats.push.failed || 0)} tone={(stats.email.failed + stats.push.failed) > 0 ? 'bad' : 'neutral'} />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          {(['all', 'email', 'push'] as const).map((c) => (
            <button
              key={c}
              onClick={() => { setChannel(c); setPage(1); }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                channel === c
                  ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30'
                  : 'bg-gray-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
        {userEmail && (
          <p className="text-[11px] text-slate-400 truncate max-w-xs">
            <Mail size={11} className="inline mr-1" />
            {userEmail}
          </p>
        )}
      </div>

      {loading && (
        <div className="py-16 flex items-center justify-center text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading notification history…
        </div>
      )}

      {error && !loading && (
        <div className="p-5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-2xl text-rose-700 dark:text-rose-300 text-sm">
          <strong>Couldn't load:</strong> {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="py-16 text-center">
          <Inbox size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No notifications sent yet</p>
          <p className="text-xs text-slate-400 mt-1">Future emails and push notifications to this user will appear here.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
            {items.map((item) => {
              const isExpanded = expandedId === item._id;
              const isFail = item.status === 'failed' || item.status === 'bounced';
              return (
                <div
                  key={item._id}
                  className={`border-b border-gray-100 dark:border-slate-800 last:border-b-0 ${isFail ? 'bg-rose-50/40 dark:bg-rose-500/5' : 'bg-white dark:bg-slate-900'}`}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item._id)}
                    className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-all text-left"
                  >
                    <ChannelIcon channel={item.channel} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{prettyType(item.type)}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                        {item.subject || <span className="italic text-slate-400">(no subject)</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatTime(item.createdAt)}</p>
                      {isFail
                        ? <XCircle size={14} className="text-rose-500 inline mt-1" />
                        : <CheckCircle2 size={14} className="text-emerald-500 inline mt-1" />
                      }
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 bg-gray-50 dark:bg-slate-800/40 border-t border-gray-100 dark:border-slate-800">
                      {item.body && (
                        <div className="mb-3">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Body</p>
                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-xl border border-gray-100 dark:border-slate-700">
                            {item.body}
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <p className="font-black text-slate-400 uppercase tracking-widest mb-0.5">Channel</p>
                          <p className="text-slate-600 dark:text-slate-300 capitalize">{item.channel}</p>
                        </div>
                        {item.providerId && (
                          <div>
                            <p className="font-black text-slate-400 uppercase tracking-widest mb-0.5">Provider ID</p>
                            <p className="font-mono text-[10px] text-slate-600 dark:text-slate-300 break-all">{item.providerId}</p>
                          </div>
                        )}
                        {item.recipientEmail && (
                          <div>
                            <p className="font-black text-slate-400 uppercase tracking-widest mb-0.5">Recipient</p>
                            <p className="text-slate-600 dark:text-slate-300 break-all">{item.recipientEmail}</p>
                          </div>
                        )}
                        {item.recipientTokenTail && (
                          <div>
                            <p className="font-black text-slate-400 uppercase tracking-widest mb-0.5">Device Token</p>
                            <p className="font-mono text-slate-600 dark:text-slate-300">…{item.recipientTokenTail}</p>
                          </div>
                        )}
                      </div>
                      {item.errorMessage && (
                        <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl">
                          <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Error</p>
                          <p className="text-xs text-rose-700 dark:text-rose-300 font-mono break-all">{item.errorMessage}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-400">Page {page} of {pages} · {stats.total} total</p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-1"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-1"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UserNotificationLog;
