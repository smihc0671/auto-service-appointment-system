import {
  buildOccupiedTimes,
  generateStartTimes,
  getEndTime,
  isWorkingDay,
  minutesToTime,
  timeToMinutes,
  toDateInputValue,
} from './dateTime.js'

const MAX_RECOMMENDATIONS = 6
const LEGACY_RESERVATION_MINUTES = 30

export function normalizePlanningSettings(settings = {}) {
  return {
    ...settings,
    slotMinutes: 5,
    resourceCount: Math.max(1, Number(settings.resourceCount) || 1),
    resourceLabel: settings.resourceLabel || 'Lift',
  }
}

function expandReservationTimes(reservation, unitMinutes) {
  const sourceMinutes = Number(reservation?.unitMinutes) || LEGACY_RESERVATION_MINUTES
  const duration = Math.max(unitMinutes, sourceMinutes)
  return buildOccupiedTimes(reservation.time, duration, unitMinutes)
}

function buildFreeIntervals(occupiedSet, settings) {
  const unit = settings.slotMinutes
  const opening = timeToMinutes(settings.workingHours.start)
  const closing = timeToMinutes(settings.workingHours.end)
  const intervals = []
  let freeStart = null

  for (let cursor = opening; cursor < closing; cursor += unit) {
    const occupied = occupiedSet.has(minutesToTime(cursor))
    if (!occupied && freeStart == null) freeStart = cursor
    if (occupied && freeStart != null) {
      intervals.push({ start: freeStart, end: cursor })
      freeStart = null
    }
  }

  if (freeStart != null) intervals.push({ start: freeStart, end: closing })
  return intervals
}

function candidateStarts(interval, duration, allDurations, unitMinutes) {
  const starts = new Set()
  const length = interval.end - interval.start
  if (length < duration) return []

  const add = (value) => {
    const rounded = Math.round(value / unitMinutes) * unitMinutes
    if (rounded >= interval.start && rounded + duration <= interval.end) starts.add(rounded)
  }

  // Önce boşluğun iki sınırı. Sonra başka tam işlemler bırakabilecek sınırlar.
  add(interval.start)
  add(interval.end - duration)

  allDurations.forEach((otherDuration) => {
    add(interval.start + otherDuration)
    add(interval.end - duration - otherDuration)
  })

  // Tamamen boş bir günde de yalnız 08:30 / kapanış göstermek yerine işi blok blok
  // yerleştiren birkaç mantıklı alternatif üret.
  for (let cursor = interval.start + duration; cursor + duration <= interval.end; cursor += duration) {
    add(cursor)
    if (starts.size > 18) break
  }

  return [...starts]
}

function gapUseful(gapMinutes, minimumUsefulDuration) {
  return gapMinutes === 0 || gapMinutes >= minimumUsefulDuration
}

export function calculateAvailableStartTimes(
  date,
  serviceDurationMinutes,
  rawSettings,
  reservations = [],
  { allServiceDurations = [] } = {},
) {
  const settings = normalizePlanningSettings(rawSettings)
  const durationMinutes = Number(serviceDurationMinutes)

  if (
    !date
    || !Number.isFinite(durationMinutes)
    || durationMinutes <= 0
    || durationMinutes % settings.slotMinutes !== 0
    || !isWorkingDay(date, settings)
  ) return []

  const allDurations = [...new Set([
    durationMinutes,
    ...(allServiceDurations || []).map(Number).filter((value) => Number.isFinite(value) && value > 0),
  ])].sort((a, b) => a - b)
  const minimumUsefulDuration = allDurations[0] || durationMinutes

  const occupiedByResource = new Map()
  for (let resourceNumber = 1; resourceNumber <= settings.resourceCount; resourceNumber += 1) {
    occupiedByResource.set(resourceNumber, new Set())
  }

  reservations.forEach((reservation) => {
    const resourceNumber = Number(reservation.resourceNumber || 1)
    if (!occupiedByResource.has(resourceNumber)) occupiedByResource.set(resourceNumber, new Set())
    const occupied = occupiedByResource.get(resourceNumber)
    expandReservationTimes(reservation, settings.slotMinutes).forEach((time) => occupied.add(time))
  })

  const validStartSet = new Set(generateStartTimes(date, settings, durationMinutes))
  const candidatesByTime = new Map()

  for (let resourceNumber = 1; resourceNumber <= settings.resourceCount; resourceNumber += 1) {
    const occupied = occupiedByResource.get(resourceNumber) || new Set()
    const intervals = buildFreeIntervals(occupied, settings)

    intervals.forEach((interval) => {
      candidateStarts(interval, durationMinutes, allDurations, settings.slotMinutes).forEach((startMinutes) => {
        const time = minutesToTime(startMinutes)
        if (!validStartSet.has(time)) return

        const leftGap = startMinutes - interval.start
        const rightGap = interval.end - (startMinutes + durationMinutes)
        const efficient = gapUseful(leftGap, minimumUsefulDuration) && gapUseful(rightGap, minimumUsefulDuration)
        const fragmentation = Number(leftGap > 0) + Number(rightGap > 0)
        const score = (efficient ? 0 : 100000) + fragmentation * 1000 + startMinutes

        const current = candidatesByTime.get(time) || {
          time,
          endTime: getEndTime(time, durationMinutes, settings.slotMinutes),
          available: true,
          availableResources: [],
          availableResourceCount: 0,
          efficient,
          score,
        }

        if (!current.availableResources.includes(resourceNumber)) current.availableResources.push(resourceNumber)
        current.availableResourceCount = current.availableResources.length
        current.efficient = current.efficient || efficient
        current.score = Math.min(current.score, score)
        candidatesByTime.set(time, current)
      })
    })
  }

  const sorted = [...candidatesByTime.values()]
    .sort((a, b) => a.score - b.score || timeToMinutes(a.time) - timeToMinutes(b.time))
    .slice(0, MAX_RECOMMENDATIONS)

  return sorted.map((slot, index) => ({
    ...slot,
    recommended: index === 0,
  }))
}
