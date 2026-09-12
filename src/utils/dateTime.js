import { DEFAULT_SHOP_SETTINGS } from '../config/shopConfig.js'

export function toDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateFromInput(dateString) {
  return new Date(`${dateString}T12:00:00`)
}

export function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function isWorkingDay(dateString, settings = DEFAULT_SHOP_SETTINGS) {
  if (!dateString) return false
  const day = dateFromInput(dateString).getDay()
  return (settings.workingDays || []).includes(day)
}

export function timeToMinutes(time) {
  const [hours, minutes] = String(time).split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function roundDurationToSlot(durationMinutes, slotMinutes) {
  const safeSlot = Math.max(1, Number(slotMinutes) || 30)
  const safeDuration = Math.max(safeSlot, Number(durationMinutes) || safeSlot)
  return Math.ceil(safeDuration / safeSlot) * safeSlot
}

export function buildOccupiedTimes(startTime, durationMinutes, slotMinutes) {
  const safeSlot = Math.max(1, Number(slotMinutes) || 30)
  const roundedDuration = roundDurationToSlot(durationMinutes, safeSlot)
  const count = roundedDuration / safeSlot
  const start = timeToMinutes(startTime)
  return Array.from({ length: count }, (_, index) => minutesToTime(start + index * safeSlot))
}

export function getEndTime(startTime, durationMinutes, slotMinutes) {
  const roundedDuration = roundDurationToSlot(durationMinutes, slotMinutes)
  return minutesToTime(timeToMinutes(startTime) + roundedDuration)
}

export function generateStartTimes(
  dateString,
  settings = DEFAULT_SHOP_SETTINGS,
  durationMinutes = settings.slotMinutes,
) {
  if (!dateString || !isWorkingDay(dateString, settings)) return []

  const today = toDateInputValue(new Date())
  if (dateString < today) return []

  const start = timeToMinutes(settings.workingHours.start)
  const end = timeToMinutes(settings.workingHours.end)
  const step = Math.max(1, Number(settings.slotMinutes) || 30)
  const roundedDuration = roundDurationToSlot(durationMinutes, step)

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return []
  if (roundedDuration > end - start) return []

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const slots = []

  for (let current = start; current + roundedDuration <= end; current += step) {
    // Aynı gün geçmiş veya başlamış saatleri müşteriye göstermiyoruz.
    if (dateString === today && current <= nowMinutes) continue
    slots.push(minutesToTime(current))
  }

  return slots
}

export function formatDateTR(dateString) {
  if (!dateString) return '-'
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(dateFromInput(dateString))
}

export function formatShortDateTR(dateString) {
  if (!dateString) return '-'
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
  }).format(dateFromInput(dateString))
}

export function getDateBounds(settings = DEFAULT_SHOP_SETTINGS) {
  const today = new Date()
  const maxAdvanceDays = settings.maxAdvanceDays ?? DEFAULT_SHOP_SETTINGS.maxAdvanceDays
  return {
    min: toDateInputValue(today),
    max: toDateInputValue(addDays(today, maxAdvanceDays)),
  }
}

export function normalizePlainText(value, maxLength = 100) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
}

export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 11)
  if (!digits) return ''

  const groups = []
  if (digits.length <= 4) return digits
  groups.push(digits.slice(0, 4))
  if (digits.length <= 7) return `${groups[0]} ${digits.slice(4)}`
  groups.push(digits.slice(4, 7))
  if (digits.length <= 9) return `${groups[0]} ${groups[1]} ${digits.slice(7)}`
  groups.push(digits.slice(7, 9))
  return `${groups[0]} ${groups[1]} ${groups[2]} ${digits.slice(9, 11)}`
}

export function phoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 15)
}

export function phoneForWhatsApp(value) {
  const digits = phoneDigits(value)
  if (!digits) return ''
  if (digits.startsWith('90')) return digits
  if (digits.startsWith('0')) return `90${digits.slice(1)}`
  if (digits.length === 10) return `90${digits}`
  return digits
}

export function normalizePlate(value) {
  const compact = String(value ?? '')
    .toLocaleUpperCase('tr-TR')
    .replace(/[Ç]/g, 'C')
    .replace(/[Ğ]/g, 'G')
    .replace(/[İI]/g, 'I')
    .replace(/[Ö]/g, 'O')
    .replace(/[Ş]/g, 'S')
    .replace(/[Ü]/g, 'U')
    .replace(/[^A-Z0-9]/g, '')

  if (!compact) return ''

  let cursor = 0
  let city = ''

  // Plaka mutlaka iki rakamlı il koduyla başlar.
  while (cursor < compact.length && city.length < 2 && /\d/.test(compact[cursor])) {
    city += compact[cursor]
    cursor += 1
  }

  if (!city) return ''
  if (city.length < 2) return city

  let letters = ''

  // İl kodundan sonra 1-3 harf.
  while (cursor < compact.length && letters.length < 3 && /[A-Z]/.test(compact[cursor])) {
    letters += compact[cursor]
    cursor += 1
  }

  if (!letters) return city

  let numbers = ''

  // Harflerden sonra 1-4 rakamı canlı biçimlendirme için göster.
  while (cursor < compact.length && numbers.length < 4 && /\d/.test(compact[cursor])) {
    numbers += compact[cursor]
    cursor += 1
  }

  return [city, letters, numbers].filter(Boolean).join(' ')
}

export function isValidPlate(value) {
  const normalized = normalizePlate(value)
  const match = normalized.match(/^(\d{2}) ([A-Z]{1,3}) (\d{2,4})$/)
  if (!match) return false

  const cityCode = Number(match[1])
  return cityCode >= 1 && cityCode <= 81
}

export function normalizeVehicleYear(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 4)
}

export function normalizeMileage(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 6)
  return digits
}

export function createReservationId(date, resourceNumber, time) {
  return `${date}_r${resourceNumber}_${time.replace(':', '-')}`
}

// v1'de kullanılan tek-slot kaydının ID biçimi.
export function createLegacySlotId(date, time) {
  return `${date}_${time.replace(':', '-')}`
}

export function compareAppointmentDateTime(a, b) {
  return `${a.date || ''}_${a.time || ''}`.localeCompare(`${b.date || ''}_${b.time || ''}`, 'tr')
}
