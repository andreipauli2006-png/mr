import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid2 as Grid,
  List,
  ListItem,
  ListItemText,
  Pagination,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { errorMessage } from '../api/client'
import { authApi, usersApi } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { BookingsTable } from '../components/BookingsTable'
import { Empty, ErrorState, Loading } from '../components/States'
import { useSnackbar } from '../components/Snackbar'
import { ACTION_LABEL, fmtDateTime, ROLE_LABEL } from '../utils/format'
import { passwordSchema } from '../utils/validation'

export function MyBookingsPage() {
  return (
    <Stack gap={3}>
      <Typography variant="h4">Мои брони</Typography>
      <BookingsTable />
    </Stack>
  )
}

const passwordForm = z
  .object({ old_password: z.string().min(1, 'Введите текущий пароль'), new_password: passwordSchema })
  .refine((d) => d.old_password !== d.new_password, {
    message: 'Новый пароль совпадает со старым',
    path: ['new_password'],
  })
type PasswordForm = z.infer<typeof passwordForm>

export function ProfilePage() {
  const { user, setUser } = useAuth()
  const notify = useSnackbar()
  const [name, setName] = useState(user!.full_name)
  const [nameError, setNameError] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const pwd = useForm<PasswordForm>({ resolver: zodResolver(passwordForm) })
  const [pwdError, setPwdError] = useState<string | null>(null)
  const history = useQuery({
    queryKey: ['history', historyPage],
    queryFn: () => usersApi.history(historyPage),
  })

  const saveName = async () => {
    if (name.trim().length < 2) return setNameError('Минимум 2 символа')
    setNameError(null)
    try {
      setUser(await usersApi.updateMe(name.trim()))
      notify('Профиль сохранён')
    } catch (e) {
      setNameError(errorMessage(e))
    }
  }

  const changePassword = async (d: PasswordForm) => {
    setPwdError(null)
    try {
      await authApi.changePassword(d.old_password, d.new_password)
      pwd.reset()
      notify('Пароль изменён')
    } catch (e) {
      setPwdError(errorMessage(e))
    }
  }

  return (
    <Stack gap={3}>
      <Typography variant="h4">Личный кабинет</Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Профиль
              </Typography>
              <Stack gap={2}>
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Email
                  </Typography>
                  <Typography>{user!.email}</Typography>
                </Box>
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Роль
                  </Typography>
                  <Chip label={ROLE_LABEL[user!.role]} size="small" color="primary" variant="outlined" />
                </Box>
                <TextField
                  label="Имя и фамилия"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={!!nameError}
                  helperText={nameError ?? ' '}
                />
                <Button variant="contained" onClick={saveName} sx={{ alignSelf: 'flex-start' }}>
                  Сохранить
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Смена пароля
              </Typography>
              <Stack component="form" gap={2} noValidate onSubmit={pwd.handleSubmit(changePassword)}>
                {pwdError && <Alert severity="error">{pwdError}</Alert>}
                <TextField
                  label="Текущий пароль"
                  type="password"
                  {...pwd.register('old_password')}
                  error={!!pwd.formState.errors.old_password}
                  helperText={pwd.formState.errors.old_password?.message}
                />
                <TextField
                  label="Новый пароль"
                  type="password"
                  {...pwd.register('new_password')}
                  error={!!pwd.formState.errors.new_password}
                  helperText={
                    pwd.formState.errors.new_password?.message ?? 'Минимум 8 символов, буквы и цифры'
                  }
                />
                <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-start' }}>
                  Изменить пароль
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6">История действий</Typography>
              {history.isLoading ? (
                <Loading />
              ) : history.isError ? (
                <ErrorState error={history.error} />
              ) : history.data!.items.length === 0 ? (
                <Empty title="Пока пусто" />
              ) : (
                <>
                  <List dense>
                    {history.data!.items.map((h) => (
                      <ListItem key={h.id} divider>
                        <ListItemText
                          primary={ACTION_LABEL[h.action] ?? h.action}
                          secondary={fmtDateTime(h.created_at)}
                        />
                      </ListItem>
                    ))}
                  </List>
                  {history.data!.total > 10 && (
                    <Pagination
                      sx={{ mt: 2 }}
                      count={Math.ceil(history.data!.total / 10)}
                      page={historyPage}
                      onChange={(_, p) => setHistoryPage(p)}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  )
}
