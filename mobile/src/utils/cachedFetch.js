/**
 * src/utils/cachedFetch.js
 *
 * The offline queue (offlineQueue.js) covers writes. This covers the other
 * half: reads that need to keep working with no signal at all. Deliberately
 * NOT a general-purpose cache-everything layer — that's a bigger data-layer
 * decision (see the local-first discussion in the mobile app's offline
 * queue design). This is a narrow, opt-in helper: call it explicitly for
 * the specific GET requests that must survive being offline, such as the
 * facility list a referral can't be created without.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'nmc_cache_';

/**
 * @param {string} key - unique cache key, e.g. 'facilities_list'
 * @param {() => Promise<any>} fetchFn - performs the live request, returns the data (not the axios response)
 * @returns {Promise<{data: any, fromCache: boolean, cachedAt?: number}>}
 * Throws only if the live fetch fails AND there is no cached copy.
 */
export async function cachedFetch(key, fetchFn) {
  try {
    const data = await fetchFn();
    AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() })).catch(() => {});
    return { data, fromCache: false };
  } catch (err) {
    try {
      const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { data: parsed.data, fromCache: true, cachedAt: parsed.cachedAt };
      }
    } catch {
      // fall through to rethrow the original network error
    }
    throw err;
  }
}
