import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cacheAndFetch,
  primeImageCache,
  collectMenuImageUrls,
  flushImageCache,
  startImageCacheRetry,
  _stopImageCacheRetryForTests,
} from '../core/utils/offlineCache'
import { clearReferenceCache, getCacheEntry, setCacheEntry } from '../core/db/aycDb'

beforeEach(async () => {
  await clearReferenceCache()
  Object.defineProperty(navigator, 'onLine', { writable: true, value: true })
})

afterEach(() => {
  _stopImageCacheRetryForTests()
})

describe('cacheAndFetch — online', () => {
  it('returns fresh data and caches it', async () => {
    const fetchData = vi.fn().mockResolvedValue({ categories: [{ id: 1 }] })

    const result = await cacheAndFetch('menu', fetchData)

    expect(result).toEqual({ categories: [{ id: 1 }] })
    expect((await getCacheEntry('menu')).data).toEqual({ categories: [{ id: 1 }] })
  })

  it('overwrites a stale cached value with the fresh fetch', async () => {
    await cacheAndFetch('menu', vi.fn().mockResolvedValue({ categories: [] }))

    const result = await cacheAndFetch('menu', vi.fn().mockResolvedValue({ categories: [{ id: 9 }] }))

    expect(result).toEqual({ categories: [{ id: 9 }] })
  })

  it('falls back to cached data on ERR_NETWORK', async () => {
    await cacheAndFetch('menu', vi.fn().mockResolvedValue({ categories: [{ id: 1 }] }))

    const netError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
    const result = await cacheAndFetch('menu', vi.fn().mockRejectedValue(netError))

    expect(result).toEqual({ categories: [{ id: 1 }] })
  })

  it('throws on ERR_NETWORK when nothing is cached yet', async () => {
    const netError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })

    await expect(cacheAndFetch('menu', vi.fn().mockRejectedValue(netError))).rejects.toThrow('Network Error')
  })

  it('re-throws non-network errors even when a cached value exists', async () => {
    await cacheAndFetch('menu', vi.fn().mockResolvedValue({ categories: [{ id: 1 }] }))
    const serverError = Object.assign(new Error('Server Error'), { response: { status: 500 } })

    await expect(cacheAndFetch('menu', vi.fn().mockRejectedValue(serverError))).rejects.toThrow('Server Error')
  })
})

describe('cacheAndFetch — offline', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false })
  })

  it('returns cached data without calling fetchData', async () => {
    // Seed the cache while online, then go offline for the read.
    Object.defineProperty(navigator, 'onLine', { writable: true, value: true })
    await cacheAndFetch('menu', vi.fn().mockResolvedValue({ categories: [{ id: 1 }] }))
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false })

    const fetchData = vi.fn()
    const result = await cacheAndFetch('menu', fetchData)

    expect(fetchData).not.toHaveBeenCalled()
    expect(result).toEqual({ categories: [{ id: 1 }] })
  })

  it('returns null when nothing has ever been cached', async () => {
    const result = await cacheAndFetch('menu', vi.fn())

    expect(result).toBeNull()
  })
})

describe('collectMenuImageUrls', () => {
  it('collects image_url from items nested under sub_category', () => {
    const menu = {
      categories: [{
        id: 1,
        sub_category: [{ items: [{ id: 10, image_url: 'a.jpg' }, { id: 11, image_url: null }] }],
      }],
    }

    expect(collectMenuImageUrls(menu)).toEqual(['a.jpg'])
  })

  it('collects image_url from orphan items directly under a category', () => {
    const menu = { categories: [{ id: 1, items: [{ id: 10, image_url: 'b.jpg' }] }] }

    expect(collectMenuImageUrls(menu)).toEqual(['b.jpg'])
  })

  it('returns an empty array for an empty or missing menu', () => {
    expect(collectMenuImageUrls(null)).toEqual([])
    expect(collectMenuImageUrls({ categories: [] })).toEqual([])
  })
})

describe('primeImageCache', () => {
  it('fires a fetch for every non-empty url and swallows failures', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({})

    await primeImageCache(['a.jpg', null, 'b.jpg'])

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy).toHaveBeenCalledWith('a.jpg')
    expect(fetchSpy).toHaveBeenCalledWith('b.jpg')
    fetchSpy.mockRestore()
  })

  it('does not throw when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    await expect(primeImageCache(['a.jpg'])).resolves.not.toThrow()
    vi.restoreAllMocks()
  })

  it('persists failed urls to the pending_images cache entry', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
      url === 'bad.jpg' ? Promise.reject(new Error('offline')) : Promise.resolve({}),
    )

    await primeImageCache(['good.jpg', 'bad.jpg'])

    expect((await getCacheEntry('pending_images')).data).toEqual(['bad.jpg'])
    vi.restoreAllMocks()
  })

  it('clears a url from pending once a later attempt succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await primeImageCache(['a.jpg'])
    expect((await getCacheEntry('pending_images')).data).toEqual(['a.jpg'])

    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({})
    await primeImageCache(['a.jpg'])

    expect((await getCacheEntry('pending_images')).data).toEqual([])
    vi.restoreAllMocks()
  })
})

describe('flushImageCache', () => {
  it('does nothing when offline', async () => {
    await setCacheEntry('pending_images', ['a.jpg'])
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await flushImageCache()

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('does nothing when nothing is pending', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await flushImageCache()

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('retries pending urls, clearing the ones that now succeed', async () => {
    await setCacheEntry('pending_images', ['a.jpg', 'b.jpg'])
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
      url === 'b.jpg' ? Promise.reject(new Error('still offline')) : Promise.resolve({}),
    )

    await flushImageCache()

    expect((await getCacheEntry('pending_images')).data).toEqual(['b.jpg'])
    vi.restoreAllMocks()
  })
})

describe('startImageCacheRetry', () => {
  it('flushes immediately when already online', async () => {
    await setCacheEntry('pending_images', ['a.jpg'])
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({})

    startImageCacheRetry()

    await vi.waitFor(async () => expect((await getCacheEntry('pending_images')).data).toEqual([]))
    vi.restoreAllMocks()
  })

  it('flushes on the online event', async () => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false })
    await setCacheEntry('pending_images', ['a.jpg'])
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({})
    startImageCacheRetry()

    Object.defineProperty(navigator, 'onLine', { writable: true, value: true })
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(async () => expect((await getCacheEntry('pending_images')).data).toEqual([]))
    vi.restoreAllMocks()
  })
})
