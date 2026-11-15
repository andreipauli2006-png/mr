import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { refreshTokens, setLogoutHandler, tokens } from '../api/client'
import { authApi, usersApi } from '../api/endpoints'
import type { Role, User } from '../api/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (u: User) => void
  hasRole: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const qc = useQueryClient()

  const clear = useCallback(() => {
    tokens.clear()
    setUser(null)
    qc.clear()
  }, [qc])

  // при загрузке страницы пробуем восстановить сессию по refresh-токену
  useEffect(() => {
    setLogoutHandler(clear)
    ;(async () => {
      if (tokens.refresh && (await refreshTokens())) {
        try {
          setUser(await usersApi.me())
        } catch {
          clear()
        }
      }
      setLoading(false)
    })()
  }, [clear])

  const login = useCallback(async (email: string, password: string) => {
    const t = await authApi.login(email, password)
    tokens.set(t.access_token, t.refresh_token)
    setUser(await usersApi.me())
  }, [])

  const logout = useCallback(async () => {
    const r = tokens.refresh
    if (r) await authApi.logout(r).catch(() => undefined)
    clear()
  }, [clear])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      logout,
      setUser,
      hasRole: (...roles) => !!user && roles.includes(user.role),
    }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth должен вызываться внутри AuthProvider')
  return ctx
}
