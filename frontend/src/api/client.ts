import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiErrorBody } from './types'

// Адрес API: в Docker фронт и бэк за одним Nginx, поэтому по умолчанию относительный путь
const baseURL = import.meta.env.VITE_API_URL ?? '/api'

export const api = axios.create({ baseURL })

// --- хранение токенов ---
const REFRESH_KEY = 'meetspace.refresh'
let accessToken: string | null = null

export const tokens = {
  get access() {
    return accessToken
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh: string) {
    accessToken = access
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    accessToken = null
    localStorage.removeItem(REFRESH_KEY)
  },
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// --- автообновление access-токена по refresh-токену при ответе 401 ---
let refreshing: Promise<boolean> | null = null
let onLogout: () => void = () => {}
export const setLogoutHandler = (fn: () => void) => {
  onLogout = fn
}

async function doRefresh(): Promise<boolean> {
  const refresh = tokens.refresh
  if (!refresh) return false
  try {
    const { data } = await axios.post(`${baseURL}/auth/refresh`, { refresh_token: refresh })
    tokens.set(data.access_token, data.refresh_token)
    return true
  } catch {
    tokens.clear()
    return false
  }
}

/** Обновить токены. Параллельные вызовы ждут один и тот же запрос:
 *  refresh-токен одноразовый, второй запрос с ним получил бы 401. */
export function refreshTokens(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => (refreshing = null))
  return refreshing
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (error.response?.status === 401 && original && !original._retry && tokens.refresh) {
      original._retry = true
      if (await refreshTokens()) return api(original)
      onLogout()
    }
    return Promise.reject(error)
  },
)

/** Текст ошибки для пользователя из единого формата ошибок API. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined
    if (body?.error) {
      const fields = body.error.details?.map((d) => d.message).join('; ')
      return fields ? `${body.error.message}: ${fields}` : body.error.message
    }
    if (!err.response) return 'Сервер недоступен. Проверьте подключение'
  }
  return 'Что-то пошло не так. Попробуйте ещё раз'
}
