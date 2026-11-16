import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { UserRole, RoleContextType } from '../types/role';

export type { UserRole, RoleContextType } from '../types/role';

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole | null>(() => {
    const saved = localStorage.getItem('artha_user_role');
    return (saved as UserRole) || null;
  });

  const [allowedFeatures, setFeaturesState] = useState<string[] | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('artha_allowed_features') ?? 'null');
    } catch {
      return null;
    }
  });

  const setAllowedFeatures = useCallback((features: string[] | null) => {
    setFeaturesState(features);
    try {
      if (features) localStorage.setItem('artha_allowed_features', JSON.stringify(features));
      else localStorage.removeItem('artha_allowed_features');
    } catch {
      // storage unavailable: the in-memory value still applies for this tab
    }
  }, []);

  const setRole = useCallback((newRole: UserRole | null) => {
    setRoleState(newRole);
    if (newRole) {
      localStorage.setItem('artha_user_role', newRole);
    } else {
      localStorage.removeItem('artha_user_role');
    }
  }, []);

  const value: RoleContextType = {
    role,
    setRole,
    allowedFeatures,
    setAllowedFeatures,
    isAdmin: role === 'admin',
    isOperator: role === 'operator',
    isViewer: role === 'viewer',
    canWrite: role === 'admin' || role === 'operator',
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextType {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
