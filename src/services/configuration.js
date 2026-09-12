import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { DEFAULT_SHOP_SETTINGS } from '../config/shopConfig'
import { normalizeServicePlanning } from '../config/servicePlanning'
import { cachedLoad, invalidateCache } from './readCache'

const BOOTSTRAP_CACHE_KEY = 'oto-randevu:bootstrap:v10'
const BOOTSTRAP_CACHE_TTL_MS = 5 * 60 * 1000

function requireDatabase() {
  if (!db) throw new Error('Firebase yapılandırması tamamlanmamış.')
}

function normalizeStaffContacts(value) {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 6)
    .map((item) => ({
      name: String(item?.name || '').trim().slice(0, 80),
      phone: String(item?.phone || '').trim().slice(0, 30),
    }))
    .filter((item) => item.name || item.phone)
}

function normalizeSettings(data = {}) {
  return {
    ...DEFAULT_SHOP_SETTINGS,
    ...data,
    // v8.14 ile yarım saatlik slot mantığı bitti. Eski Firestore belgesinde 30
    // kalsa bile istemcide 5 dakikalık iç kilit birimine zorlanır.
    slotMinutes: 5,
    workingDays: Array.isArray(data.workingDays) ? data.workingDays : DEFAULT_SHOP_SETTINGS.workingDays,
    workingHours: {
      ...DEFAULT_SHOP_SETTINGS.workingHours,
      ...(data.workingHours || {}),
    },
    contactPhone: String(data.contactPhone || DEFAULT_SHOP_SETTINGS.contactPhone || '').trim().slice(0, 30),
    whatsappPhone: String(data.whatsappPhone || DEFAULT_SHOP_SETTINGS.whatsappPhone || '').trim().slice(0, 30),
    address: String(data.address || DEFAULT_SHOP_SETTINGS.address || '').trim().slice(0, 240),
    staffContacts: normalizeStaffContacts(data.staffContacts),
  }
}

export function invalidatePublicConfigurationCache() {
  invalidateCache('oto-randevu:bootstrap:')
}

export async function getShopSettings() {
  requireDatabase()
  const snapshot = await getDoc(doc(db, 'shopSettings', 'main'))
  return snapshot.exists() ? normalizeSettings(snapshot.data()) : normalizeSettings()
}

export async function saveShopSettings(settings) {
  requireDatabase()
  const normalized = normalizeSettings(settings)
  await setDoc(doc(db, 'shopSettings', 'main'), {
    ...normalized,
    slotMinutes: 5,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  invalidatePublicConfigurationCache()
}

export async function getServicePlanning() {
  requireDatabase()
  const snapshot = await getDoc(doc(db, 'servicePlanning', 'main'))
  return snapshot.exists()
    ? normalizeServicePlanning(snapshot.data())
    : normalizeServicePlanning()
}

export async function saveServicePlanning(rawPlanning) {
  requireDatabase()
  const planning = normalizeServicePlanning(rawPlanning)
  await setDoc(doc(db, 'servicePlanning', 'main'), {
    ...planning,
    updatedAt: serverTimestamp(),
  }, { merge: false })
  invalidatePublicConfigurationCache()
  return planning
}

export async function ensureBaseConfiguration() {
  requireDatabase()
  const settingsRef = doc(db, 'shopSettings', 'main')
  const planningRef = doc(db, 'servicePlanning', 'main')
  const [settingsSnapshot, planningSnapshot] = await Promise.all([
    getDoc(settingsRef),
    getDoc(planningRef),
  ])

  const batch = writeBatch(db)
  let hasWrites = false

  if (!settingsSnapshot.exists()) {
    batch.set(settingsRef, {
      ...DEFAULT_SHOP_SETTINGS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    hasWrites = true
  }

  if (!planningSnapshot.exists()) {
    batch.set(planningRef, {
      ...normalizeServicePlanning(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    hasWrites = true
  } else if (planningSnapshot.data()?.version !== 2) {
    // v8.15: eski geniş katalogdaki sürelerden yalnız korunan Ford modellerini
    // taşır; diğer marka/listede-yok ve kaldırılan Ford modellerini temizler.
    batch.set(planningRef, {
      ...normalizeServicePlanning(planningSnapshot.data()),
      updatedAt: serverTimestamp(),
    }, { merge: false })
    hasWrites = true
  }

  if (hasWrites) {
    await batch.commit()
    invalidatePublicConfigurationCache()
  }
}

export async function getBookingBootstrap({ force = false } = {}) {
  requireDatabase()
  return cachedLoad(
    BOOTSTRAP_CACHE_KEY,
    async () => {
      const [settings, servicePlanning] = await Promise.all([
        getShopSettings(),
        getServicePlanning(),
      ])
      return { settings, servicePlanning }
    },
    {
      ttlMs: BOOTSTRAP_CACHE_TTL_MS,
      storage: 'local',
      force,
    },
  )
}
