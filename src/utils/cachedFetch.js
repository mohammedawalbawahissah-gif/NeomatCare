/**
 * src/utils/cachedFetch.js
 * Web mirror of neomatcare-mobile/src/utils/cachedFetch.js — see that file
 * for the reasoning. Narrow, opt-in read cache; not a general caching layer.
 */
const CACHE_PREFIX = 'nmc_cache_'

/**
 * @param {string} key
 * @param {() => Promise<any>} fetchFn - performs the live request, returns the data
 * @returns {Promise<{data: any, fromCache: boolean, cachedAt?: number}>}
 */
export async function cachedFetch(key, fetchFn) {
  try {
    const data = await fetchFn()
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() }))
    } catch { /* storage full or unavailable — not fatal */ }
    return { data, fromCache: false }
  } catch (err) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key)
      if (raw) {
        const parsed = JSON.parse(raw)
        return { data: parsed.data, fromCache: true, cachedAt: parsed.cachedAt }
      }
    } catch { /* fall through to rethrow */ }
    throw err
  }
}
