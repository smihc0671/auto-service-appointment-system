import { test, expect } from '@playwright/test'
import {
  normalizeMileage,
  normalizePhone,
  normalizePlate,
  normalizePlainText,
  normalizeVehicleYear,
  phoneForWhatsApp,
  roundDurationToSlot,
} from '../../src/utils/dateTime.js'

test.describe('Metin ve veri normalizasyonu', () => {
  test('telefon biçimlendirme', () => {
    expect(normalizePhone('05551234567')).toBe('0555 123 45 67')
  })

  test('WhatsApp Türkiye ülke kodu', () => {
    expect(phoneForWhatsApp('0555 123 45 67')).toBe('905551234567')
    expect(phoneForWhatsApp('5551234567')).toBe('905551234567')
    expect(phoneForWhatsApp('905551234567')).toBe('905551234567')
  })

  test('Türkçe plaka büyük harf ve karakter temizliği', () => {
    expect(normalizePlate('06 abc-123!')).toBe('06 ABC123')
    expect(normalizePlate('34 şğü 12')).toBe('34 ŞĞÜ 12')
  })

  test('model yılı rakam dışını temizler', () => {
    expect(normalizeVehicleYear('20x26')).toBe('2026')
  })

  test('kilometre 6 hane ile sınırlıdır', () => {
    expect(normalizeMileage('1.234.567')).toBe('123456')
  })

  test('kontrol karakterleri temizlenir', () => {
    expect(normalizePlainText('Ali\u0000  Veli', 20)).toBe('Ali Veli')
  })

  test('süre slot katına yukarı yuvarlanır', () => {
    expect(roundDurationToSlot(31, 30)).toBe(60)
    expect(roundDurationToSlot(89, 30)).toBe(90)
  })
})
