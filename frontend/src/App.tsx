import { CssBaseline, ThemeProvider } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { SnackbarProvider } from './components/Snackbar'
import { Empty, Loading } from './components/States'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages'
import { MyBookingsPage, ProfilePage } from './pages/ProfilePage'
import { RoomDetailPage } from './pages/RoomDetailPage'
import { RoomsPage } from './pages/RoomsPage'
import { makeTheme, type Mode } from './theme'

// Страницы администратора грузятся отдельным файлом — обычным пользователям они не нужны
const AuditPage = lazy(() => import('./pages/admin/AdminPages').then((m) => ({ default: m.AuditPage })))
const RequestsPage = lazy(() => import('./pages/admin/AdminPages').then((m) => ({ default: m.RequestsPage })))
const UsersPage = lazy(() => import('./pages/admin/AdminPages').then((m) => ({ default: m.UsersPage })))
const AdminRoomsPage = lazy(() =>
  import('./pages/admin/AdminRoomsPage').then((m) => ({ default: m.AdminRoomsPage })),
)
const DashboardPage = lazy(() =>
  import('./pages/admin/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false } },
})

const MODE_KEY = 'meetspace.theme'

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>(readMode)
  const theme = useMemo(() => makeTheme(mode), [mode])
  const toggle = () =>
    setMode((m) => {
      const next = m === 'light' ? 'dark' : 'light'
      localStorage.setItem(MODE_KEY, next)
      return next
    })

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <BrowserRouter>
            <AuthProvider>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route element={<Layout mode={mode} onToggleMode={toggle} />}>
                    <Route index element={<RoomsPage />} />
                    <Route path="rooms/:id" element={<RoomDetailPage />} />
                    <Route path="login" element={<LoginPage />} />
                    <Route path="register" element={<RegisterPage />} />
                    <Route path="forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="reset-password" element={<ResetPasswordPage />} />
                    <Route
                      path="bookings"
                      element={
                        <RequireAuth>
                          <MyBookingsPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="profile"
                      element={
                        <RequireAuth>
                          <ProfilePage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="admin"
                      element={
                        <RequireAuth roles={['admin']}>
                          <DashboardPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="admin/requests"
                      element={
                        <RequireAuth roles={['admin']}>
                          <RequestsPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="admin/rooms"
                      element={
                        <RequireAuth roles={['admin']}>
                          <AdminRoomsPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="admin/users"
                      element={
                        <RequireAuth roles={['admin']}>
                          <UsersPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="admin/audit"
                      element={
                        <RequireAuth roles={['admin']}>
                          <AuditPage />
                        </RequireAuth>
                      }
                    />
                    <Route path="*" element={<Empty title="Страница не найдена" />} />
                  </Route>
                </Routes>
              </Suspense>
            </AuthProvider>
          </BrowserRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
