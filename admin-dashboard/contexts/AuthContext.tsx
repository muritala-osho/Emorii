import React, { createContext, useContext } from 'react';
import { AuthState, AdminRole } from '../types';

interface AuthContextValue {
  auth: AuthState;
  hasRole: (...roles: AdminRole[]) => boolean;
  can: (action: PermissionAction) => boolean;
}

export type PermissionAction =
  | 'delete_user'
  | 'ban_user'
  | 'suspend_user'
  | 'view_finances'
  | 'view_analytics'
  | 'manage_settings'
  | 'send_broadcasts'
  | 'moderate_content'
  | 'view_reports'
  | 'manage_verifications'
  | 'export_data'
  | 'manage_appeals';

const ROLE_PERMISSIONS: Record<AdminRole, PermissionAction[]> = {
  [AdminRole.SUPER_ADMIN]: [
    'delete_user', 'ban_user', 'suspend_user', 'view_finances', 'view_analytics',
    'manage_settings', 'send_broadcasts', 'moderate_content', 'view_reports',
    'manage_verifications', 'export_data', 'manage_appeals',
  ],
  [AdminRole.MODERATOR]: [
    'ban_user', 'suspend_user', 'send_broadcasts', 'moderate_content',
    'view_reports', 'manage_verifications', 'manage_appeals',
  ],
  [AdminRole.SUPPORT]: [
    'view_reports',
  ],
};

export const AuthContext = createContext<AuthContextValue>({
  auth: { isAuthenticated: false, user: null },
  hasRole: () => false,
  can: () => false,
});

export const AuthProvider: React.FC<{ auth: AuthState; children: React.ReactNode }> = ({ auth, children }) => {
  const hasRole = (...roles: AdminRole[]) => {
    return auth.user?.role ? roles.includes(auth.user.role) : false;
  };

  const can = (action: PermissionAction): boolean => {
    const role = auth.user?.role;
    if (!role) return false;
    return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
  };

  return (
    <AuthContext.Provider value={{ auth, hasRole, can }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
