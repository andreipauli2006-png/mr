import dayjs, { type Dayjs } from 'dayjs'
import type { Slot } from '../api/types'

// Должно совпадать с настройками бэкенда
export const DAY_START_HOUR = 8
export const DAY_END_HOUR = 22
export const SLOT_MINUTES = 30
export const MAX_HOURS = 4

export interface TimeCell {
  start: Dayjs
  end: Dayjs
  busy: boolean
  mine: boolean
  past: boolean
}

/** Делит рабочий день на ячейки по 30 минут и отмечает занятые. */
export function buildDayCells(day: Dayjs, busy: Slot[], now: Dayjs = dayjs()): TimeCell[] {
  const cells: TimeCell[] = []
  let t = day.startOf('day').hour(DAY_START_HOUR)
  const close = day.startOf('day').hour(DAY_END_HOUR)
  while (t.isBefore(close)) {
    const end = t.add(SLOT_MINUTES, 'minute')
    const hit = busy.find((s) => dayjs(s.start_at).isBefore(end) && dayjs(s.end_at).isAfter(t))
    cells.push({ start: t, end, busy: !!hit, mine: !!hit?.mine, past: t.isBefore(now) })
    t = end
  }
  return cells
}

/** Можно ли выбрать диапазон ячеек [from..to] — все свободны, не в прошлом, не длиннее MAX_HOURS. */
export function isRangeFree(cells: TimeCell[], from: number, to: number): boolean {
  const [a, b] = from <= to ? [from, to] : [to, from]
  if ((b - a + 1) * SLOT_MINUTES > MAX_HOURS * 60) return false
  return cells.slice(a, b + 1).every((c) => !c.busy && !c.past)
}
