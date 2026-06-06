import React from 'react';
import { Lock } from 'lucide-react';
import { AdminRole } from '../types';
import { useAuth, PermissionAction } from '../contexts/AuthContext';

interface PermissionGuardProps {
  action?: PermissionAction;
  roles?: AdminRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  mode?: 'hide' | 'lock';
  lockLabel?: string;
}

const PermissionGuard: React.FC<PermissionGuardProps> = ({
  action,
  roles,
  children,
  fallback,
  mode = 'lock',
  lockLabel,
}) => {
  const { can, hasRole } = useAuth();

  const allowed = action
    ? can(action)
    : roles
    ? hasRole(...roles)
    : true;

  if (allowed) return <>{children}</>;

  if (mode === 'hide') return fallback ? <>{fallback}</> : null;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="relative inline-flex group">
      <div className="opacity-40 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center cursor-not-allowed z-10">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/80 dark:bg-slate-700/90 backdrop-blur-sm text-white rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
          <Lock size={10} />
          {lockLabel || 'Insufficient role'}
        </div>
      </div>
    </div>
  );
};

export default PermissionGuard;
