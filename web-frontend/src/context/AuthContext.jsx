import { createContext, useContext, useEffect, useState } from 'react';
import { apiCall, ENDPOINTS, getToken, clearTokens } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'authed' | 'guest'

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!getToken()) {
        setStatus('guest');
        return;
      }
      try {
        const me = await apiCall(ENDPOINTS.me);
        if (!cancelled) {
          setUser(me);
          setStatus('authed');
        }
      } catch {
        if (!cancelled) {
          clearTokens();
          setStatus('guest');
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = (loggedInUser) => {
    setUser(loggedInUser);
    setStatus('authed');
  };

  const logout = () => {
    clearTokens();
    setUser(null);
    setStatus('guest');
  };

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
