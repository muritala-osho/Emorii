import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, ShieldAlert, UserCheck, MessageSquare, X, AlertCircle, ChevronRight, RefreshCw } from 'lucide-react';
import { adminApi } from '../services/adminApi';

interface NotifItem {
  id: string;
  type: 'report' | 'verification' | 'ticket';
  title: string;
  detail: string;
  time: string;
  urgent?: boolean;
}

interface NotificationCenterProps {
  onNavigate: (tab: string) => void;
}

const TYPE_CONFIG = {
  report:       { icon: <ShieldAlert size={14} />,  color: 'text-rose-500',    bg: 'bg-rose-50 dark:bg-rose-500/10',    label: 'Safety Report' },
  verification: { icon: <UserCheck size={14} />,    color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-500/10',  label: 'ID Verification' },
  ticket:       { icon: <MessageSquare size={14} />, color: 'text-indigo-500',  bg: 'bg-indigo-50 dark:bg-indigo-500/10', label: 'Support Ticket' },
};

const NotificationCenter: React.FC<NotificationCenterProps> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [counts, setCounts] = useState({ reports: 0, verifications: 0, tickets: 0 });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const totalBadge = counts.reports + counts.verifications + counts.tickets;

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [reportsRes, verificationsRes, ticketsRes] = await Promise.allSettled([
        adminApi.getReports('pending'),
        adminApi.getVerifications(),
        adminApi.getAllSupportTickets({ status: 'open' }),
      ]);

      const notifs: NotifItem[] = [];
      let rCount = 0, vCount = 0, tCount = 0;

      if (reportsRes.status === 'fulfilled' && reportsRes.value?.success) {
        const reports: any[] = reportsRes.value.reports || [];
        rCount = reports.length;
        reports.slice(0, 3).forEach((r: any) => {
          notifs.push({
            id: r._id,
            type: 'report',
            title: `${r.reason || 'Safety'} report`,
            detail: `Reported: ${r.reportedUser?.name || 'Unknown user'}`,
            time: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Recent',
            urgent: r.reason === 'harassment' || r.reason === 'scam',
          });
        });
      }

      if (verificationsRes.status === 'fulfilled' && verificationsRes.value?.success) {
        const verifs: any[] = verificationsRes.value.verifications || [];
        vCount = verifs.length;
        verifs.slice(0, 2).forEach((v: any) => {
          notifs.push({
            id: v._id || v.id,
            type: 'verification',
            title: 'ID verification pending',
            detail: v.userName || 'User submitted documents',
            time: v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'Recent',
          });
        });
      }

      if (ticketsRes.status === 'fulfilled' && ticketsRes.value?.success) {
        const tickets: any[] = ticketsRes.value.tickets || [];
        tCount = tickets.filter((t: any) => t.status === 'open').length;
        tickets.filter((t: any) => t.status === 'open').slice(0, 2).forEach((t: any) => {
          notifs.push({
            id: t._id,
            type: 'ticket',
            title: t.subject || 'New support ticket',
            detail: `From: ${t.userName || 'User'}`,
            time: t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'Recent',
            urgent: t.priority === 'high',
          });
        });
      }

      notifs.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
      setItems(notifs);
      setCounts({ reports: rCount, verifications: vCount, tickets: tCount });
      setLastUpdated(new Date());
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(true), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleNavigate = (tab: string) => {
    setOpen(false);
    onNavigate(tab);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(prev => !prev)}
        className={`relative p-2.5 rounded-xl transition-all border ${
          open
            ? 'bg-brand-500/10 border-brand-500/30 text-brand-600 dark:text-brand-400'
            : 'bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:text-teal-500 hover:border-teal-500/30'
        }`}
        aria-label="Notifications"
      >
        <Bell size={18} className={open ? 'text-brand-500' : ''} />
        {totalBadge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-badgePop border-2 border-white dark:border-slate-950 leading-none">
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-3 w-96 bg-white dark:bg-slate-900 rounded-[2rem] border border-gray-100 dark:border-slate-800 shadow-card-hover z-[100] overflow-hidden animate-scaleIn origin-top-right"
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-50 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-black dark:text-white">Notifications</h3>
              {lastUpdated && (
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchNotifications()}
                className="p-2 text-slate-400 hover:text-brand-500 transition-colors rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-2 text-slate-400 hover:text-gray-600 dark:hover:text-white transition-colors rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-px bg-gray-50 dark:bg-slate-800 border-b border-gray-50 dark:border-slate-800">
            {[
              { label: 'Reports', count: counts.reports, tab: 'reports', color: 'text-rose-500' },
              { label: 'Verifications', count: counts.verifications, tab: 'verification', color: 'text-amber-500' },
              { label: 'Tickets', count: counts.tickets, tab: 'support', color: 'text-indigo-500' },
            ].map(({ label, count, tab, color }) => (
              <button
                key={tab}
                onClick={() => handleNavigate(tab)}
                className="bg-white dark:bg-slate-900 py-4 flex flex-col items-center gap-1 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <span className={`text-xl font-black ${color}`}>{loading ? '—' : count}</span>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
              </button>
            ))}
          </div>

          <div className="relative">
            <div className="max-h-72 overflow-y-auto custom-scrollbar" id="notif-scroll">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <RefreshCw size={20} className="animate-spin text-brand-500" />
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center py-10 opacity-40">
                  <Bell size={28} className="text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-400">All clear — no pending items</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-slate-800">
                  {items.map(item => {
                    const cfg = TYPE_CONFIG[item.type];
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavigate(item.type === 'ticket' ? 'support' : item.type === 'verification' ? 'verification' : 'reports')}
                        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors text-left group"
                      >
                        <div className={`shrink-0 h-9 w-9 rounded-2xl flex items-center justify-center ${cfg.bg} ${cfg.color} ${item.urgent ? 'ring-2 ring-rose-300 dark:ring-rose-500/30' : ''}`}>
                          {cfg.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-xs font-black dark:text-white truncate">{item.title}</p>
                            {item.urgent && (
                              <span className="shrink-0 px-1.5 py-0.5 bg-rose-100 dark:bg-rose-500/10 text-rose-600 text-[8px] font-black uppercase rounded-md">Urgent</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium truncate">{item.detail}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="text-[9px] text-slate-300 font-bold">{item.time}</span>
                          <ChevronRight size={12} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {items.length > 3 && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white dark:from-slate-900 to-transparent rounded-b-[2rem]" />
            )}
          </div>

          {items.length > 0 && (
            <div className="border-t border-gray-50 dark:border-slate-800 p-4">
              <button
                onClick={() => handleNavigate('reports')}
                className="w-full py-3 text-[10px] font-black text-brand-500 uppercase tracking-widest hover:text-brand-600 transition-colors"
              >
                View All Alerts →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
