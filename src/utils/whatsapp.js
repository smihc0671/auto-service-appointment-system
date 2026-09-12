import { formatDateTR, phoneForWhatsApp } from './dateTime'

function safe(value, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function appointmentCode(appointment) {
  return String(appointment?.id || '').slice(0, 8).toUpperCase() || '-'
}

function vehicleLabel(appointment) {
  return appointment?.vehicle || [
    appointment?.vehicleBrand,
    appointment?.vehicleModel,
    appointment?.vehicleYear,
  ].filter(Boolean).join(' ') || '-'
}

function serviceLabel(appointment) {
  return appointment?.serviceName || appointment?.service || '-'
}

export function createWhatsAppUrl(phone, message) {
  const target = phoneForWhatsApp(phone)
  if (!target) return ''
  const text = String(message ?? '').trim()
  return text
    ? `https://wa.me/${target}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${target}`
}

export function customerToShopWhatsAppUrl(shopPhone, details) {
  if (!details) return createWhatsAppUrl(shopPhone, 'Merhaba, SAYGILI FORD ile iletişime geçmek istiyorum.')

  const message = [
    'Merhaba, SAYGILI FORD üzerinden randevu oluşturdum.',
    '',
    `Randevu No: ${safe(details.code)}`,
    `Tarih: ${details.date ? formatDateTR(details.date) : '-'}`,
    `Saat: ${safe(details.time)}`,
    `İşlem: ${safe(details.serviceName)}`,
    `Araç: ${safe(details.vehicle)}`,
    `Plaka: ${safe(details.plate)}`,
    '',
    'Randevumla ilgili iletişime geçmek istiyorum.',
  ].join('\n')

  return createWhatsAppUrl(shopPhone, message)
}

export function adminAppointmentWhatsAppUrl(appointment) {
  const message = [
    `Merhaba ${safe(appointment?.fullName, '')},`,
    'SAYGILI FORD servis randevunuz oluşturulmuştur.',
    '',
    `Tarih: ${appointment?.date ? formatDateTR(appointment.date) : '-'}`,
    `Saat: ${safe(appointment?.time)}`,
    `İşlem: ${serviceLabel(appointment)}`,
    `Araç: ${vehicleLabel(appointment)}`,
    `Plaka: ${safe(appointment?.plate)}`,
    `Randevu No: ${appointmentCode(appointment)}`,
    '',
    'Değişiklik veya iptal için bu WhatsApp hattından bize ulaşabilirsiniz.',
  ].join('\n')

  return createWhatsAppUrl(appointment?.phone, message)
}

export function adminReminderWhatsAppUrl(appointment) {
  const message = [
    `Merhaba ${safe(appointment?.fullName, '')},`,
    'SAYGILI FORD servis randevunuzu hatırlatmak isteriz.',
    '',
    `Tarih: ${appointment?.date ? formatDateTR(appointment.date) : '-'}`,
    `Saat: ${safe(appointment?.time)}`,
    `İşlem: ${serviceLabel(appointment)}`,
    `Araç: ${vehicleLabel(appointment)}`,
    `Plaka: ${safe(appointment?.plate)}`,
    `Randevu No: ${appointmentCode(appointment)}`,
    '',
    'Görüşmek üzere.',
  ].join('\n')

  return createWhatsAppUrl(appointment?.phone, message)
}

export function adminCancelledWhatsAppUrl(appointment) {
  const message = [
    `Merhaba ${safe(appointment?.fullName, '')},`,
    'SAYGILI FORD servis randevunuz iptal edilmiştir.',
    '',
    `Tarih: ${appointment?.date ? formatDateTR(appointment.date) : '-'}`,
    `Saat: ${safe(appointment?.time)}`,
    `İşlem: ${serviceLabel(appointment)}`,
    `Randevu No: ${appointmentCode(appointment)}`,
    '',
    'Yeni bir randevu oluşturmak veya bilgi almak için bizimle iletişime geçebilirsiniz.',
  ].join('\n')

  return createWhatsAppUrl(appointment?.phone, message)
}

export function adminCompletedWhatsAppUrl(appointment) {
  const message = [
    `Merhaba ${safe(appointment?.fullName, '')},`,
    'SAYGILI FORD servis kaydınızdaki işlem tamamlandı.',
    '',
    `Araç: ${vehicleLabel(appointment)}`,
    `Plaka: ${safe(appointment?.plate)}`,
    `İşlem: ${serviceLabel(appointment)}`,
    `Randevu No: ${appointmentCode(appointment)}`,
    '',
    'Detaylı bilgi için bizimle iletişime geçebilirsiniz.',
  ].join('\n')

  return createWhatsAppUrl(appointment?.phone, message)
}

export function adminStatusWhatsAppUrl(appointment) {
  const status = String(appointment?.status || '')
  if (status === 'cancelled') return adminCancelledWhatsAppUrl(appointment)
  if (status === 'completed') return adminCompletedWhatsAppUrl(appointment)
  return adminAppointmentWhatsAppUrl(appointment)
}

export function adminStatusWhatsAppLabel(appointment) {
  const status = String(appointment?.status || '')
  if (status === 'cancelled') return 'İptal Mesajı'
  if (status === 'completed') return 'Tamamlandı Mesajı'
  return 'Randevu Mesajı'
}
