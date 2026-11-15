import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Переговорные и коворкинги')).toBeVisible()
}

/** Открывает зал на неделю вперёд и выбирает первые два свободных слота подряд. */
async function pickFreeSlots(page: Page, roomName: string) {
  await page.getByText(roomName).first().click()
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Следующий день' }).click()
  const free = page.getByRole('button', { name: /— Свободно$/ })
  await expect(free.first()).toBeVisible()
  const first = await free.nth(0).getAttribute('aria-label')
  await free.nth(0).click()
  await page
    .getByRole('button', { name: /— Свободно$/ })
    .nth(0)
    .click()
  return first!.slice(0, 5)
}

test('сотрудник бронирует зал, и бронь появляется в «Мои брони»', async ({ page }) => {
  const title = `E2E встреча ${Date.now()}`
  await login(page, 'employee@meetspace.ru', 'Employee123')
  const start = await pickFreeSlots(page, 'Переговорная «Альфа»')
  await expect(page.getByText(new RegExp(`Выбрано: ${start}`))).toBeVisible()
  await page.getByLabel('Тема встречи').fill(title)
  await page.getByRole('button', { name: 'Забронировать' }).click()
  await expect(page.getByText('Зал забронирован!')).toBeVisible()

  await page.getByRole('link', { name: 'Мои брони' }).click()
  const row = page.getByRole('row', { name: new RegExp(title) })
  await expect(row.getByText('Подтверждена')).toBeVisible()

  // отмена с подтверждением
  await row.getByRole('button', { name: 'Отменить' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Да' }).click()
  await expect(row.getByText('Отменена')).toBeVisible()
})

test('заявку гостя подтверждает администратор', async ({ page }) => {
  const title = `E2E заявка ${Date.now()}`
  await login(page, 'guest@meetspace.ru', 'Guest12345')
  await pickFreeSlots(page, 'Лофт')
  await page.getByLabel('Тема встречи').fill(title)
  await page.getByRole('button', { name: 'Забронировать' }).click()
  await expect(page.getByText(/Заявка отправлена/)).toBeVisible()

  await page.getByRole('button', { name: 'Меню профиля' }).click()
  await page.getByRole('menuitem', { name: 'Выйти' }).click()

  await login(page, 'admin@meetspace.ru', 'Admin12345')
  await page.getByRole('link', { name: 'Заявки' }).click()
  const row = page.getByRole('row', { name: new RegExp(title) })
  await row.getByRole('button', { name: 'Подтвердить' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Да' }).click()
  await expect(page.getByText(/Статус брони .* подтверждена/)).toBeVisible()
})
