import { z } from 'zod'

// Правила совпадают с серверными (backend/app/schemas)
export const passwordSchema = z
  .string()
  .min(8, 'Минимум 8 символов')
  .max(72, 'Максимум 72 символа')
  .regex(/[A-Za-zА-Яа-яЁё]/, 'Нужна хотя бы одна буква')
  .regex(/\d/, 'Нужна хотя бы одна цифра')

export const emailSchema = z.string().trim().email('Некорректный email')

export const MAX_UPLOAD_MB = 5
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Проверка файла на клиенте (на сервере — такая же, плюс проверка содержимого). */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Можно загрузить только JPG, PNG или WEBP'
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `Файл больше ${MAX_UPLOAD_MB} МБ`
  return null
}
