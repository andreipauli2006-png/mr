import { Alert, Snackbar } from '@mui/material'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Severity = 'success' | 'error' | 'info'
type Notify = (message: string, severity?: Severity) => void

const Ctx = createContext<Notify>(() => {})

/** Всплывающие уведомления об успехе / ошибке действий. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ message: string; severity: Severity; key: number } | null>(null)
  const notify = useCallback<Notify>((message, severity = 'success') => {
    setState({ message, severity, key: Date.now() })
  }, [])
  return (
    <Ctx.Provider value={notify}>
      {children}
      <Snackbar
        key={state?.key}
        open={!!state}
        autoHideDuration={4000}
        onClose={() => setState(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={state?.severity ?? 'success'} variant="filled" onClose={() => setState(null)}>
          {state?.message}
        </Alert>
      </Snackbar>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSnackbar = () => useContext(Ctx)
