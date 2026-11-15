import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { pluralPeople } from '../utils/format'
import { buildDayCells, isRangeFree } from '../utils/slots'
import { checkImageFile, passwordSchema } from '../utils/validation'

describe('buildDayCells', () => {
  const day = dayjs('2030-01-10')
  const now = dayjs('2030-01-10T09:10:00')

  it('делит рабочий день 08:00–22:00 на 28 ячеек по 30 минут', () => {
    const cells = buildDayCells(day, [], now)
    expect(cells).toHaveLength(28)
    expect(cells[0].start.format('HH:mm')).toBe('08:00')
    expect(cells.at(-1)!.end.format('HH:mm')).toBe('22:00')
  })

  it('отмечает прошедшие и занятые ячейки', () => {
    const busy = [
      {
        start_at: day.hour(10).toISOString(),
        end_at: day.hour(11).toISOString(),
        status: 'confirmed' as const,
        mine: true,
      },
    ]
    const cells = buildDayCells(day, busy, now)
    expect(cells[0].past).toBe(true) // 08:00
    expect(cells[3].past).toBe(false) // 09:30
    expect(cells[4].busy && cells[4].mine).toBe(true) // 10:00
    expect(cells[5].busy).toBe(true) // 10:30
    expect(cells[6].busy).toBe(false) // 11:00
  })
})

describe('isRangeFree', () => {
  const day = dayjs('2030-01-10')
  const busy = [
    {
      start_at: day.hour(12).toISOString(),
      end_at: day.hour(13).toISOString(),
      status: 'pending' as const,
      mine: false,
    },
  ]
  const cells = buildDayCells(day, busy, dayjs('2030-01-01'))

  it('разрешает свободный интервал в любом порядке клика', () => {
    expect(isRangeFree(cells, 2, 5)).toBe(true)
    expect(isRangeFree(cells, 5, 2)).toBe(true)
  })
  it('запрещает интервал через занятое время', () => {
    expect(isRangeFree(cells, 6, 10)).toBe(false)
  })
  it('запрещает интервал длиннее 4 часов', () => {
    expect(isRangeFree(cells, 14, 22)).toBe(false)
  })
})

describe('pluralPeople', () => {
  it.each([
    [1, '1 человек'],
    [3, '3 человека'],
    [5, '5 человек'],
    [12, '12 человек'],
    [22, '22 человека'],
  ])('%i → %s', (n, s) => expect(pluralPeople(n)).toBe(s))
})

describe('валидация', () => {
  it('пароль: буквы и цифры, от 8 символов', () => {
    expect(passwordSchema.safeParse('abc12345').success).toBe(true)
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(false)
    expect(passwordSchema.safeParse('a1').success).toBe(false)
  })
  it('файл: только картинки до 5 МБ', () => {
    expect(checkImageFile({ type: 'image/png', size: 1000 })).toBeNull()
    expect(checkImageFile({ type: 'application/pdf', size: 1000 })).toMatch(/JPG/)
    expect(checkImageFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toMatch(/МБ/)
  })
})
