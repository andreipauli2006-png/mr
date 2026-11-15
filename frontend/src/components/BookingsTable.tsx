import {
  Box,
  Button,
  Chip,
  Grid2 as Grid,
  InputAdornment,
  MenuItem,
  Pagination,
  Stack,
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
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { bookingsApi } from '../api/endpoints'
import type { Booking, BookingStatus } from '../api/types'
import { useDebounced } from '../utils/useDebounced'
import { fmtRange, STATUS_COLOR, STATUS_LABEL } from '../utils/format'
import { ConfirmDialog } from './ConfirmDialog'
import { Empty, ErrorState, Loading } from './States'
import { useSnackbar } from './Snackbar'

const PAGE_SIZE = 10

interface Props {
  admin?: boolean // режим администратора: все брони, колонка «Кто», подтверждение заявок
  initialStatus?: BookingStatus | ''
}

export function BookingsTable({ admin = false, initialStatus = '' }: Props) {
  const qc = useQueryClient()
  const notify = useSnackbar()
  const [status, setStatus] = useState<BookingStatus | ''>(initialStatus)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-start_at')
  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState<{ booking: Booking; status: BookingStatus } | null>(null)
  const debounced = useDebounced(search)
  useEffect(() => setPage(1), [status, debounced, sort])

  const q = useQuery({
    queryKey: ['bookings', admin, status, debounced, sort, page],
    queryFn: () => bookingsApi.list({ mine: !admin, status, search: debounced, sort, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: BookingStatus }) => bookingsApi.setStatus(id, status),
    onSuccess: (b) => {
      notify(`Статус брони «${b.title}»: ${STATUS_LABEL[b.status].toLowerCase()}`)
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['slots'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => notify(errorMessage(e), 'error'),
  })

  const ask = (booking: Booking, status: BookingStatus) => setConfirm({ booking, status })
  const pages = q.data ? Math.ceil(q.data.total / PAGE_SIZE) : 0
  const active = (b: Booking) => b.status === 'pending' || b.status === 'confirmed'

  return (
    <Stack gap={2}>
      <Grid container spacing={2} alignItems="center">
        <Grid size={{ xs: 12, sm: 5 }}>
          <TextField
            fullWidth
            size="small"
            label="Поиск по теме"
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
        <Grid size={{ xs: 6, sm: 2.5 }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Статус"
            value={status}
            onChange={(e) => setStatus(e.target.value as BookingStatus | '')}
          >
            <MenuItem value="">Все</MenuItem>
            {(Object.keys(STATUS_LABEL) as BookingStatus[]).map((s) => (
              <MenuItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 2.5 }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Сортировка"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <MenuItem value="-start_at">Сначала поздние</MenuItem>
            <MenuItem value="start_at">Сначала ранние</MenuItem>
            <MenuItem value="-created_at">Недавно созданные</MenuItem>
            <MenuItem value="title">По теме</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 2 }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={() => bookingsApi.exportXlsx(status).catch((e) => notify(errorMessage(e), 'error'))}
          >
            Excel
          </Button>
        </Grid>
      </Grid>

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Empty title="Броней пока нет">
          {!admin && (
            <Button component={RouterLink} to="/" variant="contained">
              Найти зал
            </Button>
          )}
        </Empty>
      ) : (
        <>
          <TableContainer sx={{ opacity: q.isFetching ? 0.6 : 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Тема</TableCell>
                  <TableCell>Зал</TableCell>
                  <TableCell>Время</TableCell>
                  {admin && <TableCell>Кто</TableCell>}
                  <TableCell>Статус</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {q.data!.items.map((b) => (
                  <TableRow key={b.id} hover>
                    <TableCell>
                      <Typography fontWeight={500}>{b.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        участников: {b.attendees}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box component={RouterLink} to={`/rooms/${b.room.id}`} sx={{ color: 'primary.main' }}>
                        {b.room.name}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtRange(b.start_at, b.end_at)}</TableCell>
                    {admin && (
                      <TableCell>
                        {b.user.full_name}
                        <Typography variant="caption" display="block" color="text.secondary">
                          {b.user.email}
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell>
                      <Chip size="small" label={STATUS_LABEL[b.status]} color={STATUS_COLOR[b.status]} />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {admin && b.status === 'pending' && (
                        <>
                          <Button size="small" color="success" onClick={() => ask(b, 'confirmed')}>
                            Подтвердить
                          </Button>
                          <Button size="small" color="error" onClick={() => ask(b, 'rejected')}>
                            Отклонить
                          </Button>
                        </>
                      )}
                      {active(b) && (admin ? b.status === 'confirmed' : true) && (
                        <Button size="small" color="inherit" onClick={() => ask(b, 'cancelled')}>
                          Отменить
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {pages > 1 && (
            <Box display="flex" justifyContent="center">
              <Pagination count={pages} page={page} onChange={(_, p) => setPage(p)} color="primary" />
            </Box>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.status === 'confirmed'
            ? 'Подтвердить бронь?'
            : confirm?.status === 'rejected'
              ? 'Отклонить заявку?'
              : 'Отменить бронь?'
        }
        text={
          confirm
            ? `«${confirm.booking.title}», ${fmtRange(confirm.booking.start_at, confirm.booking.end_at)}`
            : ''
        }
        danger={confirm?.status !== 'confirmed'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) mutation.mutate({ id: confirm.booking.id, status: confirm.status })
          setConfirm(null)
        }}
      />
    </Stack>
  )
}
