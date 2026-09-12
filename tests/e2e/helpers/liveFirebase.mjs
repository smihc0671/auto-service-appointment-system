import fs from 'node:fs'
import path from 'node:path'
import {
  initializeApp,
  deleteApp,
} from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'

const E2E_PREFIX = 'E2E TEST'

function loadEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(filePath)) return {}

  const env = {}
  fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
    const value = line.trim()
    if (!value || value.startsWith('#')) return

    const index = value.indexOf('=')
    if (index < 1) return

    const key = value.slice(0, index).trim()
    let item = value.slice(index + 1).trim()

    if (
      (item.startsWith('"') && item.endsWith('"')) ||
      (item.startsWith("'") && item.endsWith("'"))
    ) {
      item = item.slice(1, -1)
    }

    env[key] = item
  })
  return env
}

export function readE2EEnv() {
  return {
    ...loadEnvFile('.env.local'),
    ...loadEnvFile('.env.e2e.local'),
    ...process.env,
  }
}

export function liveModeEnabled() {
  return readE2EEnv().E2E_LIVE === '1'
}

export function adminCredentialsAvailable() {
  const env = readE2EEnv()
  return Boolean(env.E2E_ADMIN_EMAIL && env.E2E_ADMIN_PASSWORD)
}

function firebaseConfigFromEnv(env) {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
}

function assertFirebaseConfig(config) {
  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error(
      '.env.local içinde Firebase ayarları bulunamadı. ' +
      'VITE_FIREBASE_API_KEY / PROJECT_ID / APP_ID alanlarını kontrol edin.',
    )
  }
}

export async function createFirebaseTestClient({ admin = false } = {}) {
  const env = readE2EEnv()
  const config = firebaseConfigFromEnv(env)
  assertFirebaseConfig(config)

  const app = initializeApp(config, `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const db = getFirestore(app)
  const auth = getAuth(app)

  if (admin) {
    if (!env.E2E_ADMIN_EMAIL || !env.E2E_ADMIN_PASSWORD) {
      await deleteApp(app).catch(() => {})
      throw new Error('.env.e2e.local içinde E2E_ADMIN_EMAIL ve E2E_ADMIN_PASSWORD gerekli.')
    }

    await signInWithEmailAndPassword(
      auth,
      env.E2E_ADMIN_EMAIL,
      env.E2E_ADMIN_PASSWORD,
    )
  }

  async function close() {
    await signOut(auth).catch(() => {})
    await deleteApp(app).catch(() => {})
  }

  return { app, db, auth, env, close }
}

export function isE2EAppointment(data = {}) {
  return (
    String(data.fullName || '').startsWith(E2E_PREFIX) ||
    String(data.note || '').includes('[E2E]')
  )
}

async function commitDeletes(db, refs) {
  const unique = [...new Map(refs.map((ref) => [ref.path, ref])).values()]
  const chunkSize = 400
  let deleted = 0

  for (let start = 0; start < unique.length; start += chunkSize) {
    const batch = writeBatch(db)
    const chunk = unique.slice(start, start + chunkSize)
    chunk.forEach((ref) => batch.delete(ref))
    await batch.commit()
    deleted += chunk.length
  }

  return deleted
}

export async function cleanupE2EArtifacts({ marker = '', verbose = true } = {}) {
  if (!adminCredentialsAvailable()) {
    if (verbose) {
      console.log('SKIP cleanup: admin test hesabı tanımlı değil.')
    }
    return { appointments: 0, reservations: 0 }
  }

  const client = await createFirebaseTestClient({ admin: true })
  const { db } = client

  try {
    const appointmentSnapshot = await getDocs(collection(db, 'appointments'))

    const targets = appointmentSnapshot.docs.filter((item) => {
      const data = item.data()
      if (!isE2EAppointment(data)) return false
      if (!marker) return true

      const searchable = [
        data.fullName,
        data.note,
        data.plate,
      ].map((value) => String(value || '')).join(' ')

      return searchable.includes(marker)
    })

    const reservationRefs = []
    const appointmentRefs = []

    for (const appointmentDoc of targets) {
      const data = appointmentDoc.data()
      appointmentRefs.push(appointmentDoc.ref)

      if (Array.isArray(data.reservationIds)) {
        data.reservationIds.forEach((reservationId) => {
          reservationRefs.push(doc(db, 'reservations', reservationId))
        })
      }

      // reservationIds alanı eski/bozuk bir kayıtta eksik olsa bile
      // appointmentId üzerinden bağlı rezervasyonları yakala.
      const reservationSnapshot = await getDocs(
        query(
          collection(db, 'reservations'),
          where('appointmentId', '==', appointmentDoc.id),
        ),
      )
      reservationSnapshot.docs.forEach((item) => reservationRefs.push(item.ref))
    }

    const reservations = await commitDeletes(db, reservationRefs)
    const appointments = await commitDeletes(db, appointmentRefs)

    if (verbose) {
      console.log(
        `CLEANUP: ${appointments} E2E randevu + ${reservations} rezervasyon kaydı silindi.`,
      )
    }

    return { appointments, reservations }
  } finally {
    await client.close()
  }
}

export async function findCleanLiveSlot({
  preferredDuration = 60,
  minimumOffsetDays = 14,
  maximumSearchDays = 36,
} = {}) {
  // Bu importlar yalnızca canlı slot bulma sırasında gerekir.
  // Cleanup artık uygulamanın scheduling/dateTime modüllerine bağımlı değildir.
  const [{ calculateAvailableStartTimes }, { addDays, isWorkingDay, toDateInputValue }] =
    await Promise.all([
      import('../../../src/utils/scheduling.js'),
      import('../../../src/utils/dateTime.js'),
    ])
  const client = await createFirebaseTestClient()
  const { db } = client

  try {
    const [settingsSnapshot, serviceSnapshot] = await Promise.all([
      getDoc(doc(db, 'shopSettings', 'main')),
      getDocs(collection(db, 'services')),
    ])

    if (!settingsSnapshot.exists()) {
      throw new Error('shopSettings/main bulunamadı.')
    }

    const settings = settingsSnapshot.data()
    const services = serviceSnapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((service) => service.active !== false)
      .sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999))

    if (!services.length) throw new Error('Aktif hizmet bulunamadı.')

    const service =
      services.find((item) => Number(item.durationMinutes) === preferredDuration) ||
      services.find((item) => Number(item.durationMinutes) <= 120) ||
      services[0]

    const today = new Date()
    today.setHours(12, 0, 0, 0)

    const maxAdvance = Math.max(
      minimumOffsetDays + 1,
      Math.min(
        Number(settings.maxAdvanceDays || 45) - 1,
        maximumSearchDays,
      ),
    )

    for (let offset = minimumOffsetDays; offset <= maxAdvance; offset += 1) {
      const date = toDateInputValue(addDays(today, offset))
      if (!isWorkingDay(date, settings)) continue

      const reservationSnapshot = await getDocs(
        query(collection(db, 'reservations'), where('date', '==', date)),
      )

      const reservations = reservationSnapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }))

      const availability = calculateAvailableStartTimes(
        date,
        Number(service.durationMinutes),
        settings,
        reservations,
      )

      const completelyFree = availability.find(
        (slot) =>
          slot.available &&
          Number(slot.availableResourceCount) === Number(settings.resourceCount),
      )

      if (completelyFree) {
        return {
          date,
          time: completelyFree.time,
          service,
          settings,
        }
      }
    }

    throw new Error(
      'Test için tüm liftleri boş olan güvenli bir gelecek saat bulunamadı. ' +
      'maximumSearchDays değerini artırabilirsiniz.',
    )
  } finally {
    await client.close()
  }
}

export async function readAppointmentsByMarker(marker) {
  const client = await createFirebaseTestClient({ admin: true })
  const { db } = client

  try {
    const snapshot = await getDocs(collection(db, 'appointments'))
    return snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => {
        const searchable = `${item.fullName || ''} ${item.note || ''} ${item.plate || ''}`
        return searchable.includes(marker)
      })
  } finally {
    await client.close()
  }
}

export async function anonymousAppointmentReadMustFail() {
  const client = await createFirebaseTestClient()
  try {
    await getDocs(collection(client.db, 'appointments'))
    return false
  } catch (error) {
    return String(error.code || '').includes('permission-denied')
  } finally {
    await client.close()
  }
}

export async function anonymousWriteMustFail(targetPath, payload) {
  const client = await createFirebaseTestClient()
  try {
    await import('firebase/firestore').then(async ({ setDoc }) => {
      await setDoc(doc(client.db, ...targetPath.split('/')), payload)
    })
    return false
  } catch (error) {
    return String(error.code || '').includes('permission-denied')
  } finally {
    await client.close()
  }
}

export { E2E_PREFIX }
