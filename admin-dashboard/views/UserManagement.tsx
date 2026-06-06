import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Filter, UserX, AlertTriangle, Eye, CheckCircle2, X,
  Loader2, RefreshCw, Download, ChevronLeft, ChevronRight,
  Trash2, PauseCircle, PlayCircle, AlertCircle, Crown, Users,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Badge from '../components/Badge';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { adminApi } from '../services/adminApi';
import PermissionGuard from '../components/PermissionGuard';
import { SkeletonTableRow } from '../components/Skeleton';
import ConfirmActionModal from '../components/ConfirmActionModal';
import UserProfileModal from '../components/UserProfileModal';
import { AppUser } from '../types';

interface UserManagementProps {
  showToast?: (message: string, type: 'success' | 'error') => void;
}

type ConfirmType = 'ban' | 'unban' | 'delete' | 'suspend' | 'unsuspend';
type ProfileTab  = 'bio' | 'activity' | 'safety' | 'notifications';

const PAGE_SIZE = 25;

const UserManagement: React.FC<UserManagementProps> = ({ showToast }) => {
  const [users, setUsers]               = useState<AppUser[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileTab>('bio');
  const [searchQuery, setSearchQuery]   = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'banned' | 'warned'>('all');
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [totalUsers, setTotalUsers]     = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ user: AppUser; type: ConfirmType } | null>(null);
  const [suspendDays, setSuspendDays]   = useState(7);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [premiumActionLoading, setPremiumActionLoading] = useState<'grant' | 'revoke' | null>(null);
  const [showGrantForm, setShowGrantForm]         = useState(false);
  const [grantDuration, setGrantDuration]         = useState(30);
  const [grantReason, setGrantReason]             = useState('');
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revokeReason, setRevokeReason]           = useState('');

  const fetchUsers = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const params: Record<string, unknown> = { page, limit: PAGE_SIZE };
      if (searchQuery) params.search = searchQuery;
      if (statusFilter !== 'all') params.status = statusFilter;
      const data = await adminApi.getUsers(params);
      if (data.success) {
        setUsers(data.users || []);
        if (data.pagination) {
          setTotalPages(data.pagination.pages || 1);
          setTotalUsers(data.pagination.total  || 0);
        }
      } else {
        setError('Failed to load users from server.');
        setUsers([]);
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to reach the backend. Check your API URL.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const mapUserStatus = (user: AppUser): string => {
    if (user.banned)                        return 'banned';
    if (user.suspended)                     return 'suspended';
    if (user.warnings && user.warnings > 0) return 'warned';
    return 'active';
  };

  const formatLocationName = (location: AppUser['location']): string => {
    if (!location) return '';
    if (typeof location === 'string') return location;
    const coords = Array.isArray(location.coordinates) && location.coordinates.length >= 2
      && !(Number(location.coordinates[0]) === 0 && Number(location.coordinates[1]) === 0)
      ? `${Number(location.coordinates[1]).toFixed(4)}, ${Number(location.coordinates[0]).toFixed(4)}`
      : '';
    return location.name || [location.city, location.country].filter(Boolean).join(', ') || location.address || coords || '';
  };

  const getUserLocationLabel = (user: AppUser): string =>
    user?.livingIn || formatLocationName(user?.location) || 'Not set';

  const getLocationUpdatedLabel = (user: AppUser): string => {
    if (!user?.locationUpdatedAt) return '';
    return `Updated ${new Date(user.locationUpdatedAt).toLocaleString()}`;
  };

  const formatRelativeTime = (date: string | Date): string => {
    const ms = Date.now() - new Date(date).getTime();
    if (ms < 0) return 'just now';
    const sec = Math.floor(ms / 1000);
    if (sec < 60)  return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60)  return `${min}m ago`;
    const hr  = Math.floor(min / 60);
    if (hr  < 24)  return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  };

  const getLiveLocationInfo = (user: AppUser) => {
    const live = user?.liveLocation;
    if (!live || !Array.isArray(live.coordinates) || live.coordinates.length < 2) return null;
    const [lng, lat] = live.coordinates;
    if (Number(lat) === 0 && Number(lng) === 0) return null;
    const updatedAt  = user?.liveLocationUpdatedAt ? new Date(user.liveLocationUpdatedAt) : null;
    const ageMs      = updatedAt ? Date.now() - updatedAt.getTime() : Infinity;
    const isLive     = ageMs < 10 * 60 * 1000;
    const isRecent   = ageMs < 60 * 60 * 1000;
    const cityCountry = [live.city, live.country].filter(Boolean).join(', ');
    return {
      lat: Number(lat), lng: Number(lng),
      label:    cityCountry || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`,
      coords:   `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`,
      updatedAt, relative: updatedAt ? formatRelativeTime(updatedAt) : 'unknown',
      isLive, isRecent,
    };
  };

  const getLoveLocations = (user: AppUser): string[] => {
    const locations: string[] = [];
    const passport = formatLocationName(user.passportLocation);
    if (passport) locations.push(`Passport: ${passport}`);
    (user.additionalLocations || []).forEach((loc: AppUser['location']) => {
      const name = formatLocationName(loc);
      if (name) locations.push(name);
    });
    return locations;
  };

  const handleUserClick = (user: AppUser) => {
    setSelectedUser(user);
    setIsModalOpen(true);
    setActiveProfileTab('bio');
    setShowGrantForm(false);
    setShowRevokeConfirm(false);
  };

  const handleBanToggle = async (user: AppUser, ban: boolean) => {
    setActionLoading(user._id + (ban ? 'ban' : 'unban'));
    try {
      const data = await adminApi.banUser(user._id, ban, ban ? 'Banned by admin' : undefined);
      if (data.success) {
        const updated = { ...user, banned: ban };
        setUsers(prev => prev.map(u => u._id === user._id ? updated : u));
        if (selectedUser?._id === user._id) setSelectedUser(updated);
        showToast?.(ban ? `${user.name} has been banned.` : `${user.name}'s access has been restored.`, ban ? 'error' : 'success');
      }
    } catch (err: unknown) {
      showToast?.((err as Error)?.message || 'Action failed. Try again.', 'error');
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleSuspendToggle = async (user: AppUser, suspend: boolean) => {
    setActionLoading(user._id + (suspend ? 'suspend' : 'unsuspend'));
    try {
      const data = await adminApi.suspendUser(user._id, suspend, suspend ? suspendDays : undefined);
      if (data.success) {
        const updated = { ...user, suspended: suspend };
        setUsers(prev => prev.map(u => u._id === user._id ? updated : u));
        if (selectedUser?._id === user._id) setSelectedUser(updated);
        showToast?.(suspend ? `${user.name} suspended for ${suspendDays} days.` : `${user.name}'s suspension lifted.`, 'success');
      }
    } catch (err: unknown) {
      showToast?.((err as Error)?.message || 'Action failed. Try again.', 'error');
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleDelete = async (user: AppUser) => {
    setActionLoading(user._id + 'delete');
    try {
      const data = await adminApi.deleteUser(user._id);
      if (data.success) {
        setUsers(prev => prev.filter(u => u._id !== user._id));
        if (selectedUser?._id === user._id) { setIsModalOpen(false); setSelectedUser(null); }
        showToast?.(`${user.name}'s account has been permanently deleted.`, 'error');
      }
    } catch (err: unknown) {
      showToast?.((err as Error)?.message || 'Delete failed. Try again.', 'error');
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmModal) return;
    const { user, type } = confirmModal;
    if (type === 'ban')       await handleBanToggle(user, true);
    else if (type === 'unban')      await handleBanToggle(user, false);
    else if (type === 'suspend')    await handleSuspendToggle(user, true);
    else if (type === 'unsuspend')  await handleSuspendToggle(user, false);
    else if (type === 'delete')     await handleDelete(user);
  };

  const handleGrantPremium = async () => {
    if (!selectedUser || !grantDuration || grantDuration < 1) return;
    setPremiumActionLoading('grant');
    try {
      const res = await adminApi.grantPremium(selectedUser._id, {
        durationDays: grantDuration,
        reason: grantReason.trim() || undefined,
      });
      if (res?.success) {
        const updated = { ...selectedUser, premium: { ...selectedUser.premium, isActive: true, source: 'admin' } };
        setSelectedUser(updated);
        setUsers(prev => prev.map(u => u._id === selectedUser._id ? updated : u));
        setShowGrantForm(false);
        setGrantReason('');
        showToast?.(`Premium granted to ${selectedUser.name || selectedUser.email} for ${grantDuration} days.`, 'success');
      } else {
        showToast?.(res?.message || 'Failed to grant premium.', 'error');
      }
    } catch (err: unknown) {
      showToast?.((err as Error)?.message || 'Failed to grant premium.', 'error');
    } finally {
      setPremiumActionLoading(null);
    }
  };

  const handleRevokePremium = async () => {
    if (!selectedUser) return;
    setPremiumActionLoading('revoke');
    try {
      const res = await adminApi.revokePremium(selectedUser._id, revokeReason.trim() || undefined);
      if (res?.success) {
        const updated = { ...selectedUser, premium: { ...selectedUser.premium, isActive: false } };
        setSelectedUser(updated);
        setUsers(prev => prev.map(u => u._id === selectedUser._id ? updated : u));
        setShowRevokeConfirm(false);
        setRevokeReason('');
        showToast?.(`Premium revoked for ${selectedUser.name || selectedUser.email}.`, 'success');
      } else {
        showToast?.(res?.message || 'Failed to revoke premium.', 'error');
      }
    } catch (err: unknown) {
      showToast?.((err as Error)?.message || 'Failed to revoke premium.', 'error');
    } finally {
      setPremiumActionLoading(null);
    }
  };

  const exportCSV = () => {
    if (users.length === 0) return;
    const headers = ['Name', 'Email', 'Status', 'Verified', 'Location', 'Joined'];
    const rows = users.map(u => [
      u.name || '',
      u.email || '',
      mapUserStatus(u),
      u.verified ? 'Yes' : 'No',
      getUserLocationLabel(u),
      u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '',
    ]);
    const csv  = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `users-page${page}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.(`Exported ${users.length} users to CSV.`, 'success');
  };

  const statusBadge = (status: string): string => {
    const map: Record<string, string> = {
      active:    'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      warned:    'bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400',
      suspended: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
      banned:    'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400',
    };
    return map[status] || map.active;
  };

  const handleConfirmRequest = (user: AppUser, type: ConfirmType) => {
    setConfirmModal({ user, type });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="User Management"
        eyebrow="Citizens"
        subtitle={loading ? 'Loading...' : `${totalUsers.toLocaleString()} total users`}
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search name or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Search users by name or email"
                className="pl-9 pr-8 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none w-52 text-sm dark:text-white"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-500" size={13} aria-hidden="true" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                aria-label="Filter by status"
                className="pl-8 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm outline-none appearance-none cursor-pointer dark:text-slate-300 font-medium"
              >
                <option value="all">All Users</option>
                <option value="active">Active</option>
                <option value="warned">Warned</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
              </select>
            </div>
            <button onClick={() => fetchUsers()} aria-label="Refresh user list" className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-gray-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 transition-all">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              Refresh
            </button>
            <button onClick={exportCSV} disabled={users.length === 0} aria-label="Export current page as CSV" className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-all disabled:opacity-40">
              <Download size={14} aria-hidden="true" />
              Export
            </button>
          </>
        }
      />

      {error && (
        <div role="alert" className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl text-sm text-rose-700 dark:text-rose-400">
          <AlertCircle size={18} className="shrink-0" aria-hidden="true" />
          <span className="font-medium">{error}</span>
          <button onClick={() => fetchUsers()} className="ml-auto underline text-xs">Retry</button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left" aria-label="Loading users">
              <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-100 dark:border-slate-800">
                <tr>
                  {['User', 'Location', 'Status', 'Verified', 'Joined', 'Actions'].map(h => (
                    <th key={h} scope="col" className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {[1,2,3,4,5,6,7,8].map(i => <SkeletonTableRow key={i} cols={6} />)}
              </tbody>
            </table>
          </div>
        ) : users.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left" aria-label="Users list">
                <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-100 dark:border-slate-800">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">User</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Location</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Verified</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Joined</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {users.map(user => {
                    const status = mapUserStatus(user);
                    return (
                      <tr key={user._id} className="hover:bg-teal-50/30 dark:hover:bg-teal-500/5 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3 group">
                            <Avatar
                              src={user.photos?.[0]?.url}
                              name={user.name}
                              size="md"
                              hover
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{user.name}</p>
                              <p className="text-xs text-gray-400 dark:text-slate-500 truncate max-w-[160px]">{user.email}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">
                          <div className="flex flex-col gap-1">
                            <span>{getUserLocationLabel(user)}</span>
                            {(() => {
                              const live = getLiveLocationInfo(user);
                              if (!live) return (
                                <span className="text-[10px] text-gray-400 dark:text-slate-500">No live location yet</span>
                              );
                              const dotColor   = live.isLive ? 'bg-emerald-500' : live.isRecent ? 'bg-amber-500' : 'bg-gray-400';
                              const labelColor = live.isLive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400';
                              return (
                                <a
                                  href={`https://www.google.com/maps?q=${live.lat},${live.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-[11px] hover:underline"
                                  title={`Live location · ${live.coords}`}
                                >
                                  <span className="relative flex h-2 w-2">
                                    {live.isLive && (
                                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-60`} />
                                    )}
                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
                                  </span>
                                  <span className={`font-semibold ${labelColor}`}>{live.isLive ? 'LIVE' : 'Last seen'}</span>
                                  <span className="text-gray-500 dark:text-slate-400">{live.label} · {live.relative}</span>
                                </a>
                              );
                            })()}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <Badge variant={status as any} label={status} dot />
                        </td>

                        <td className="px-6 py-4">
                          {user.verified
                            ? <CheckCircle2 size={16} className="text-teal-500" aria-label="Verified" />
                            : <AlertTriangle size={16} className="text-amber-400" aria-label="Not verified" />}
                        </td>

                        <td className="px-6 py-4 text-xs text-gray-400 dark:text-slate-500">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleUserClick(user)}
                              aria-label={`View profile for ${user.name}`}
                              className="p-2 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-500/20 transition-all"
                            >
                              <Eye size={15} />
                            </button>

                            {user.suspended ? (
                              <button
                                onClick={() => setConfirmModal({ user, type: 'unsuspend' })}
                                disabled={actionLoading !== null}
                                aria-label={`Lift suspension for ${user.name}`}
                                className="p-2 text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-lg hover:bg-amber-100 transition-all disabled:opacity-40"
                              >
                                <PlayCircle size={15} />
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmModal({ user, type: 'suspend' })}
                                disabled={actionLoading !== null}
                                aria-label={`Suspend ${user.name}`}
                                className="p-2 text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-lg hover:bg-amber-100 transition-all disabled:opacity-40"
                              >
                                <PauseCircle size={15} />
                              </button>
                            )}

                            {user.banned ? (
                              <button
                                onClick={() => setConfirmModal({ user, type: 'unban' })}
                                disabled={actionLoading !== null}
                                aria-label={`Restore access for ${user.name}`}
                                className="p-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg hover:bg-emerald-100 transition-all disabled:opacity-40"
                              >
                                {actionLoading === user._id + 'unban'
                                  ? <Loader2 size={15} className="animate-spin" />
                                  : <CheckCircle2 size={15} />}
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmModal({ user, type: 'ban' })}
                                disabled={actionLoading !== null}
                                aria-label={`Ban ${user.name}`}
                                className="p-2 text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg hover:bg-rose-100 transition-all disabled:opacity-40"
                              >
                                {actionLoading === user._id + 'ban'
                                  ? <Loader2 size={15} className="animate-spin" />
                                  : <UserX size={15} />}
                              </button>
                            )}

                            <PermissionGuard action="delete_user" lockLabel="Super Admin only">
                              <button
                                onClick={() => setConfirmModal({ user, type: 'delete' })}
                                disabled={actionLoading !== null}
                                aria-label={`Delete account for ${user.name}`}
                                className="p-2 text-gray-400 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-rose-50 hover:text-rose-500 transition-all disabled:opacity-40"
                              >
                                {actionLoading === user._id + 'delete'
                                  ? <Loader2 size={15} className="animate-spin" />
                                  : <Trash2 size={15} />}
                              </button>
                            </PermissionGuard>

                            {user.premium?.isActive && (
                              <Crown size={15} className="text-amber-400" aria-label="Premium member" />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-slate-800">
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                Page {page} of {totalPages} · {totalUsers.toLocaleString()} total
              </p>
              <nav aria-label="Pagination" className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  aria-label="Previous page"
                  className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-gray-600 dark:text-slate-300 hover:border-teal-400 transition-all disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start   = Math.max(1, Math.min(page - 2, totalPages - 4));
                    const pageNum = start + i;
                    if (pageNum > totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        aria-label={`Page ${pageNum}`}
                        aria-current={pageNum === page ? 'page' : undefined}
                        className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${pageNum === page ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800'}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  aria-label="Next page"
                  className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-gray-600 dark:text-slate-300 hover:border-teal-400 transition-all disabled:opacity-40"
                >
                  Next <ChevronRight size={14} />
                </button>
              </nav>
            </div>
          </>
        ) : !error ? (
          <EmptyState
            icon={<Users size={28} />}
            title="No users found"
            description="Try adjusting your search or filter criteria."
          />
        ) : null}
      </div>

      <UserProfileModal
        isOpen={isModalOpen}
        user={selectedUser}
        onClose={() => { setIsModalOpen(false); setSelectedUser(null); }}
        onConfirmAction={handleConfirmRequest}
        activeProfileTab={activeProfileTab}
        onTabChange={setActiveProfileTab}
        lightboxPhoto={lightboxPhoto}
        onSetLightboxPhoto={setLightboxPhoto}
        mapUserStatus={mapUserStatus}
        statusBadge={statusBadge}
        getUserLocationLabel={getUserLocationLabel}
        getLocationUpdatedLabel={getLocationUpdatedLabel}
        getLiveLocationInfo={getLiveLocationInfo}
        getLoveLocations={getLoveLocations}
        formatRelativeTime={formatRelativeTime}
        showGrantForm={showGrantForm}
        setShowGrantForm={setShowGrantForm}
        showRevokeConfirm={showRevokeConfirm}
        setShowRevokeConfirm={setShowRevokeConfirm}
        grantDuration={grantDuration}
        setGrantDuration={setGrantDuration}
        grantReason={grantReason}
        setGrantReason={setGrantReason}
        revokeReason={revokeReason}
        setRevokeReason={setRevokeReason}
        premiumActionLoading={premiumActionLoading}
        handleGrantPremium={handleGrantPremium}
        handleRevokePremium={handleRevokePremium}
      />

      <ConfirmActionModal
        confirmModal={confirmModal}
        onClose={() => setConfirmModal(null)}
        onConfirm={handleConfirmAction}
        actionLoading={actionLoading}
        suspendDays={suspendDays}
        setSuspendDays={setSuspendDays}
      />
    </div>
  );
};

export default UserManagement;
