import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { AuthUser } from '../types';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Relit l'utilisateur (ex. après modification des droits de son rôle) */
  refresh: () => Promise<void>;
  /** Droit « module.action » accordé par le rôle de l'utilisateur connecté */
  can: (perm: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      setUser(await api<AuthUser>('/auth/me'));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const onUnauthorized = () => setUser(null);
    window.addEventListener('crm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('crm:unauthorized', onUnauthorized);
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const u = await api<AuthUser>('/auth/login', 'POST', { email, password });
      qc.clear();
      setUser(u);
    },
    [qc],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', 'POST').catch(() => undefined);
    qc.clear();
    setUser(null);
  }, [qc]);

  const can = useCallback((perm: string) => !!user?.permissions.includes(perm), [user]);

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh, can }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

/** Raccourci : const can = useCan(); can('deals.delete') */
export const useCan = () => useAuth().can;
