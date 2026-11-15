// Вход, регистрация, восстановление и сброс пароля
import { Alert, Box, Button, Link, Paper, Stack, TextField, Typography } from '@mui/material'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { errorMessage } from '../api/client'
import { authApi } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { emailSchema, passwordSchema } from '../utils/validation'

function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box display="flex" justifyContent="center" pt={{ xs: 2, md: 6 }}>
      <Paper sx={{ p: { xs: 3, sm: 4 }, width: '100%', maxWidth: 420 }}>
        <Typography variant="h5" mb={3}>
          {title}
        </Typography>
        {children}
      </Paper>
    </Box>
  )
}

// ---------- Вход ----------
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Введите пароль') })
type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginForm) => {
    setError(null)
    try {
      await login(data.email, data.password)
      const from = (location.state as { from?: string } | null)?.from ?? '/'
      navigate(from, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <AuthCard title="Вход">
      <Stack component="form" gap={2} onSubmit={handleSubmit(onSubmit)} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          {...register('email')}
          error={!!formState.errors.email}
          helperText={formState.errors.email?.message}
        />
        <TextField
          label="Пароль"
          type="password"
          autoComplete="current-password"
          {...register('password')}
          error={!!formState.errors.password}
          helperText={formState.errors.password?.message}
        />
        <Button type="submit" variant="contained" size="large" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Входим…' : 'Войти'}
        </Button>
        <Stack direction="row" justifyContent="space-between">
          <Link component={RouterLink} to="/register">
            Регистрация
          </Link>
          <Link component={RouterLink} to="/forgot-password">
            Забыли пароль?
          </Link>
        </Stack>
      </Stack>
    </AuthCard>
  )
}

// ---------- Регистрация ----------
const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Минимум 2 символа').max(120),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'Пароли не совпадают', path: ['confirm'] })
type RegisterForm = z.infer<typeof registerSchema>

export function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (d: RegisterForm) => {
    setError(null)
    try {
      await authApi.register({ email: d.email, password: d.password, full_name: d.full_name })
      await login(d.email, d.password)
      navigate('/')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const err = formState.errors
  return (
    <AuthCard title="Регистрация">
      <Stack component="form" gap={2} onSubmit={handleSubmit(onSubmit)} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Имя и фамилия"
          {...register('full_name')}
          error={!!err.full_name}
          helperText={err.full_name?.message}
        />
        <TextField
          label="Email"
          type="email"
          {...register('email')}
          error={!!err.email}
          helperText={err.email?.message}
        />
        <TextField
          label="Пароль"
          type="password"
          {...register('password')}
          error={!!err.password}
          helperText={err.password?.message ?? 'Минимум 8 символов, буквы и цифры'}
        />
        <TextField
          label="Повторите пароль"
          type="password"
          {...register('confirm')}
          error={!!err.confirm}
          helperText={err.confirm?.message}
        />
        <Button type="submit" variant="contained" size="large" disabled={formState.isSubmitting}>
          Зарегистрироваться
        </Button>
        <Typography variant="body2" color="text.secondary">
          После регистрации вы получите роль «Гость»: брони будут отправляться на подтверждение
          администратору.
        </Typography>
        <Link component={RouterLink} to="/login">
          Уже есть аккаунт? Войти
        </Link>
      </Stack>
    </AuthCard>
  )
}

// ---------- Забыли пароль ----------
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState } = useForm<{ email: string }>({
    resolver: zodResolver(z.object({ email: emailSchema })),
  })
  return (
    <AuthCard title="Восстановление пароля">
      {sent ? (
        <Alert severity="success">
          Если такой email зарегистрирован, ссылка для сброса отправлена. (В учебной версии ссылка выводится в
          лог сервера.)
        </Alert>
      ) : (
        <Stack
          component="form"
          gap={2}
          noValidate
          onSubmit={handleSubmit(async (d) => {
            await authApi.forgot(d.email)
            setSent(true)
          })}
        >
          <TextField
            label="Email"
            {...register('email')}
            error={!!formState.errors.email}
            helperText={formState.errors.email?.message}
          />
          <Button type="submit" variant="contained" disabled={formState.isSubmitting}>
            Отправить ссылку
          </Button>
        </Stack>
      )}
      <Box mt={2}>
        <Link component={RouterLink} to="/login">
          Вернуться ко входу
        </Link>
      </Box>
    </AuthCard>
  )
}

// ---------- Сброс пароля по ссылке ----------
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<{ password: string }>({
    resolver: zodResolver(z.object({ password: passwordSchema })),
  })
  const token = params.get('token') ?? ''
  return (
    <AuthCard title="Новый пароль">
      <Stack
        component="form"
        gap={2}
        noValidate
        onSubmit={handleSubmit(async (d) => {
          try {
            await authApi.reset(token, d.password)
            navigate('/login')
          } catch (e) {
            setError(errorMessage(e))
          }
        })}
      >
        {!token && <Alert severity="warning">В ссылке нет токена</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Новый пароль"
          type="password"
          {...register('password')}
          error={!!formState.errors.password}
          helperText={formState.errors.password?.message}
        />
        <Button type="submit" variant="contained" disabled={!token || formState.isSubmitting}>
          Сохранить
        </Button>
      </Stack>
    </AuthCard>
  )
}
