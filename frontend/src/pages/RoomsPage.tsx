import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  FormControl,
  Grid2 as Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Pagination,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import GroupsIcon from '@mui/icons-material/Groups'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { roomsApi } from '../api/endpoints'
import type { Room } from '../api/types'
import { Empty, ErrorState, Loading } from '../components/States'
import { pluralPeople } from '../utils/format'
import { useDebounced } from '../utils/useDebounced'

const PAGE_SIZE = 9

export function RoomCard({ room }: { room: Room }) {
  const photo = room.photos[0]?.url
  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea
        component={RouterLink}
        to={`/rooms/${room.id}`}
        sx={{ height: '100%', alignItems: 'stretch' }}
      >
        {photo ? (
          <CardMedia component="img" height="150" image={photo} alt={room.name} />
        ) : (
          <Box
            height={150}
            display="flex"
            alignItems="center"
            justifyContent="center"
            sx={{ bgcolor: 'action.hover', color: 'text.secondary' }}
          >
            <GroupsIcon sx={{ fontSize: 56 }} />
          </Box>
        )}
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {room.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {room.location.name} · {room.floor} этаж · до {pluralPeople(room.capacity)}
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.5} mt={1}>
            {room.amenities.map((a) => (
              <Chip key={a.id} label={a.name} size="small" />
            ))}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

export function RoomsPage() {
  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState<number | ''>('')
  const [minCapacity, setMinCapacity] = useState<number | ''>('')
  const [amenityIds, setAmenityIds] = useState<number[]>([])
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounced(search)

  // при смене фильтров возвращаемся на первую страницу
  useEffect(() => setPage(1), [debouncedSearch, locationId, minCapacity, amenityIds, sort])

  const locations = useQuery({ queryKey: ['locations'], queryFn: roomsApi.locations })
  const amenities = useQuery({ queryKey: ['amenities'], queryFn: roomsApi.amenities })
  const rooms = useQuery({
    queryKey: ['rooms', debouncedSearch, locationId, minCapacity, amenityIds, sort, page],
    queryFn: () =>
      roomsApi.list({
        search: debouncedSearch,
        location_id: locationId,
        min_capacity: minCapacity,
        amenity_ids: amenityIds,
        sort,
        page,
        size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })

  const pages = rooms.data ? Math.ceil(rooms.data.total / PAGE_SIZE) : 0

  return (
    <Stack gap={3}>
      <Box>
        <Typography variant="h4">Переговорные и коворкинги</Typography>
        <Typography color="text.secondary">
          Выберите зал и свободное время — бронь оформляется в пару кликов
        </Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            label="Поиск по названию или описанию"
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
        <Grid size={{ xs: 6, md: 2 }}>
          <TextField
            select
            fullWidth
            label="Локация"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <MenuItem value="">Все</MenuItem>
            {locations.data?.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <TextField
            fullWidth
            type="number"
            label="Мест от"
            value={minCapacity}
            onChange={(e) => setMinCapacity(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
            slotProps={{ htmlInput: { min: 1 } }}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <FormControl fullWidth>
            <InputLabel id="amenities-label">Удобства</InputLabel>
            <Select
              labelId="amenities-label"
              multiple
              value={amenityIds}
              onChange={(e) => setAmenityIds(e.target.value as number[])}
              input={<OutlinedInput label="Удобства" />}
              renderValue={(ids) => `Выбрано: ${ids.length}`}
            >
              {amenities.data?.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <TextField
            select
            fullWidth
            label="Сортировка"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <MenuItem value="name">По названию</MenuItem>
            <MenuItem value="-capacity">Сначала большие</MenuItem>
            <MenuItem value="capacity">Сначала маленькие</MenuItem>
            <MenuItem value="floor">По этажу</MenuItem>
          </TextField>
        </Grid>
      </Grid>

      {rooms.isLoading ? (
        <Loading />
      ) : rooms.isError ? (
        <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} />
      ) : rooms.data!.items.length === 0 ? (
        <Empty title="Ничего не найдено">
          <Typography variant="body2">Попробуйте изменить фильтры</Typography>
        </Empty>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary">
            Найдено залов: {rooms.data!.total}
          </Typography>
          <Grid container spacing={2} sx={{ opacity: rooms.isFetching ? 0.6 : 1 }}>
            {rooms.data!.items.map((r) => (
              <Grid key={r.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <RoomCard room={r} />
              </Grid>
            ))}
          </Grid>
          {pages > 1 && (
            <Box display="flex" justifyContent="center">
              <Pagination count={pages} page={page} onChange={(_, p) => setPage(p)} color="primary" />
            </Box>
          )}
        </>
      )}
    </Stack>
  )
}
