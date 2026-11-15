// Заявки, пользователи и журнал аудита для администратора
import {
  Box,
  Chip,
  Grid2 as Grid,
  InputAdornment,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { errorMessage } from '../../api/client'
import { usersApi } from '../../api/endpoints'
import type { Role } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { BookingsTable } from '../../components/BookingsTable'
import { Empty, ErrorState, Loading } from '../../components/States'
import { useSnackbar } from '../../components/Snackbar'
import { ACTION_LABEL, fmtDateTime, ROLE_LABEL } from '../../utils/format'
import { useDebounced } from '../../utils/useDebounced'

export function RequestsPage() {
  return (
    <Stack gap={3}>
      <Box>
        <Typography variant="h4">Заявки и брони</Typography>
        <Typography color="text.secondary">Брони гостей ждут вашего подтверждения</Typography>
      </Box>
      <BookingsTable admin initialStatus="pending" />
    </Stack>
  )
}

const PAGE = 15

export function UsersPage() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const notify = useSnackbar()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [sort, setSort] = useState('-created_at')
  const [page, setPage] = useState(1)
  const debounced = useDebounced(search)
  useEffect(() => setPage(1), [debounced, role, sort])

  const q = useQuery({
    queryKey: ['users', debounced, role, sort, page],
    queryFn: () => usersApi.list({ search: debounced, role, sort, page, size: PAGE }),
    placeholderData: keepPreviousData,
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { role?: Role; is_blocked?: boolean } }) =>
      usersApi.update(id, data),
    onSuccess: (u) => {
      notify(`Пользователь ${u.full_name} обновлён`)
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => notify(errorMessage(e), 'error'),
  })

  return (
    <Stack gap={3}>
      <Typography variant="h4">Пользователи</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            size="small"
            label="Поиск по имени или email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Роль"
            value={role}
            onChange={(e) => setRole(e.target.value as Role | '')}
          >
            <MenuItem value="">Все</MenuItem>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <MenuItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Сортировка"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <MenuItem value="-created_at">Новые</MenuItem>
            <MenuItem value="created_at">Старые</MenuItem>
            <MenuItem value="full_name">По имени</MenuItem>
            <MenuItem value="email">По email</MenuItem>
          </TextField>
        </Grid>
      </Grid>

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Empty title="Никого не нашли" />
      ) : (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Пользователь</TableCell>
                  <TableCell>Роль</TableCell>
                  <TableCell>Зарегистрирован</TableCell>
                  <TableCell>Заблокирован</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {q.data!.items.map((u) => {
                  const self = u.id === me?.id
                  return (
                    <TableRow key={u.id} hover>
                      <TableCell>
                        {u.full_name} {self && <Chip size="small" label="вы" />}
                        <Typography variant="caption" display="block" color="text.secondary">
                          {u.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={u.role}
                          disabled={self}
                          onChange={(e) =>
                            update.mutate({ id: u.id, data: { role: e.target.value as Role } })
                          }
                          sx={{ minWidth: 150 }}
                        >
                          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                            <MenuItem key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(u.created_at)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={u.is_blocked}
                          disabled={self}
                          color="error"
                          slotProps={{ input: { 'aria-label': 'Заблокировать' } }}
                          onChange={(e) =>
                            update.mutate({ id: u.id, data: { is_blocked: e.target.checked } })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
      {q.data && q.data.total > PAGE && (
        <Box display="flex" justifyContent="center">
          <Pagination
            count={Math.ceil(q.data.total / PAGE)}
            page={page}
            onChange={(_, p) => setPage(p)}
            color="primary"
          />
        </Box>
      )}
    </Stack>
  )
}

export function AuditPage() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [action])
  const q = useQuery({
    queryKey: ['audit', action, page],
    queryFn: () => usersApi.audit({ page, size: 20, action: action || undefined }),
    placeholderData: keepPreviousData,
  })
  return (
    <Stack gap={3}>
      <Typography variant="h4">Журнал действий</Typography>
      <TextField
        select
        size="small"
        label="Действие"
        value={action}
        onChange={(e) => setAction(e.target.value)}
        sx={{ maxWidth: 300 }}
      >
        <MenuItem value="">Все</MenuItem>
        {Object.entries(ACTION_LABEL).map(([k, v]) => (
          <MenuItem key={k} value={k}>
            {v}
          </MenuItem>
        ))}
      </TextField>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : q.data!.items.length === 0 ? (
        <Empty title="Записей нет" />
      ) : (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Когда</TableCell>
                  <TableCell>Кто</TableCell>
                  <TableCell>Действие</TableCell>
                  <TableCell>Подробности</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {q.data!.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.created_at)}</TableCell>
                    <TableCell>{a.user?.full_name ?? '—'}</TableCell>
                    <TableCell>{ACTION_LABEL[a.action] ?? a.action}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {a.entity}
                      {a.entity_id ? ` #${a.entity_id}` : ''}{' '}
                      {Object.keys(a.details).length > 0 && JSON.stringify(a.details)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
      {q.data && q.data.total > 20 && (
        <Box display="flex" justifyContent="center">
          <Pagination
            count={Math.ceil(q.data.total / 20)}
            page={page}
            onChange={(_, p) => setPage(p)}
            color="primary"
          />
        </Box>
      )}
    </Stack>
  )
}
