import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import AuthContext from './authContextObject.js';
import { clearAccessToken, getAccessToken, setAccessToken } from '../lib/authStorage.js';
import { setAuthTokenGetter, setUnauthorizedHandler, request } from '../lib/httpClient.js';
import errorLogger from '../services/errorLogger.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authCheckIdRef = useRef(0);

  // Check for existing token on mount
  useEffect(() => {
    let isCancelled = false;

    const checkAuth = async () => {
      const currentAuthCheckId = authCheckIdRef.current + 1;
      authCheckIdRef.current = currentAuthCheckId;

      const token = getAccessToken();
      if (token) {
        try {
          // Verify token with backend
          const response = await request('/auth/me', { timeoutMs: 5000 });
          if (response.success && response.data) {
            if (!isCancelled && authCheckIdRef.current === currentAuthCheckId) {
              setUser({
                ...response.data.user,
                token,
              });
            }
          } else {
            clearAccessToken();
          }
        } catch {
          clearAccessToken();
        }
      }
      if (!isCancelled && authCheckIdRef.current === currentAuthCheckId) {
        setIsLoading(false);
      }
    };

    checkAuth();

    return () => {
      isCancelled = true;
    };
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

  const logout = useCallback(async () => {
    try {
      // Call logout endpoint to invalidate refresh token
      await request('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors and always clear local auth state.
    } finally {
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const login = useCallback(async (credentials) => {
    setIsAuthenticating(true);
    try {
      const response = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      
      if (response.success && response.data) {
        const { accessToken, user: userData } = response.data;
        setAccessToken(accessToken);
        setUser({
          ...userData,
          token: accessToken,
        });
        return { success: true };
      } else {
        throw new Error(response.error?.message || 'Login failed');
      }
    } catch (error) {
      // Log to error logger
      errorLogger.logFrontendError(
        `Login failed: ${error.message}`,
        {
          email: credentials.email,
          status: error.status,
        }
      );
      
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, logout, login, isLoading, isAuthenticating }),
    [user, logout, login, isLoading, isAuthenticating]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
