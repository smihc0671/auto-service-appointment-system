import {
  adminCredentialsAvailable,
  cleanupE2EArtifacts,
  liveModeEnabled,
} from './helpers/liveFirebase.mjs'

export default async function globalTeardown() {
  if (!liveModeEnabled() || !adminCredentialsAvailable()) return

  console.log('\n=== TEST SONRASI TEMİZLİK ===')
  await cleanupE2EArtifacts({ verbose: true })
}
