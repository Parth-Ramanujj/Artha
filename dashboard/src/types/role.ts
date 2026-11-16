// Role types for RBAC
export type UserRole = 'admin' | 'operator' | 'viewer';

export interface RoleContextType {
  role: UserRole | null;
  setRole: (role: UserRole | null) => void;
  /** Features the API key is approved for; null = all (super admin / legacy keys). */
  allowedFeatures: string[] | null;
  setAllowedFeatures: (features: string[] | null) => void;
  isAdmin: boolean;
  isOperator: boolean;
  isViewer: boolean;
  canWrite: boolean;
}
