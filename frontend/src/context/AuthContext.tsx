import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  role?: string;
  role_name?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('accessToken'));
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync profile on mount if token exists
  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken');
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    apiClient
      .get('/auth/me')
      .then((res) => {
        if (res.data.success && res.data.data?.user) {
          const u = res.data.data.user;
          const profile: UserProfile = {
            ...u,
            role: u.role_name || u.role,
          };
          setUser(profile);
          localStorage.setItem('user', JSON.stringify(profile));
        }
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient.post('/auth/login', { email, password });
    if (res.data.success && res.data.data?.access_token) {
      const accessToken: string = res.data.data.access_token;
      const rawUser = res.data.data.user;
      const profile: UserProfile = {
        ...rawUser,
        role: rawUser.role || rawUser.role_name,
      };

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('user', JSON.stringify(profile));
      setToken(accessToken);
      setUser(profile);
    } else {
      throw new Error(res.data.message || 'Login failed');
    }
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Continue client cleanup even if backend logout fails
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    }
  };

  const refreshProfile = async () => {
    const res = await apiClient.get('/auth/me');
    if (res.data.success && res.data.data?.user) {
      const u = res.data.data.user;
      const profile: UserProfile = {
        ...u,
        role: u.role_name || u.role,
      };
      setUser(profile);
      localStorage.setItem('user', JSON.stringify(profile));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
