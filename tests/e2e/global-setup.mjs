import {
  adminCredentialsAvailable,
  cleanupE2EArtifacts,
  liveModeEnabled,
} from './helpers/liveFirebase.mjs'

export default async function globalSetup() {
  if (!liveModeEnabled()) {
    console.log('\nE2E_LIVE=1 değil: canlı Firebase yazma testleri atlanacak.\n')
    return
  }

  if (!adminCredentialsAvailable()) {
    console.log('\nAdmin bilgileri yok: canlı testler ve otomatik temizlik atlanacak.\n')
    return
  }

  console.log('\n=== TEST ÖNCESİ TEMİZLİK ===')
  await cleanupE2EArtifacts({ verbose: true })
}
