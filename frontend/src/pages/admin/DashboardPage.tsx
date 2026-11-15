import { Button, Card, CardContent, Grid2 as Grid, Stack, Typography, useTheme } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Link as RouterLink } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { usersApi } from '../../api/endpoints'
import { ErrorState, Loading } from '../../components/States'

function Stat({ label, value, action }: { label: string; value: number; action?: React.ReactNode }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography color="text.secondary" variant="body2">
          {label}
        </Typography>
        <Typography variant="h4" mt={0.5}>
          {value}
        </Typography>
        {action}
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const theme = useTheme()
  const q = useQuery({ queryKey: ['dashboard'], queryFn: usersApi.dashboard })
  if (q.isLoading) return <Loading />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const d = q.data!
  const byDay = d.by_day.map((x) => ({ ...x, label: dayjs(x.day).format('D MMM') }))
  const axis = { fill: theme.palette.text.secondary, fontSize: 12 }

  return (
    <Stack gap={3}>
      <Typography variant="h4">Дашборд</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Активных залов" value={d.total_rooms} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Пользователей" value={d.total_users} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Броней сегодня" value={d.bookings_today} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat
            label="Ждут подтверждения"
            value={d.pending_count}
            action={
              d.pending_count > 0 && (
                <Button size="small" component={RouterLink} to="/admin/requests" sx={{ mt: 1, px: 0 }}>
                  Перейти к заявкам
                </Button>
              )
            }
          />
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Брони за 14 дней
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                  <XAxis dataKey="label" tick={axis} />
                  <YAxis allowDecimals={false} tick={axis} />
                  <Tooltip formatter={(v) => [v, 'Броней']} />
                  <Line type="linear" dataKey="count" stroke={theme.palette.primary.main} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Популярные залы
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={d.top_rooms} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" allowDecimals={false} tick={axis} />
                  <YAxis type="category" dataKey="room" width={110} tick={axis} />
                  <Tooltip formatter={(v) => [v, 'Броней']} />
                  <Bar dataKey="count" fill={theme.palette.secondary.main} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  )
}
