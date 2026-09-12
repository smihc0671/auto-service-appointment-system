import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  buildOccupiedTimes,
  compareAppointmentDateTime,
  createLegacySlotId,
  createReservationId,
  generateStartTimes,
  getEndTime,
  isWorkingDay,
  normalizePlainText,
  normalizePlate,
  phoneDigits,
  timeToMinutes,
  minutesToTime,
  toDateInputValue,
  addDays,
} from '../utils/dateTime'
import { calculateAvailableStartTimes, normalizePlanningSettings } from '../utils/scheduling'
import {
  getActiveServiceDurations,
  getCatalogModel,
  getModelServiceConfig,
  isFordBrand,
  normalizeServicePlanning,
  resolveVehicleModelId,
} from '../config/servicePlanning'
import { getBookingBootstrap as loadBookingBootstrap } from './configuration'
import { cachedLoad, invalidateCache } from './readCache'

const RESERVATION_CACHE_TTL_MS = 30_000
const ADMIN_APPOINTMENT_CACHE_TTL_MS = 15_000
const ADMIN_RESULT_LIMIT = 250
const LEGACY_UNIT_MINUTES = 30

function requireDatabase() {
  if (!db) throw new Error('Firebase yapılandırması tamamlanmamış.')
}

function reservationCacheKey(date) {
  return `oto-randevu:reservations:${date}`
}

function invalidateReservationDate(date) {
  if (date) invalidateCache(reservationCacheKey(date))
}

function invalidateAdminAppointments() {
  invalidateCache('oto-randevu:admin-appointments:')
}

export async function getReservationsForDate(date, { force = false } = {}) {
  requireDatabase()
  return cachedLoad(
    reservationCacheKey(date),
    async () => {
      const [reservationSnapshot, legacySlotSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'reservations'), where('date', '==', date))),
        getDocs(query(collection(db, 'slots'), where('date', '==', date))),
      ])

      const reservations = reservationSnapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }))

      legacySlotSnapshot.docs.forEach((item) => {
        const data = item.data()
        reservations.push({
          id: item.id,
          date: data.date,
          time: data.time,
          resourceNumber: 1,
          appointmentId: data.appointmentId,
          unitMinutes: LEGACY_UNIT_MINUTES,
          legacy: true,
        })
      })

      return reservations
    },
    {
      ttlMs: RESERVATION_CACHE_TTL_MS,
      storage: 'session',
      force,
    },
  )
}

export { calculateAvailableStartTimes } from '../utils/scheduling'

export async function getAvailabilityForDate(
  date,
  serviceDurationMinutes,
  settings,
  servicePlanning,
  { force = false } = {},
) {
  requireDatabase()
  const reservations = await getReservationsForDate(date, { force })
  return calculateAvailableStartTimes(date, serviceDurationMinutes, settings, reservations, {
    allServiceDurations: getActiveServiceDurations(servicePlanning),
  })
}

export async function findFirstAvailableDate(
  serviceDurationMinutes,
  rawSettings,
  servicePlanning,
  startDate = '',
) {
  const settings = normalizePlanningSettings(rawSettings)
  const today = new Date()
  const todayString = toDateInputValue(today)
  const requestedStart = startDate && startDate > todayString
    ? new Date(`${startDate}T12:00:00`)
    : today
  const absoluteMax = addDays(today, Number(settings.maxAdvanceDays ?? 45))

  for (let cursor = new Date(requestedStart); cursor <= absoluteMax; cursor = addDays(cursor, 1)) {
    const date = toDateInputValue(cursor)
    if (!isWorkingDay(date, settings)) continue
    const availability = await getAvailabilityForDate(date, serviceDurationMinutes, settings, servicePlanning)
    if (availability.some((slot) => slot.available)) return date
  }
  return ''
}

function floorTimeToLegacyUnit(time, unitMinutes = LEGACY_UNIT_MINUTES) {
  const minutes = timeToMinutes(time)
  return minutesToTime(Math.floor(minutes / unitMinutes) * unitMinutes)
}

export async function createAppointment(formData) {
  requireDatabase()

  const requiredYear = String(formData.vehicleYear || '').replace(/\D/g, '').slice(0, 4)
  const mileageText = String(formData.mileage ?? '').replace(/\D/g, '')
  const requiredMileage = mileageText === '' ? null : Number(mileageText)
  const maximumVehicleYear = new Date().getFullYear() + 1

  if (requiredYear.length !== 4 || Number(requiredYear) < 1950 || Number(requiredYear) > maximumVehicleYear) {
    throw new Error(`Model yılı 1950 ile ${maximumVehicleYear} arasında 4 haneli olarak girilmelidir.`)
  }
  if (requiredMileage === null || !Number.isInteger(requiredMileage) || requiredMileage < 0 || requiredMileage > 999999) {
    throw new Error('Kilometre bilgisi zorunludur ve 0 ile 999999 arasında olmalıdır.')
  }

  const appointmentRef = doc(collection(db, 'appointments'))
  const settingsRef = doc(db, 'shopSettings', 'main')
  const planningRef = doc(db, 'servicePlanning', 'main')

  await runTransaction(db, async (transaction) => {
    const settingsSnapshot = await transaction.get(settingsRef)
    const planningSnapshot = await transaction.get(planningRef)

    if (!settingsSnapshot.exists()) throw new Error('Servis çalışma ayarları henüz hazırlanmadı.')
    if (!planningSnapshot.exists()) throw new Error('Model ve işlem süreleri henüz hazırlanmadı. Yönetici panelinden bir kez kaydediniz.')

    const settings = normalizePlanningSettings(settingsSnapshot.data())
    const planning = normalizeServicePlanning(planningSnapshot.data())
    const brand = normalizePlainText(formData.vehicleBrand, 40).trim()
    const model = normalizePlainText(formData.vehicleModel, 50).trim()

    if (!isFordBrand(brand)) {
      throw new Error('Online randevu yalnız Ford marka araçlar için kullanılabilir.')
    }

    const modelId = resolveVehicleModelId(brand, model, planning)
    const catalogModel = getCatalogModel(modelId)
    if (!modelId || !catalogModel || catalogModel.name !== model) {
      throw new Error('Lütfen listeden geçerli bir Ford modeli seçiniz.')
    }

    const service = getModelServiceConfig(planning, modelId, formData.serviceId)

    if (!service?.active) throw new Error('Seçilen işlem bu Ford modeli için artık aktif değil. Lütfen sayfayı yenileyin.')
    const durationMinutes = Number(service.durationMinutes)

    if (!isWorkingDay(formData.date, settings)) throw new Error('Seçilen gün servis kapalı.')

    const validStartTimes = generateStartTimes(formData.date, settings, durationMinutes)
    if (!validStartTimes.includes(formData.time)) {
      throw new Error('Seçilen saat artık geçerli değil. Lütfen başka bir saat seçin.')
    }

    const occupiedTimes = buildOccupiedTimes(formData.time, durationMinutes, settings.slotMinutes)
    let chosenResource = null
    let chosenReservationRefs = []

    for (let resourceNumber = 1; resourceNumber <= settings.resourceCount; resourceNumber += 1) {
      const reservationRefs = occupiedTimes.map((time) =>
        doc(db, 'reservations', createReservationId(formData.date, resourceNumber, time)),
      )

      const exactSnapshots = []
      for (const reservationRef of reservationRefs) exactSnapshots.push(await transaction.get(reservationRef))
      if (exactSnapshots.some((snapshot) => snapshot.exists())) continue

      // v8.14 öncesinde 30 dakikalık rezervasyon belgeleri vardı. Yeni 5 dakikalık
      // başlangıçların eski kayıtların arasına sızmaması için kapsayan eski sınır
      // belgesini de kontrol ediyoruz. Yeni belgede unitMinutes=5 olduğu için yanlış
      // pozitif çakışma oluşturmaz.
      const legacyBoundaryRefs = new Map()
      occupiedTimes.forEach((time) => {
        const legacyTime = floorTimeToLegacyUnit(time)
        const ref = doc(db, 'reservations', createReservationId(formData.date, resourceNumber, legacyTime))
        legacyBoundaryRefs.set(ref.path, ref)
      })

      let legacyConflict = false
      for (const legacyRef of legacyBoundaryRefs.values()) {
        const snapshot = await transaction.get(legacyRef)
        if (snapshot.exists()) {
          const data = snapshot.data()
          if (!data.unitMinutes || Number(data.unitMinutes) >= LEGACY_UNIT_MINUTES) {
            legacyConflict = true
            break
          }
        }
      }

      if (resourceNumber === 1 && !legacyConflict) {
        const slotRefs = new Map()
        occupiedTimes.forEach((time) => {
          const legacyTime = floorTimeToLegacyUnit(time)
          const ref = doc(db, 'slots', createLegacySlotId(formData.date, legacyTime))
          slotRefs.set(ref.path, ref)
        })
        for (const slotRef of slotRefs.values()) {
          if ((await transaction.get(slotRef)).exists()) {
            legacyConflict = true
            break
          }
        }
      }

      if (!legacyConflict) {
        chosenResource = resourceNumber
        chosenReservationRefs = reservationRefs
        break
      }
    }

    if (!chosenResource) {
      const error = new Error('Bu başlangıç saati az önce doldu. Lütfen başka bir saat seçin.')
      error.code = 'slot-taken'
      throw error
    }

    const reservationIds = chosenReservationRefs.map((item) => item.id)
    const endTime = getEndTime(formData.time, durationMinutes, settings.slotMinutes)
    const combinedVehicle = ['Ford', model, requiredYear].filter(Boolean).join(' ')

    transaction.set(appointmentRef, {
      fullName: normalizePlainText(formData.fullName, 80).trim(),
      phone: phoneDigits(formData.phone),
      vehicle: combinedVehicle,
      vehicleBrand: 'Ford',
      vehicleModel: model,
      vehicleModelId: modelId,
      vehicleYear: requiredYear,
      mileage: requiredMileage,
      plate: normalizePlate(formData.plate).trim(),
      fuelType: formData.fuelType,
      serviceId: service.id,
      serviceName: service.name,
      serviceCategory: service.category,
      serviceDurationMinutes: durationMinutes,
      note: normalizePlainText(formData.note, 500).trim(),
      date: formData.date,
      time: formData.time,
      endTime,
      resourceNumber: chosenResource,
      resourceLabel: `${settings.resourceLabel} ${chosenResource}`,
      reservationIds,
      status: 'confirmed',
      createdAt: serverTimestamp(),
    })

    chosenReservationRefs.forEach((reservationRef, index) => {
      transaction.set(reservationRef, {
        appointmentId: appointmentRef.id,
        date: formData.date,
        time: occupiedTimes[index],
        resourceNumber: chosenResource,
        unitMinutes: settings.slotMinutes,
        createdAt: serverTimestamp(),
      })
    })
  })

  invalidateReservationDate(formData.date)
  invalidateAdminAppointments()
  return appointmentRef.id
}

function adminAppointmentCacheKey({ mode, date, today }) {
  return `oto-randevu:admin-appointments:${mode}:${date || ''}:${today || ''}`
}

export async function getAppointmentsForView(
  { mode = 'upcoming', date = '', today = toDateInputValue(new Date()) } = {},
  { force = false } = {},
) {
  requireDatabase()
  return cachedLoad(
    adminAppointmentCacheKey({ mode, date, today }),
    async () => {
      let targetQuery
      if (mode === 'today') {
        targetQuery = query(collection(db, 'appointments'), where('date', '==', today))
      } else if (mode === 'date') {
        targetQuery = query(collection(db, 'appointments'), where('date', '==', date || today))
      } else if (mode === 'past') {
        targetQuery = query(collection(db, 'appointments'), where('date', '<', today), orderBy('date', 'desc'), limit(ADMIN_RESULT_LIMIT))
      } else {
        targetQuery = query(collection(db, 'appointments'), where('date', '>=', today), orderBy('date', 'asc'), limit(ADMIN_RESULT_LIMIT))
      }
      const snapshot = await getDocs(targetQuery)
      return snapshot.docs
        .map((appointmentDoc) => ({ id: appointmentDoc.id, ...appointmentDoc.data() }))
        .sort(compareAppointmentDateTime)
    },
    { ttlMs: ADMIN_APPOINTMENT_CACHE_TTL_MS, force },
  )
}

export async function getAllAppointments() {
  requireDatabase()
  const snapshot = await getDocs(collection(db, 'appointments'))
  return snapshot.docs
    .map((appointmentDoc) => ({ id: appointmentDoc.id, ...appointmentDoc.data() }))
    .sort(compareAppointmentDateTime)
}

export async function changeAppointmentStatus(appointment, nextStatus) {
  requireDatabase()
  if (appointment.status === 'cancelled' && nextStatus !== 'cancelled') {
    throw new Error('İptal edilmiş randevu yeniden etkinleştirilemez.')
  }
  const appointmentRef = doc(db, 'appointments', appointment.id)
  if (nextStatus === 'cancelled' && appointment.status !== 'cancelled') {
    const batch = writeBatch(db)
    batch.update(appointmentRef, { status: nextStatus, updatedAt: serverTimestamp() })
    if (Array.isArray(appointment.reservationIds)) {
      appointment.reservationIds.forEach((reservationId) => batch.delete(doc(db, 'reservations', reservationId)))
    }
    if (appointment.slotId) batch.delete(doc(db, 'slots', appointment.slotId))
    await batch.commit()
    invalidateReservationDate(appointment.date)
    invalidateAdminAppointments()
    return
  }
  await updateDoc(appointmentRef, { status: nextStatus, updatedAt: serverTimestamp() })
  invalidateAdminAppointments()
}

export async function removeAppointment(appointment) {
  requireDatabase()
  const batch = writeBatch(db)
  batch.delete(doc(db, 'appointments', appointment.id))
  if (Array.isArray(appointment.reservationIds)) {
    appointment.reservationIds.forEach((reservationId) => batch.delete(doc(db, 'reservations', reservationId)))
  }
  if (appointment.slotId) batch.delete(doc(db, 'slots', appointment.slotId))
  await batch.commit()
  invalidateReservationDate(appointment.date)
  invalidateAdminAppointments()
}

export async function getBookingBootstrap(options) {
  return loadBookingBootstrap(options)
}
