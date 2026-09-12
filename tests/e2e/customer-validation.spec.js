import { test, expect } from '@playwright/test'

async function chooseFirstService(page) {
  const select = page.getByTestId('service')
  await expect(select).toBeEnabled()

  const options = await select.locator('option').evaluateAll((items) =>
    items.map((item) => ({
      value: item.value,
      text: item.textContent || '',
    })),
  )

  const first = options.find((item) => item.value)
  expect(first).toBeTruthy()
  await select.selectOption(first.value)
}

async function prepareUntilTime(page) {
  await page.getByTestId('full-name').fill('Otomatik Test')
  await page.getByTestId('phone').fill('05551234567')
  await expect(page.getByTestId('vehicle-brand')).toHaveValue('Ford')
  await page.getByTestId('vehicle-model').selectOption({ label: 'Focus' })
  await page.getByTestId('vehicle-year').fill('2020')
  await page.getByTestId('mileage').fill('125000')
  await page.getByTestId('plate').fill('06 TST 06')
  await page.getByTestId('fuel-type').selectOption('diesel')
  await chooseFirstService(page)

  const firstTime = page.locator('.time-button').first()
  await expect(firstTime).toBeVisible({ timeout: 25_000 })
  await firstTime.click()
}

test.describe('Müşteri formu - doğrulama ve normalizasyon', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/Servis randevusu oluşturun/i)).toBeVisible()
  })

  test('telefon 0555 123 45 67 biçimine normalize edilir', async ({ page }) => {
    await page.getByTestId('phone').fill('05551234567')
    await expect(page.getByTestId('phone')).toHaveValue('0555 123 45 67')
  })

  test('plaka otomatik büyük harfe çevrilir, temizlenir ve boşluklandırılır', async ({ page }) => {
    await page.getByTestId('plate').fill('06 abc-123!')
    await expect(page.getByTestId('plate')).toHaveValue('06 ABC 123')
  })

  test('plaka alanı gereğinden uzun karakter grubunu kabul etmez', async ({ page }) => {
    await page.getByTestId('plate').fill('074JDIASJDIOAKSJOKDŞ123456789')
    const plate = await page.getByTestId('plate').inputValue()
    expect(plate.length).toBeLessThanOrEqual(11)
    expect(plate).toMatch(/^\d{2}( [A-Z]{1,3})?( \d{1,4})?$/)
  })

  test('model yılı yapıştırmada harfleri temizler ve ilk 4 rakamı korur', async ({ page }) => {
    await page.getByTestId('vehicle-year').fill('20a26xyz')
    await expect(page.getByTestId('vehicle-year')).toHaveValue('2026')
  })

  test('kilometre yalnızca rakam ve en fazla 6 hane kabul eder', async ({ page }) => {
    await page.getByTestId('mileage').fill('123456789abc')
    await expect(page.getByTestId('mileage')).toHaveValue('123456')
  })

  test('açıklama 500 karakteri geçmez', async ({ page }) => {
    await page.getByTestId('note').fill('x'.repeat(700))
    await expect(page.getByTestId('note')).toHaveValue('x'.repeat(500))
    await expect(page.getByText('500/500')).toBeVisible()
  })

  test('model yılı boşsa randevu gönderilmez', async ({ page }) => {
    await prepareUntilTime(page)
    await page.getByTestId('vehicle-year').fill('')
    await page.getByTestId('submit-booking').click()
    await expect(page.getByRole('alert')).toContainText('Model yılı zorunludur')
  })

  test('1950 öncesi model yılı reddedilir', async ({ page }) => {
    await prepareUntilTime(page)
    await page.getByTestId('vehicle-year').fill('1949')
    await page.getByTestId('submit-booking').click()
    await expect(page.getByRole('alert')).toContainText(/1950 ile/)
  })

  test('kilometre boşsa randevu gönderilmez', async ({ page }) => {
    await prepareUntilTime(page)
    await page.getByTestId('mileage').fill('')
    await page.getByTestId('submit-booking').click()
    await expect(page.getByRole('alert')).toContainText('Kilometre bilgisini giriniz')
  })

  test('yakıt seçilmeden randevu gönderilmez', async ({ page }) => {
    await prepareUntilTime(page)
    await page.getByTestId('fuel-type').selectOption('')
    await page.getByTestId('submit-booking').click()
    await expect(page.getByRole('alert')).toContainText('Yakıt türünü seçiniz')
  })

  test('randevu butonunda doğru metin kullanılır', async ({ page }) => {
    await prepareUntilTime(page)
    await expect(page.getByTestId('submit-booking')).toHaveText('Randevuyu Onayla')
  })

  test('marka Ford olarak sabittir ve müşteri başka marka yazamaz', async ({ page }) => {
    const brand = page.getByTestId('vehicle-brand')
    await expect(brand).toHaveValue('Ford')
    await expect(brand).toHaveAttribute('readonly', '')
  })

  test('müşteri model alanında yalnız izin verilen Ford modellerini görebilir', async ({ page }) => {
    const allowedModels = [
      'Focus', 'Fiesta', 'Mondeo', 'Fusion', 'B-Max', 'C-Max', 'EcoSport', 'Kuga', 'Puma',
      'Ranger', 'Tourneo Courier', 'Transit Courier', 'Tourneo Connect', 'Transit Connect',
      'Tourneo Custom', 'Transit Custom', 'Transit (Genel)', 'Escort',
    ]
    await expect(page.getByTestId('vehicle-model').locator('option')).toHaveCount(19)
    const labels = await page.getByTestId('vehicle-model').locator('option').evaluateAll((items) =>
      items.map((item) => (item.textContent || '').trim()).filter((item) => item && item !== 'Ford modelini seçiniz'),
    )
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.every((label) => allowedModels.includes(label))).toBe(true)
    expect(labels).not.toContain('Diğer Marka')
    expect(labels).not.toContain('Diğer Ford / Listede Yok')
  })

  test('marka ve model kutuları aynı yüksekliktedir', async ({ page }) => {
    const brand = page.getByTestId('vehicle-brand')
    const model = page.getByTestId('vehicle-model')
    const [brandBox, modelBox] = await Promise.all([
      brand.boundingBox(),
      model.boundingBox(),
    ])

    expect(brandBox).not.toBeNull()
    expect(modelBox).not.toBeNull()
    expect(Math.abs(brandBox.height - modelBox.height)).toBeLessThanOrEqual(2)
  })
})
