import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import type { BookingStatus, Role } from '../api/types'

dayjs.locale('ru')

export const ROLE_LABEL: Record<Role, string> = {
  guest: 'Гость',
  employee: 'Сотрудник',
  admin: 'Администратор',
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Ожидает',
  confirmed: 'Подтверждена',
  rejected: 'Отклонена',
  cancelled: 'Отменена',
}

export const STATUS_COLOR: Record<BookingStatus, 'warning' | 'success' | 'error' | 'default'> = {
  pending: 'warning',
  confirmed: 'success',
  rejected: 'error',
  cancelled: 'default',
}

export const ACTION_LABEL: Record<string, string> = {
  'user.register': 'Регистрация',
  'user.login': 'Вход в систему',
  'user.password_reset': 'Сброс пароля',
  'user.password_change': 'Смена пароля',
  'user.profile_update': 'Изменение профиля',
  'booking.create': 'Создание брони',
  'booking.status': 'Смена статуса брони',
  'room.create': 'Создание зала',
  'room.update': 'Изменение зала',
  'room.delete': 'Удаление зала',
  'room.photo_add': 'Загрузка фото',
  'room.photo_delete': 'Удаление фото',
  'location.create': 'Создание локации',
  'admin.user_update': 'Изменение пользователя',
}

export const fmtDateTime = (iso: string) => dayjs(iso).format('D MMM YYYY, HH:mm')
export const fmtTime = (iso: string) => dayjs(iso).format('HH:mm')
export const fmtRange = (start: string, end: string) =>
  `${dayjs(start).format('D MMM, HH:mm')} – ${dayjs(end).format('HH:mm')}`

/** «1 человек», «3 человека», «5 человек» */
export function pluralPeople(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} человек`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} человека`
  return `${n} человек`
}
