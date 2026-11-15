import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Grid2 as Grid,
  IconButton,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import UploadIcon from '@mui/icons-material/Upload'
import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { errorMessage } from '../../api/client'
import { roomsApi } from '../../api/endpoints'
import type { Room, RoomInput } from '../../api/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Empty, ErrorState, Loading } from '../../components/States'
import { useSnackbar } from '../../components/Snackbar'
import { checkImageFile, IMAGE_TYPES, MAX_UPLOAD_MB } from '../../utils/validation'

const PAGE = 10

const roomSchema = z.object({
  name: z.string().trim().min(2, 'Минимум 2 символа').max(120),
  location_id: z.number({ message: 'Выберите локацию' }).int().positive('Выберите локацию'),
  capacity: z.number({ message: 'Укажите число' }).int().min(1, 'Минимум 1').max(500, 'Максимум 500'),
  floor: z.number({ message: 'Укажите число' }).int().min(-5).max(200),
  description: z.string().max(2000),
  is_active: z.boolean(),
  amenity_ids: z.array(z.number()),
})

function RoomDialog({ room, onClose }: { room: Room | null | 'new'; onClose: () => void }) {
  const qc = useQueryClient()
  const notify = useSnackbar()
  const locations = useQuery({ queryKey: ['locations'], queryFn: roomsApi.locations })
  const amenities = useQuery({ queryKey: ['amenities'], queryFn: roomsApi.amenities })
  const editing = room && room !== 'new' ? room : null
  const [error, setError] = useState<string | null>(null)

  const form = useForm<RoomInput>({
    resolver: zodResolver(roomSchema),
    values: editing
      ? {
          name: editing.name,
          location_id: editing.location.id,
          capacity: editing.capacity,
          floor: editing.floor,
          description: editing.description,
          is_active: editing.is_active,
          amenity_ids: editing.amenities.map((a) => a.id),
        }
      : {
          name: '',
          location_id: 0,
          capacity: 4,
          floor: 1,
          description: '',
          is_active: true,
          amenity_ids: [],
        },
  })

  const save = useMutation({
    mutationFn: (data: RoomInput) => (editing ? roomsApi.update(editing.id, data) : roomsApi.create(data)),
    onSuccess: () => {
      notify(editing ? 'Зал обновлён' : 'Зал создан')
      qc.invalidateQueries({ queryKey: ['rooms'] })
      qc.invalidateQueries({ queryKey: ['room'] })
      qc.invalidateQueries({ queryKey: ['admin-rooms'] })
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const upload = useMutation({
    mutationFn: (file: File) => roomsApi.uploadPhoto(editing!.id, file),
    onSuccess: () => {
      notify('Фото загружено')
      qc.invalidateQueries({ queryKey: ['room', editing?.id] })
      qc.invalidateQueries({ queryKey: ['admin-rooms'] })
      qc.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (e) => notify(errorMessage(e), 'error'),
  })
  const removePhoto = useMutation({
    mutationFn: (photoId: number) => roomsApi.deletePhoto(editing!.id, photoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', editing?.id] })
      qc.invalidateQueries({ queryKey: ['admin-rooms'] })
    },
  })

  const errs = form.formState.errors
  const num = { setValueAs: (v: string) => (v === '' ? NaN : Number(v)) }

  // актуальные фото: подгружаем зал заново после каждой загрузки/удаления
  const fresh = useQuery({
    queryKey: ['room', editing?.id],
    queryFn: () => roomsApi.get(editing!.id),
    enabled: !!editing,
  }).data

  return (
    <Dialog open={!!room} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editing ? `Редактирование: ${editing.name}` : 'Новый зал'}</DialogTitle>
      <DialogContent>
        <Stack
          component="form"
          id="room-form"
          gap={2}
          pt={1}
          noValidate
          onSubmit={form.handleSubmit((d) => save.mutate(d))}
        >
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Название"
            {...form.register('name')}
            error={!!errs.name}
            helperText={errs.name?.message}
          />
          <Controller
            name="location_id"
            control={form.control}
            render={({ field }) => (
              <TextField
                select
                label="Локация"
                value={field.value || ''}
                onChange={(e) => field.onChange(Number(e.target.value))}
                error={!!errs.location_id}
                helperText={errs.location_id?.message}
              >
                {locations.data?.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField
                fullWidth
                type="number"
                label="Вместимость"
                {...form.register('capacity', num)}
                error={!!errs.capacity}
                helperText={errs.capacity?.message}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth
                type="number"
                label="Этаж"
                {...form.register('floor', num)}
                error={!!errs.floor}
                helperText={errs.floor?.message}
              />
            </Grid>
          </Grid>
          <TextField label="Описание" multiline minRows={2} {...form.register('description')} />
          <Controller
            name="amenity_ids"
            control={form.control}
            render={({ field }) => (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Удобства
                </Typography>
                <FormGroup row>
                  {amenities.data?.map((a) => (
                    <FormControlLabel
                      key={a.id}
                      label={a.name}
                      control={
                        <Checkbox
                          checked={field.value.includes(a.id)}
                          onChange={(e) =>
                            field.onChange(
                              e.target.checked
                                ? [...field.value, a.id]
                                : field.value.filter((x) => x !== a.id),
                            )
                          }
                        />
                      }
                    />
                  ))}
                </FormGroup>
              </Box>
            )}
          />
          <Controller
            name="is_active"
            control={form.control}
            render={({ field }) => (
              <FormControlLabel
                label="Доступен для бронирования"
                control={
                  <Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                }
              />
            )}
          />
          {fresh && (
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Фото (JPG/PNG/WEBP, до {MAX_UPLOAD_MB} МБ)
              </Typography>
              <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
                {fresh.photos.map((p) => (
                  <Box key={p.id} position="relative">
                    <Box
                      component="img"
                      src={p.url}
                      alt=""
                      width={90}
                      height={64}
                      sx={{ objectFit: 'cover', borderRadius: 1 }}
                    />
                    <IconButton
                      size="small"
                      aria-label="Удалить фото"
                      onClick={() => removePhoto.mutate(p.id)}
                      sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper' }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button
                  component="label"
                  variant="outlined"
                  startIcon={<UploadIcon />}
                  disabled={upload.isPending}
                >
                  {upload.isPending ? 'Загрузка…' : 'Загрузить'}
                  <input
                    hidden
                    type="file"
                    accept={IMAGE_TYPES.join(',')}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (!file) return
                      const err = checkImageFile(file)
                      if (err) notify(err, 'error')
                      else upload.mutate(file)
                    }}
                  />
                </Button>
              </Stack>
            </Box>
          )}
          {!editing && (
            <Typography variant="caption" color="text.secondary">
              Фото можно добавить после создания зала
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button type="submit" form="room-form" variant="contained" disabled={save.isPending}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function LocationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const qc = useQueryClient()
  const notify = useSnackbar()
  const save = useMutation({
    mutationFn: () => roomsApi.createLocation({ name, address }),
    onSuccess: () => {
      notify('Локация добавлена')
      qc.invalidateQueries({ queryKey: ['locations'] })
      setName('')
      setAddress('')
      onClose()
    },
    onError: (e) => notify(errorMessage(e), 'error'),
  })
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Новая локация</DialogTitle>
      <DialogContent>
        <Stack gap={2} pt={1}>
          <TextField label="Название" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Адрес" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={name.trim().length < 2 || address.trim().length < 3}
          onClick={() => save.mutate()}
        >
          Добавить
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function AdminRoomsPage() {
  const qc = useQueryClient()
  const notify = useSnackbar()
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Room | null | 'new'>(null)
  const [deleting, setDeleting] = useState<Room | null>(null)
  const [locationOpen, setLocationOpen] = useState(false)

  const q = useQuery({
    queryKey: ['admin-rooms', page],
    queryFn: () => roomsApi.list({ page, size: PAGE, include_inactive: true, sort: 'name' }),
    placeholderData: keepPreviousData,
  })

  const remove = useMutation({
    mutationFn: (id: number) => roomsApi.remove(id),
    onSuccess: () => {
      notify('Зал удалён')
      qc.invalidateQueries({ queryKey: ['admin-rooms'] })
      qc.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (e) => notify(errorMessage(e), 'error'),
  })

  return (
    <Stack gap={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
        <Typography variant="h4">Управление залами</Typography>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" onClick={() => setLocationOpen(true)}>
            + Локация
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>
            Новый зал
          </Button>
        </Stack>
      </Stack>

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Empty title="Залов пока нет" />
      ) : (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                  <TableCell>Локация</TableCell>
                  <TableCell>Мест</TableCell>
                  <TableCell>Фото</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {q.data!.items.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.location.name}</TableCell>
                    <TableCell>{r.capacity}</TableCell>
                    <TableCell>{r.photos.length}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={r.is_active ? 'Активен' : 'Скрыт'}
                        color={r.is_active ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Редактировать">
                        <IconButton onClick={() => setEditing(r)} aria-label={`Редактировать ${r.name}`}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Удалить">
                        <IconButton
                          color="error"
                          onClick={() => setDeleting(r)}
                          aria-label={`Удалить ${r.name}`}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
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

      <RoomDialog room={editing} onClose={() => setEditing(null)} />
      <LocationDialog open={locationOpen} onClose={() => setLocationOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        danger
        title="Удалить зал?"
        text={`«${deleting?.name}» и все его брони будут удалены без возможности восстановления.`}
        confirmLabel="Удалить"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id)
          setDeleting(null)
        }}
      />
    </Stack>
  )
}
