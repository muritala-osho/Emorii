import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserPlus, Heart, AlertTriangle, ShieldCheck, MessageSquare, Zap, Wifi, WifiOff } from 'lucide-react';
import { adminApi } from '../services/adminApi';

type EventType = 'signup' | 'match' | 'report' | 'verification' | 'message';

interface ActivityEvent {
  id: string;
  type: EventType;
  label: string;
  detail: string;
  timestamp: Date;
  isNew?: boolean;
}

const EVENT_CONFIG: Record<EventType, { icon: React.ReactNode; color: string; bg: string }> = {
  signup:       { icon: <UserPlus size={14} />,       color: 'text-cyan-600 dark:text-cyan-400',    bg: 'bg-cyan-50 dark:bg-cyan-500/10' },
  match:        { icon: <Heart size={14} />,           color: 'text-rose-500 dark:text-rose-400',    bg: 'bg-rose-50 dark:bg-rose-500/10' },
  report:       { icon: <AlertTriangle size={14} />,   color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-500/10' },
  verification: { icon: <ShieldCheck size={14} />,     color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  message:      { icon: <MessageSquare size={14} />,   color: 'text-indigo-600 dark:text-indigo-400',   bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
};

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

let _prevStats: Record<string, number> = {};
let _prevReports: Set<string> = new Set();
let _prevVerifications: Set<string> = new Set();

const LiveActivityFeed: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [pulse, setPulse] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  const pushEvent = useCallback((type: EventType, label: string, detail: string, isNew = true) => {
    const evt: ActivityEvent = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      label,
      detail,
      timestamp: new Date(),
      isNew,
    };
    setEvents(prev => [evt, ...prev].slice(0, 40));
    if (isNew) {
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    }
  }, []);

  const fetchAndDiff = useCallback(async () => {
    try {
      const [statsRes, reportsRes, verificationsRes] = await Promise.allSettled([
        adminApi.getStats(),
        adminApi.getReports('pending'),
        adminApi.getVerifications(),
      ]);

      if (statsRes.status === 'fulfilled' && statsRes.value?.success) {
        const s = statsRes.value.stats;
        if (!firstLoad.current) {
          if (s.totalUsers > (_prevStats.totalUsers ?? s.totalUsers)) {
            const diff = s.totalUsers - _prevStats.totalUsers;
            pushEvent('signup', `${diff} new citizen${diff > 1 ? 's' : ''} joined`, 'New account registration');
          }
          if (s.totalMatches > (_prevStats.totalMatches ?? s.totalMatches)) {
            const diff = s.totalMatches - _prevStats.totalMatches;
            pushEvent('match', `${diff} new match${diff > 1 ? 'es' : ''}`, 'Connection established');
          }
          if (s.totalMessages > (_prevStats.totalMessages ?? s.totalMessages)) {
            const diff = s.totalMessages - _prevStats.totalMessages;
            pushEvent('message', `${diff.toLocaleString()} new message${diff > 1 ? 's' : ''}`, 'Platform traffic spike');
          }
        }
        _prevStats = { totalUsers: s.totalUsers, totalMatches: s.totalMatches, totalMessages: s.totalMessages };
      }

      if (reportsRes.status === 'fulfilled' && reportsRes.value?.success) {
        const incoming: any[] = reportsRes.value.reports || [];
        incoming.forEach((r: any) => {
          const rid = r._id || r.id;
          if (!_prevReports.has(rid)) {
            _prevReports.add(rid);
            if (!firstLoad.current) {
              pushEvent('report', `New ${r.reason || 'safety'} report`, `Reported user: ${r.reportedUser?.name || 'Unknown'}`);
            }
          }
        });
        if (firstLoad.current) {
          incoming.slice(0, 3).forEach((r: any) => {
            pushEvent('report', `${r.reason || 'safety'} report`, `Reported user: ${r.reportedUser?.name || 'Unknown'}`, false);
          });
        }
      }

      if (verificationsRes.status === 'fulfilled' && verificationsRes.value?.success) {
        const incoming: any[] = verificationsRes.value.verifications || [];
        incoming.forEach((v: any) => {
          const vid = v._id || v.id;
          if (!_prevVerifications.has(vid)) {
            _prevVerifications.add(vid);
            if (!firstLoad.current) {
              pushEvent('verification', `ID verification request`, `${v.userName || 'User'} submitted documents`);
            }
          }
        });
        if (firstLoad.current) {
          incoming.slice(0, 2).forEach((v: any) => {
            pushEvent('verification', `ID verification pending`, `${v.userName || 'User'} submitted documents`, false);
          });
        }
      }

      if (firstLoad.current && events.length === 0 &&
          statsRes.status === 'fulfilled' && statsRes.value?.success) {
        const s = statsRes.value.stats;
        if (s.totalUsers > 0) pushEvent('signup', `${s.totalUsers.toLocaleString()} total citizens`, 'Platform at launch', false);
        if (s.totalMatches > 0) pushEvent('match', `${s.totalMatches.toLocaleString()} total matches`, 'All-time connections', false);
      }

      firstLoad.current = false;
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, [pushEvent]);

  useEffect(() => {
    fetchAndDiff();
    const interval = setInterval(fetchAndDiff, 20000);
    return () => clearInterval(interval);
  }, [fetchAndDiff]);

  useEffect(() => {
    if (feedRef.current && events.length > 0 && events[0].isNew) {
      feedRef.current.scrollTop = 0;
    }
  }, [events]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
      <div className="px-8 py-6 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${pulse ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-600 dark:text-brand-400'} transition-all duration-300`}>
            <Zap size={18} />
          </div>
          <div>
            <h3 className="text-base font-black dark:text-white tracking-tight">Live Activity Feed</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Updates every 20 seconds</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl text-[9px] font-black uppercase tracking-widest border border-emerald-100 dark:border-emerald-500/20">
              <Wifi size={10} />
              Live
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-100 dark:border-slate-700">
              <WifiOff size={10} />
              Offline
            </span>
          )}
        </div>
      </div>

      <div ref={feedRef} className="flex-1 overflow-y-auto custom-scrollbar max-h-80 divide-y divide-gray-50 dark:divide-slate-800/50">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 opacity-40">
            <Zap size={32} className="text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-400">Awaiting platform activity...</p>
            <p className="text-xs text-slate-400 mt-1">Events will stream in as users engage</p>
          </div>
        ) : (
          events.map(evt => {
            const cfg = EVENT_CONFIG[evt.type];
            return (
              <div
                key={evt.id}
                className={`flex items-center gap-4 px-8 py-4 transition-all ${evt.isNew ? 'animate-fadeIn' : ''} hover:bg-gray-50 dark:hover:bg-slate-800/30`}
              >
                <div className={`shrink-0 h-8 w-8 rounded-xl flex items-center justify-center ${cfg.bg} ${cfg.color}`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-black truncate ${cfg.color}`}>{evt.label}</p>
                  <p className="text-[10px] font-medium text-slate-400 truncate">{evt.detail}</p>
                </div>
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest shrink-0">{timeAgo(evt.timestamp)}</span>
                {evt.isNew && (
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0 animate-pulse" />
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="px-8 py-4 border-t border-gray-50 dark:border-slate-800 flex items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          {(Object.keys(EVENT_CONFIG) as EventType[]).map(type => {
            const cfg = EVENT_CONFIG[type];
            const count = events.filter(e => e.type === type).length;
            return (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`h-1.5 w-1.5 rounded-full ${cfg.bg.includes('cyan') ? 'bg-cyan-500' : cfg.bg.includes('rose') ? 'bg-rose-500' : cfg.bg.includes('amber') ? 'bg-amber-500' : cfg.bg.includes('emerald') ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                <span className="text-[9px] font-black text-slate-400 uppercase">{type} <span className="text-slate-300">({count})</span></span>
              </div>
            );
          })}
        </div>
        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{events.length} events</span>
      </div>
    </div>
  );
};

export default LiveActivityFeed;
