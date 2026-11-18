// Phase 1 session: who I am (roles, permissions, language) and which measurement cycle is selected.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { api } from '../services/qiyasApi.js';

const QiyasSessionContext = createContext(null);
const CYCLE_KEY = 'qiyas_cycle';

/** The signed-in user and the measurement cycles (an empty list if cycles cannot be read). */
const loadSession = () => Promise.all([api.get('/me'), api.get('/cycles').catch(() => [])]);

export function QiyasSessionProvider({ children, enabled }) {
  const [me, setMe] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleIdState] = useState(() => {
    try {
      return localStorage.getItem(CYCLE_KEY);
    } catch {
      return null;
    }
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));

  // Applies a loaded session. Only ever called from a promise callback, after the network call.
  const applySession = useCallback(([m, c]) => {
    setMe(m);
    setCycles(c);
    setCycleIdState((prev) => {
      if (prev && c.some((x) => x.id === prev)) return prev;
      return (c.find((x) => x.status === 'active') ?? c[0])?.id ?? null;
    });
    setError(null);
    setLoading(false);
  }, []);
  const applyError = useCallback((e) => {
    setError(e);
    setLoading(false);
  }, []);

  const refresh = useCallback(
    () => loadSession().then(applySession, applyError),
    [applySession, applyError],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    // Loading the session is a network call; state is set only when it resolves.
    let alive = true;
    loadSession().then(
      (s) => alive && applySession(s),
      (e) => alive && applyError(e),
    );
    return () => {
      alive = false;
    };
  }, [enabled, applySession, applyError]);

  const setCycleId = useCallback((id) => {
    setCycleIdState(id);
    try {
      localStorage.setItem(CYCLE_KEY, id);
    } catch {
      // storage unavailable
    }
  }, []);

  const value = useMemo(() => {
    const roles = new Set((me?.roles ?? []).map((g) => g.role));
    return {
      me,
      cycles,
      cycle: cycles.find((c) => c.id === cycleId) ?? null,
      cycleId,
      setCycleId,
      refresh,
      loading,
      error,
      hasRole: (code) => roles.has(code),
      roles,
      /** Permission check mirroring the server: scope list or undefined. */
      can: (permission) => Boolean(me?.permissions?.[permission]?.length),
      managedDepartments: (me?.roles ?? []).filter((g) => g.role === 'DM').map((g) => g.departmentId),
    };
  }, [me, cycles, cycleId, setCycleId, refresh, loading, error]);

  return <QiyasSessionContext.Provider value={value}>{children}</QiyasSessionContext.Provider>;
}

QiyasSessionProvider.propTypes = { children: PropTypes.node, enabled: PropTypes.bool };

// eslint-disable-next-line react-refresh/only-export-components
export function useQiyas() {
  const ctx = useContext(QiyasSessionContext);
  if (!ctx) throw new Error('useQiyas must be used inside QiyasSessionProvider');
  return ctx;
}
