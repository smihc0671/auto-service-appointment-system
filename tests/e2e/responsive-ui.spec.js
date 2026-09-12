import { test, expect } from '@playwright/test'

const viewports = [
  { name: 'iPhone küçük', width: 375, height: 667 },
  { name: 'iPhone modern', width: 390, height: 844 },
  { name: 'Android', width: 412, height: 915 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Laptop', width: 1366, height: 768 },
  { name: 'Desktop', width: 1920, height: 1080 },
]

for (const viewport of viewports) {
  test(`${viewport.name}: yatay taşma yok (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/')

    await expect(page.getByText(/Servis randevusu oluşturun/i)).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(2)
  })
}

test('mobil hero ekranı tamamen yutmuyor ve form erişilebilir', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const hero = page.locator('.street-hero')
  await expect(hero).toBeVisible()

  const heroBox = await hero.boundingBox()
  expect(heroBox).not.toBeNull()
  expect(heroBox.height).toBeLessThanOrEqual(520)

  await page.getByText(/Servis randevusu oluşturun/i).scrollIntoViewIfNeeded()
  await expect(page.getByTestId('full-name')).toBeVisible()
})

test('hero Street View görseli yüklenmiş olmalı', async ({ page }) => {
  await page.goto('/')
  const image = page.locator('.street-hero-media img')
  await expect(image).toBeVisible()

  const result = await image.evaluate((element) => ({
    complete: element.complete,
    naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight,
  }))

  expect(result.complete).toBe(true)
  expect(result.naturalWidth).toBeGreaterThan(500)
  expect(result.naturalHeight).toBeGreaterThan(300)
})

test('yol tarifi butonu varsa Google Maps hedefi kullanır', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: 'Yol Tarifi Al' }).first()

  if (await link.count()) {
    const href = await link.getAttribute('href')
    expect(href).toContain('google.com/maps')
    expect(href).toContain('destination=')
  }
})
