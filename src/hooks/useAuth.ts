'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface User {
  id: number;
  username: string;
  display_name: string;
}

export interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  checkAuth: () => Promise<User | null>;
  logout: () => Promise<void>;
}

/**
 * Custom hook for managing authentication state
 *
 * @example
 * function ProfilePage() {
 *   const { user, loading, isAuthenticated, logout } = useAuth();
 *
 *   if (loading) return <CircularProgress />;
 *
 *   if (!isAuthenticated) {
 *     return <Navigate to="/login" />;
 *   }
 *
 *   return (
 *     <div>
 *       <p>Welcome, {user?.display_name}</p>
 *       <Button onClick={logout}>Logout</Button>
 *     </div>
 *   );
 * }
 */
export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async (): Promise<User | null> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/auth/me');

      if (!response.ok) {
        setUser(null);
        return null;
      }

      const data = await response.json();
      setUser(data.user);
      return data.user;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication check failed';
      setError(errorMessage);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
      // Still clear user state and redirect even if API fails
      setUser(null);
      router.push('/login');
    }
  }, [router]);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return {
    user,
    loading,
    error,
    isAuthenticated: user !== null,
    checkAuth,
    logout,
  };
}

/**
 * Hook that redirects to login if not authenticated
 * Use this on protected pages
 *
 * @example
 * function ProtectedPage() {
 *   const { user, loading } = useRequireAuth();
 *
 *   if (loading) return <CircularProgress />;
 *
 *   return <div>Welcome {user?.display_name}</div>;
 * }
 */
export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.loading && !auth.isAuthenticated) {
      router.push('/login');
    }
  }, [auth.loading, auth.isAuthenticated, router]);

  return auth;
}
