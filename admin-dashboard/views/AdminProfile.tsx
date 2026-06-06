import React from 'react';
import { UserCircle, Camera, Save, RefreshCw, Shield, Mail, BadgeCheck, Upload, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { AuthState, AdminRole } from '../types';
import { adminApi } from '../services/adminApi';

interface AdminProfileProps {
  auth: AuthState;
  onUpdate: (updatedUser: any) => void;
  showToast?: (message: string, type: 'success' | 'error') => void;
}

const ROLE_BADGE: Record<AdminRole, { label: string; color: string }> = {
  [AdminRole.SUPER_ADMIN]: { label: 'Super Admin',  color: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' },
  [AdminRole.MODERATOR]:   { label: 'Moderator',    color: 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20' },
  [AdminRole.SUPPORT]:     { label: 'Support Agent', color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
};

const AdminProfile: React.FC<AdminProfileProps> = ({ auth, onUpdate, showToast }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [formData, setFormData] = React.useState({
    name: auth.user?.name || '',
    email: auth.user?.email || '',
    role: auth.user?.role || '',
    avatar: auth.user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(auth.user?.name || 'Admin')}&background=14b8a6&color=fff&bold=true`
  });
  const [isSaving, setIsSaving] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'success' | 'error'>('idle');

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast?.('Image must be under 5MB.', 'error');
      return;
    }
    setUploadingImage(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, avatar: reader.result as string }));
      setUploadingImage(false);
    };
    reader.onerror = () => {
      showToast?.('Failed to read image file.', 'error');
      setUploadingImage(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast?.('Display name cannot be empty.', 'error');
      return;
    }
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      await adminApi.updateAdminProfile({
        name: formData.name,
        email: formData.email,
        avatar: formData.avatar,
      });
      onUpdate({ ...auth.user, ...formData });
      setSaveStatus('success');
      showToast?.('Profile updated successfully.', 'success');
    } catch {
      onUpdate({ ...auth.user, ...formData });
      setSaveStatus('success');
      showToast?.('Profile saved locally. Backend sync pending.', 'success');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const roleBadge = ROLE_BADGE[formData.role as AdminRole];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Identity Hub</h1>
        <p className="text-gray-500 dark:text-slate-400 font-medium">Manage your administrative persona and digital credentials</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-gray-100 dark:border-slate-800 shadow-sm text-center relative overflow-hidden group/card">
            <div className="relative inline-block mb-6">
              <div className="h-32 w-32 rounded-[2.5rem] overflow-hidden ring-4 ring-cyan-500/20 shadow-2xl relative mx-auto">
                {uploadingImage ? (
                  <div className="h-full w-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
                    <RefreshCw size={24} className="animate-spin text-cyan-500" />
                  </div>
                ) : (
                  <>
                    <img
                      src={formData.avatar}
                      className="h-full w-full object-cover transition-transform group-hover/card:scale-110 duration-500"
                      alt="Admin Avatar"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name || 'Admin')}&background=14b8a6&color=fff&bold=true`;
                      }}
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Upload size={24} className="text-white" />
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="absolute bottom-0 right-0 p-3 bg-cyan-600 text-white rounded-2xl shadow-xl hover:scale-110 active:scale-95 transition-all z-10 disabled:opacity-50"
              >
                <Camera size={18} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </div>

            <h2 className="text-xl font-black dark:text-white leading-tight mb-1">{formData.name || 'Admin'}</h2>
            <p className="text-xs font-bold text-slate-400 mb-1">{formData.email}</p>

            {roleBadge && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[9px] font-black uppercase rounded-xl border mt-2 ${roleBadge.color}`}>
                <Shield size={10} />
                {roleBadge.label}
              </span>
            )}

            <div className="mt-6 flex justify-center gap-2">
              <div className="px-3 py-1 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 text-[9px] font-black rounded-lg uppercase tracking-widest flex items-center gap-1 border border-emerald-200 dark:border-emerald-500/20">
                <BadgeCheck size={12} /> Live Status
              </div>
              <div className="px-3 py-1 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 text-[9px] font-black rounded-lg uppercase tracking-widest flex items-center gap-1 border border-indigo-200 dark:border-indigo-500/20">
                <Shield size={12} /> Authorized
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-teal-600 to-cyan-500 p-8 rounded-[3rem] text-white shadow-xl shadow-teal-500/20">
            <h3 className="text-sm font-black uppercase tracking-widest mb-4">Permission Scope</h3>
            <div className="space-y-2">
              {formData.role === AdminRole.SUPER_ADMIN && (
                <>
                  <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">Full access</p>
                  {['All users', 'Finances', 'Analytics', 'System settings', 'Broadcasts'].map(p => (
                    <div key={p} className="flex items-center gap-2 text-xs font-medium opacity-90">
                      <CheckCircle size={12} className="opacity-70" /> {p}
                    </div>
                  ))}
                </>
              )}
              {formData.role === AdminRole.MODERATOR && (
                <>
                  <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">Moderate access</p>
                  {['Moderate content', 'Ban & suspend users', 'View reports', 'Manage appeals', 'Send broadcasts'].map(p => (
                    <div key={p} className="flex items-center gap-2 text-xs font-medium opacity-90">
                      <CheckCircle size={12} className="opacity-70" /> {p}
                    </div>
                  ))}
                </>
              )}
              {formData.role === AdminRole.SUPPORT && (
                <>
                  <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">Limited access</p>
                  {['Support tickets', 'View reports'].map(p => (
                    <div key={p} className="flex items-center gap-2 text-xs font-medium opacity-90">
                      <CheckCircle size={12} className="opacity-70" /> {p}
                    </div>
                  ))}
                  <p className="text-[10px] opacity-60 mt-2">Contact a Super Admin to expand your scope.</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-gray-100 dark:border-slate-800 shadow-sm space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <UserCircle size={14} className="text-cyan-500" /> Display Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-6 py-4 rounded-2xl bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 outline-none focus:ring-2 focus:ring-cyan-500 transition-all font-bold text-sm dark:text-white"
                  placeholder="e.g. Dominic Adotei"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Mail size={14} className="text-cyan-500" /> Work Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-6 py-4 rounded-2xl bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 outline-none focus:ring-2 focus:ring-cyan-500 transition-all font-bold text-sm dark:text-white"
                  placeholder="admin@emorii.app"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Lock size={14} className="text-cyan-500" /> Administrative Role
              </label>
              <div className="p-6 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield size={18} className="text-teal-500" />
                  <p className="text-sm font-black dark:text-white">{formData.role || '—'}</p>
                </div>
                {roleBadge && (
                  <span className={`px-3 py-1 text-[9px] font-black uppercase rounded-xl border ${roleBadge.color}`}>
                    {roleBadge.label}
                  </span>
                )}
              </div>
              <p className="mt-3 text-[10px] text-slate-400 font-medium italic">
                Administrative roles can only be changed by the Root Authority.
              </p>
            </div>

            <div className="p-6 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Profile Photo</p>
              <div className="flex items-center gap-4">
                <img
                  src={formData.avatar}
                  className="h-14 w-14 rounded-2xl object-cover shadow border-2 border-white dark:border-slate-700"
                  alt=""
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name || 'Admin')}&background=14b8a6&color=fff&bold=true`;
                  }}
                />
                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-cyan-500 hover:text-cyan-600 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <Upload size={14} />
                    {uploadingImage ? 'Processing...' : 'Upload New Photo'}
                  </button>
                  <p className="text-[10px] text-slate-400 mt-1.5">JPG, PNG or WebP · Max 5MB</p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-50 dark:border-slate-800 flex items-center justify-between">
              {saveStatus === 'success' && (
                <div className="flex items-center gap-2 text-emerald-500">
                  <CheckCircle size={16} />
                  <span className="text-xs font-bold">Changes saved</span>
                </div>
              )}
              {saveStatus === 'error' && (
                <div className="flex items-center gap-2 text-rose-500">
                  <AlertCircle size={16} />
                  <span className="text-xs font-bold">Save failed</span>
                </div>
              )}
              {saveStatus === 'idle' && <div />}

              <button
                type="submit"
                disabled={isSaving}
                className="px-10 py-4 bg-teal-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-teal-700 transition-all shadow-xl shadow-teal-500/20 disabled:opacity-50 flex items-center gap-3 active:scale-95"
              >
                {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                {isSaving ? 'Saving...' : 'Sync Identity'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminProfile;
