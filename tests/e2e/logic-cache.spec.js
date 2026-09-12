import { test, expect } from '@playwright/test'
import { cachedLoad, invalidateCache } from '../../src/services/readCache.js'

test.describe('Firestore read cache', () => {
  test.beforeEach(() => {
    invalidateCache()
  })

  test('aynı anahtar TTL içinde loaderı yalnızca bir kez çalıştırır', async () => {
    let calls = 0
    const loader = async () => {
      calls += 1
      return { value: calls }
    }

    const first = await cachedLoad('oto-randevu:test:cache-1', loader, { ttlMs: 5_000 })
    const second = await cachedLoad('oto-randevu:test:cache-1', loader, { ttlMs: 5_000 })

    expect(first).toEqual({ value: 1 })
    expect(second).toEqual({ value: 1 })
    expect(calls).toBe(1)
  })

  test('aynı anda gelen iki istek tek in-flight isteği paylaşır', async () => {
    let calls = 0

    const loader = async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 50))
      return 'ok'
    }

    const [a, b, c] = await Promise.all([
      cachedLoad('oto-randevu:test:cache-2', loader, { ttlMs: 5_000 }),
      cachedLoad('oto-randevu:test:cache-2', loader, { ttlMs: 5_000 }),
      cachedLoad('oto-randevu:test:cache-2', loader, { ttlMs: 5_000 }),
    ])

    expect([a, b, c]).toEqual(['ok', 'ok', 'ok'])
    expect(calls).toBe(1)
  })

  test('force true cachei atlar', async () => {
    let calls = 0
    const loader = async () => ++calls

    expect(
      await cachedLoad('oto-randevu:test:cache-3', loader, { ttlMs: 5_000 }),
    ).toBe(1)

    expect(
      await cachedLoad('oto-randevu:test:cache-3', loader, {
        ttlMs: 5_000,
        force: true,
      }),
    ).toBe(2)
  })

  test('prefix invalidate yalnız ilgili cacheleri temizler', async () => {
    let a = 0
    let b = 0

    await cachedLoad('oto-randevu:test:a:1', async () => ++a, { ttlMs: 5_000 })
    await cachedLoad('oto-randevu:test:b:1', async () => ++b, { ttlMs: 5_000 })

    invalidateCache('oto-randevu:test:a:')

    await cachedLoad('oto-randevu:test:a:1', async () => ++a, { ttlMs: 5_000 })
    await cachedLoad('oto-randevu:test:b:1', async () => ++b, { ttlMs: 5_000 })

    expect(a).toBe(2)
    expect(b).toBe(1)
  })
})
