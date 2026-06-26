/**
 * Reference-data cache for the AYC PWA — menu, device config, session config.
 *
 * Non-personal, device-level data only. Never session-scoped, never wiped on
 * session end (see aycDb.js's reference_cache store). Guest-personal data
 * never belongs here — that stays in Redux memory / guestProfile.js per the
 * existing rule.
 *
 * Stale-while-revalidate: cached data renders instantly (works offline);
 * a fresh fetch overwrites the cache in the background whenever online.
 *
 * DO NOT regenerate this file. Contact Rushiraj if behaviour must change.
 */

import { getCacheEntry, setCacheEntry } from '../db/aycDb'

/**
 * @template T
 * @param {string} key            Cache key, e.g. 'menu', 'device_config'.
 * @param {() => Promise<T>} fetchData  Resolves to the already-unwrapped data
 *   (i.e. `res.data.data`, not the raw axios response).
 * @returns {Promise<T|null>} Fresh data when the fetch succeeds; otherwise the
 *   last cached value; `null` if neither is available (never been online).
 */
export const cacheAndFetch = async (key, fetchData) => {
  if (!navigator.onLine) {
    const cached = await getCacheEntry(key)
    return cached?.data ?? null
  }

  try {
    const fresh = await fetchData()
    await setCacheEntry(key, fresh)
    return fresh
  } catch (err) {
    if (err?.code === 'ERR_NETWORK') {
      const cached = await getCacheEntry(key)
      if (cached) return cached.data
    }
    throw err
  }
}

/**
 * Proactively warms the Cache Storage entry for each image URL (via the
 * Workbox CacheFirst runtimeCaching route configured in vite.config.js),
 * rather than waiting for a guest to scroll an <img> into view. Fire-and-forget
 * — a priming failure must never block menu rendering.
 * @param {string[]} urls
 */
export const primeImageCache = (urls = []) => {
  urls.filter(Boolean).forEach((url) => {
    fetch(url).catch(() => {})
  })
}

/**
 * Walks the normalized /pwa/menu payload and collects every item image_url,
 * for use with primeImageCache(). Mirrors the category → sub_category →
 * items traversal already used in CartScreen.jsx/MenuScreen.jsx.
 * @param {{ categories?: Array }} menu
 * @returns {string[]}
 */
export const collectMenuImageUrls = (menu) => {
  const urls = []
  const categories = Array.isArray(menu?.categories) ? menu.categories : []
  categories.forEach((category) => {
    const subs = Array.isArray(category?.sub_category) ? category.sub_category : []
    const orphanItems = Array.isArray(category?.items) ? category.items : []
    const groups = orphanItems.length > 0 ? [{ items: orphanItems }, ...subs] : subs
    groups.forEach((group) => {
      (group.items ?? []).forEach((item) => {
        if (item?.image_url) urls.push(item.image_url)
      })
    })
  })
  return urls
}
