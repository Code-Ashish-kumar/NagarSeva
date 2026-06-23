import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);   // true on first mount while we check token

  // ── On mount: hydrate user from stored tokens ────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      api.get('/auth/me')
        .then((res) => setUser(res.data.user))
        .catch(() => {
          // Token invalid/expired and refresh also failed — clear storage
          localStorage.clear();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────

  const login = useCallback(({ user, access_token, refresh_token }) => {
    localStorage.setItem('access_token',  access_token);
    localStorage.setItem('refresh_token', refresh_token);
    setUser(user);
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
  }, []);

  const isAuthenticated = Boolean(user);
  const isAdmin         = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, isAdmin, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
