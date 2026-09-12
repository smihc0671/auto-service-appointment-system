import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

import {
  createFirebaseTestClient,
  readE2EEnv,
} from '../e2e/helpers/liveFirebase.mjs'

let failed = false

async function allowed(label, action) {
  try {
    await action()
    console.log(`PASS  ${label}`)
  } catch (error) {
    failed = true
    console.error(`FAIL  ${label}: ${error.code || error.message}`)
  }
}

async function denied(label, action) {
  try {
    await action()
    failed = true
    console.error(`FAIL  ${label}: erişim beklenmedik şekilde izinli.`)
  } catch (error) {
    const text = `${error.code || ''} ${error.message || ''}`
    if (/permission-denied|permission/i.test(text)) {
      console.log(`PASS  ${label}`)
    } else {
      failed = true
      console.error(`FAIL  ${label}: beklenmeyen hata ${text}`)
    }
  }
}

const env = readE2EEnv()

console.log('\n=== ANONİM MÜŞTERİ GÜVENLİK TESTİ ===')
const anonymous = await createFirebaseTestClient()

try {
  const { db } = anonymous

  await allowed(
    'services anonim okunabilir',
    () => getDocs(query(collection(db, 'services'), limit(1))),
  )

  await allowed(
    'shopSettings anonim okunabilir',
    () => getDoc(doc(db, 'shopSettings', 'main')),
  )

  await allowed(
    'reservations anonim okunabilir (PII yok)',
    () => getDocs(query(collection(db, 'reservations'), limit(1))),
  )

  await allowed(
    'servicePlanning anonim okunabilir',
    () => getDoc(doc(db, 'servicePlanning', 'main')),
  )

  await denied(
    'appointments anonim okunamaz',
    () => getDocs(query(collection(db, 'appointments'), limit(1))),
  )

  await denied(
    'admins anonim okunamaz',
    () => getDoc(doc(db, 'admins', 'rastgele-uid')),
  )


  await denied(
    'anonim kullanıcı service yazamaz',
    () => setDoc(doc(db, 'services', `e2e-denied-${Date.now()}`), {
      name: 'E2E DENIED',
      active: true,
      durationMinutes: 60,
    }),
  )

  await denied(
    'anonim kullanıcı shopSettings değiştiremez',
    () => updateDoc(doc(db, 'shopSettings', 'main'), {
      resourceCount: 99,
    }),
  )

  await denied(
    'anonim kullanıcı servicePlanning değiştiremez',
    () => updateDoc(doc(db, 'servicePlanning', 'main'), { version: 999 }),
  )
} finally {
  await anonymous.close()
}

if (env.E2E_ADMIN_EMAIL && env.E2E_ADMIN_PASSWORD) {
  console.log('\n=== ADMIN GÜVENLİK TESTİ ===')

  const admin = await createFirebaseTestClient({ admin: true })
  try {
    const { db } = admin

    await allowed(
      'admin appointments okuyabilir',
      () => getDocs(query(collection(db, 'appointments'), limit(1))),
    )

    await allowed(
      'admin servicePlanning okuyabilir',
      () => getDoc(doc(db, 'servicePlanning', 'main')),
    )


    const ownUid = admin.auth.currentUser?.uid
    if (ownUid) {
      await allowed(
        'admin kendi admins belgesini okuyabilir',
        () => getDoc(doc(db, 'admins', ownUid)),
      )
    }
  } finally {
    await admin.close()
  }
} else {
  console.log('SKIP  Admin güvenlik testi: .env.e2e.local admin bilgileri yok.')
}

console.log('')
process.exit(failed ? 1 : 0)
