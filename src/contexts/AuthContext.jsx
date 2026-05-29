import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '@/api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')

    if (!token) {
      setLoading(false)
      return
    }

    authApi.me()
      .then(({ data }) => setUser(data))
      .catch(() => localStorage.clear())
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await authApi.login({ email, password })

    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)

    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem('refresh_token')
    try {
      if (refresh) await authApi.logout(refresh)
    } catch {}

    localStorage.clear()
    setUser(null)
  }, [])

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
    role: user?.role,

    isHealthWorker:  user?.role === 'health_worker',
    isFacilityAdmin: user?.role === 'facility_admin',
    isSpecialist:    user?.role === 'specialist',
    isDriver:        user?.role === 'driver',
    isSuperAdmin:    user?.role === 'superadmin',
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}