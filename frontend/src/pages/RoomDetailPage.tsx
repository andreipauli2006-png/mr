import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid2 as Grid,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { bookingsApi, roomsApi } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { DayTimeline } from '../components/DayTimeline'
import { ErrorState, Loading } from '../components/States'
import { pluralPeople } from '../utils/format'
import { buildDayCells, isRangeFree, MAX_HOURS } from '../utils/slots'

export function RoomDetailPage() {
  const id = Number(useParams().id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [day, setDay] = useState(dayjs().startOf('day'))
  const [selection, setSelection] = useState<[number, number] | null>(null)
  const [title, setTitle] = useState('')
  const [attendees, setAttendees] = useState(1)
  const [hint, setHint] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const room = useQuery({ queryKey: ['room', id], queryFn: () => roomsApi.get(id) })
  const slots = useQuery({
    queryKey: ['slots', id, day.format('YYYY-MM-DD')],
    queryFn: () => roomsApi.slots(id, day.format('YYYY-MM-DD')),
  })
  const cells = useMemo(() => buildDayCells(day, slots.data ?? []), [day, slots.data])

  const book = useMutation({
    mutationFn: bookingsApi.create,
    onSuccess: (b) => {
      setSelection(null)
      setTitle('')
      setSuccess(
        b.status === 'pending'
          ? 'Заявка отправлена. Бронь станет активной после подтверждения администратором.'
          : 'Зал забронирован!',
      )
      qc.invalidateQueries({ queryKey: ['slots', id] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
    },
  })

  const changeDay = (delta: number) => {
    setDay((d) => d.add(delta, 'day'))
    setSelection(null)
    setSuccess(null)
  }

  // первый клик — начало, второй — конец интервала; третий — начинаем заново
  const handleSelect = (i: number) => {
    setSuccess(null)
    book.reset()
    if (!selection || selection[0] !== selection[1]) {
      setSelection([i, i])
      setHint(null)
      return
    }
    if (isRangeFree(cells, selection[0], i)) {
      setSelection([selection[0], i])
      setHint(null)
    } else {
      setSelection([i, i])
      setHint(`Интервал должен быть свободным и не длиннее ${MAX_HOURS} часов`)
    }
  }

  if (room.isLoading) return <Loading />
  if (room.isError) return <ErrorState error={room.error} />
  const r = room.data!

  const [a, b] = selection ? [Math.min(...selection), Math.max(...selection)] : [0, 0]
  const start = selection ? cells[a].start : null
  const end = selection ? cells[b].end : null
  const titleError = title.trim().length > 0 && title.trim().length < 2
  const canSubmit =
    !!user && !!selection && title.trim().length >= 2 && attendees >= 1 && attendees <= r.capacity

  return (
    <Stack gap={3}>
      <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} sx={{ alignSelf: 'flex-start' }}>
        Все залы
      </Button>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            {r.photos[0] && (
              <Box
                component="img"
                src={r.photos[0].url}
                alt={r.name}
                width="100%"
                maxHeight={260}
                sx={{ objectFit: 'cover' }}
              />
            )}
            <CardContent>
              <Typography variant="h5" gutterBottom>
                {r.name}
              </Typography>
              <Typography color="text.secondary" gutterBottom>
                {r.location.name}, {r.location.address}
              </Typography>
              <Typography gutterBottom>
                {r.floor} этаж · вместимость до {pluralPeople(r.capacity)}
              </Typography>
              {r.description && <Typography mt={2}>{r.description}</Typography>}
              <Stack direction="row" flexWrap="wrap" gap={0.5} mt={2}>
                {r.amenities.map((am) => (
                  <Chip key={am.id} label={am.name} size="small" />
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
                <IconButton
                  onClick={() => changeDay(-1)}
                  disabled={day.isSame(dayjs(), 'day')}
                  aria-label="Предыдущий день"
                >
                  <ChevronLeftIcon />
                </IconButton>
                <Typography variant="h6" textAlign="center">
                  {day.format('dddd, D MMMM')}
                </Typography>
                <IconButton onClick={() => changeDay(1)} aria-label="Следующий день">
                  <ChevronRightIcon />
                </IconButton>
              </Stack>

              {slots.isLoading ? (
                <Loading label="Загружаем расписание…" />
              ) : slots.isError ? (
                <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
              ) : (
                <DayTimeline cells={cells} selection={selection} onSelect={handleSelect} />
              )}

              <Stack direction="row" gap={2} mt={2} flexWrap="wrap">
                <Legend color="error.light" label="Занято" />
                <Legend color="secondary.light" label="Ваша бронь" />
                <Legend color="primary.main" label="Выбрано" />
              </Stack>

              {hint && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  {hint}
                </Alert>
              )}

              <Box mt={3}>
                {!user ? (
                  <Alert
                    severity="info"
                    action={
                      <Button
                        color="inherit"
                        onClick={() => navigate('/login', { state: { from: `/rooms/${id}` } })}
                      >
                        Войти
                      </Button>
                    }
                  >
                    Войдите, чтобы забронировать зал
                  </Alert>
                ) : (
                  <Stack gap={2}>
                    <Typography>
                      {start && end
                        ? `Выбрано: ${start.format('HH:mm')} – ${end.format('HH:mm')}`
                        : 'Выберите начало и конец встречи в расписании'}
                    </Typography>
                    <TextField
                      label="Тема встречи"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      error={titleError}
                      helperText={titleError ? 'Минимум 2 символа' : ' '}
                      slotProps={{ htmlInput: { maxLength: 200 } }}
                    />
                    <TextField
                      label="Количество участников"
                      type="number"
                      value={attendees}
                      onChange={(e) => setAttendees(Number(e.target.value))}
                      error={attendees < 1 || attendees > r.capacity}
                      helperText={attendees > r.capacity ? `Не больше ${r.capacity}` : ' '}
                      slotProps={{ htmlInput: { min: 1, max: r.capacity } }}
                    />
                    {user.role === 'guest' && (
                      <Alert severity="warning">
                        Вы гость: бронь будет ждать подтверждения администратора.
                      </Alert>
                    )}
                    {book.isError && <Alert severity="error">{errorMessage(book.error)}</Alert>}
                    {success && <Alert severity="success">{success}</Alert>}
                    <Button
                      variant="contained"
                      size="large"
                      disabled={!canSubmit || book.isPending}
                      onClick={() =>
                        book.mutate({
                          room_id: id,
                          title: title.trim(),
                          attendees,
                          start_at: start!.toISOString(),
                          end_at: end!.toISOString(),
                        })
                      }
                    >
                      {book.isPending ? 'Бронируем…' : 'Забронировать'}
                    </Button>
                  </Stack>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" alignItems="center" gap={0.75}>
      <Box width={14} height={14} borderRadius={0.5} bgcolor={color} />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  )
}
