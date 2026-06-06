import React from 'react';
import {
  X, Eye, MapPin, Calendar, History, ShieldAlert, Award, Heart,
  Briefcase, GraduationCap, Camera, Tag, Cigarette, Wine,
  PlayCircle, PauseCircle, UserX, CheckCircle2, Trash2,
  Crown, Gift, Loader2, Bell,
} from 'lucide-react';
import PermissionGuard from './PermissionGuard';
import UserNotificationLog from '../views/UserNotificationLog';
import { useFocusTrap } from './FocusTrap';

type ConfirmType = 'ban' | 'unban' | 'delete' | 'suspend' | 'unsuspend';
type ProfileTab   = 'bio' | 'activity' | 'safety' | 'notifications';

interface Props {
  isOpen: boolean;
  user: any;
  onClose: () => void;
  onConfirmAction: (user: any, type: ConfirmType) => void;
  activeProfileTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  lightboxPhoto: string | null;
  onSetLightboxPhoto: (url: string | null) => void;
  mapUserStatus: (user: any) => string;
  statusBadge:   (status: string) => string;
  getUserLocationLabel:    (user: any) => string;
  getLocationUpdatedLabel: (user: any) => string;
  getLiveLocationInfo:     (user: any) => any;
  getLoveLocations:        (user: any) => string[];
  formatRelativeTime:      (date: string | Date) => string;
  showGrantForm:    boolean;
  setShowGrantForm: (b: boolean) => void;
  showRevokeConfirm:    boolean;
  setShowRevokeConfirm: (b: boolean) => void;
  grantDuration:    number;
  setGrantDuration: (n: number) => void;
  grantReason:      string;
  setGrantReason:   (s: string) => void;
  revokeReason:     string;
  setRevokeReason:  (s: string) => void;
  premiumActionLoading: 'grant' | 'revoke' | null;
  handleGrantPremium:  () => void;
  handleRevokePremium: () => void;
}

const PROFILE_TABS: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
  { id: 'bio',           label: 'Profile',       icon: <Eye size={14} /> },
  { id: 'activity',      label: 'Activity',      icon: <History size={14} /> },
  { id: 'safety',        label: 'Safety',        icon: <ShieldAlert size={14} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
];

const UserProfileModal: React.FC<Props> = ({
  isOpen,
  user,
  onClose,
  onConfirmAction,
  activeProfileTab,
  onTabChange,
  lightboxPhoto,
  onSetLightboxPhoto,
  mapUserStatus,
  statusBadge,
  getUserLocationLabel,
  getLocationUpdatedLabel,
  getLiveLocationInfo,
  getLoveLocations,
  formatRelativeTime: _ft,
  showGrantForm,
  setShowGrantForm,
  showRevokeConfirm,
  setShowRevokeConfirm,
  grantDuration,
  setGrantDuration,
  grantReason,
  setGrantReason,
  revokeReason,
  setRevokeReason,
  premiumActionLoading,
  handleGrantPremium,
  handleRevokePremium,
}) => {
  const trapRef = useFocusTrap(isOpen);

  if (!isOpen || !user) return null;

  const status = mapUserStatus(user);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xl animate-fadeIn"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-modal-title"
      >
        <div
          ref={trapRef}
          className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-white/10 flex flex-col"
        >
          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 dark:border-slate-800 shrink-0">
            <h2 id="user-profile-modal-title" className="text-lg font-black dark:text-white">
              User Profile
            </h2>
            <button
              onClick={onClose}
              aria-label="Close user profile"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-white bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 p-2.5 rounded-xl transition-all"
            >
              <X size={20} />
            </button>
          </div>

          <div className="px-8 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col md:flex-row items-start gap-6 mt-6 mb-8">
              <div
                className="p-1.5 bg-white dark:bg-slate-800 rounded-2xl shadow-xl ring-1 ring-black/5 shrink-0 cursor-pointer hover:ring-teal-400 transition-all"
                onClick={() => { const url = user.photos?.[0]?.url; if (url) onSetLightboxPhoto(url); }}
                title="Click to enlarge"
                role="button"
                aria-label="Enlarge profile photo"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { const url = user.photos?.[0]?.url; if (url) onSetLightboxPhoto(url); } }}
              >
                <img
                  src={user.photos?.[0]?.url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'U')}&background=14b8a6&color=fff&size=200`}
                  className="h-36 w-36 rounded-xl object-cover"
                  alt={user.name}
                />
              </div>

              <div className="flex-1 pb-2">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h2 className="text-2xl font-black text-gray-900 dark:text-white">{user.name}</h2>
                  {user.verified && (
                    <span className="bg-teal-500 text-white px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1 uppercase tracking-widest">
                      <Award size={12} /> VERIFIED
                    </span>
                  )}
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${statusBadge(status)}`}>
                    {status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-4 text-gray-500 dark:text-slate-400 text-sm">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} className="text-teal-500" />
                    {getUserLocationLabel(user)}{getLocationUpdatedLabel(user) ? ` · ${getLocationUpdatedLabel(user)}` : ''}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} className="text-teal-500" />
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                  </span>
                  {user.age && <span className="flex items-center gap-1.5"><span className="text-teal-500 text-xs font-bold">Age</span> {user.age}</span>}
                  {user.email && <span className="text-xs text-gray-400">{user.email}</span>}
                </div>

                {(() => {
                  const live = getLiveLocationInfo(user);
                  if (!live) return (
                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-slate-800 text-[11px] font-semibold text-gray-500 dark:text-slate-400 w-fit">
                      <span className="h-2 w-2 rounded-full bg-gray-400" />
                      No live location reported yet
                    </div>
                  );
                  const dotColor = live.isLive ? 'bg-emerald-500' : live.isRecent ? 'bg-amber-500' : 'bg-gray-400';
                  const wrapColor = live.isLive
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300';
                  return (
                    <a
                      href={`https://www.google.com/maps?q=${live.lat},${live.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold w-fit hover:opacity-90 ${wrapColor}`}
                      title={live.coords}
                    >
                      <span className="relative flex h-2 w-2">
                        {live.isLive && (
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-60`} />
                        )}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
                      </span>
                      {live.isLive ? 'LIVE NOW' : 'Last seen'} · {live.label} · {live.relative}
                    </a>
                  );
                })()}
              </div>

              <div className="flex gap-2 pb-2 flex-wrap">
                {user.suspended ? (
                  <button
                    onClick={() => onConfirmAction(user, 'unsuspend')}
                    className="px-5 py-2.5 bg-amber-500 text-white text-xs font-black rounded-xl hover:bg-amber-600 transition-all flex items-center gap-2"
                  >
                    <PlayCircle size={15} /> Lift Suspension
                  </button>
                ) : !user.banned && (
                  <button
                    onClick={() => onConfirmAction(user, 'suspend')}
                    className="px-5 py-2.5 bg-amber-500 text-white text-xs font-black rounded-xl hover:bg-amber-600 transition-all flex items-center gap-2"
                  >
                    <PauseCircle size={15} /> Suspend
                  </button>
                )}
                <button
                  onClick={() => onConfirmAction(user, user.banned ? 'unban' : 'ban')}
                  className={`px-5 py-2.5 text-xs font-black rounded-xl transition-all flex items-center gap-2 ${user.banned ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-rose-500 hover:bg-rose-600 text-white'}`}
                >
                  {user.banned ? <><CheckCircle2 size={15} /> Restore Access</> : <><UserX size={15} /> Ban User</>}
                </button>
                <PermissionGuard action="delete_user" lockLabel="Super Admin only">
                  <button
                    onClick={() => onConfirmAction(user, 'delete')}
                    className="px-5 py-2.5 bg-gray-700 text-white text-xs font-black rounded-xl hover:bg-gray-800 transition-all flex items-center gap-2"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                </PermissionGuard>
              </div>
            </div>

            <div className="flex border-b border-gray-100 dark:border-slate-800 mb-6 sticky top-0 bg-white dark:bg-slate-900 z-10" role="tablist">
              {PROFILE_TABS.map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeProfileTab === tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-6 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeProfileTab === tab.id ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            <div className="pb-10" role="tabpanel">
              {activeProfileTab === 'bio' && (
                <div className="space-y-6 animate-fadeIn">
                  {user.photos?.length > 0 && (
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Camera size={12} /> Photos ({user.photos.length})
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {user.photos.map((photo: any, i: number) => {
                          const url = photo?.url || (typeof photo === 'string' ? photo : null);
                          if (!url) return null;
                          return (
                            <div
                              key={i}
                              className="aspect-square rounded-xl overflow-hidden border-2 border-gray-100 dark:border-slate-700 cursor-pointer hover:border-teal-400 transition-all group relative"
                              onClick={() => onSetLightboxPhoto(url)}
                              role="button"
                              tabIndex={0}
                              aria-label={`View photo ${i + 1}`}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSetLightboxPhoto(url); }}
                            >
                              <img src={url} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt={`Photo ${i + 1}`} />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                                <Eye size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                              </div>
                              {photo?.privacy && (
                                <span className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">{photo.privacy}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {user.bio && (
                    <div className="p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bio</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">"{user.bio}"</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Job / Title',        value: user.jobTitle,              icon: <Briefcase size={10} /> },
                      { label: 'Education',           value: user.education,             icon: <GraduationCap size={10} /> },
                      { label: 'Relationship Goal',   value: user.relationshipGoal,      icon: <Heart size={10} /> },
                      { label: 'Ethnicity',           value: user.ethnicity,             icon: null },
                      { label: 'Religion',            value: user.religion,              icon: null },
                      { label: 'Height',              value: user.height ? `${user.height} cm` : null, icon: null },
                      { label: 'Drinking',            value: user.lifestyle?.drinking,   icon: <Wine size={10} /> },
                      { label: 'Smoking',             value: user.lifestyle?.smoking,    icon: <Cigarette size={10} /> },
                      { label: 'Has Kids',            value: user.hasKids != null ? (user.hasKids ? 'Yes' : 'No') : null, icon: null },
                      { label: 'Wants Kids',          value: user.wantsKids,             icon: null },
                      { label: 'Language',            value: Array.isArray(user.languages) ? user.languages.join(', ') : user.language, icon: null },
                      { label: 'Zodiac',              value: user.zodiac,                icon: null },
                      { label: 'Hometown',            value: user.hometown,              icon: <MapPin size={10} /> },
                      { label: 'Phone',               value: user.phone,                 icon: null },
                      { label: 'Gender',              value: user.gender,                icon: null },
                      { label: 'Sexual Orientation',  value: user.sexualOrientation,     icon: null },
                    ].map(item => item.value ? (
                      <div key={item.label} className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">{item.icon} {item.label}</p>
                        <p className="text-sm font-semibold dark:text-white">{item.value}</p>
                      </div>
                    ) : null)}
                  </div>

                  {getLoveLocations(user).length > 0 && (
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Heart size={12} /> Love Locations
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {getLoveLocations(user).map((location, i) => (
                          <div key={i} className="p-4 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-100 dark:border-rose-500/20">
                            <p className="text-sm font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                              <MapPin size={13} /> {location}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {user.interests?.length > 0 && (
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Tag size={12} /> Interests
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {user.interests.map((interest: string, i: number) => (
                          <span key={i} className="px-3 py-1.5 bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 rounded-lg text-xs font-bold">
                            {interest}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {user.prompts?.length > 0 && (
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Prompts</p>
                      <div className="space-y-2">
                        {user.prompts.map((p: any, i: number) => (
                          <div key={i} className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                            <p className="text-[10px] font-black text-slate-400 mb-1">{p.question}</p>
                            <p className="text-sm dark:text-white">{p.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeProfileTab === 'activity' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Last Active', value: user.lastActive ? new Date(user.lastActive).toLocaleString() : '—' },
                      { label: 'Joined',      value: user.createdAt  ? new Date(user.createdAt).toLocaleDateString()  : '—' },
                      { label: 'Online Now',  value: user.online ? 'Yes' : 'No' },
                    ].map(item => (
                      <div key={item.label} className="p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                        <p className="text-sm font-bold dark:text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className={`p-5 rounded-2xl border ${user.premium?.isActive ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' : 'bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Crown size={14} className={user.premium?.isActive ? 'text-amber-500' : 'text-slate-400'} />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Premium</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${user.premium?.isActive ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' : 'bg-gray-200 dark:bg-slate-700 text-slate-500'}`}>
                        {user.premium?.isActive ? `Active · ${user.premium?.source || 'unknown'}` : 'Free'}
                      </span>
                    </div>

                    {user.premium?.isActive && user.premium?.expiresAt && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        Expires {new Date(user.premium.expiresAt).toLocaleDateString()}
                      </p>
                    )}

                    {!showGrantForm && !showRevokeConfirm && (
                      <div className="flex gap-2">
                        {!user.premium?.isActive && (
                          <button
                            onClick={() => { setShowGrantForm(true); setShowRevokeConfirm(false); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white"
                          >
                            <Gift size={12} /> Grant Premium
                          </button>
                        )}
                        {user.premium?.isActive && user.premium?.source === 'admin' && (
                          <button
                            onClick={() => { setShowRevokeConfirm(true); setShowGrantForm(false); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white"
                          >
                            <Trash2 size={12} /> Revoke
                          </button>
                        )}
                        {user.premium?.isActive && user.premium?.source !== 'admin' && (
                          <p className="text-[10px] text-slate-400">Store subscription — manage via Apple/Google.</p>
                        )}
                      </div>
                    )}

                    {showGrantForm && (
                      <div className="space-y-3 mt-2">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Duration</p>
                          <div className="flex flex-wrap gap-1.5">
                            {[7, 30, 90, 180, 365].map(d => (
                              <button
                                key={d}
                                onClick={() => setGrantDuration(d)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${grantDuration === d ? 'bg-teal-500 text-white border-teal-500' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200'}`}
                              >
                                {d === 7 ? '1 wk' : d === 30 ? '1 mo' : d === 90 ? '3 mo' : d === 180 ? '6 mo' : '1 yr'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          type="text"
                          value={grantReason}
                          onChange={e => setGrantReason(e.target.value)}
                          placeholder="Reason (optional)"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-xs text-gray-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-400"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setShowGrantForm(false); setGrantReason(''); }}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleGrantPremium}
                            disabled={premiumActionLoading === 'grant' || !grantDuration}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
                          >
                            {premiumActionLoading === 'grant' ? <Loader2 size={12} className="animate-spin" /> : <Gift size={12} />}
                            Grant {grantDuration}d
                          </button>
                        </div>
                      </div>
                    )}

                    {showRevokeConfirm && (
                      <div className="space-y-3 mt-2">
                        <input
                          type="text"
                          value={revokeReason}
                          onChange={e => setRevokeReason(e.target.value)}
                          placeholder="Reason for revoke (optional)"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-xs text-gray-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-400"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setShowRevokeConfirm(false); setRevokeReason(''); }}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleRevokePremium}
                            disabled={premiumActionLoading === 'revoke'}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-50"
                          >
                            {premiumActionLoading === 'revoke' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            Confirm Revoke
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">User ID</p>
                    <p className="text-xs font-mono text-slate-500 break-all">{user._id}</p>
                  </div>
                </div>
              )}

              {activeProfileTab === 'safety' && (
                <div className="space-y-4 animate-fadeIn">
                  {[
                    { label: 'Account Status', value: status.toUpperCase(), color: status === 'active' ? 'text-emerald-600' : 'text-rose-600' },
                    { label: 'Warnings',   value: String(user.warnings || 0),                                          color: 'text-amber-600' },
                    { label: 'Ban Reason', value: user.banReason  || '—',                                              color: 'dark:text-white' },
                    { label: 'Banned At',  value: user.bannedAt ? new Date(user.bannedAt).toLocaleString() : '—',      color: 'dark:text-white' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                      <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                  <div className="p-5 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-2xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Cigarette size={14} className="text-amber-500" />
                      <p className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">Lifestyle Flags</p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Smoking: {user.lifestyle?.smoking || 'N/A'} · Drinking: {user.lifestyle?.drinking || 'N/A'}
                    </p>
                  </div>
                </div>
              )}

              {activeProfileTab === 'notifications' && (
                <UserNotificationLog userId={user._id} userEmail={user.email} />
              )}
            </div>
          </div>
        </div>
      </div>

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
          onClick={() => onSetLightboxPhoto(null)}
        >
          <button
            onClick={() => onSetLightboxPhoto(null)}
            aria-label="Close photo"
            className="absolute top-5 right-5 text-white bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition-all z-10"
          >
            <X size={22} />
          </button>
          <img
            src={lightboxPhoto}
            className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain shadow-2xl"
            alt="Full size photo"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default UserProfileModal;
