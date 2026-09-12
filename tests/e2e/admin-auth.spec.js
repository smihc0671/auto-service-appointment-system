import { test, expect } from '@playwright/test'
import { e2eEnv } from './helpers/env.js'

test('yanlış yönetici bilgileri reddedilir', async ({ page }) => {
  await page.goto('/yonetim')
  await page.getByLabel('E-posta').fill('yanlis@example.com')
  await page.getByLabel('Şifre').fill('yanlis-sifre-123')
  await page.getByRole('button', { name: 'Giriş Yap' }).click()

  await expect(page.getByRole('alert')).toContainText(
    /E-posta veya şifre hatalı|Giriş sırasında/i,
  )
})

test('tanımlı admin yönetim paneline girebilir', async ({ page }) => {
  const email = e2eEnv('E2E_ADMIN_EMAIL')
  const password = e2eEnv('E2E_ADMIN_PASSWORD')

  test.skip(!email || !password, 'Admin test hesabı tanımlı değil.')

  await page.goto('/yonetim')
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Şifre').fill(password)
  await page.getByRole('button', { name: 'Giriş Yap' }).click()

  await expect(page.getByRole('button', { name: 'Randevular' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(/Bugünün Özeti/i)).toBeVisible()
})
