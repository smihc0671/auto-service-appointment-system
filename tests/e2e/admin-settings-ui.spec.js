import { test, expect } from '@playwright/test'
import { e2eEnv } from './helpers/env.js'

async function login(page) {
  const email = e2eEnv('E2E_ADMIN_EMAIL')
  const password = e2eEnv('E2E_ADMIN_PASSWORD')

  test.skip(!email || !password, 'Admin test hesabı tanımlı değil.')

  await page.goto('/yonetim')
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Şifre').fill(password)
  await page.getByRole('button', { name: 'Giriş Yap' }).click()

  await expect(page.getByRole('button', { name: 'Ayarlar & Fiyatlar' })).toBeVisible({
    timeout: 20_000,
  })
}

test('admin hizmet yönetiminde toplu görünürlük ve tek genel kaydetme vardır', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Ayarlar & Fiyatlar' }).click()

  await expect(page.getByRole('button', { name: 'Tüm İşlemleri Göster' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tüm İşlemleri Gizle' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Tüm Hizmet Değişikliklerini Kaydet' }),
  ).toBeVisible()

  // Her hizmet için ayrı ayrı "Kaydet" butonu olmamalı.
  const serviceAdminList = page.locator('.service-admin-list')
  if (await serviceAdminList.count()) {
    await expect(
      serviceAdminList.getByRole('button', { name: /^Kaydet$/ }),
    ).toHaveCount(0)
  }
})

test('admin süre yönetimi saat + ek dakika şeklindedir', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Ayarlar & Fiyatlar' }).click()

  await expect(page.getByText('Tahmini süre').first()).toBeVisible()
  await expect(page.getByText('Saat', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Ek dakika', { exact: true }).first()).toBeVisible()
})

test('fiyatlandırma ayrı genel kaydetme butonuna sahiptir', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Ayarlar & Fiyatlar' }).click()
  await expect(page.getByRole('button', { name: 'Fiyat Ayarlarını Kaydet' })).toBeVisible()
})
