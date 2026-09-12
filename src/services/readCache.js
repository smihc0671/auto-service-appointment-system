const memoryCache = new Map()
const inFlight = new Map()

function storageFor(kind) {
  if (typeof window === 'undefined') return null
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

function readStorage(key, kind) {
  const storage = storageFor(kind)
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      storage.removeItem(key)
      return null
    }
    return parsed.value
  } catch {
    try { storage.removeItem(key) } catch { /* ignore */ }
    return null
  }
}

function writeStorage(key, value, ttlMs, kind) {
  const storage = storageFor(kind)
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify({
      expiresAt: Date.now() + ttlMs,
      value,
    }))
  } catch {
    // Storage dolu/kapalıysa uygulama Firestore üzerinden çalışmaya devam eder.
  }
}

export async function cachedLoad(
  key,
  loader,
  {
    ttlMs = 30_000,
    storage = null,
    force = false,
  } = {},
) {
  const now = Date.now()

  if (!force) {
    const memoryEntry = memoryCache.get(key)
    if (memoryEntry && memoryEntry.expiresAt > now) return memoryEntry.value

    if (storage) {
      const stored = readStorage(key, storage)
      if (stored !== null) {
        memoryCache.set(key, { value: stored, expiresAt: now + ttlMs })
        return stored
      }
    }

    if (inFlight.has(key)) return inFlight.get(key)
  }

  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs })
      if (storage) writeStorage(key, value, ttlMs, storage)
      return value
    })
    .finally(() => inFlight.delete(key))

  inFlight.set(key, promise)
  return promise
}

export function invalidateCache(prefix = '') {
  for (const key of [...memoryCache.keys()]) {
    if (!prefix || key.startsWith(prefix)) memoryCache.delete(key)
  }

  if (typeof window === 'undefined') return
  for (const kind of ['local', 'session']) {
    const storage = storageFor(kind)
    if (!storage) continue
    try {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index)
        if (key && key.startsWith('oto-randevu:') && (!prefix || key.startsWith(prefix))) {
          storage.removeItem(key)
        }
      }
    } catch {
      // ignore
    }
  }
}
