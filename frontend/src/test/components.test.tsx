import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Room } from '../api/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DayTimeline } from '../components/DayTimeline'
import { buildDayCells } from '../utils/slots'

// Подменяем контекст авторизации, чтобы тестировать страницу входа без сервера
const loginMock = vi.fn()
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ login: loginMock }) }))

const { LoginPage } = await import('../pages/AuthPages')
const { RoomCard } = await import('../pages/RoomsPage')

describe('DayTimeline', () => {
  const day = dayjs('2030-01-10')
  const busy = [
    {
      start_at: day.hour(9).toISOString(),
      end_at: day.hour(10).toISOString(),
      status: 'confirmed' as const,
      mine: false,
    },
  ]
  const cells = buildDayCells(day, busy, dayjs('2030-01-01'))

  it('занятые слоты заблокированы, свободные — кликабельны', async () => {
    const onSelect = vi.fn()
    render(<DayTimeline cells={cells} selection={null} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /09:00 — Занято/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /11:00 — Свободно/ }))
    expect(onSelect).toHaveBeenCalledWith(6)
  })

  it('выделяет выбранный интервал', () => {
    render(<DayTimeline cells={cells} selection={[6, 8]} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /11:30/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /12:30/ })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('ConfirmDialog', () => {
  it('вызывает onConfirm по кнопке подтверждения', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Удалить зал?"
        confirmLabel="Удалить"
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    )
    expect(screen.getByText('Удалить зал?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})

describe('LoginPage', () => {
  it('показывает ошибки валидации и не отправляет пустую форму', async () => {
    render(<LoginPage />, { wrapper: MemoryRouter })
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByText('Некорректный email')).toBeInTheDocument()
    expect(screen.getByText('Введите пароль')).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('отправляет email и пароль', async () => {
    render(<LoginPage />, { wrapper: MemoryRouter })
    await userEvent.type(screen.getByLabelText(/Email/), 'admin@meetspace.ru')
    await userEvent.type(screen.getByLabelText(/Пароль/), 'Admin12345')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(loginMock).toHaveBeenCalledWith('admin@meetspace.ru', 'Admin12345')
  })
})

describe('RoomCard', () => {
  it('показывает название, локацию и удобства', () => {
    const room: Room = {
      id: 1,
      name: 'Переговорная «Альфа»',
      description: '',
      capacity: 6,
      floor: 3,
      is_active: true,
      location: { id: 1, name: 'БЦ Север', address: '' },
      amenities: [{ id: 1, name: 'Проектор' }],
      photos: [],
    }
    render(<RoomCard room={room} />, { wrapper: MemoryRouter })
    expect(screen.getByText('Переговорная «Альфа»')).toBeInTheDocument()
    expect(screen.getByText(/БЦ Север · 3 этаж · до 6 человек/)).toBeInTheDocument()
    expect(screen.getByText('Проектор')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/rooms/1')
  })
})
