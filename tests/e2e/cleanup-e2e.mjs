import { cleanupE2EArtifacts } from './helpers/liveFirebase.mjs'

try {
  console.log('\n=== ZORUNLU E2E TEMİZLİĞİ ===')
  const result = await cleanupE2EArtifacts({ verbose: true })
  console.log(
    `Temizlik tamamlandı: ${result.appointments} randevu, ${result.reservations} rezervasyon.`,
  )
  process.exit(0)
} catch (error) {
  console.error('TEMİZLİK BAŞARISIZ:', error)
  process.exit(2)
}
