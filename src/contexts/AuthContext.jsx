import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, setLogoutCallback, getErrorMessage } from '../api/client';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from '../utils/secureStorage';

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ─── Role → home tab mapping (mirrors frontend App.jsx redirects) ─────────────
export const ROLE_HOME_SCREEN = {
  health_worker:  'Dashboard',
  specialist:     'Dashboard',
  facility_admin: 'Dashboard',
  driver:         'Transport',
  superadmin:     'Dashboard',
  patient:        'Portal',
};

// ─── Provider ─────────────────────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [token, setToken]     = useState(null);
  const [loading, setLoading] = useState(true); // true on boot while we read storage / verify session
  const [error, setError]     = useState(null);

  // ── Restore session on app launch — re-fetch /me/ to make sure token is still valid ──
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await getAccessToken();
        if (!storedToken) { setLoading(false); return; }
        setToken(storedToken);
        const { data } = await authApi.me();
        setUser(data);
        await AsyncStorage.setItem('user', JSON.stringify(data));
      } catch (e) {
        await clearTokens();
        await AsyncStorage.removeItem('user');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    restoreSession();
  }, []);

  // ── Logout (also invoked by the 401 interceptor when refresh fails) ──
  const logout = useCallback(async () => {
    try {
      const refresh = await getRefreshToken();
      if (refresh) await authApi.logout(refresh).catch(() => {});
    } finally {
      await clearTokens();
      await AsyncStorage.removeItem('user');
      setUser(null);
      setToken(null);
      setError(null);
    }
  }, []);

  useEffect(() => {
    setLogoutCallback(logout);
  }, [logout]);

  // ── Login ── POST /api/auth/login/ → { access, refresh, user }
  const login = async (email, password) => {
    setError(null);
    try {
      const { data } = await authApi.login({ email, password });
      await setTokens(data.access, data.refresh);
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.access);
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      return { success: false, error: message };
    }
  };

  // ── Register step 1 ── POST /api/auth/register/ → { user_id, channel, otp_sent }
  // Does NOT log the user in — the backend creates an inactive account pending OTP.
  const register = async (data) => {
    setError(null);
    try {
      const res = await authApi.register(data);
      return { success: true, ...res.data };
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      return { success: false, error: message };
    }
  };

  // ── Register step 2 ── POST /api/auth/verify-otp/ → { access, refresh, user }
  // or, for staff roles awaiting approval, { pending_approval: true, user, message }
  // and no tokens at all — see STAFF_ROLES_REQUIRING_APPROVAL on the backend.
  const verifyOtp = async (userId, code) => {
    setError(null);
    try {
      const { data } = await authApi.verifyOtp({ user_id: userId, code });
      if (data.pending_approval) {
        return { success: true, pendingApproval: true, user: data.user, message: data.message };
      }
      await loginWithTokens(data.access, data.refresh, data.user);
      return { success: true, user: data.user };
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      return { success: false, error: message };
    }
  };

  const resendOtp = async (userId) => {
    try {
      const { data } = await authApi.resendOtp({ user_id: userId });
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  };

  // ── Used directly after OTP verification (backend already returns tokens) ──
  const loginWithTokens = async (access, refresh, userData) => {
    await setTokens(access, refresh);
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    setToken(access);
    setUser(userData);
  };

  // ── Update local user cache (called after profile edits) ──
  const updateUser = async (updated) => {
    const merged = { ...user, ...updated };
    await AsyncStorage.setItem('user', JSON.stringify(merged));
    setUser(merged);
  };

  // ── Helpers ──
  const isAuthenticated  = !!user && !!token;
  const userRole         = user?.role || null;
  const homeScreen       = ROLE_HOME_SCREEN[userRole] || 'Dashboard';
  const isHealthWorker   = userRole === 'health_worker';
  const isSpecialist     = userRole === 'specialist';
  const isFacilityAdmin  = userRole === 'facility_admin';
  const isDriver         = userRole === 'driver';
  const isSuperadmin     = userRole === 'superadmin';
  const isPatient        = userRole === 'patient';
  // Wellness Companion subtype — only meaningful when isPatient is true.
  const isMaternal        = isPatient && user?.wellness_type !== 'wellness';
  const isWellness         = isPatient && user?.wellness_type === 'wellness';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        isAuthenticated,
        userRole,
        role: userRole,
        homeScreen,
        isHealthWorker,
        isSpecialist,
        isFacilityAdmin,
        isDriver,
        isSuperadmin,
        isSuperAdmin: isSuperadmin,
        isPatient,
        isMaternal,
        isWellness,
        login,
        register,
        verifyOtp,
        resendOtp,
        loginWithTokens,
        logout,
        updateUser,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

export default AuthContext;
