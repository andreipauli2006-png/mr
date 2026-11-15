import { Box, Tooltip, Typography } from '@mui/material'
import type { TimeCell } from '../utils/slots'

interface Props {
  cells: TimeCell[]
  selection: [number, number] | null
  onSelect: (index: number) => void
}

/** Календарь дня: ячейки по 30 минут. Клик по первой и последней ячейке задаёт интервал. */
export function DayTimeline({ cells, selection, onSelect }: Props) {
  const [a, b] = selection ? [Math.min(...selection), Math.max(...selection)] : [-1, -1]
  return (
    <Box
      display="grid"
      gridTemplateColumns={{ xs: 'repeat(4, 1fr)', sm: 'repeat(7, 1fr)', md: 'repeat(7, 1fr)' }}
      gap={0.75}
      role="grid"
      aria-label="Слоты на день"
    >
      {cells.map((c, i) => {
        const selected = i >= a && i <= b
        const disabled = c.busy || c.past
        const label = c.start.format('HH:mm')
        const hint = c.busy ? (c.mine ? 'Ваша бронь' : 'Занято') : c.past ? 'Время прошло' : 'Свободно'
        return (
          <Tooltip key={i} title={hint}>
            <Box
              component="button"
              type="button"
              disabled={disabled}
              onClick={() => onSelect(i)}
              aria-pressed={selected}
              aria-label={`${label} — ${hint}`}
              sx={{
                py: 1,
                border: 1,
                borderRadius: 1,
                font: 'inherit',
                cursor: disabled ? 'not-allowed' : 'pointer',
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected
                  ? 'primary.main'
                  : c.busy
                    ? c.mine
                      ? 'secondary.light'
                      : 'error.light'
                    : c.past
                      ? 'action.disabledBackground'
                      : 'background.paper',
                color: selected ? 'primary.contrastText' : c.busy ? '#fff' : 'text.primary',
                opacity: c.past && !c.busy ? 0.5 : 1,
                transition: 'background-color .15s',
                '&:hover:not(:disabled)': { borderColor: 'primary.main' },
              }}
            >
              <Typography variant="body2" fontWeight={selected ? 700 : 400}>
                {label}
              </Typography>
            </Box>
          </Tooltip>
        )
      })}
    </Box>
  )
}
