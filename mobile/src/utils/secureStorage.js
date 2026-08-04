/**
 * src/utils/secureStorage.js
 *
 * Access and refresh tokens are sensitive — they grant full API access to a
 * real patient-data system. AsyncStorage is plaintext on-disk storage with no
 * encryption, so tokens belong in SecureStore instead (iOS Keychain /
 * Android Keystore-backed EncryptedSharedPreferences).
 *
 * Non-sensitive cache data (the `user` object used only for display, local
 * follow-up scheduling, etc.) can stay in AsyncStorage — this module is only
 * for the two auth tokens.
 */
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY  = 'nmc_access_token';
const REFRESH_KEY = 'nmc_refresh_token';

export const getAccessToken  = () => SecureStore.getItemAsync(ACCESS_KEY);
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY);

export const setTokens = async (access, refresh) => {
  const ops = [SecureStore.setItemAsync(ACCESS_KEY, access)];
  if (refresh) ops.push(SecureStore.setItemAsync(REFRESH_KEY, refresh));
  await Promise.all(ops);
};

export const setAccessToken = (access) => SecureStore.setItemAsync(ACCESS_KEY, access);

export const clearTokens = () => Promise.all([
  SecureStore.deleteItemAsync(ACCESS_KEY),
  SecureStore.deleteItemAsync(REFRESH_KEY),
]);
