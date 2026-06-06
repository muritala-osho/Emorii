import React, { useState, useEffect, useCallback } from 'react';
import {
  Send, Megaphone, Bell, History,
  Trash2, Filter, Clock, CheckCircle, Zap,
  Layout, Image as ImageIcon, Calendar, BookOpen, Star, Save,
  AlertTriangle, ArrowRight, X, Play, RefreshCw, AlertCircle,
  TimerIcon, Ban,
} from 'lucide-react';
import { NotificationCampaign, PushTemplate, BroadcastTarget } from '../types';
import { PUSH_TEMPLATES } from '../constants';
import { adminApi } from '../services/adminApi';

interface BroadcastsProps {
  showToast?: (message: string, type: 'success' | 'error') => void;
}

interface ScheduledBroadcast {
  _id: string;
  title: string;
  body: string;
  target: string;
  imageUrl?: string;
  scheduledAt: string;
  status: 'pending' | 'fired' | 'cancelled' | 'failed';
  createdByName: string;
  firedAt?: string;
  cancelledAt?: string;
  cancelledByName?: string;
  reach: number;
}

const TARGET_LABELS: Record<string, string> = {
  all: 'Global', male: 'Male', female: 'Female', verified: 'Verified',
  platinum: 'Platinum', gold: 'Gold', lagos: 'Lagos', london: 'London',
};

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-500/10',   icon: <TimerIcon size={12} /> },
  fired:     { label: 'Sent',      color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: <CheckCircle size={12} /> },
  cancelled: { label: 'Cancelled', color: 'text-slate-500',                        bg: 'bg-slate-50 dark:bg-slate-700',       icon: <Ban size={12} /> },
  failed:    { label: 'Failed',    color: 'text-rose-600 dark:text-rose-400',      bg: 'bg-rose-50 dark:bg-rose-500/10',     icon: <AlertCircle size={12} /> },
};

type LedgerTab = 'sent' | 'scheduled' | 'drafts';

interface DraftBroadcast {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  target: BroadcastTarget;
  scheduledAt?: string;
  savedAt: number;
}

const DRAFTS_STORAGE_KEY = 'emorii_broadcast_drafts_v1';

const loadDrafts = (): DraftBroadcast[] => {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const persistDrafts = (drafts: DraftBroadcast[]) => {
  try { localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts)); } catch { /* ignore */ }
};

const Broadcasts: React.FC<BroadcastsProps> = ({ showToast }) => {
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignBody, setCampaignBody] = useState('');
  const [campaignImage, setCampaignImage] = useState('');
  const [targetSegment, setTargetSegment] = useState<BroadcastTarget>('all');
  const [isSending, setIsSending] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<'immediate' | 'scheduled'>('immediate');
  const [scheduledAt, setScheduledAt] = useState('');
  const [history, setHistory] = useState<NotificationCampaign[]>([]);
  const [scheduledQueue, setScheduledQueue] = useState<ScheduledBroadcast[]>([]);
  const [ledgerTab, setLedgerTab] = useState<LedgerTab>('sent');
  const [queueLoading, setQueueLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [firingId, setFiringId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftBroadcast[]>(() => loadDrafts());
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await adminApi.getBroadcastHistory();
        if (data.success && data.broadcasts?.length > 0) {
          setHistory(data.broadcasts.map((b: any) => ({
            id: b._id || b.id,
            title: b.title,
            body: b.body,
            target: b.target || 'all',
            status: b.status || 'sent',
            timestamp: b.createdAt ? new Date(b.createdAt).toLocaleDateString() : 'Unknown',
            reach: b.reach || 0,
            openRate: b.openRate || '—',
          })));
        } else {
          setHistory([]);
        }
      } catch {
        setHistory([]);
      }
    };
    fetchHistory();
  }, []);

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const data = await adminApi.getScheduledBroadcasts(100);
      if (data.success) setScheduledQueue(data.broadcasts || []);
    } catch {
      setScheduledQueue([]);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ledgerTab === 'scheduled') fetchQueue();
  }, [ledgerTab, fetchQueue]);

  const handleSend = async (status: 'sent' | 'draft' | 'scheduled') => {
    if (!campaignTitle || !campaignBody) return;
    if (dispatchMode === 'scheduled' && !scheduledAt) {
      if (showToast) showToast('Please pick a date and time for the scheduled broadcast.', 'error');
      return;
    }
    setIsSending(true);
    try {
      if (status === 'draft') {
        const id = editingDraftId || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const draft: DraftBroadcast = {
          id,
          title: campaignTitle,
          body: campaignBody,
          imageUrl: campaignImage || undefined,
          target: targetSegment,
          scheduledAt: dispatchMode === 'scheduled' ? scheduledAt : undefined,
          savedAt: Date.now(),
        };
        setDrafts(prev => {
          const without = prev.filter(d => d.id !== id);
          const next = [draft, ...without];
          persistDrafts(next);
          return next;
        });
        setEditingDraftId(null);
        if (showToast) showToast(editingDraftId ? 'Draft updated.' : 'Campaign saved to drafts.', 'success');
      } else if (dispatchMode === 'scheduled') {
        const data = await adminApi.scheduleBroadcast({
          title: campaignTitle,
          body: campaignBody,
          imageUrl: campaignImage || undefined,
          target: targetSegment,
          scheduledAt,
        });
        if (!data.success) throw new Error(data.message || 'Failed to schedule.');
        if (showToast) showToast(`Broadcast queued for ${new Date(scheduledAt).toLocaleString()}.`, 'success');
        if (ledgerTab === 'scheduled') fetchQueue();
        if (editingDraftId) deleteDraft(editingDraftId, false);
      } else {
        await adminApi.sendBroadcast({
          title: campaignTitle,
          body: campaignBody,
          target: targetSegment,
          imageUrl: campaignImage || undefined,
          scheduled: false,
        });
        const newEntry: NotificationCampaign = {
          id: Date.now().toString(),
          title: campaignTitle,
          body: campaignBody,
          target: targetSegment,
          status: 'sent',
          timestamp: 'Just now',
          reach: 0,
          openRate: '—',
        };
        setHistory(prev => [newEntry, ...prev]);
        if (showToast) showToast(`Immediate dispatch to ${targetSegment} segment initiated.`, 'success');
        if (editingDraftId) deleteDraft(editingDraftId, false);
      }
      resetForm();
    } catch (err: any) {
      if (showToast) showToast(err.message || 'Broadcast failed. Check your connection.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      const data = await adminApi.cancelScheduledBroadcast(id);
      if (data.success) {
        setScheduledQueue(prev => prev.map(b => b._id === id ? { ...b, status: 'cancelled' } : b));
        if (showToast) showToast('Scheduled broadcast cancelled.', 'success');
      } else {
        if (showToast) showToast(data.message || 'Could not cancel.', 'error');
      }
    } catch (err: any) {
      if (showToast) showToast(err.message || 'Cancel failed. Try again.', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const handleFireNow = async (id: string) => {
    setFiringId(id);
    try {
      const data = await adminApi.fireScheduledBroadcast(id);
      if (data.success) {
        setScheduledQueue(prev => prev.map(b => b._id === id ? { ...b, status: 'fired', firedAt: new Date().toISOString() } : b));
        if (showToast) showToast('Broadcast fired immediately!', 'success');
      } else {
        if (showToast) showToast(data.message || 'Could not fire.', 'error');
      }
    } catch (err: any) {
      if (showToast) showToast(err.message || 'Fire failed. Try again.', 'error');
    } finally {
      setFiringId(null);
    }
  };

  const deleteDraft = (id: string, notify = true) => {
    setDrafts(prev => {
      const next = prev.filter(d => d.id !== id);
      persistDrafts(next);
      return next;
    });
    if (editingDraftId === id) setEditingDraftId(null);
    if (notify && showToast) showToast('Draft deleted.', 'success');
  };

  const editDraft = (draft: DraftBroadcast) => {
    setCampaignTitle(draft.title);
    setCampaignBody(draft.body);
    setCampaignImage(draft.imageUrl || '');
    setTargetSegment(draft.target);
    if (draft.scheduledAt) {
      setScheduledAt(draft.scheduledAt);
      setDispatchMode('scheduled');
    } else {
      setDispatchMode('immediate');
    }
    setEditingDraftId(draft.id);
    if (showToast) showToast('Draft loaded into the composer.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setCampaignTitle('');
    setCampaignBody('');
    setCampaignImage('');
    setScheduledAt('');
    setDispatchMode('immediate');
    setEditingDraftId(null);
  };

  const loadTemplate = (template: PushTemplate) => {
    setCampaignTitle(template.title);
    setCampaignBody(template.body);
    if (showToast) showToast(`"${template.name}" template loaded.`, 'success');
  };

  const minDateTime = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16);

  const pendingCount = scheduledQueue.filter(b => b.status === 'pending').length;

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Broadcast Command</h1>
          <p className="text-gray-500 dark:text-slate-400 font-medium">Engineer global push notification campaigns with rich media and granular targeting</p>
        </div>
        <div className="flex bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center px-4 py-2 text-emerald-600 dark:text-emerald-400 gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest">Gateway: Online</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-gray-100 dark:border-slate-800 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <BookOpen size={14} /> Template Library
            </h3>
            <div className="space-y-3">
              {PUSH_TEMPLATES.map(pt => (
                <button
                  key={pt.id}
                  onClick={() => loadTemplate(pt)}
                  className="w-full text-left p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl hover:bg-brand-500 hover:text-white transition-all group border border-transparent hover:shadow-xl"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest group-hover:text-white/60 mb-1">{pt.category}</p>
                  <p className="text-sm font-black truncate">{pt.name}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 text-white relative overflow-hidden group shadow-xl">
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <Star size={40} className="text-brand-400 group-hover:rotate-45 transition-transform duration-700" />
            </div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 text-brand-400">Optimization Tip</h4>
            <p className="text-xs font-medium opacity-80 leading-relaxed">Notifications with <span className="text-brand-400 font-bold">emojis</span> in the headline see a <span className="font-bold">22% higher</span> engagement rate. Schedule for <span className="text-brand-400 font-bold">7–9 PM local time</span> for peak opens.</p>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-brand-500/10 text-brand-600 rounded-3xl">
                <Megaphone size={24} />
              </div>
              <h2 className="text-xl font-black dark:text-white uppercase tracking-tight">Campaign Architect</h2>
            </div>
            {isSending && <div className="animate-spin h-6 w-6 border-4 border-brand-500 border-t-transparent rounded-full" />}
          </div>

          <div className="space-y-6">
            <div className="relative">
              <label className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                <span>Notification Title</span>
                <span className={`font-black ${campaignTitle.length > 50 ? 'text-rose-500' : 'text-slate-300'}`}>{campaignTitle.length}/60</span>
              </label>
              <input
                type="text"
                maxLength={60}
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="The headline users see first..."
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white transition-all shadow-sm"
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                <span>Message Body</span>
                <span className={`font-black ${campaignBody.length > 140 ? 'text-rose-500' : 'text-slate-300'}`}>{campaignBody.length}/150</span>
              </label>
              <textarea
                rows={3}
                maxLength={150}
                value={campaignBody}
                onChange={(e) => setCampaignBody(e.target.value)}
                placeholder="The core message payload..."
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white transition-all resize-none shadow-sm"
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                <span>Rich Media Attachment (URL)</span>
                <ImageIcon size={14} className="text-slate-300" />
              </label>
              <input
                type="text"
                value={campaignImage}
                onChange={(e) => setCampaignImage(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white transition-all shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Audience</label>
              <select
                value={targetSegment}
                onChange={(e) => setTargetSegment(e.target.value as any)}
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-500 font-black text-xs uppercase tracking-widest dark:text-white appearance-none cursor-pointer shadow-sm"
              >
                <optgroup label="Demographic">
                  <option value="all">Global Population</option>
                  <option value="male">Male Citizens</option>
                  <option value="female">Female Citizens</option>
                  <option value="verified">Verified Elite</option>
                </optgroup>
                <optgroup label="Subscription Tier">
                  <option value="platinum">Platinum Users</option>
                  <option value="gold">Gold Users</option>
                </optgroup>
                <optgroup label="Regional Hubs">
                  <option value="lagos">Lagos Hub</option>
                  <option value="london">London Hub</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Dispatch Mode</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setDispatchMode('immediate')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all ${
                    dispatchMode === 'immediate'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                      : 'bg-gray-50 dark:bg-slate-800 text-slate-500 border border-gray-100 dark:border-slate-700 hover:border-emerald-300'
                  }`}
                >
                  <Zap size={14} /> Immediate
                </button>
                <button
                  onClick={() => setDispatchMode('scheduled')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all ${
                    dispatchMode === 'scheduled'
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                      : 'bg-gray-50 dark:bg-slate-800 text-slate-500 border border-gray-100 dark:border-slate-700 hover:border-amber-300'
                  }`}
                >
                  <Calendar size={14} /> Scheduled
                </button>
              </div>
            </div>

            {dispatchMode === 'scheduled' && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-2xl p-5 space-y-3 animate-fadeIn">
                <label className="flex items-center gap-2 text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                  <Clock size={12} /> Schedule Date & Time (UTC)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  min={minDateTime}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-xl bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-500/30 outline-none focus:ring-2 focus:ring-amber-400 font-bold dark:text-white text-sm"
                />
                {scheduledAt && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                    Will fire: {new Date(scheduledAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => handleSend('draft')}
              className="flex-1 py-5 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm"
            >
              <Save size={16} /> Save Draft
            </button>
            <button
              onClick={() => handleSend('sent')}
              disabled={isSending || !campaignTitle || !campaignBody || (dispatchMode === 'scheduled' && !scheduledAt)}
              className="flex-[2] py-5 bg-brand-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-brand-500/30 hover:bg-brand-600 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
            >
              {dispatchMode === 'scheduled' ? <><Calendar size={18} /> Queue Broadcast</> : <><Send size={18} /> Execute Dispatch</>}
            </button>
          </div>
        </div>

        <div className="lg:col-span-4 bg-slate-900 p-10 rounded-[3.5rem] flex flex-col items-center justify-center space-y-8 relative overflow-hidden group shadow-2xl border border-white/5">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(20,184,166,0.1),transparent)]" />
          <h3 className="text-[10px] font-black text-teal-500 uppercase tracking-[0.3em] relative z-10">Real-Time User Experience</h3>
          <div className="w-72 h-[520px] bg-black rounded-[3rem] border-[8px] border-slate-800 relative shadow-2xl z-10 p-3 ring-1 ring-white/10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-28 bg-slate-800 rounded-b-2xl" />
            <div className="h-full w-full rounded-[2.25rem] overflow-hidden bg-gradient-to-b from-slate-700 to-slate-900 p-4 flex flex-col pt-12 relative">
              <div className="bg-white/10 backdrop-blur-2xl border border-white/10 p-4 rounded-3xl animate-fadeIn shadow-2xl relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-5 w-5 bg-teal-500 rounded-lg flex items-center justify-center text-white text-[8px] font-black shadow-lg">A</div>
                  <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">
                    Emorii · {dispatchMode === 'scheduled' && scheduledAt ? new Date(scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'NOW'}
                  </span>
                </div>
                <p className="text-sm font-black text-white truncate mb-1">{campaignTitle || 'Campaign Title'}</p>
                <p className="text-[11px] text-white/70 line-clamp-2 leading-relaxed font-medium mb-3">{campaignBody || 'The message body will populate here...'}</p>
                {campaignImage && (
                  <div className="h-32 w-full rounded-2xl overflow-hidden border border-white/10 shadow-inner">
                    <img src={campaignImage} className="w-full h-full object-cover" alt="Push Attachment" />
                  </div>
                )}
              </div>
              <div className="mt-auto mb-10 flex flex-col items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center border border-white/5 animate-bounce">
                  <ArrowRight size={18} className="text-white/20 rotate-90" />
                </div>
                <div className="h-1 w-20 bg-white/20 rounded-full" />
              </div>
            </div>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3 relative z-10">
            <AlertTriangle size={16} className="text-amber-500" />
            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Preview assumes iOS 17 Render Engine</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="px-10 py-8 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 rounded-2xl">
              <History size={20} />
            </div>
            <h3 className="text-lg font-bold dark:text-white">Communication Ledger</h3>
          </div>
          <div className="flex gap-2 items-center">
            {(['sent', 'scheduled', 'drafts'] as LedgerTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setLedgerTab(tab)}
                className={`relative px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  ledgerTab === tab
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-gray-50 dark:bg-slate-800 text-slate-500 hover:text-brand-500 border border-gray-100 dark:border-slate-700'
                }`}
              >
                {tab === 'scheduled' ? 'Scheduled' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'scheduled' && pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-amber-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
            {ledgerTab === 'scheduled' && (
              <button
                onClick={fetchQueue}
                className="p-2 bg-gray-50 dark:bg-slate-800 rounded-xl text-slate-400 hover:text-brand-500 transition-all border border-gray-100 dark:border-slate-700 ml-2"
              >
                <RefreshCw size={16} className={queueLoading ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        </div>

        {ledgerTab === 'scheduled' ? (
          queueLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" />
            </div>
          ) : scheduledQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="p-5 bg-gray-50 dark:bg-slate-800 rounded-3xl mb-4">
                <Calendar size={32} className="text-slate-300" />
              </div>
              <h3 className="text-base font-black dark:text-white mb-1">No scheduled broadcasts</h3>
              <p className="text-sm text-slate-400 font-medium">Switch to Scheduled mode above to queue a timed broadcast.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-slate-800">
              {scheduledQueue.map(b => {
                const cfg = STATUS_CONFIG[b.status] || STATUS_CONFIG.pending;
                const isPending = b.status === 'pending';
                const isCancelling = cancellingId === b._id;
                const isFiring = firingId === b._id;
                return (
                  <div key={b._id} className="px-8 py-5 flex items-center gap-5 hover:bg-gray-50/60 dark:hover:bg-slate-800/30 transition-colors group">
                    <div className={`shrink-0 h-10 w-10 rounded-2xl flex items-center justify-center ${cfg.bg} ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-black dark:text-white truncate">{b.title}</span>
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="px-2 py-0.5 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-lg text-[9px] font-black uppercase">
                          {TARGET_LABELS[b.target] || b.target}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate font-medium">{b.body}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                          <Clock size={9} />
                          {b.status === 'pending' ? `Fires: ${new Date(b.scheduledAt).toLocaleString()}` : b.status === 'fired' ? `Fired: ${b.firedAt ? new Date(b.firedAt).toLocaleString() : '—'}` : `Cancelled: ${b.cancelledAt ? new Date(b.cancelledAt).toLocaleString() : '—'}`}
                        </span>
                        {b.status === 'pending' && (
                          <CountdownTimer scheduledAt={b.scheduledAt} />
                        )}
                      </div>
                    </div>
                    {isPending && (
                      <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleFireNow(b._id)}
                          disabled={!!isFiring}
                          title="Fire immediately"
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        >
                          {isFiring ? <div className="h-3 w-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /> : <Play size={11} />}
                          Fire Now
                        </button>
                        <button
                          onClick={() => handleCancel(b._id)}
                          disabled={!!isCancelling}
                          title="Cancel broadcast"
                          className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl text-[10px] font-black uppercase hover:bg-rose-100 transition-colors disabled:opacity-50"
                        >
                          {isCancelling ? <div className="h-3 w-3 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" /> : <X size={11} />}
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : ledgerTab === 'sent' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Metadata</th>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Segment</th>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Reach</th>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">CTR</th>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-10 py-16 text-center">
                      <div className="flex flex-col items-center opacity-40">
                        <History size={36} className="text-slate-300 mb-3" />
                        <p className="text-sm font-black text-slate-400">No campaigns sent yet</p>
                        <p className="text-xs text-slate-400 mt-1 font-medium">Dispatched campaigns will appear here</p>
                      </div>
                    </td>
                  </tr>
                ) : history.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-10 py-6">
                      <p className="text-sm font-black dark:text-white mb-1">{item.title}</p>
                      <p className="text-[10px] text-slate-400 font-medium truncate max-w-xs">{item.body}</p>
                    </td>
                    <td className="px-10 py-6">
                      <span className="px-3 py-1 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[9px] font-black uppercase tracking-widest rounded-lg">
                        {item.target}
                      </span>
                    </td>
                    <td className="px-10 py-6 text-sm font-black dark:text-white">{item.reach.toLocaleString()}</td>
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-black dark:text-white">{item.openRate}</p>
                        <div className="h-1.5 w-16 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full shadow-[0_0_8px_rgba(20,184,166,0.5)]" style={{ width: item.openRate }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-6 text-xs font-bold text-slate-400">{item.timestamp}</td>
                    <td className="px-10 py-6 text-right">
                      <button className="p-3 text-slate-300 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-5 bg-gray-50 dark:bg-slate-800 rounded-3xl mb-4">
              <Save size={32} className="text-slate-300" />
            </div>
            <h3 className="text-base font-black dark:text-white mb-1">No drafts yet</h3>
            <p className="text-sm text-slate-400 font-medium">Use the "Save Draft" button in the composer to save a campaign for later.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-slate-800">
            {drafts.map(d => (
              <div key={d.id} className="px-8 py-5 flex items-center gap-5 hover:bg-gray-50/60 dark:hover:bg-slate-800/30 transition-colors group">
                <div className="shrink-0 h-10 w-10 rounded-2xl flex items-center justify-center bg-slate-50 dark:bg-slate-700 text-slate-500">
                  <Save size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-black dark:text-white truncate">{d.title || '(untitled)'}</span>
                    <span className="px-2 py-0.5 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-lg text-[9px] font-black uppercase">
                      {TARGET_LABELS[d.target] || d.target}
                    </span>
                    {d.scheduledAt && (
                      <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg text-[9px] font-black uppercase">
                        Scheduled
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate font-medium">{d.body}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                      <Clock size={9} />
                      Saved {new Date(d.savedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => editDraft(d)}
                    title="Load draft into composer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-xl text-[10px] font-black uppercase hover:bg-brand-100 transition-colors"
                  >
                    <ArrowRight size={11} /> Use
                  </button>
                  <button
                    onClick={() => deleteDraft(d.id)}
                    title="Delete draft"
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl text-[10px] font-black uppercase hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function CountdownTimer({ scheduledAt }: { scheduledAt: string }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = new Date(scheduledAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Firing soon...'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setTimeLeft(`${d}d ${h}h ${m}m`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else setTimeLeft(`${m}m ${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [scheduledAt]);

  return (
    <span className="flex items-center gap-1 text-[10px] font-black text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-lg">
      <TimerIcon size={9} /> {timeLeft}
    </span>
  );
}

export default Broadcasts;
