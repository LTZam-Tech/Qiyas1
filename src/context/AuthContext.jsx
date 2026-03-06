import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import AuthContext from './authContextObject.js';
import { clearAccessToken, getAccessToken, setAccessToken } from '../lib/authStorage.js';
import { setAuthTokenGetter, setUnauthorizedHandler, request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import errorLogger from '../services/errorLogger.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAccessToken();
      if (token) {
        try {
          // Verify token with backend (assuming /api/v1/auth/me endpoint)
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
      console.groupEnd();
      
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
