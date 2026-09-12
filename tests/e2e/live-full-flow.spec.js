import { test, expect } from '@playwright/test'
import { e2eEnv } from './helpers/env.js'
import {
  adminCredentialsAvailable,
  cleanupE2EArtifacts,
  findCleanLiveSlot,
  liveModeEnabled,
  readAppointmentsByMarker,
} from './helpers/liveFirebase.mjs'

const LIVE = liveModeEnabled()
const ADMIN_EMAIL = e2eEnv('E2E_ADMIN_EMAIL')
const ADMIN_PASSWORD = e2eEnv('E2E_ADMIN_PASSWORD')

function marker(label = '') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return `E2E-${label}-${suffix}`
}

async function fillBooking(page, { testMarker, service, date, time, suffix = 'A' }) {
  const fullName = `E2E TEST ${testMarker} ${suffix}`

  await page.goto('/')
  await page.getByTestId('full-name').fill(fullName)
  await page.getByTestId('phone').fill('05551234567')
  await page.getByTestId('vehicle-brand').fill('Ford')
  await page.getByTestId('vehicle-model').fill('Focus 1.5 TDCi')
  await page.getByTestId('vehicle-year').fill('2020')
  await page.getByTestId('mileage').fill('125000')
  await page.getByTestId('plate').fill(`06 E2E ${suffix}`)
  await page.getByTestId('fuel-type').selectOption('diesel')
  await page.getByTestId('note').fill(`[E2E] ${testMarker} ${suffix}`)

  await page.getByTestId('service').selectOption(service.id)

  const bookingDate = page.getByTestId('booking-date')
  await expect(bookingDate).toBeVisible({ timeout: 25_000 })

  // Servis seçimi sonrası başlayan "ilk uygun günü bul" isteği ile
  // testin seçtiği tarih yarışmamalı. Tarihin gerçekten state'e yerleştiğini
  // doğrulamadan saat seçimine geçmiyoruz.
  await bookingDate.fill(date)
  await expect(bookingDate).toHaveValue(date, { timeout: 25_000 })

  const timeButton = page.getByTestId(`time-${time}`)
  await expect(timeButton).toBeVisible({ timeout: 25_000 })
  await timeButton.click()
  await expect(bookingDate).toHaveValue(date)

  return { fullName, timeButton }
}

async function submitBooking(page) {
  const submit = page.getByTestId('submit-booking')
  await expect(submit).toHaveText('Randevuyu Onayla')
  await submit.click()

  await expect(page.getByText(/Randevunuz hazır/i)).toBeVisible({
    timeout: 25_000,
  })
  await expect(page.getByText(/Ek bir onay beklemeniz gerekmez/i)).toBeVisible()

  const receipt = page.locator('.success-receipt, .success-card, .alert-success').first()
  return receipt
}

async function adminLogin(page) {
  await page.goto('/yonetim')

  if (await page.getByLabel('E-posta').count()) {
    await page.getByLabel('E-posta').fill(ADMIN_EMAIL)
    await page.getByLabel('Şifre').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Giriş Yap' }).click()
  }

  await expect(page.getByRole('button', { name: 'Randevular' })).toBeVisible({
    timeout: 25_000,
  })
}

async function openAdminDateAndSearch(page, date, testMarker) {
  await adminLogin(page)

  await page.getByRole('button', { name: 'Tarihe Git' }).click()
  const dateInput = page.locator('.date-nav-control input[type="date"]')
  await dateInput.fill(date)
  await page.getByPlaceholder('Müşteri, telefon, plaka, araç...').fill(testMarker)

  const card = page.locator('.appointment-item').filter({ hasText: testMarker }).first()
  await expect(card).toBeVisible({ timeout: 25_000 })
  return card
}

async function cancelCard(page, card) {
  page.once('dialog', (dialog) => dialog.accept())
  const status = card.locator('select')
  await status.selectOption('cancelled')
  await expect(page.getByRole('alert')).toContainText(/İptal Edildi/i, {
    timeout: 20_000,
  })
}


async function waitForRaceOutcome(page, timeoutMs = 30_000) {
  const success = page.getByText(/Randevunuz hazır/i)
  const blocked = page
    .getByRole('alert')
    .filter({ hasText: /başka bir randevu|başka bir saat|uygun değil|doldu/i })

  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await success.isVisible().catch(() => false)) {
      return { type: 'success', detail: 'Randevunuz hazır' }
    }

    if (await blocked.isVisible().catch(() => false)) {
      return {
        type: 'blocked',
        detail: (await blocked.first().textContent().catch(() => '')) || '',
      }
    }

    const alerts = await page.getByRole('alert').allTextContents().catch(() => [])
    const meaningfulAlert = alerts
      .map((item) => String(item || '').trim())
      .find(Boolean)

    if (meaningfulAlert) {
      return { type: 'error', detail: meaningfulAlert }
    }

    await page.waitForTimeout(100)
  }

  const submitText = await page
    .getByTestId('submit-booking')
    .textContent()
    .catch(() => '')

  return {
    type: 'timeout',
    detail: `30 sn içinde sonuç oluşmadı. Buton: ${submitText || '(bulunamadı)'}`,
  }
}

test.describe.serial('CANLI Firebase - gerçek uçtan uca akış', () => {
  test.beforeEach(() => {
    test.skip(!LIVE, 'E2E_LIVE=1 değil.')
    test.skip(!adminCredentialsAvailable(), 'Admin test hesabı tanımlı değil.')
  })

  test('müşteri → Firestore → admin → durum akışı → otomatik temizlik', async ({ page }) => {
    const runMarker = marker('FLOW')
    let slot

    try {
      slot = await findCleanLiveSlot()

      const booking = await fillBooking(page, {
        testMarker: runMarker,
        service: slot.service,
        date: slot.date,
        time: slot.time,
        suffix: 'FLOW',
      })

      await expect(page.getByTestId('phone')).toHaveValue('0555 123 45 67')
      await expect(page.getByTestId('plate')).toHaveValue('06 E2E FLOW')

      await submitBooking(page)

      const created = await readAppointmentsByMarker(runMarker)
      expect(created).toHaveLength(1)
      expect(created[0].status).toBe('confirmed')
      expect(created[0].date).toBe(slot.date)
      expect(created[0].time).toBe(slot.time)

      const card = await openAdminDateAndSearch(page, slot.date, runMarker)
      await expect(card).toContainText('Ford Focus 1.5 TDCi 2020')
      await expect(card).toContainText('125.000')
      await expect(card).toContainText(slot.service.name)

      const status = card.locator('select')

      await status.selectOption('arrived')
      await expect(page.getByRole('alert')).toContainText('Araç Geldi')
      await expect(status).toHaveValue('arrived')

      await status.selectOption('in_progress')
      await expect(page.getByRole('alert')).toContainText('İşlemde')
      await expect(status).toHaveValue('in_progress')

      await status.selectOption('completed')
      await expect(page.getByRole('alert')).toContainText('Tamamlandı')
      await expect(status).toHaveValue('completed')
    } finally {
      await cleanupE2EArtifacts({ marker: runMarker, verbose: true })
    }
  })

  test('tüm liftler dolunca saat kapanır; iptal edilince tekrar açılır', async ({ page }) => {
    const runMarker = marker('CAPACITY')

    try {
      const slot = await findCleanLiveSlot()
      const capacity = Math.max(1, Number(slot.settings.resourceCount) || 1)

      for (let index = 0; index < capacity; index += 1) {
        await fillBooking(page, {
          testMarker: runMarker,
          service: slot.service,
          date: slot.date,
          time: slot.time,
          suffix: `CAP${index + 1}`,
        })
        await submitBooking(page)
      }

      // Kapasite tamamen dolduğunda aynı saat artık yeni müşteriye görünmemeli.
      await page.goto('/')
      await page.getByTestId('service').selectOption(slot.service.id)
      await page.getByTestId('booking-date').fill(slot.date)
      await expect(page.getByTestId(`time-${slot.time}`)).toHaveCount(0, {
        timeout: 25_000,
      })

      // Admin bir tanesini iptal eder.
      const card = await openAdminDateAndSearch(page, slot.date, runMarker)
      await cancelCard(page, card)

      // İptal rezervasyonları serbest bıraktığı için saat tekrar görünmeli.
      await page.goto('/')
      await page.getByTestId('service').selectOption(slot.service.id)
      await page.getByTestId('booking-date').fill(slot.date)

      await expect(page.getByTestId(`time-${slot.time}`)).toBeVisible({
        timeout: 25_000,
      })
    } finally {
      await cleanupE2EArtifacts({ marker: runMarker, verbose: true })
    }
  })

  test('eşzamanlı yarışta kapasite aşılmaz', async ({ browser }) => {
    const runMarker = marker('RACE')
    const contexts = []

    try {
      const slot = await findCleanLiveSlot()
      const capacity = Math.max(1, Number(slot.settings.resourceCount) || 1)
      const contenderCount = capacity + 1
      const pages = []

      for (let index = 0; index < contenderCount; index += 1) {
        const context = await browser.newContext()
        contexts.push(context)

        const page = await context.newPage()
        pages.push(page)

        await fillBooking(page, {
          testMarker: runMarker,
          service: slot.service,
          date: slot.date,
          time: slot.time,
          suffix: `RACE${index + 1}`,
        })
      }

      // Hepsi slotu görmüşken aynı anda gönderiyoruz.
      await Promise.all(
        pages.map((page) => page.getByTestId('submit-booking').click()),
      )

      /*
        locator.isVisible({ timeout }) Playwright'te bekleyen bir assertion değildir;
        o anda görünürlüğü kontrol edip hemen döner. Önceki test bu nedenle
        Firestore transaction'ları sonuçlanmadan üç sayfayı da "unknown" sayıyor,
        ardından assertion fail olup context'leri kapatıyordu.

        Şimdi her tarayıcıyı aynı anda gerçek sonuca kadar bekliyoruz.
      */
      const outcomes = await Promise.all(
        pages.map((page) => waitForRaceOutcome(page)),
      )

      console.log(
        'RACE OUTCOMES:',
        outcomes.map((item, index) => ({
          contender: index + 1,
          ...item,
        })),
      )

      const successCount = outcomes.filter((item) => item.type === 'success').length
      const blockedCount = outcomes.filter((item) => item.type === 'blocked').length
      const unexpected = outcomes.filter(
        (item) => !['success', 'blocked'].includes(item.type),
      )

      expect(
        unexpected,
        `Beklenmeyen yarış sonuçları: ${JSON.stringify(unexpected)}`,
      ).toEqual([])

      expect(successCount).toBe(capacity)
      expect(blockedCount).toBe(contenderCount - capacity)

      const created = await readAppointmentsByMarker(runMarker)
      expect(created).toHaveLength(capacity)

      const resources = new Set(created.map((item) => Number(item.resourceNumber)))
      expect(resources.size).toBe(capacity)
    } finally {
      await Promise.all(contexts.map((context) => context.close().catch(() => {})))
      await cleanupE2EArtifacts({ marker: runMarker, verbose: true })
    }
  })

  test('admin Sil işlemi randevuyu ve slotlarını gerçekten kaldırır', async ({ page }) => {
    const runMarker = marker('DELETE')

    try {
      const slot = await findCleanLiveSlot()

      await fillBooking(page, {
        testMarker: runMarker,
        service: slot.service,
        date: slot.date,
        time: slot.time,
        suffix: 'DELETE',
      })
      await submitBooking(page)

      const card = await openAdminDateAndSearch(page, slot.date, runMarker)

      page.once('dialog', (dialog) => dialog.accept())
      await card.getByRole('button', { name: 'Sil' }).click()

      await expect(page.getByRole('alert')).toContainText(
        /Randevu ve ayırdığı süreler silindi/i,
        { timeout: 20_000 },
      )

      expect(await readAppointmentsByMarker(runMarker)).toHaveLength(0)

      // Silme sonrası aynı saat tekrar seçilebilir olmalı.
      await page.goto('/')
      await page.getByTestId('service').selectOption(slot.service.id)
      await page.getByTestId('booking-date').fill(slot.date)
      await expect(page.getByTestId(`time-${slot.time}`)).toBeVisible({
        timeout: 25_000,
      })
    } finally {
      await cleanupE2EArtifacts({ marker: runMarker, verbose: true })
    }
  })
})
