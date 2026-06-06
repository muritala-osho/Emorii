import React from 'react';
import { ShieldX, Lock, ArrowLeft } from 'lucide-react';
import { AdminRole } from '../types';

interface AccessDeniedProps {
  currentRole?: AdminRole;
  requiredRoles?: AdminRole[];
  onBack?: () => void;
  section?: string;
}

const ROLE_COLORS: Record<AdminRole, string> = {
  [AdminRole.SUPER_ADMIN]: 'text-amber-500',
  [AdminRole.MODERATOR]: 'text-indigo-500',
  [AdminRole.SUPPORT]: 'text-slate-500',
};

const AccessDenied: React.FC<AccessDeniedProps> = ({ currentRole, requiredRoles, onBack, section }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-12 bg-white dark:bg-slate-900 rounded-[3rem] border-2 border-dashed border-rose-100 dark:border-rose-900/50 animate-fadeIn">
      <div className="p-8 bg-rose-50 dark:bg-rose-500/10 rounded-full mb-8 relative">
        <ShieldX size={48} className="text-rose-400" />
        <div className="absolute -top-2 -right-2 p-2 bg-white dark:bg-slate-900 rounded-full shadow-lg border-2 border-rose-100 dark:border-rose-900/50">
          <Lock size={18} className="text-rose-500" />
        </div>
      </div>

      <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-3 tracking-tight">Access Restricted</h3>
      <p className="text-gray-500 dark:text-slate-400 font-medium max-w-sm mb-2">
        {section ? `The "${section}" section` : 'This section'} requires elevated privileges.
      </p>

      {currentRole && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Your role:</span>
          <span className={`text-[10px] font-black uppercase tracking-widest ${ROLE_COLORS[currentRole] || 'text-slate-500'}`}>{currentRole}</span>
        </div>
      )}

      {requiredRoles && requiredRoles.length > 0 && (
        <div className="flex items-center gap-2 mb-8">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Required:</span>
          <div className="flex gap-1.5">
            {requiredRoles.map(r => (
              <span key={r} className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 ${ROLE_COLORS[r] || 'text-slate-500'}`}>
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-8 py-3 bg-teal-600 text-white font-bold rounded-2xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-500/20"
        >
          <ArrowLeft size={16} />
          Return to Dashboard
        </button>
      )}
    </div>
  );
};

export default AccessDenied;
