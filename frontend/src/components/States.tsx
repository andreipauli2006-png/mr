// Единые состояния загрузки, пустого списка и ошибки (UI-kit)
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import type { ReactNode } from 'react'
import { errorMessage } from '../api/client'

export function Loading({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <Stack alignItems="center" gap={2} py={6} role="status">
      <CircularProgress />
      <Typography color="text.secondary">{label}</Typography>
    </Stack>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Stack alignItems="center" gap={1} py={6} color="text.secondary">
      <InboxOutlinedIcon sx={{ fontSize: 48 }} />
      <Typography variant="h6">{title}</Typography>
      {children}
    </Stack>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Box py={2}>
      <Alert
        severity="error"
        action={
          onRetry && (
            <Button color="inherit" size="small" onClick={onRetry}>
              Повторить
            </Button>
          )
        }
      >
        {errorMessage(error)}
      </Alert>
    </Box>
  )
}
