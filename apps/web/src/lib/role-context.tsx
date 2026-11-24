'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UserRole } from '@interstate/shared';

export type AuthMode = 'demo' | 'postgres';

export interface AuthUser {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  subCompanyId: string | null;
  mfaEnabled?: boolean;
}

interface AuthMeResponse {
  mode?: AuthMode;
  authenticated?: boolean;
  mfaPending?: boolean;
  sessionTimeoutMinutes?: number;
  user?: {
    userId?: string;
    id?: string;
    email?: string;
    fullName?: string;
    role?: UserRole;
    subCompanyId?: string | null;
    mfaEnabled?: boolean;
  } | null;
}

interface RoleContextValue {
  role: UserRole;
  setRole: (role: UserRole) => void;
  subCompanyId: string;
  authMode: AuthMode;
  user: AuthUser | null;
  authenticated: boolean;
  loading: boolean;
  sessionTimeoutMinutes: number;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const DEFAULT_SUB_ID = 'sub-red-cliffs';

const RoleContext = createContext<RoleContextValue>({
  role: 'estimator_approver',
  setRole: () => {},
  subCompanyId: DEFAULT_SUB_ID,
  authMode: 'demo',
  user: null,
  authenticated: false,
  loading: true,
  sessionTimeoutMinutes: 30,
  refreshSession: async () => {},
  logout: async () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<UserRole>('estimator_approver');
  const [subCompanyId, setSubCompanyId] = useState<string>(DEFAULT_SUB_ID);
  const [authMode, setAuthMode] = useState<AuthMode>('demo');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<number>(30);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'x-demo-role': role,
          'x-demo-sub-id': subCompanyId,
        },
      });

      if (res.status === 401) {
        setAuthMode('postgres');
        setUser(null);
        setAuthenticated(false);
        return;
      }

      if (!res.ok) {
        // Keep demo fallback if API is temporarily unavailable during local preview
        return;
      }

      const data = (await res.json()) as AuthMeResponse;
      const detectedMode: AuthMode = data.mode === 'postgres' ? 'postgres' : 'demo';
      setAuthMode(detectedMode);

      if (typeof data.sessionTimeoutMinutes === 'number') {
        setSessionTimeoutMinutes(data.sessionTimeoutMinutes);
      }

      const rawUser = data.user;
      const resolvedUserId = rawUser?.userId ?? rawUser?.id;
      const validUser: AuthUser | null =
        rawUser && resolvedUserId && resolvedUserId !== 'anonymous' && rawUser.role
          ? {
              userId: resolvedUserId,
              email: rawUser.email ?? '',
              fullName: rawUser.fullName ?? rawUser.email ?? 'Signed-in User',
              role: rawUser.role,
              subCompanyId: rawUser.subCompanyId ?? null,
              mfaEnabled: rawUser.mfaEnabled,
            }
          : null;

      if (detectedMode === 'postgres') {
        const isAuthed = Boolean(validUser) && data.authenticated !== false && data.mfaPending !== true;
        setUser(isAuthed ? validUser : null);
        setAuthenticated(isAuthed);
        if (isAuthed && validUser) {
          setRoleState(validUser.role);
          setSubCompanyId(validUser.subCompanyId ?? DEFAULT_SUB_ID);
        }
      } else {
        setUser(validUser);
        setAuthenticated(true);
      }
    } catch {
      // Network error during local dev without API server — stay in demo mode
    } finally {
      setLoading(false);
    }
  }, [role, subCompanyId]);

  useEffect(() => {
    void refreshSession();
    // Only run initial mount check; subsequent updates call refreshSession explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRole = useCallback(
    (nextRole: UserRole) => {
      if (authMode === 'demo') {
        setRoleState(nextRole);
      }
    },
    [authMode]
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
    } finally {
      setUser(null);
      setAuthenticated(false);
    }
  }, []);

  return (
    <RoleContext.Provider
      value={{
        role,
        setRole,
        subCompanyId,
        authMode,
        user,
        authenticated,
        loading,
        sessionTimeoutMinutes,
        refreshSession,
        logout,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
