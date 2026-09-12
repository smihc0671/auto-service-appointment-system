import { test, expect } from '@playwright/test'

async function fillBaseCustomerForm(page) {
  await page.getByLabel('Ad Soyad *').fill('Otomatik Test Müşterisi')
  await page.getByLabel('Telefon *').fill('05551234567')
  await page.getByLabel('Araç Markası *').fill('Ford')
  await page.getByLabel('Araç Modeli *').fill('Focus')
  await page.getByLabel('Plaka *').fill('06 TEST 06')
  await page.getByLabel('Yakıt Türü *').selectOption('diesel')

  const serviceSelect = page.getByLabel('Yapılacak İşlem *')
  await expect(serviceSelect).toBeEnabled()
  await serviceSelect.selectOption({ index: 1 })

  const firstTime = page.locator('.time-button').first()
  await expect(firstTime).toBeVisible({ timeout: 20_000 })
  await firstTime.click()
}

test('müşteri formu zorunlu model yılı ve kilometreyi doğrular', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /SAYGILI FORD/i })).toBeVisible()

  await fillBaseCustomerForm(page)

  const submit = page.getByRole('button', { name: 'Randevuyu Onayla' })
  await expect(submit).toBeEnabled()

  // Model yılı boşken gerçek kayıt oluşturulmadan validasyon devreye girmeli.
  await submit.click()
  await expect(page.getByRole('alert')).toContainText('Model yılı zorunludur')

  await page.getByLabel('Model Yılı *').fill('2020')
  await submit.click()
  await expect(page.getByRole('alert')).toContainText('Kilometre bilgisini giriniz')

  await page.getByLabel('Kilometre *').fill('125000')
  await expect(page.getByText('125.000 km')).toBeVisible()

  // Bu smoke testi gerçek randevu oluşturmadan burada biter.
  // Submit butonunun masaüstünde gereksiz tam genişlikte olmadığını da kontrol eder.
  const box = await submit.boundingBox()
  expect(box).not.toBeNull()
  expect(box.width).toBeLessThanOrEqual(370)
})

test('müşteri ekranı mobil genişlikte yatay taşma yapmaz', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /SAYGILI FORD/i })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(2)
})
