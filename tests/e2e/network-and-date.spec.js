import { test, expect } from '@playwright/test'

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function waitForFirstService(page) {
  const service = page.getByTestId('service')
  await expect(service).toBeVisible({ timeout: 25_000 })

  await expect.poll(
    async () => {
      const options = await service.locator('option').evaluateAll((items) =>
        items.map((item) => item.value).filter(Boolean),
      )
      return options.length
    },
    {
      timeout: 25_000,
      message: 'Aktif hizmetler Firebase’den yüklenemedi.',
    },
  ).toBeGreaterThan(0)

  const options = await service.locator('option').evaluateAll((items) =>
    items
      .map((item) => ({ value: item.value, text: item.textContent || '' }))
      .filter((item) => item.value),
  )

  return { service, first: options[0] }
}

test('offline durumda uyarı görünür ve kayıt butonu devre dışı kalır', async ({ page, context }) => {
  await page.goto('/')

  // Bootstrap tamamlanmadan interneti kesersek form hiç render olmayabilir.
  // Önce formun gerçekten hazır olduğunu doğruluyoruz.
  await waitForFirstService(page)
  await expect(page.getByTestId('submit-booking')).toBeVisible()

  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))

  await expect(page.getByText('İnternet bağlantısı yok')).toBeVisible()
  await expect(page.getByTestId('submit-booking')).toBeDisabled()

  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText('İnternet bağlantısı yok')).toHaveCount(0)
})

test('tarih inputu geçmiş günü seçmeye izin vermeyecek min değerine sahiptir', async ({ page }) => {
  await page.goto('/')

  const { service, first } = await waitForFirstService(page)
  await service.selectOption(first.value)

  const date = page.getByTestId('booking-date')
  await expect(date).toBeVisible({ timeout: 25_000 })

  const min = await date.getAttribute('min')
  expect(min).toBe(toDateInput(new Date()))
})

test('çalışma dışı gün varsa kullanıcı açık kapalı mesajını görür', async ({ page }) => {
  await page.goto('/')

  const { service, first } = await waitForFirstService(page)
  await service.selectOption(first.value)

  const dateInput = page.getByTestId('booking-date')
  await expect(dateInput).toBeVisible({ timeout: 25_000 })

  const min = await dateInput.getAttribute('min')
  const max = await dateInput.getAttribute('max')
  expect(min).toBeTruthy()
  expect(max).toBeTruthy()

  const cursor = new Date(`${min}T12:00:00`)
  const maxDate = new Date(`${max}T12:00:00`)
  let foundClosedDay = false

  // Firestore çalışma günleri admin tarafından değiştirilebilir.
  // Bu yüzden "Pazar kesin kapalıdır" varsayımı yapmıyoruz.
  while (cursor <= maxDate && !foundClosedDay) {
    const candidate = toDateInput(cursor)
    await dateInput.fill(candidate)

    foundClosedDay = await page
      .getByText(/Seçtiğiniz gün servis kapalı/i)
      .isVisible()
      .catch(() => false)

    cursor.setDate(cursor.getDate() + 1)
  }

  test.skip(!foundClosedDay, 'Seçilebilir tarih aralığında kapalı gün tanımlı değil.')
  await expect(page.getByText(/Seçtiğiniz gün servis kapalı/i)).toBeVisible()
})
