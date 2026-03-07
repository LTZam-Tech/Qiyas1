import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import AuthContext from './authContextObject.js';
import { clearAccessToken, getAccessToken, setAccessToken } from '../lib/authStorage.js';
import { setAuthTokenGetter, setUnauthorizedHandler, request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import errorLogger from '../services/errorLogger.js';

const MOCK_USER_KEY = 'qiyas_mock_user';

/**
 * Demo-only credentials. These are for development/testing use ONLY.
 * Remove or replace with real authentication when connecting to a production backend.
 */
const MOCK_USERS = {
  'admin@university.edu': {
    password: 'AdminPass123',
    user: { id: 1, email: 'admin@university.edu', fullName: 'Admin User', role: 'admin' },
  },
  'dean@university.edu': {
    password: 'DeanPass123',
    user: { id: 2, email: 'dean@university.edu', fullName: 'Dean User', role: 'dean' },
  },
  'consultant@qiyas.sa': {
    password: 'ConsultPass123',
    user: { id: 3, email: 'consultant@qiyas.sa', fullName: 'Consultant User', role: 'consultant' },
  },
  'user@department.edu': {
    password: 'UserPass123',
    user: { id: 4, email: 'user@department.edu', fullName: 'Regular User', role: 'user' },
  },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAccessToken();
      if (token) {
        if (env.useMockApi) {
          // Restore user from localStorage in mock mode
          try {
            const storedUser = JSON.parse(localStorage.getItem(MOCK_USER_KEY) || 'null');
            if (storedUser) {
              setUser({ ...storedUser, token });
            } else {
              clearAccessToken();
            }
          } catch {
            clearAccessToken();
          }
        } else {
          try {
            // Verify token with backend
            const response = await request('/auth/me');
            if (response.success && response.data) {
              setUser({
                ...response.data.user,
                token,
              });
            } else {
              clearAccessToken();
            }
          } catch (error) {
            console.error('Token validation failed:', error);
            clearAccessToken();
          }
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => user?.token || null);
  }, [user]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearAccessToken();
      setUser(null);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const logout = async () => {
    if (env.useMockApi) {
      localStorage.removeItem(MOCK_USER_KEY);
      clearAccessToken();
      setUser(null);
      return;
    }
    try {
      // Call logout endpoint to invalidate refresh token
      await request('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAccessToken();
      setUser(null);
    }
  };

  const login = async (credentials) => {
    setIsAuthenticating(true);
    try {
      if (env.useMockApi) {
        // Mock authentication — validate against demo users
        const mockEntry = MOCK_USERS[credentials.email];
        if (mockEntry && mockEntry.password === credentials.password) {
          const accessToken = crypto.randomUUID();
          localStorage.setItem(MOCK_USER_KEY, JSON.stringify(mockEntry.user));
          setAccessToken(accessToken);
          setUser({ ...mockEntry.user, token: accessToken });
          return { success: true };
        }
        const err = new Error('Invalid email or password');
        err.status = 401;
        throw err;
      }

      console.group('🔐 LOGIN ATTEMPT');
      console.log('Credentials:', { email: credentials.email, password: '***' });
      console.log('API Base URL:', env.apiBaseUrl);
      
      const response = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      console.log('✅ Raw Login response:', response);
      console.log('Response structure:', {
        success: response.success,
        hasData: !!response.data,
        data: response.data,
      });
      
      if (response.success && response.data) {
        const { accessToken, user: userData } = response.data;
        console.log('✅ Extracted data:', {
          hasAccessToken: !!accessToken,
          tokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : 'none',
          userData: userData,
        });
        setAccessToken(accessToken);
        setUser({
          ...userData,
          token: accessToken,
        });
        console.log('✅ User state updated successfully');
        console.groupEnd();
        return { success: true };
      } else {
        console.error('❌ Invalid response structure:', response);
        console.groupEnd();
        throw new Error(response.error?.message || 'Login failed');
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      console.error('Error type:', error.constructor.name);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        body: error.body,
        stack: error.stack,
      });
      if (!env.useMockApi) console.groupEnd();
      
      // Log to error logger
      errorLogger.logFrontendError(
        `Login failed: ${error.message}`,
        {
          email: credentials.email,
          status: error.status,
          body: error.body,
        }
      );
      
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const value = useMemo(
    () => ({ user, logout, login, isLoading, isAuthenticating }),
    [user, isLoading, isAuthenticating]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
