import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, CheckCircle2, Eye, ShieldCheck, MessageCircle,
  Loader2, RefreshCw, AlertCircle, X, UserX, AlertTriangle, Clock, Trash2, FileImage, FileText, Mic, Video,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import PageHeader from '../components/PageHeader';
import Badge from '../components/Badge';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { SkeletonTableRow } from '../components/Skeleton';

interface ReportsQueueProps {
  showToast?: (message: string, type: 'success' | 'error') => void;
}

type ResolveAction = 'dismiss' | 'warn' | 'suspend' | 'ban';

const ACTION_META: Record<ResolveAction, { label: string; color: string; bg: string; hoverBg: string; icon: React.ReactNode }> = {
  dismiss: { label: 'Dismiss', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10', hoverBg: 'hover:bg-emerald-100', icon: <ShieldCheck size={13} /> },
  warn:    { label: 'Warn',    color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-500/10',   hoverBg: 'hover:bg-amber-100',   icon: <AlertTriangle size={13} /> },
  suspend: { label: 'Suspend (7d)', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-500/10', hoverBg: 'hover:bg-orange-100', icon: <Clock size={13} /> },
  ban:     { label: 'Ban',     color: 'text-rose-600',    bg: 'bg-rose-50 dark:bg-rose-500/10',    hoverBg: 'hover:bg-rose-100',    icon: <UserX size={13} /> },
};

const ReportsQueue: React.FC<ReportsQueueProps> = ({ showToast }) => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('pending');
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ResolveAction | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [deletingContent, setDeletingContent] = useState(false);

  const fetchReports = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const data = await adminApi.getReports(activeFilter);
      if (data.success) {
        setReports(data.reports || []);
      } else {
        setError('Failed to load reports.');
        setReports([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not reach the backend.');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const TOAST_MSG: Record<ResolveAction, string> = {
    dismiss: 'Report dismissed.',
    warn:    'Warning issued and user notified.',
    suspend: 'User suspended for 7 days and notified.',
    ban:     'User banned and report resolved.',
  };

  const handleResolve = async (reportId: string, action: ResolveAction, notes?: string) => {
    setActionLoading(reportId + action);
    try {
      const data = await adminApi.resolveReport(reportId, action, notes);
      if (data.success) {
        setReports(prev => prev.filter(r => r._id !== reportId));
        setSelectedReport(null);
        setPendingAction(null);
        setActionNotes('');
        showToast?.(TOAST_MSG[action], 'success');
      }
    } catch (err: any) {
      showToast?.(err?.message || 'Failed to resolve report.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleModalAction = (reportId: string) => {
    if (!pendingAction) return;
    handleResolve(reportId, pendingAction, actionNotes.trim() || undefined);
  };

  const handleDeleteContent = async (reportId: string) => {
    setDeletingContent(true);
    try {
      const data = await adminApi.deleteReportedContent(reportId);
      if (data.success) {
        setReports(prev => prev.filter(r => r._id !== reportId));
        setSelectedReport(null);
        showToast?.('Reported content removed successfully.', 'success');
      } else {
        showToast?.(data.message || 'Failed to remove content.', 'error');
      }
    } catch (err: any) {
      showToast?.(err?.message || 'Failed to remove content.', 'error');
    } finally {
      setDeletingContent(false);
    }
  };

  const CONTENT_TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
    story:         { label: 'Story',           icon: <FileImage size={14} /> },
    message_image: { label: 'Image Message',   icon: <FileImage size={14} /> },
    message_text:  { label: 'Text Message',    icon: <FileText  size={14} /> },
    message_audio: { label: 'Voice Message',   icon: <Mic       size={14} /> },
    message_video: { label: 'Video Message',   icon: <Video     size={14} /> },
    profile_photo: { label: 'Profile Photo',   icon: <FileImage size={14} /> },
    voice_bio:     { label: 'Voice Bio',       icon: <Mic       size={14} /> },
    bio:           { label: 'Profile Bio',     icon: <FileText  size={14} /> },
    success_story: { label: 'Success Story',   icon: <FileText  size={14} /> },
    comment:       { label: 'Comment',         icon: <MessageCircle size={14} /> },
  };

  const isImageType = (t?: string) => t === 'story' || t === 'message_image' || t === 'profile_photo' || t === 'success_story';
  const isAudioType = (t?: string) => t === 'voice_bio' || t === 'message_audio';
  const isVideoType = (t?: string) => t === 'message_video';
  const isTextType  = (t?: string) => t === 'message_text' || t === 'bio' || t === 'comment';

  const stats = [
    { label: 'Reports Loaded', value: reports.length, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/5', border: 'border-rose-100 dark:border-rose-500/20', icon: <ShieldAlert size={20} /> },
    { label: 'Pending', value: activeFilter === 'pending' ? reports.length : '—', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/5', border: 'border-amber-100 dark:border-amber-500/20', icon: <AlertCircle size={20} /> },
    { label: 'View', value: activeFilter.toUpperCase(), color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/5', border: 'border-emerald-100 dark:border-emerald-500/20', icon: <CheckCircle2 size={20} /> },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Reports Queue"
        eyebrow="Trust & Safety"
        subtitle="Incident management and content moderation"
        actions={
          <>
            <div className="flex bg-white dark:bg-slate-900 p-1 rounded-2xl border border-gray-100 dark:border-slate-800">
              {(['pending', 'resolved', 'all'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-4 py-2 text-[10px] font-black uppercase rounded-xl transition-all ${activeFilter === f ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={() => fetchReports()}
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-gray-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 transition-all"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className={`${stat.bg} border ${stat.border} rounded-2xl p-5 flex items-center gap-4`}>
            <div className={stat.color}>{stat.icon}</div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
              <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl text-sm text-rose-700 dark:text-rose-400">
          <AlertCircle size={16} className="shrink-0" />
          <span className="font-medium">{error}</span>
          <button onClick={() => fetchReports()} className="ml-auto underline text-xs">Retry</button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <table className="w-full text-left" aria-label="Loading reports">
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
              {[1,2,3,4,5].map(i => <SkeletonTableRow key={i} cols={5} />)}
            </tbody>
          </table>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-100 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID / Date</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Parties</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {reports.length > 0 ? reports.map((report) => (
                  <tr key={report._id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-black dark:text-white">{report._id?.slice(-6).toUpperCase()}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{report.createdAt ? new Date(report.createdAt).toLocaleDateString() : '—'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs">
                        <Avatar src={report.reporter?.photos?.[0]?.url} name={report.reporter?.name} size="xs" />
                        <span className="font-bold text-slate-600 dark:text-slate-300 max-w-[70px] truncate">{report.reporter?.name || 'Unknown'}</span>
                        <span className="text-slate-300 shrink-0">→</span>
                        <Avatar src={report.reportedUser?.photos?.[0]?.url} name={report.reportedUser?.name} size="xs" />
                        <span className="font-bold text-slate-600 dark:text-slate-300 max-w-[70px] truncate">{report.reportedUser?.name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="neutral" label={report.reason || 'Other'} />
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={report.status === 'resolved' ? 'resolved' : 'pending'}
                        label={report.status}
                        dot
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { setSelectedReport(report); setPendingAction(null); setActionNotes(''); }}
                          className="p-2 text-teal-600 bg-teal-50 dark:bg-teal-500/10 rounded-lg hover:bg-teal-100 transition-all"
                          title="View details & take action"
                        >
                          <Eye size={15} />
                        </button>
                        {report.status === 'pending' && (
                          <button
                            onClick={() => handleResolve(report._id, 'dismiss')}
                            disabled={actionLoading !== null}
                            className="p-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg hover:bg-emerald-100 transition-all disabled:opacity-40"
                            title="Dismiss"
                          >
                            {actionLoading === report._id + 'dismiss' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        icon={<CheckCircle2 size={28} />}
                        title={`No ${activeFilter} reports`}
                        description="The queue is clear for this filter"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/70 backdrop-blur-md animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-white/10 overflow-hidden">
            <div className="p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Report #{selectedReport._id?.slice(-6).toUpperCase()}</p>
                  <h2 className="text-2xl font-black dark:text-white">{selectedReport.reason || 'Incident Report'}</h2>
                </div>
                <button
                  onClick={() => { setSelectedReport(null); setPendingAction(null); setActionNotes(''); }}
                  className="p-2.5 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reporter</p>
                  <p className="font-bold dark:text-white text-sm">{selectedReport.reporter?.name || 'Unknown'}</p>
                  {selectedReport.reporter?.email && <p className="text-xs text-slate-400">{selectedReport.reporter.email}</p>}
                </div>
                <div className="p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reported User</p>
                  <p className="font-bold dark:text-white text-sm">{selectedReport.reportedUser?.name || 'Unknown'}</p>
                  {selectedReport.reportedUser?.email && <p className="text-xs text-slate-400">{selectedReport.reportedUser.email}</p>}
                </div>
              </div>

              <div className="p-6 bg-rose-50/50 dark:bg-rose-500/5 rounded-2xl border border-rose-100 dark:border-rose-500/20 mb-4">
                <div className="flex items-center gap-2 mb-3 text-rose-600">
                  <MessageCircle size={16} />
                  <p className="text-xs font-black uppercase tracking-widest">Incident Description</p>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selectedReport.description || selectedReport.reason || 'No additional details provided.'}
                </p>
              </div>

              {selectedReport.contentType && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 mb-4">
                  <div className="flex items-center gap-2 mb-3 text-slate-500">
                    {CONTENT_TYPE_META[selectedReport.contentType]?.icon ?? <FileImage size={14} />}
                    <p className="text-xs font-black uppercase tracking-widest">
                      Reported {CONTENT_TYPE_META[selectedReport.contentType]?.label ?? selectedReport.contentType}
                    </p>
                  </div>
                  {selectedReport.contentUrl && isImageType(selectedReport.contentType) && (
                    <img
                      src={selectedReport.contentUrl}
                      alt="Reported content"
                      className="w-full max-h-48 object-cover rounded-xl mb-3 border border-slate-200 dark:border-slate-700"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  {selectedReport.contentUrl && isAudioType(selectedReport.contentType) && (
                    <div className="mb-3 p-3 bg-slate-100 dark:bg-slate-900 rounded-xl">
                      <audio controls preload="metadata" className="w-full" src={selectedReport.contentUrl}>
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                  )}
                  {selectedReport.contentUrl && isVideoType(selectedReport.contentType) && (
                    <video controls preload="metadata" className="w-full max-h-64 rounded-xl mb-3 bg-black" src={selectedReport.contentUrl}>
                      Your browser does not support video playback.
                    </video>
                  )}
                  {selectedReport.contentPreview && (
                    <div className={`${isTextType(selectedReport.contentType) ? 'p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700' : ''}`}>
                      <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isTextType(selectedReport.contentType) ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400 italic'}`}>
                        {isTextType(selectedReport.contentType) ? selectedReport.contentPreview : `"${selectedReport.contentPreview}"`}
                      </p>
                    </div>
                  )}
                  {selectedReport.status === 'pending' && (
                    <button
                      onClick={() => handleDeleteContent(selectedReport._id)}
                      disabled={deletingContent}
                      className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                      {deletingContent ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Remove This Content
                    </button>
                  )}
                </div>
              )}

              {selectedReport.status === 'pending' && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Choose Action</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['dismiss', 'warn', 'suspend', 'ban'] as ResolveAction[]).map(act => {
                      const meta = ACTION_META[act];
                      const isSelected = pendingAction === act;
                      return (
                        <button
                          key={act}
                          onClick={() => setPendingAction(isSelected ? null : act)}
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all border-2 ${
                            isSelected
                              ? `${meta.bg} border-current ${meta.color} shadow-sm`
                              : `border-transparent ${meta.bg} ${meta.color} ${meta.hoverBg}`
                          }`}
                        >
                          {meta.icon}
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>

                  {pendingAction && pendingAction !== 'dismiss' && (
                    <textarea
                      value={actionNotes}
                      onChange={e => setActionNotes(e.target.value)}
                      placeholder={pendingAction === 'ban' ? 'Required: Reason for ban...' : 'Optional: Notes / reason for user...'}
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                    />
                  )}

                  {pendingAction && (
                    <button
                      onClick={() => handleModalAction(selectedReport._id)}
                      disabled={actionLoading !== null || (pendingAction === 'ban' && !actionNotes.trim())}
                      className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-white ${
                        pendingAction === 'ban' ? 'bg-rose-500 hover:bg-rose-600' :
                        pendingAction === 'suspend' ? 'bg-orange-500 hover:bg-orange-600' :
                        pendingAction === 'warn' ? 'bg-amber-500 hover:bg-amber-600' :
                        'bg-emerald-500 hover:bg-emerald-600'
                      }`}
                    >
                      {actionLoading ? <Loader2 size={14} className="animate-spin" /> : ACTION_META[pendingAction].icon}
                      Confirm — {ACTION_META[pendingAction].label}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsQueue;
