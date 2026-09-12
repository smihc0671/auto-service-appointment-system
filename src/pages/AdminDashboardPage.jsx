import { useCallback, useEffect, useMemo, useState } from 'react'
import { signOut } from 'firebase/auth'
import BrandHeader from '../components/BrandHeader'
import StatusBadge, { normalizedAppointmentStatus } from '../components/StatusBadge'
import { APPOINTMENT_STATUSES, FUEL_TYPES } from '../config/shopConfig'
import {
  MODEL_GROUP_ORDER,
  SERVICE_DEFINITIONS,
  planningModelGroups,
  normalizePlanningDuration,
} from '../config/servicePlanning'
import { auth } from '../firebase'
import {
  changeAppointmentStatus,
  getAppointmentsForView,
  removeAppointment,
} from '../services/appointments'
import {
  ensureBaseConfiguration,
  getServicePlanning,
  getShopSettings,
  saveServicePlanning,
  saveShopSettings,
} from '../services/configuration'
import {
  addDays,
  formatDateTR,
  formatShortDateTR,
  minutesToTime,
  timeToMinutes,
  toDateInputValue,
} from '../utils/dateTime'
import {
  adminReminderWhatsAppUrl,
  adminStatusWhatsAppLabel,
  adminStatusWhatsAppUrl,
} from '../utils/whatsapp'

const DAY_OPTIONS = [
  { value: 1, label: 'Pzt' },
  { value: 2, label: 'Sal' },
  { value: 3, label: 'Çar' },
  { value: 4, label: 'Per' },
  { value: 5, label: 'Cum' },
  { value: 6, label: 'Cmt' },
  { value: 0, label: 'Paz' },
]


function fuelLabel(value) {
  return FUEL_TYPES.find((item) => item.value === value)?.label || value || '-'
}

function serviceLabel(appointment) {
  return appointment.serviceName || appointment.service || '-'
}

function endTimeLabel(appointment) {
  return appointment.endTime || ''
}

function vehicleLabel(appointment) {
  return appointment.vehicle || [
    appointment.vehicleBrand,
    appointment.vehicleModel,
    appointment.vehicleYear,
  ].filter(Boolean).join(' ') || '-'
}

function mileageLabel(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '-'
  return `${new Intl.NumberFormat('tr-TR').format(numeric)} km`
}

function formatDuration(minutes) {
  const value = Math.max(0, Number(minutes) || 0)
  const hours = Math.floor(value / 60)
  const remainingMinutes = value % 60

  if (hours === 0) return `${remainingMinutes} dakika`
  if (remainingMinutes === 0) return `${hours} saat`
  return `${hours} saat ${remainingMinutes} dakika`
}

function durationHours(minutes) {
  return Math.floor((Number(minutes) || 0) / 60)
}

function durationExtraMinutes(minutes) {
  return (Number(minutes) || 0) % 60
}

function composeDurationMinutes(hours, minutes) {
  return (Math.max(0, Number(hours) || 0) * 60) + Math.max(0, Number(minutes) || 0)
}

function appointmentCode(appointment) {
  return String(appointment.id || '').slice(0, 8).toUpperCase()
}

function groupByDate(items) {
  return items.reduce((groups, item) => {
    if (!groups[item.date]) groups[item.date] = []
    groups[item.date].push(item)
    return groups
  }, {})
}

function normalizeWhatsAppTarget(value) {
  let digits = String(value || '').replace(/\D/g, '')

  if (/^05\d{9}$/.test(digits)) digits = `9${digits}`
  else if (/^5\d{9}$/.test(digits)) digits = `90${digits}`

  return /^905\d{9}$/.test(digits) ? digits : ''
}

function buildTomorrowPlanText(dateString, items) {
  const activeItems = [...items]
    .filter((item) => normalizedAppointmentStatus(item.status) !== 'cancelled')
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))

  const lines = [
    'SAYGILI FORD – YARININ SERVİS PLANI',
    formatDateTR(dateString),
    '',
  ]

  if (activeItems.length === 0) {
    lines.push('Yarın için aktif randevu bulunmuyor.')
    return lines.join('\n')
  }

  lines.push(`Toplam: ${activeItems.length} randevu`, '')

  activeItems.forEach((appointment, index) => {
    const timeRange = appointment.endTime
      ? `${appointment.time}–${appointment.endTime}`
      : appointment.time

    lines.push(
      `${index + 1}) ${timeRange} | ${appointment.fullName}`,
      `${vehicleLabel(appointment)} | ${appointment.plate}`,
      `${serviceLabel(appointment)} | ${appointment.resourceLabel || 'Lift belirtilmedi'}`,
      `Tel: ${appointment.phone}`,
    )

    if (appointment.note) {
      lines.push(`Not: ${String(appointment.note).replace(/\s+/g, ' ').trim()}`)
    }

    lines.push('')
  })

  return lines.join('\n').trim()
}

function csvCell(value) {
  const text = String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .trim()
    .replace(/"/g, '""')

  return `"${text}"`
}

function buildTomorrowPlanCsv(dateString, items) {
  const activeItems = [...items]
    .filter((item) => normalizedAppointmentStatus(item.status) !== 'cancelled')
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))

  const rows = [
    [
      'Tarih',
      'Saat',
      'Bitiş',
      'Müşteri',
      'Telefon',
      'Araç',
      'Plaka',
      'Yakıt',
      'İşlem',
      'Süre',
      'Lift',
      'Referans',
      'Not',
    ],
    ...activeItems.map((appointment) => [
      dateString,
      appointment.time || '',
      appointment.endTime || '',
      appointment.fullName || '',
      appointment.phone || '',
      vehicleLabel(appointment),
      appointment.plate || '',
      fuelLabel(appointment.fuelType),
      serviceLabel(appointment),
      appointment.serviceDurationMinutes ? `${appointment.serviceDurationMinutes} dk` : '',
      appointment.resourceLabel || '',
      appointmentCode(appointment),
      appointment.note || '',
    ]),
  ]

  // BOM sayesinde Türkçe karakterler Windows Excel'de daha sorunsuz açılır.
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`
}

function buildWhatsAppPlanUrl(phone, text) {
  const target = normalizeWhatsAppTarget(phone)
  if (!target) return ''
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`
}

function buildWhatsAppChooserUrl(text) {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
}

function appointmentEndMinutes(appointment) {
  if (appointment.endTime) return timeToMinutes(appointment.endTime)
  return timeToMinutes(appointment.time) + Number(appointment.serviceDurationMinutes || 30)
}

function buildLiftSchedule(items, resourceNumber, settings, dateString, todayString) {
  if (!settings) return []

  const opening = timeToMinutes(settings.workingHours.start)
  const closing = timeToMinutes(settings.workingHours.end)
  let cursor = opening

  const liftAppointments = items
    .filter((item) => Number(item.resourceNumber || 1) === resourceNumber && item.status !== 'cancelled')
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))

  const segments = []

  liftAppointments.forEach((appointment) => {
    const start = Math.max(opening, timeToMinutes(appointment.time))
    const end = Math.min(closing, appointmentEndMinutes(appointment))

    if (start > cursor) {
      segments.push({
        type: 'free',
        start: minutesToTime(cursor),
        end: minutesToTime(start),
      })
    }

    if (end > opening && start < closing) {
      segments.push({
        type: 'appointment',
        appointment,
        start: minutesToTime(start),
        end: minutesToTime(end),
      })
      cursor = Math.max(cursor, end)
    }
  })

  if (cursor < closing) {
    segments.push({
      type: 'free',
      start: minutesToTime(cursor),
      end: minutesToTime(closing),
    })
  }

  if (dateString !== todayString) return segments

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todaySegments = []

  segments.forEach((segment) => {
    if (segment.type !== 'free') {
      todaySegments.push(segment)
      return
    }

    const start = timeToMinutes(segment.start)
    const end = timeToMinutes(segment.end)

    if (end <= nowMinutes) {
      todaySegments.push({ ...segment, type: 'past' })
      return
    }

    if (start < nowMinutes && nowMinutes < end) {
      todaySegments.push({
        type: 'past',
        start: segment.start,
        end: minutesToTime(nowMinutes),
      })
      todaySegments.push({
        type: 'free',
        start: minutesToTime(nowMinutes),
        end: segment.end,
      })
      return
    }

    todaySegments.push(segment)
  })

  return todaySegments
}

export default function AdminDashboardPage({ adminProfile }) {
  const today = toDateInputValue(new Date())
  const tomorrow = toDateInputValue(addDays(new Date(), 1))
  const [section, setSection] = useState('appointments')
  const [settingsSection, setSettingsSection] = useState('shop')
  const [viewMode, setViewMode] = useState('upcoming')
  const [selectedDate, setSelectedDate] = useState(today)
  const [appointments, setAppointments] = useState([])
  const [tomorrowAppointments, setTomorrowAppointments] = useState([])
  const [tomorrowLoading, setTomorrowLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [shopSettings, setShopSettings] = useState(null)
  const [servicePlanning, setServicePlanning] = useState(null)
  const [planningDirty, setPlanningDirty] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [configLoading, setConfigLoading] = useState(true)
  const [actionId, setActionId] = useState('')
  const [message, setMessage] = useState(null)
  const [copied, setCopied] = useState(false)

  const loadAppointments = useCallback(async (force = false) => {
    setLoading(true)
    try {
      setAppointments(await getAppointmentsForView(
        { mode: viewMode, date: selectedDate, today },
        { force },
      ))
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'Randevular yüklenemedi.' })
    } finally {
      setLoading(false)
    }
  }, [viewMode, selectedDate, today])

  const loadTomorrowAppointments = useCallback(async (force = false) => {
    setTomorrowLoading(true)
    try {
      const items = await getAppointmentsForView(
        { mode: 'date', date: tomorrow, today },
        { force },
      )
      setTomorrowAppointments(items)
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'Yarının randevu planı yüklenemedi.' })
    } finally {
      setTomorrowLoading(false)
    }
  }, [tomorrow, today])

  const loadConfiguration = useCallback(async () => {
    setConfigLoading(true)
    try {
      await ensureBaseConfiguration()
      const [settings, planning] = await Promise.all([
        getShopSettings(),
        getServicePlanning(),
      ])
      setShopSettings(settings)
      setServicePlanning(planning)
      setPlanningDirty(false)
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'Dükkan ve model süre ayarları hazırlanamadı.' })
    } finally {
      setConfigLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfiguration()
  }, [loadConfiguration])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  useEffect(() => {
    loadTomorrowAppointments()
  }, [loadTomorrowAppointments])

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!planningDirty) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [planningDirty])

  const visibleAppointments = useMemo(() => {
    let result = appointments

    if (viewMode === 'today') result = result.filter((item) => item.date === today)
    if (viewMode === 'upcoming') result = result.filter((item) => item.date >= today)
    if (viewMode === 'past') result = result.filter((item) => item.date < today)
    if (viewMode === 'date') result = result.filter((item) => item.date === selectedDate)

    if (statusFilter !== 'all') {
      result = result.filter((item) => normalizedAppointmentStatus(item.status) === statusFilter)
    }

    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('tr-TR')
    if (normalizedSearch) {
      result = result.filter((item) => {
        const haystack = [
          item.fullName,
          item.phone,
          item.plate,
          item.vehicle,
          item.vehicleBrand,
          item.vehicleModel,
          item.serviceName,
        ].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR')
        return haystack.includes(normalizedSearch)
      })
    }

    return [...result].sort((a, b) => {
      const comparison = `${a.date}_${a.time}`.localeCompare(`${b.date}_${b.time}`, 'tr')
      return viewMode === 'past' ? -comparison : comparison
    })
  }, [appointments, viewMode, statusFilter, searchTerm, selectedDate, today])

  const groupedAppointments = useMemo(() => groupByDate(visibleAppointments), [visibleAppointments])
  const groupDates = useMemo(() => Object.keys(groupedAppointments).sort((a, b) => viewMode === 'past' ? b.localeCompare(a) : a.localeCompare(b)), [groupedAppointments, viewMode])

  const counts = useMemo(() => ({
    total: visibleAppointments.length,
    planned: visibleAppointments.filter((item) => normalizedAppointmentStatus(item.status) === 'confirmed').length,
    active: visibleAppointments.filter((item) => ['arrived', 'in_progress'].includes(normalizedAppointmentStatus(item.status))).length,
    completed: visibleAppointments.filter((item) => normalizedAppointmentStatus(item.status) === 'completed').length,
  }), [visibleAppointments])

  const todayOperations = useMemo(() => {
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const todayItems = appointments
      .filter((item) => item.date === today && normalizedAppointmentStatus(item.status) !== 'cancelled')
      .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))

    const occupyingItems = todayItems.filter((item) => {
      const status = normalizedAppointmentStatus(item.status)
      if (status === 'completed') return false
      const start = timeToMinutes(item.time)
      const end = appointmentEndMinutes(item)
      return start <= nowMinutes && nowMinutes < end
    })

    const activeItems = occupyingItems.filter((item) => ['arrived', 'in_progress'].includes(normalizedAppointmentStatus(item.status)))

    const nextAppointment = todayItems.find((item) => {
      const status = normalizedAppointmentStatus(item.status)
      return status !== 'completed' && timeToMinutes(item.time) >= nowMinutes
    }) || null

    const occupiedResources = new Set(occupyingItems.map((item) => Number(item.resourceNumber || 1)))
    const totalResources = Math.max(1, Number(shopSettings?.resourceCount) || 1)

    return {
      total: todayItems.length,
      active: activeItems.length,
      freeResources: Math.max(0, totalResources - occupiedResources.size),
      nextAppointment,
    }
  }, [appointments, today, shopSettings?.resourceCount])

  const tomorrowPlanAppointments = useMemo(
    () => [...tomorrowAppointments]
      .filter((item) => normalizedAppointmentStatus(item.status) !== 'cancelled')
      .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)),
    [tomorrowAppointments],
  )

  const tomorrowPlanText = useMemo(
    () => buildTomorrowPlanText(tomorrow, tomorrowPlanAppointments),
    [tomorrow, tomorrowPlanAppointments],
  )

  const tomorrowPlanCsv = useMemo(
    () => buildTomorrowPlanCsv(tomorrow, tomorrowPlanAppointments),
    [tomorrow, tomorrowPlanAppointments],
  )

  const tomorrowStaffContacts = useMemo(
    () => (Array.isArray(shopSettings?.staffContacts) ? shopSettings.staffContacts : [])
      .map((item) => ({
        name: String(item?.name || '').trim(),
        phone: String(item?.phone || '').trim(),
      }))
      .filter((item) => item.name && normalizeWhatsAppTarget(item.phone)),
    [shopSettings?.staffContacts],
  )

  const genericTomorrowWhatsAppUrl = useMemo(
    () => buildWhatsAppChooserUrl(tomorrowPlanText),
    [tomorrowPlanText],
  )

  const filteredPlanningGroups = useMemo(() => {
    if (!servicePlanning) return []
    const search = modelSearch.trim().toLocaleLowerCase('tr-TR')
    return planningModelGroups(servicePlanning)
      .map((group) => ({
        ...group,
        models: group.models.filter((model) => !search || model.name.toLocaleLowerCase('tr-TR').includes(search)),
      }))
      .filter((group) => group.models.length > 0)
  }, [servicePlanning, modelSearch])

  const viewTitle = useMemo(() => {
    if (viewMode === 'today') return `Bugün · ${formatShortDateTR(today)}`
    if (viewMode === 'upcoming') return 'Bugün ve Yaklaşan Randevular'
    if (viewMode === 'past') return 'Geçmiş Randevular'
    return formatDateTR(selectedDate)
  }, [viewMode, selectedDate, today])

  const isSelectedDatePast = selectedDate < today

  const selectedDayAppointments = useMemo(
    () => appointments
      .filter((item) => item.date === selectedDate)
      .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)),
    [appointments, selectedDate],
  )

  const liftSchedules = useMemo(() => {
    if (!shopSettings) return []
    const count = Math.max(1, Number(shopSettings.resourceCount) || 1)
    return Array.from({ length: count }, (_, index) => ({
      resourceNumber: index + 1,
      label: `${shopSettings.resourceLabel || 'Lift'} ${index + 1}`,
      segments: buildLiftSchedule(selectedDayAppointments, index + 1, shopSettings, selectedDate, today),
    }))
  }, [selectedDayAppointments, shopSettings, selectedDate, today])

  const handleStatusChange = async (appointment, nextStatus) => {
    if (nextStatus === normalizedAppointmentStatus(appointment.status) && appointment.status !== 'pending') return
    const label = APPOINTMENT_STATUSES.find((item) => item.value === nextStatus)?.label ?? nextStatus

    if (nextStatus === 'cancelled' && !window.confirm('Bu randevu iptal edilecek ve ayırdığı lift süreleri yeniden müşterilere açılacak. Müşteriye iptal bilgisini telefon veya WhatsApp ile ilettiğinizden emin olun. Devam edilsin mi?')) return

    setActionId(appointment.id)
    setMessage(null)
    try {
      await changeAppointmentStatus(appointment, nextStatus)
      setMessage({ type: 'success', text: `Randevu durumu “${label}” olarak güncellendi.` })
      await Promise.all([loadAppointments(true), loadTomorrowAppointments(true)])
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: error?.message || 'Durum güncellenemedi.' })
    } finally {
      setActionId('')
    }
  }

  const handleDelete = async (appointment) => {
    if (!window.confirm(`${appointment.fullName} adlı müşterinin randevusu kalıcı olarak silinsin mi? Ayırdığı lift süreleri de boşaltılacak.`)) return

    setActionId(appointment.id)
    setMessage(null)
    try {
      await removeAppointment(appointment)
      setMessage({ type: 'success', text: 'Randevu ve ayırdığı süreler silindi.' })
      await Promise.all([loadAppointments(true), loadTomorrowAppointments(true)])
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'Randevu silinemedi.' })
    } finally {
      setActionId('')
    }
  }

  const copyBookingLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setMessage({ type: 'error', text: 'Link panoya kopyalanamadı.' })
    }
  }

  const handleCopyTomorrowPlan = async () => {
    try {
      await navigator.clipboard.writeText(tomorrowPlanText)
      setMessage({ type: 'success', text: 'Yarının servis planı panoya kopyalandı.' })
    } catch {
      setMessage({ type: 'error', text: 'Plan metni panoya kopyalanamadı.' })
    }
  }

  const handleNativeShareTomorrowPlan = async () => {
    if (!navigator.share) {
      window.open(genericTomorrowWhatsAppUrl, '_blank', 'noopener,noreferrer')
      return
    }

    try {
      await navigator.share({
        title: `Saygılı Ford · ${formatDateTR(tomorrow)}`,
        text: tomorrowPlanText,
      })
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error(error)
        setMessage({ type: 'error', text: 'Paylaşım ekranı açılamadı.' })
      }
    }
  }

  const handleDownloadTomorrowCsv = () => {
    try {
      const blob = new Blob([tomorrowPlanCsv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `SaygiliFord_${tomorrow}_Randevular.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setMessage({ type: 'success', text: 'Yarının randevu listesi CSV olarak indirildi.' })
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'CSV dosyası oluşturulamadı.' })
    }
  }

  const handleRefreshDashboard = async () => {
    setActionId('dashboard-refresh')
    setMessage(null)

    try {
      await Promise.all([
        loadAppointments(true),
        loadTomorrowAppointments(true),
        loadConfiguration(),
      ])

      setMessage({
        type: 'success',
        text: 'Yönetim paneli güncellendi. Yeni randevular ve yarının planı yenilendi.',
      })
    } catch (error) {
      console.error(error)
      setMessage({
        type: 'error',
        text: 'Yönetim paneli yenilenirken bir hata oluştu.',
      })
    } finally {
      setActionId('')
    }
  }

  const moveDate = (days) => {
    const current = new Date(`${selectedDate}T12:00:00`)
    setSelectedDate(toDateInputValue(addDays(current, days)))
    setViewMode('date')
  }

  const updatePlanningModel = (modelId, updater) => {
    setServicePlanning((current) => {
      if (!current?.models?.[modelId]) return current
      const currentModel = current.models[modelId]
      const nextModel = typeof updater === 'function' ? updater(currentModel) : { ...currentModel, ...updater }
      return {
        ...current,
        models: {
          ...current.models,
          [modelId]: nextModel,
        },
      }
    })
    setPlanningDirty(true)
  }

  const updateModelService = (modelId, serviceId, patch) => {
    updatePlanningModel(modelId, (model) => ({
      ...model,
      services: {
        ...model.services,
        [serviceId]: {
          ...model.services[serviceId],
          ...patch,
        },
      },
    }))
  }

  const updateModelServiceDurationPart = (modelId, serviceId, part, rawValue) => {
    const currentMinutes = Number(servicePlanning?.models?.[modelId]?.services?.[serviceId]?.durationMinutes) || 60
    const hours = Math.floor(currentMinutes / 60)
    const minutes = currentMinutes % 60
    const next = part === 'hours'
      ? composeDurationMinutes(rawValue, minutes)
      : composeDurationMinutes(hours, rawValue)
    updateModelService(modelId, serviceId, { durationMinutes: normalizePlanningDuration(next) })
  }

  const handleSaveServicePlanning = async () => {
    if (!servicePlanning) return
    setActionId('service-planning')
    try {
      const saved = await saveServicePlanning(servicePlanning)
      setServicePlanning(saved)
      setPlanningDirty(false)
      setMessage({ type: 'success', text: 'Ford model / işlem süreleri kaydedildi. Müşteri öneri saatleri artık bu sürelere göre hesaplanacak.' })
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'Model ve işlem süreleri kaydedilemedi.' })
    } finally {
      setActionId('')
    }
  }

  const toggleWorkingDay = (day) => {
    if (!shopSettings) return
    const exists = shopSettings.workingDays.includes(day)
    const nextDays = exists
      ? shopSettings.workingDays.filter((item) => item !== day)
      : [...shopSettings.workingDays, day]
    setShopSettings({ ...shopSettings, workingDays: nextDays })
  }

  const addStaffContact = () => {
    if (!shopSettings) return
    const current = Array.isArray(shopSettings.staffContacts) ? shopSettings.staffContacts : []
    if (current.length >= 6) {
      setMessage({ type: 'error', text: 'En fazla 6 usta / yetkili iletişimi ekleyebilirsiniz.' })
      return
    }
    setShopSettings({
      ...shopSettings,
      staffContacts: [...current, { name: '', phone: '' }],
    })
  }

  const updateStaffContact = (index, field, value) => {
    if (!shopSettings) return
    const current = Array.isArray(shopSettings.staffContacts) ? shopSettings.staffContacts : []
    setShopSettings({
      ...shopSettings,
      staffContacts: current.map((item, itemIndex) => (
        itemIndex === index
          ? { ...item, [field]: String(value || '').slice(0, field === 'name' ? 80 : 30) }
          : item
      )),
    })
  }

  const removeStaffContact = (index) => {
    if (!shopSettings) return
    const current = Array.isArray(shopSettings.staffContacts) ? shopSettings.staffContacts : []
    setShopSettings({
      ...shopSettings,
      staffContacts: current.filter((_, itemIndex) => itemIndex !== index),
    })
  }

  const handleSaveShopSettings = async () => {
    if (!shopSettings) return
    if (shopSettings.workingHours.start >= shopSettings.workingHours.end) {
      setMessage({ type: 'error', text: 'Kapanış saati açılış saatinden sonra olmalı.' })
      return
    }
    if (Number(shopSettings.resourceCount) < 1 || Number(shopSettings.resourceCount) > 6) {
      setMessage({ type: 'error', text: 'Lift sayısı 1 ile 6 arasında olmalı.' })
      return
    }

    const preparedSettings = {
      ...shopSettings,
      resourceCount: Number(shopSettings.resourceCount),
      staffContacts: (Array.isArray(shopSettings.staffContacts) ? shopSettings.staffContacts : [])
        .map((item) => ({
          name: String(item?.name || '').trim(),
          phone: String(item?.phone || '').trim(),
        }))
        .filter((item) => item.name || item.phone),
    }

    setActionId('shop-settings')
    try {
      await saveShopSettings(preparedSettings)
      setShopSettings(preparedSettings)
      setMessage({ type: 'success', text: 'Dükkan çalışma, iletişim ve kapasite ayarları kaydedildi.' })
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'Dükkan ayarları kaydedilemedi.' })
    } finally {
      setActionId('')
    }
  }

  const renderLiftSegment = (segment, resourceNumber) => {
    if (segment.type === 'past') {
      return (
        <div className="lift-segment lift-segment-past" key={`${resourceNumber}-${segment.start}-past`}>
          <div className="lift-segment-time">{segment.start} – {segment.end}</div>
          <strong>Geçmiş zaman</strong>
        </div>
      )
    }

    if (segment.type === 'free') {
      return (
        <div className="lift-segment lift-segment-free" key={`${resourceNumber}-${segment.start}-free`}>
          <div className="lift-segment-time">{segment.start} – {segment.end}</div>
          <strong>Boş</strong>
          <span>Yeni randevu için uygun</span>
        </div>
      )
    }

    const appointment = segment.appointment
    return (
      <div className="lift-segment lift-segment-busy" key={appointment.id}>
        <div className="lift-segment-topline">
          <div className="lift-segment-time">{segment.start} – {segment.end}</div>
          <StatusBadge status={appointment.status} />
        </div>
        <strong>{serviceLabel(appointment)}</strong>
        <span>{vehicleLabel(appointment)} · {appointment.plate}</span>
        <span>{appointment.fullName}</span>
        <div className="lift-contact-row">
          <a href={`tel:${appointment.phone}`}>Ara</a>
          {adminReminderWhatsAppUrl(appointment) && (
            <a href={adminReminderWhatsAppUrl(appointment)} target="_blank" rel="noreferrer">Hatırlat</a>
          )}
        </div>
      </div>
    )
  }

  const renderAppointment = (appointment) => {
    return (
      <article className="appointment-item appointment-table-row" key={appointment.id}>
        <div className="appointment-table-cell appointment-time">
          <strong>{appointment.time}</strong>
          {endTimeLabel(appointment) && <span className="end-time">→ {appointment.endTime}</span>}
          <StatusBadge status={appointment.status} />
        </div>

        <div className="appointment-table-cell appointment-customer">
          <span className="appointment-mobile-label">Müşteri</span>
          <strong className="appointment-customer-name">{appointment.fullName}</strong>
          <a className="appointment-phone-link" href={`tel:${appointment.phone}`}>{appointment.phone}</a>
          {appointment.note && (
            <p className="appointment-note appointment-note-compact" title={appointment.note}>
              {appointment.note}
            </p>
          )}
        </div>

        <div className="appointment-table-cell appointment-vehicle">
          <span className="appointment-mobile-label">Araç</span>
          <strong>{vehicleLabel(appointment)}</strong>
          <span className="appointment-plate">{appointment.plate}</span>
          <small>{mileageLabel(appointment.mileage)} · {fuelLabel(appointment.fuelType)}</small>
        </div>

        <div className="appointment-table-cell appointment-service">
          <span className="appointment-mobile-label">İşlem</span>
          <strong>{serviceLabel(appointment)}</strong>
          {appointment.serviceDurationMinutes && <small>{formatDuration(appointment.serviceDurationMinutes)}</small>}
        </div>

        <div className="appointment-table-cell appointment-assignment">
          <span className="appointment-mobile-label">Lift / Referans</span>
          <strong>{appointment.resourceLabel || '-'}</strong>
          <small>{appointmentCode(appointment)}</small>
        </div>

        <div className="appointment-table-cell appointment-actions">
          <div className="appointment-contact-actions">
            <a className="secondary-button link-button" href={`tel:${appointment.phone}`}>Ara</a>

            {adminStatusWhatsAppUrl(appointment) && (
              <a
                className="secondary-button link-button whatsapp-button"
                href={adminStatusWhatsAppUrl(appointment)}
                target="_blank"
                rel="noreferrer"
                title="WhatsApp hazır mesajını açar; mesaj otomatik gönderilmez."
              >
                {adminStatusWhatsAppLabel(appointment)}
              </a>
            )}

            {appointment.status !== 'cancelled' && appointment.status !== 'completed' && adminReminderWhatsAppUrl(appointment) && (
              <a
                className="secondary-button link-button whatsapp-button whatsapp-reminder-button"
                href={adminReminderWhatsAppUrl(appointment)}
                target="_blank"
                rel="noreferrer"
                title="Randevu bilgileriyle hazırlanmış hatırlatma mesajını açar."
              >
                Hatırlat
              </a>
            )}
          </div>

          <div className="appointment-manage-row">
            <label className="appointment-status-control">
              <span>Durum</span>
              <select
                disabled={actionId === appointment.id || appointment.status === 'cancelled'}
                value={normalizedAppointmentStatus(appointment.status)}
                onChange={(e) => handleStatusChange(appointment, e.target.value)}
              >
                {APPOINTMENT_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </label>

            <button
              className="delete-button appointment-delete-button"
              type="button"
              disabled={actionId === appointment.id}
              onClick={() => handleDelete(appointment)}
            >
              Sil
            </button>
          </div>
        </div>
      </article>
    )
  }

  return (
    <>
      <BrandHeader admin />
      <main className="page-shell admin-shell">
        <section className="admin-topbar card">
          <div>
            <p className="eyebrow">Hoş Geldiniz</p>
            <h2>{adminProfile?.name || auth.currentUser?.email || 'Yönetici'}</h2>
            <p className="muted">{section === 'appointments' ? viewTitle : (settingsSection === 'shop' ? 'Dükkan ve iletişim ayarları' : 'Ford model / işlem süreleri')}</p>
          </div>
          <div className="topbar-actions">
            <button className={`secondary-button ${section === 'appointments' ? 'active-nav-button' : ''}`} type="button" onClick={() => setSection('appointments')}>Randevular</button>
            <button className={`secondary-button ${section === 'settings' ? 'active-nav-button' : ''}`} type="button" onClick={() => setSection('settings')}>Servis Ayarları</button>
            <button className="secondary-button" type="button" onClick={copyBookingLink}>{copied ? 'Kopyalandı' : 'Randevu Linkini Kopyala'}</button>
            <a className="secondary-button link-button" href="/" target="_blank" rel="noreferrer">Müşteri Sayfası</a>
            <button

              className="secondary-button admin-refresh-button"

              type="button"

              disabled={actionId === 'dashboard-refresh'}

              onClick={handleRefreshDashboard}

            >

              {actionId === 'dashboard-refresh' ? 'Yenileniyor...' : 'Paneli Yenile'}

            </button>

            <button className="danger-outline-button" type="button" onClick={() => signOut(auth)}>Çıkış</button>
          </div>
        </section>

        {message && <div className={`alert alert-${message.type} admin-toast`} role="alert"><span>{message.text}</span><button type="button" aria-label="Bildirimi kapat" onClick={() => setMessage(null)}>×</button></div>}

        {section === 'appointments' ? (
          <>
            <section className="stats-grid">
              <article className="stat-card card"><span>Gösterilen</span><strong>{counts.total}</strong></article>
              <article className="stat-card card"><span>Planlandı</span><strong>{counts.planned}</strong></article>
              <article className="stat-card card"><span>Serviste</span><strong>{counts.active}</strong></article>
              <article className="stat-card card"><span>Tamamlandı</span><strong>{counts.completed}</strong></article>
            </section>

            {(viewMode === 'today' || viewMode === 'upcoming') && (
              <section className="card daily-ops-summary" aria-label="Bugünün servis özeti">
                <div>
                  <p className="eyebrow">Bugünün Özeti</p>
                  <h3>{todayOperations.total === 0 ? 'Bugün planlanmış randevu yok' : `${todayOperations.total} randevu planlı`}</h3>
                </div>
                <div className="daily-ops-metrics">
                  <div><span>Şu an serviste</span><strong>{todayOperations.active}</strong></div>
                  <div><span>Boş lift</span><strong>{todayOperations.freeResources}</strong></div>
                  <div className="next-appointment-metric">
                    <span>Sıradaki</span>
                    <strong>{todayOperations.nextAppointment ? `${todayOperations.nextAppointment.time} · ${todayOperations.nextAppointment.fullName}` : 'Bugün başka randevu yok'}</strong>
                    {todayOperations.nextAppointment && <small>{serviceLabel(todayOperations.nextAppointment)} · {vehicleLabel(todayOperations.nextAppointment)}</small>}
                  </div>
                </div>
              </section>
            )}

            <section className="card tomorrow-plan-card" aria-label="Yarının servis planı">
              <div className="tomorrow-plan-card-heading">
                <div>
                  <p className="eyebrow">Yarının Planı</p>
                  <h3>{formatDateTR(tomorrow)}</h3>
                  <span className="muted">
                    Ücretsiz paylaşım: sistem metni hazırlar; WhatsApp'ta son gönderme işlemini siz yaparsınız.
                  </span>
                </div>

                <div className="tomorrow-plan-count">
                  <span>Aktif randevu</span>
                  <strong>{tomorrowPlanAppointments.length}</strong>
                </div>
              </div>

              {tomorrowLoading ? (
                <div className="empty-state tomorrow-plan-loading">Yarının planı hazırlanıyor...</div>
              ) : (
                <>
                  <div className="tomorrow-plan-preview">
                    {tomorrowPlanAppointments.length === 0 ? (
                      <div className="tomorrow-plan-empty">
                        Yarın için aktif randevu bulunmuyor.
                      </div>
                    ) : (
                      tomorrowPlanAppointments.map((appointment) => (
                        <article className="tomorrow-plan-preview-row" key={`tomorrow-${appointment.id}`}>
                          <div className="tomorrow-plan-preview-time">
                            <strong>{appointment.time}</strong>
                            {appointment.endTime && <span>→ {appointment.endTime}</span>}
                          </div>
                          <div>
                            <strong>{appointment.fullName}</strong>
                            <span>{vehicleLabel(appointment)} · {appointment.plate}</span>
                          </div>
                          <div>
                            <strong>{serviceLabel(appointment)}</strong>
                            <span>{appointment.resourceLabel || '-'}</span>
                          </div>
                        </article>
                      ))
                    )}
                  </div>

                  <div className="tomorrow-plan-share-area">
                    <div className="tomorrow-plan-main-actions">
                      <a
                        className="primary-button link-button tomorrow-whatsapp-main"
                        href={genericTomorrowWhatsAppUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp'ta Paylaş
                      </a>

                      <button className="secondary-button" type="button" onClick={handleNativeShareTomorrowPlan}>
                        Telefonda Paylaş
                      </button>

                      <button className="secondary-button" type="button" onClick={handleCopyTomorrowPlan}>
                        Metni Kopyala
                      </button>

                      <button className="secondary-button" type="button" onClick={handleDownloadTomorrowCsv}>
                        CSV İndir
                      </button>

                      <button className="secondary-button" type="button" onClick={() => loadTomorrowAppointments(true)}>
                        Yarını Yenile
                      </button>
                    </div>

                    {tomorrowStaffContacts.length > 0 && (
                      <div className="tomorrow-direct-share">
                        <span>Hızlı WhatsApp</span>
                        <div>
                          {tomorrowStaffContacts.map((contact, index) => (
                            <a
                              className="secondary-button link-button tomorrow-contact-share"
                              key={`${contact.name}-${index}`}
                              href={buildWhatsAppPlanUrl(contact.phone, tomorrowPlanText)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {contact.name} · WhatsApp
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>

            <section className="card appointment-panel">
              <div className="admin-view-tabs">
                <button type="button" className={viewMode === 'today' ? 'view-tab active' : 'view-tab'} onClick={() => { setViewMode('today'); setSelectedDate(today) }}>Bugün</button>
                <button type="button" className={viewMode === 'upcoming' ? 'view-tab active' : 'view-tab'} onClick={() => { setViewMode('upcoming'); setSelectedDate(today) }}>Bugün + Yaklaşan</button>
                <button type="button" className={viewMode === 'past' ? 'view-tab active' : 'view-tab'} onClick={() => { setViewMode('past'); setSelectedDate(toDateInputValue(addDays(new Date(), -1))) }}>Geçmiş</button>
                <button type="button" className={viewMode === 'date' ? 'view-tab active' : 'view-tab'} onClick={() => setViewMode('date')}>Tarihe Git</button>
              </div>

              <div className="filters-row">
                <div className="date-nav-control">
                  <button type="button" className="secondary-button" onClick={() => moveDate(-1)}>‹</button>
                  <label>
                    <span>Tarih</span>
                    <input type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setViewMode('date') }} />
                  </label>
                  <button type="button" className="secondary-button" onClick={() => moveDate(1)}>›</button>
                </div>
                <label className="search-filter">
                  <span>Ara</span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Müşteri, telefon, plaka, araç..."
                  />
                </label>
                <label>
                  <span>Durum</span>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">Tümü</option>
                    {APPOINTMENT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </label>
                <button className="secondary-button filter-button" type="button" onClick={() => loadAppointments(true)}>Yenile</button>
              </div>

              {!isSelectedDatePast && (
                <section className="workshop-day-plan" aria-label="Günlük lift planı">
                  <div className="workshop-plan-heading">
                    <div>
                      <p className="eyebrow">Günlük Servis Planı</p>
                      <h3>{formatDateTR(selectedDate)}</h3>
                    </div>
                    <span className="muted">İptal edilen randevular lift kapasitesini kapatmaz.</span>
                  </div>

                  {configLoading || !shopSettings ? (
                    <div className="empty-state">Lift planı hazırlanıyor...</div>
                  ) : (
                    <div className="lift-plan-grid">
                      {liftSchedules.map((lift) => (
                        <article className="lift-plan-column" key={lift.resourceNumber}>
                          <header className="lift-plan-header">
                            <strong>{lift.label}</strong>
                            <span>{shopSettings.workingHours.start} – {shopSettings.workingHours.end}</span>
                          </header>
                          <div className="lift-plan-segments">
                            {lift.segments.length === 0 ? (
                              <div className="lift-segment lift-segment-free">
                                <div className="lift-segment-time">{shopSettings.workingHours.start} – {shopSettings.workingHours.end}</div>
                                <strong>Tüm gün boş</strong>
                              </div>
                            ) : lift.segments.map((segment) => renderLiftSegment(segment, lift.resourceNumber))}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <div className="panel-heading-row">
                <div>
                  <p className="eyebrow">Randevu Listesi</p>
                  <h2>{viewTitle}</h2>
                </div>
                <span className="muted">Randevular müşteri tarafından oluşturulduğunda otomatik olarak planlanır. Durum alanı yalnızca dükkan içi iş takibi içindir.</span>
              </div>

              {loading ? (
                <div className="empty-state">Randevular yükleniyor...</div>
              ) : visibleAppointments.length === 0 ? (
                <div className="empty-state">Bu görünümde randevu bulunmuyor.</div>
              ) : (
                <div className="appointment-date-groups">
                  {groupDates.map((groupDate) => (
                    <section className="date-group" key={groupDate}>
                      {(viewMode === 'upcoming' || viewMode === 'past') && (
                        <div className="date-group-heading">
                          <h3>{groupDate === today ? `Bugün · ${formatDateTR(groupDate)}` : formatDateTR(groupDate)}</h3>
                          <span>{groupedAppointments[groupDate].length} randevu</span>
                        </div>
                      )}
                      <div className="appointment-table">
                        <div className="appointment-table-head" aria-hidden="true">
                          <span>Saat / Durum</span>
                          <span>Müşteri</span>
                          <span>Araç</span>
                          <span>İşlem</span>
                          <span>Lift / Ref.</span>
                          <span>Yönetim</span>
                        </div>
                        <div className="appointment-list">{groupedAppointments[groupDate].map(renderAppointment)}</div>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="settings-simple-shell">
            <section className="card settings-mini-menu" aria-label="Servis ayarları menüsü">
              <button
                type="button"
                className={settingsSection === 'shop' ? 'settings-mini-button active' : 'settings-mini-button'}
                onClick={() => setSettingsSection('shop')}
              >
                <strong>Dükkan & İletişim</strong>
                <span>Çalışma saatleri, günler, lift ve telefonlar</span>
              </button>
              <button
                type="button"
                className={settingsSection === 'planning' ? 'settings-mini-button active' : 'settings-mini-button'}
                onClick={() => setSettingsSection('planning')}
              >
                <strong>Ford Model & Süreleri</strong>
                <span>18 Ford modeli · 6 ana işlem · dinamik saat planı</span>
              </button>
            </section>

            {settingsSection === 'shop' ? (
              <section className="card settings-card compact-settings-card">
                <div className="section-heading compact-heading">
                  <div><p className="eyebrow">Dükkan</p><h2>Çalışma düzeni ve iletişim</h2></div>
                </div>

                {configLoading || !shopSettings ? <div className="empty-state">Ayarlar yükleniyor...</div> : (
                  <div className="settings-form">
                    <div className="form-grid three-column">
                      <label><span>Açılış</span><input type="time" value={shopSettings.workingHours.start} onChange={(e) => setShopSettings({ ...shopSettings, workingHours: { ...shopSettings.workingHours, start: e.target.value } })} /></label>
                      <label><span>Kapanış</span><input type="time" value={shopSettings.workingHours.end} onChange={(e) => setShopSettings({ ...shopSettings, workingHours: { ...shopSettings.workingHours, end: e.target.value } })} /></label>
                      <label><span>Lift / Eşzamanlı İş</span><input type="number" min="1" max="6" value={shopSettings.resourceCount} onChange={(e) => setShopSettings({ ...shopSettings, resourceCount: Number(e.target.value) })} /></label>
                    </div>

                    <div>
                      <span className="settings-label">Çalışma Günleri</span>
                      <div className="day-toggle-row">
                        {DAY_OPTIONS.map((day) => (
                          <button key={day.value} type="button" className={shopSettings.workingDays.includes(day.value) ? 'day-toggle active' : 'day-toggle'} onClick={() => toggleWorkingDay(day.value)}>{day.label}</button>
                        ))}
                      </div>
                    </div>

                    <div className="settings-info-note planning-unit-note">
                      <strong>Saat planı artık dinamik</strong>
                      <span>Müşteri 30 dakikalık sabit slot görmez. Sistem model + işlem süresine göre uygun başlangıçları kendisi önerir.</span>
                    </div>

                    <div className="settings-subsection contact-settings-panel">
                      <div className="contact-settings-heading">
                        <div>
                          <span className="settings-label">Dükkan İletişim Bilgileri</span>
                          <small className="muted">Bu bilgiler müşteri randevu ekranında doğrudan gösterilir.</small>
                        </div>
                      </div>

                      <div className="form-grid two-column">
                        <label>
                          <span>Dükkan Telefonu</span>
                          <input type="tel" value={shopSettings.contactPhone || ''} onChange={(e) => setShopSettings({ ...shopSettings, contactPhone: e.target.value.slice(0, 30) })} placeholder="Örn. 0312 ..." />
                        </label>
                        <label>
                          <span>Dükkan WhatsApp</span>
                          <input type="tel" value={shopSettings.whatsappPhone || ''} onChange={(e) => setShopSettings({ ...shopSettings, whatsappPhone: e.target.value.slice(0, 30) })} placeholder="Boşsa müşteri tarafında WhatsApp gösterilmez" />
                        </label>
                      </div>

                      <div className="staff-settings-block">
                        <div className="staff-settings-title-row">
                          <div>
                            <strong>Usta / Yetkili İletişimleri</strong>
                            <small>İsim ve telefon eklediğiniz kişiler müşteri tarafında ayrı ayrı görünür.</small>
                          </div>
                          <button className="secondary-button compact-action-button" type="button" onClick={addStaffContact}>+ Usta Ekle</button>
                        </div>

                        {(shopSettings.staffContacts || []).length === 0 ? (
                          <div className="empty-inline-note">Henüz usta iletişimi eklenmedi.</div>
                        ) : (
                          <div className="staff-settings-list">
                            {(shopSettings.staffContacts || []).map((contact, index) => (
                              <div className="staff-settings-row" key={`staff-contact-${index}`}>
                                <label><span>Usta / Yetkili Adı</span><input type="text" maxLength={80} value={contact.name || ''} onChange={(e) => updateStaffContact(index, 'name', e.target.value)} placeholder="Örn. İsrafil KASAR" /></label>
                                <label><span>Telefon</span><input type="tel" value={contact.phone || ''} onChange={(e) => updateStaffContact(index, 'phone', e.target.value)} placeholder="05xx xxx xx xx" /></label>
                                <button className="delete-button staff-remove-button" type="button" onClick={() => removeStaffContact(index)}>Kaldır</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <label>
                        <span>Adres</span>
                        <textarea rows="2" maxLength={240} value={shopSettings.address || ''} onChange={(e) => setShopSettings({ ...shopSettings, address: e.target.value.slice(0, 240) })} placeholder="Açık adres" />
                      </label>
                    </div>

                    <button className="primary-button" type="button" disabled={actionId === 'shop-settings'} onClick={handleSaveShopSettings}>
                      {actionId === 'shop-settings' ? 'Kaydediliyor...' : 'Dükkan Ayarlarını Kaydet'}
                    </button>
                  </div>
                )}
              </section>
            ) : (
              <section className="card settings-card model-planning-card">
                <div className="model-planning-head">
                  <div>
                    <p className="eyebrow">Dinamik Süre Planı</p>
                    <h2>Ford modeline göre işlem süreleri</h2>
                    <p className="muted">Müşteri yalnız aşağıdaki 18 Ford modelinden randevu alabilir. Bir modeli açın, 6 ana işlem için süreleri ayarlayın ve kaydedin.</p>
                  </div>
                  <label className="model-search-field">
                    <span>Model ara</span>
                    <input type="search" value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="Focus, Custom, Courier..." />
                  </label>
                </div>

                <div className="settings-info-note">
                  <strong>Diğer / Arıza Tespiti</strong>
                  <span>Bu satır büyük onarımın tamamını değil, ilk mekanik inceleme / arıza tespiti için ayrılan süreyi temsil eder. Silindir kapağı, rektefiye gibi devam işleri araç görüldükten sonra planlanabilir.</span>
                </div>

                {configLoading || !servicePlanning ? (
                  <div className="empty-state">Model süreleri yükleniyor...</div>
                ) : (
                  <div className="model-group-stack">
                    {filteredPlanningGroups.map(({ group, models }) => (
                      <details className="model-group-details" key={group} open={Boolean(modelSearch.trim()) || group === MODEL_GROUP_ORDER[0]}>
                        <summary>
                          <strong>{group}</strong>
                          <span>{models.length} model</span>
                        </summary>

                        <div className="model-duration-grid">
                          {models.map((model) => (
                            <details className="model-duration-card" key={model.id}>
                              <summary>
                                <div>
                                  <strong>{model.name}</strong>
                                  <span>6 işlem · süreleri düzenlemek için açın</span>
                                </div>
                              </summary>

                              <div className="model-service-list">
                                {SERVICE_DEFINITIONS.map((service) => {
                                  const config = model.services?.[service.id]
                                  if (!config) return null
                                  return (
                                    <div className={`model-service-row ${config.active === false ? 'service-row-disabled' : ''}`} key={`${model.id}-${service.id}`}>
                                      <div className="model-service-name">
                                        <strong>{service.name}</strong>
                                        <small>{service.description}</small>
                                      </div>

                                      <label className="model-service-toggle">
                                        <input type="checkbox" checked={config.active === true} onChange={(e) => updateModelService(model.id, service.id, { active: e.target.checked })} />
                                        <span>{config.active === true ? 'Aktif' : 'Kapalı'}</span>
                                      </label>

                                      <div className="model-duration-editor">
                                        <label>
                                          <span>Saat</span>
                                          <input type="number" min="0" max="12" step="1" disabled={config.active === false} value={durationHours(config.durationMinutes)} onChange={(e) => updateModelServiceDurationPart(model.id, service.id, 'hours', e.target.value)} />
                                        </label>
                                        <label>
                                          <span>Dakika</span>
                                          <select disabled={config.active === false} value={durationExtraMinutes(config.durationMinutes)} onChange={(e) => updateModelServiceDurationPart(model.id, service.id, 'minutes', e.target.value)}>
                                            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((minute) => <option key={minute} value={minute}>{minute} dk</option>)}
                                          </select>
                                        </label>
                                      </div>

                                      <div className="model-duration-preview">≈ {formatDuration(config.durationMinutes)}</div>
                                    </div>
                                  )
                                })}
                              </div>
                            </details>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}

                <div className={`service-save-bar planning-save-bar ${planningDirty ? 'dirty' : 'saved'}`}>
                  <div>
                    <strong>{planningDirty ? 'Kaydedilmemiş süre değişiklikleri var.' : 'Model süreleri kayıtlı.'}</strong>
                    <span>Müşteri model + işlem seçtiğinde önerilen saatler bu sürelerden otomatik hesaplanır.</span>
                  </div>
                  <button className="primary-button" type="button" disabled={!planningDirty || actionId === 'service-planning'} onClick={handleSaveServicePlanning}>
                    {actionId === 'service-planning' ? 'Süreler kaydediliyor...' : 'Model Sürelerini Kaydet'}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  )
}
