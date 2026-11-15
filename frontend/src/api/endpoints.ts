// Все запросы к API в одном месте
import { api } from './client'
import type {
  Amenity,
  AuditEntry,
  Booking,
  BookingStatus,
  Dashboard,
  Location,
  Page,
  Role,
  Room,
  RoomInput,
  RoomPhoto,
  Slot,
  User,
} from './types'

export interface TokenPair {
  access_token: string
  refresh_token: string
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<TokenPair>('/auth/login', { email, password }).then((r) => r.data),
  register: (data: { email: string; password: string; full_name: string }) =>
    api.post<User>('/auth/register', data).then((r) => r.data),
  logout: (refresh_token: string) => api.post('/auth/logout', { refresh_token }),
  forgot: (email: string) => api.post('/auth/forgot-password', { email }),
  reset: (token: string, new_password: string) => api.post('/auth/reset-password', { token, new_password }),
  changePassword: (old_password: string, new_password: string) =>
    api.post('/auth/change-password', { old_password, new_password }),
}

export const usersApi = {
  me: () => api.get<User>('/users/me').then((r) => r.data),
  updateMe: (full_name: string) => api.patch<User>('/users/me', { full_name }).then((r) => r.data),
  history: (page: number) =>
    api.get<Page<AuditEntry>>('/users/me/history', { params: { page, size: 10 } }).then((r) => r.data),
  list: (params: { search?: string; role?: Role | ''; sort?: string; page: number; size: number }) =>
    api
      .get<Page<User>>('/admin/users', { params: { ...params, role: params.role || undefined } })
      .then((r) => r.data),
  update: (id: number, data: { role?: Role; is_blocked?: boolean }) =>
    api.patch<User>(`/admin/users/${id}`, data).then((r) => r.data),
  audit: (params: { page: number; size: number; action?: string }) =>
    api.get<Page<AuditEntry>>('/admin/audit', { params }).then((r) => r.data),
  dashboard: () => api.get<Dashboard>('/admin/dashboard').then((r) => r.data),
}

export interface RoomFilters {
  search?: string
  location_id?: number | ''
  min_capacity?: number | ''
  amenity_ids?: number[]
  sort?: string
  include_inactive?: boolean
  page: number
  size: number
}

export const roomsApi = {
  list: (f: RoomFilters) =>
    api
      .get<Page<Room>>('/rooms', {
        params: {
          ...f,
          location_id: f.location_id || undefined,
          min_capacity: f.min_capacity || undefined,
          search: f.search || undefined,
        },
        paramsSerializer: { indexes: null }, // amenity_ids=1&amenity_ids=2
      })
      .then((r) => r.data),
  get: (id: number) => api.get<Room>(`/rooms/${id}`).then((r) => r.data),
  slots: (id: number, day: string) =>
    api.get<Slot[]>(`/rooms/${id}/slots`, { params: { day } }).then((r) => r.data),
  create: (data: RoomInput) => api.post<Room>('/rooms', data).then((r) => r.data),
  update: (id: number, data: RoomInput) => api.put<Room>(`/rooms/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/rooms/${id}`),
  uploadPhoto: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<RoomPhoto>(`/rooms/${id}/photos`, form).then((r) => r.data)
  },
  deletePhoto: (roomId: number, photoId: number) => api.delete(`/rooms/${roomId}/photos/${photoId}`),
  locations: () => api.get<Location[]>('/locations').then((r) => r.data),
  createLocation: (data: { name: string; address: string }) =>
    api.post<Location>('/locations', data).then((r) => r.data),
  amenities: () => api.get<Amenity[]>('/amenities').then((r) => r.data),
}

export interface BookingFilters {
  mine?: boolean
  status?: BookingStatus | ''
  search?: string
  room_id?: number
  sort?: string
  page: number
  size: number
}

export const bookingsApi = {
  list: (f: BookingFilters) =>
    api
      .get<Page<Booking>>('/bookings', {
        params: { ...f, status: f.status || undefined, search: f.search || undefined },
      })
      .then((r) => r.data),
  create: (data: { room_id: number; title: string; start_at: string; end_at: string; attendees: number }) =>
    api.post<Booking>('/bookings', data).then((r) => r.data),
  setStatus: (id: number, status: BookingStatus) =>
    api.patch<Booking>(`/bookings/${id}/status`, { status }).then((r) => r.data),
  exportXlsx: async (status?: BookingStatus | '') => {
    const r = await api.get('/bookings/export.xlsx', {
      params: { status: status || undefined },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(r.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bookings.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  },
}
