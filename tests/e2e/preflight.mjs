import fs from 'node:fs'
import path from 'node:path'
import { readE2EEnv } from './helpers/liveFirebase.mjs'

const requireLive = process.argv.includes('--require-live')
const root = process.cwd()
const e2ePath = path.resolve(root, '.env.e2e.local')
const env = readE2EEnv()

let failed = false

function ok(message) {
  console.log(`PASS  ${message}`)
}

function fail(message) {
  failed = true
  console.error(`FAIL  ${message}`)
}

console.log('\n=== TEST ÖN KONTROL ===')

if (fs.existsSync(path.resolve(root, '.env.local'))) {
  ok('.env.local bulundu')
} else {
  fail('.env.local bulunamadı')
}

if (fs.existsSync(e2ePath)) {
  ok('.env.e2e.local bulundu')
} else {
  fail('.env.e2e.local bulunamadı')

  const suspicious = fs.readdirSync(root).filter((name) =>
    name.toLowerCase().startsWith('.env.e2e.local'),
  )

  if (suspicious.length) {
    console.error(`      Benzer dosya(lar): ${suspicious.join(', ')}`)
    console.error('      Windows uzantıyı gizleyip .txt eklemiş olabilir.')
  }
}

if (env.VITE_FIREBASE_PROJECT_ID) {
  ok(`Firebase project: ${env.VITE_FIREBASE_PROJECT_ID}`)
} else {
  fail('VITE_FIREBASE_PROJECT_ID okunamadı')
}

if (env.E2E_ADMIN_EMAIL) {
  ok(`Admin e-posta tanımlı: ${env.E2E_ADMIN_EMAIL}`)
} else {
  fail('E2E_ADMIN_EMAIL boş')
}

if (env.E2E_ADMIN_PASSWORD) {
  ok('Admin şifre tanımlı')
} else {
  fail('E2E_ADMIN_PASSWORD boş')
}

if (env.E2E_LIVE === '1') {
  ok('E2E_LIVE=1 — canlı Firebase testleri AÇIK')
} else if (requireLive) {
  fail(`E2E_LIVE=1 değil (okunan değer: ${JSON.stringify(env.E2E_LIVE || '')})`)
} else {
  console.log(`INFO  E2E_LIVE=${JSON.stringify(env.E2E_LIVE || '')}`)
}

const requiredFiles = [
  'src/utils/scheduling.js',
  'src/utils/dateTime.js',
  'src/config/shopConfig.js',
  'src/utils/pricing.js',
]

for (const file of requiredFiles) {
  if (fs.existsSync(path.resolve(root, file))) {
    ok(`${file} bulundu`)
  } else {
    fail(`${file} bulunamadı`)
  }
}

console.log('')
process.exit(failed ? 2 : 0)
