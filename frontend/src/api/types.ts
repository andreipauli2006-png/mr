// Типы, повторяющие схемы бэкенда (см. Swagger: /api/docs)
export type Role = 'guest' | 'employee' | 'admin'
export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
  is_blocked: boolean
  created_at: string
}

export interface Location {
  id: number
  name: string
  address: string
}

export interface Amenity {
  id: number
  name: string
}

export interface RoomPhoto {
  id: number
  file_name: string
  url: string
}

export interface Room {
  id: number
  name: string
  description: string
  capacity: number
  floor: number
  is_active: boolean
  location: Location
  amenities: Amenity[]
  photos: RoomPhoto[]
}

export interface RoomInput {
  location_id: number
  name: string
  description: string
  capacity: number
  floor: number
  is_active: boolean
  amenity_ids: number[]
}

export interface Booking {
  id: number
  title: string
  start_at: string
  end_at: string
  attendees: number
  status: BookingStatus
  created_at: string
  room: { id: number; name: string }
  user: { id: number; full_name: string; email: string }
}

export interface Slot {
  start_at: string
  end_at: string
  status: BookingStatus
  mine: boolean
}

export interface AuditEntry {
  id: number
  action: string
  entity: string
  entity_id: number | null
  details: Record<string, unknown>
  created_at: string
  user: { id: number; full_name: string; email: string } | null
}

export interface Dashboard {
  total_rooms: number
  total_users: number
  bookings_today: number
  pending_count: number
  by_day: { day: string; count: number }[]
  top_rooms: { room: string; count: number }[]
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { field: string; message: string }[] | null }
}
