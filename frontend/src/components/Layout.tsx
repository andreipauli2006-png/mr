import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom'
import { useState } from 'react'
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL } from '../utils/format'
import type { Role } from '../api/types'

interface NavItem {
  to: string
  label: string
  roles?: Role[] // нет roles — видят все, включая анонимов
  auth?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Залы' },
  { to: '/bookings', label: 'Мои брони', auth: true },
  { to: '/admin', label: 'Дашборд', roles: ['admin'] },
  { to: '/admin/requests', label: 'Заявки', roles: ['admin'] },
  { to: '/admin/rooms', label: 'Управление залами', roles: ['admin'] },
  { to: '/admin/users', label: 'Пользователи', roles: ['admin'] },
  { to: '/admin/audit', label: 'Журнал', roles: ['admin'] },
]

export function Layout({ mode, onToggleMode }: { mode: 'light' | 'dark'; onToggleMode: () => void }) {
  const { user, logout } = useAuth()
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const [drawer, setDrawer] = useState(false)
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const items = NAV.filter((n) => {
    if (n.roles) return !!user && n.roles.includes(user.role)
    if (n.auth) return !!user
    return true
  })
  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname === to)

  const handleLogout = async () => {
    setMenuEl(null)
    await logout()
    navigate('/login')
  }

  return (
    <Box minHeight="100vh" display="flex" flexDirection="column">
      <AppBar position="sticky" color="inherit" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          {mobile && (
            <IconButton edge="start" aria-label="Открыть меню" onClick={() => setDrawer(true)}>
              <MenuIcon />
            </IconButton>
          )}
          <MeetingRoomIcon color="primary" />
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{ color: 'inherit', textDecoration: 'none', mr: 2 }}
          >
            MeetSpace
          </Typography>
          {!mobile &&
            items.map((n) => (
              <Button
                key={n.to}
                component={RouterLink}
                to={n.to}
                color={isActive(n.to) ? 'primary' : 'inherit'}
                sx={{ fontWeight: isActive(n.to) ? 700 : 400 }}
              >
                {n.label}
              </Button>
            ))}
          <Box flexGrow={1} />
          <Tooltip title={mode === 'light' ? 'Тёмная тема' : 'Светлая тема'}>
            <IconButton onClick={onToggleMode} aria-label="Переключить тему">
              {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>
          {user ? (
            <>
              <IconButton onClick={(e) => setMenuEl(e.currentTarget)} aria-label="Меню профиля">
                <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main' }}>{user.full_name[0]}</Avatar>
              </IconButton>
              <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)}>
                <Box px={2} py={1}>
                  <Typography fontWeight={600}>{user.full_name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {ROLE_LABEL[user.role]}
                  </Typography>
                </Box>
                <Divider />
                <MenuItem
                  onClick={() => {
                    setMenuEl(null)
                    navigate('/profile')
                  }}
                >
                  Личный кабинет
                </MenuItem>
                <MenuItem onClick={handleLogout}>Выйти</MenuItem>
              </Menu>
            </>
          ) : (
            <Button variant="contained" component={RouterLink} to="/login">
              Войти
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Drawer open={drawer} onClose={() => setDrawer(false)}>
        <List sx={{ width: 260 }}>
          {items.map((n) => (
            <ListItemButton
              key={n.to}
              component={RouterLink}
              to={n.to}
              selected={isActive(n.to)}
              onClick={() => setDrawer(false)}
            >
              <ListItemText primary={n.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 }, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  )
}
