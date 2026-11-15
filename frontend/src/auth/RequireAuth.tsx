import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Role } from '../api/types'
import { Loading } from '../components/States'
import { useAuth } from './AuthContext'

/** Защищённый маршрут. Без roles — нужен любой вход; с roles — только эти роли.
 *  Это только удобство интерфейса: реальная проверка прав — на сервере. */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}
