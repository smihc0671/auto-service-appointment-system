import { test, expect } from '@playwright/test'
import { calculateAvailableStartTimes } from '../../src/utils/scheduling.js'

const settings = {
  workingDays: [1, 2, 3, 4, 5, 6],
  workingHours: { start: '08:30', end: '18:00' },
  slotMinutes: 5,
  resourceCount: 2,
  resourceLabel: 'Lift',
}

const date = '2030-08-17'

function reservation(resourceNumber, time, unitMinutes = 5) {
  return { date, resourceNumber, time, unitMinutes }
}

function reserveRange(resourceNumber, start, durationMinutes, unitMinutes = 5) {
  const [h, m] = start.split(':').map(Number)
  const startMin = h * 60 + m
  return Array.from({ length: durationMinutes / unitMinutes }, (_, index) => {
    const total = startMin + index * unitMinutes
    return reservation(resourceNumber, `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`, unitMinutes)
  })
}

test('30 dakikalık sabit slot yerine 5 dakikalık iç planlama ile 08:45 gibi saat önerilebilir', async () => {
  const reservations = reserveRange(1, '08:30', 15)
  const result = calculateAvailableStartTimes(date, 75, settings, reservations, {
    allServiceDurations: [60, 75, 90, 120, 180],
  })
  expect(result.some((slot) => slot.time === '08:45')).toBe(true)
})

test('iki liftte çakışan işin üstüne üçüncü randevu önerilmez', async () => {
  const reservations = [
    ...reserveRange(1, '08:30', 90),
    ...reserveRange(2, '08:30', 90),
  ]
  const result = calculateAvailableStartTimes(date, 60, settings, reservations, {
    allServiceDurations: [60, 75, 90],
  })
  expect(result.some((slot) => slot.time === '08:30')).toBe(false)
  expect(result.some((slot) => slot.time === '10:00')).toBe(true)
})

test('eski 30 dakikalık rezervasyonlar yeni 5 dakikalık önerilerde tam 30 dakika dolu sayılır', async () => {
  const reservations = [reservation(1, '08:30', 30), reservation(2, '08:30', 30)]
  const result = calculateAvailableStartTimes(date, 60, settings, reservations, {
    allServiceDurations: [60, 90],
  })
  expect(result.some((slot) => slot.time === '08:35')).toBe(false)
  expect(result.some((slot) => slot.time === '09:00')).toBe(true)
})

test('öneri listesi az sayıda ve ilk kayıt recommended olarak işaretlenir', async () => {
  const result = calculateAvailableStartTimes(date, 90, settings, [], {
    allServiceDurations: [60, 75, 90, 120, 180],
  })
  expect(result.length).toBeGreaterThan(0)
  expect(result.length).toBeLessThanOrEqual(6)
  expect(result[0].recommended).toBe(true)
  expect(result.slice(1).every((slot) => !slot.recommended)).toBe(true)
})


test('sistem küçük ölü boşluk yerine başka tam iş sığdıran başlangıcı öne çıkarır', async () => {
  const reservations = [
    ...reserveRange(1, '13:00', 60),
    ...reserveRange(2, '08:30', 270),
  ]
  const result = calculateAvailableStartTimes(date, 120, settings, reservations, {
    allServiceDurations: [60, 90, 120, 180],
  })

  expect(result.length).toBeGreaterThan(0)
  expect(result[0].time).toBe('08:30')
  expect(result[0].recommended).toBe(true)
})

import {
  FORD_MODEL_CATALOG,
  normalizeServicePlanning,
  resolveVehicleModelId,
} from '../../src/config/servicePlanning.js'

test('müşteri kataloğu yalnız belirlenen 18 Ford modelini içerir', async () => {
  expect(FORD_MODEL_CATALOG.map((model) => model.name)).toEqual([
    'Focus',
    'Fiesta',
    'Mondeo',
    'Fusion',
    'B-Max',
    'C-Max',
    'EcoSport',
    'Kuga',
    'Puma',
    'Ranger',
    'Tourneo Courier',
    'Transit Courier',
    'Tourneo Connect',
    'Transit Connect',
    'Tourneo Custom',
    'Transit Custom',
    'Transit (Genel)',
    'Escort',
  ])
})

test('Ford dışı marka veya katalog dışı model planlama eşleşmesi alamaz', async () => {
  const planning = normalizeServicePlanning()
  expect(resolveVehicleModelId('Ford', 'Focus', planning)).toBe('focus')
  expect(resolveVehicleModelId('Ford', 'Transit Connect', planning)).toBe('transit-connect')
  expect(resolveVehicleModelId('Volkswagen', 'Focus', planning)).toBe('')
  expect(resolveVehicleModelId('Ford', 'Mustang', planning)).toBe('')
})
