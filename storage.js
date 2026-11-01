/**
 * storage.js - Local Storage Service & Adapter for GitHub Repository Viewer
 *
 * Wraps chrome.storage.local with a Promise-based interface and provides
 * a seamless in-memory fallback adapter for Node.js test environments.
 *
 * Strict Token Security Lifecycle:
 * - Stored exclusively in chrome.storage.local (or in-memory mock during tests)
 * - Zero logging of token values in logs, warnings, or error messages
 * - Complete purge of all credentials and cached data on clearStorage()
 */

// Storage key constants
export const STORAGE_KEYS = Object.freeze({
  TOKEN: 'gh_pat_token',
  PROFILE: 'gh_user_profile',
  REPOS: 'gh_cached_repos',
  UPDATED_AT: 'gh_last_cached_at'
});

export const GH_PAT_TOKEN_KEY = STORAGE_KEYS.TOKEN;
export const GH_USER_PROFILE_KEY = STORAGE_KEYS.PROFILE;
export const GH_CACHED_REPOS_KEY = STORAGE_KEYS.REPOS;
export const GH_LAST_CACHED_AT_KEY = STORAGE_KEYS.UPDATED_AT;

// In-memory mock storage dictionary for non-Chrome environments (Node.js tests)
let memoryStore = {};

/**
 * Deep clone helper to ensure in-memory store mimics chrome.storage serialization
 * @param {any} val
 * @returns {any}
 */
function cloneValue(val) {
  if (val === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val));
}

/**
 * Checks whether the code is running inside a valid Chrome extension environment
 * with access to chrome.storage.local.
 * @returns {boolean}
 */
export function isExtensionEnvironment() {
  return typeof chrome !== 'undefined' &&
    Boolean(chrome.storage) &&
    Boolean(chrome.storage.local);
}

/**
 * Retrieve one or more items from storage.
 * - getStorage('key') -> returns Promise<any> (unwrapped value for that key)
 * - getStorage(['k1', 'k2']) -> returns Promise<object> ({ k1: v1, k2: v2 })
 * - getStorage() / getStorage(null) -> returns Promise<object> (all stored items)
 * - getStorage({ k1: defaultVal }) -> returns Promise<object> with defaults
 *
 * @param {string|string[]|object|null|undefined} [key]
 * @returns {Promise<any>}
 */
export async function getStorage(key) {
  if (isExtensionEnvironment()) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err, result) => {
        if (settled) return;
        settled = true;
        const lastErr = err || (chrome.runtime && chrome.runtime.lastError);
        if (lastErr) {
          return reject(new Error(lastErr.message || String(lastErr)));
        }
        if (typeof key === 'string') {
          resolve(result ? result[key] : undefined);
        } else {
          resolve(result || {});
        }
      };

      try {
        const query = (typeof key === 'string') ? [key] : (key ?? null);
        const ret = chrome.storage.local.get(query, (result) => done(null, result));
        if (ret && typeof ret.then === 'function') {
          ret.then((res) => done(null, res), (err) => done(err));
        }
      } catch (err) {
        done(err);
      }
    });
  }

  // In-memory fallback adapter for Node.js / test environment
  if (typeof key === 'string') {
    return cloneValue(memoryStore[key]);
  }

  if (Array.isArray(key)) {
    const result = {};
    for (const k of key) {
      if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(memoryStore, k)) {
        result[k] = cloneValue(memoryStore[k]);
      }
    }
    return result;
  }

  if (key && typeof key === 'object') {
    const result = {};
    for (const [k, defaultVal] of Object.entries(key)) {
      if (Object.prototype.hasOwnProperty.call(memoryStore, k)) {
        result[k] = cloneValue(memoryStore[k]);
      } else {
        result[k] = cloneValue(defaultVal);
      }
    }
    return result;
  }

  // null or undefined: return all items
  const all = {};
  for (const k of Object.keys(memoryStore)) {
    all[k] = cloneValue(memoryStore[k]);
  }
  return all;
}

/**
 * Set one or more items into storage.
 * Supports:
 * - setStorage({ key: value, ... })
 * - setStorage('key', value)
 *
 * Zero logging: token values or sensitive payload data are never logged.
 *
 * @param {object|string} items - Object map of items or key name
 * @param {any} [value] - Value if key name is passed as first argument
 * @returns {Promise<void>}
 */
export async function setStorage(items, value) {
  let payload = items;
  if (typeof items === 'string') {
    payload = { [items]: value };
  } else if (!items || typeof items !== 'object' || Array.isArray(items)) {
    throw new TypeError('setStorage expects an object or (key, value) pair');
  }

  if (isExtensionEnvironment()) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        const lastErr = err || (chrome.runtime && chrome.runtime.lastError);
        if (lastErr) {
          // Do NOT log or interpolate payload in error message to prevent token leakage
          return reject(new Error(lastErr.message || String(lastErr)));
        }
        resolve();
      };

      try {
        const ret = chrome.storage.local.set(payload, () => done());
        if (ret && typeof ret.then === 'function') {
          ret.then(() => done(), (err) => done(err));
        }
      } catch (err) {
        done(err);
      }
    });
  }

  // In-memory fallback adapter
  for (const [k, v] of Object.entries(payload)) {
    memoryStore[k] = cloneValue(v);
  }
}

/**
 * Remove one or more keys from storage.
 *
 * @param {string|string[]} keys - Key or array of keys to remove
 * @returns {Promise<void>}
 */
export async function removeStorage(keys) {
  const keyList = typeof keys === 'string' ? [keys] : (Array.isArray(keys) ? keys : []);

  if (isExtensionEnvironment()) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        const lastErr = err || (chrome.runtime && chrome.runtime.lastError);
        if (lastErr) {
          return reject(new Error(lastErr.message || String(lastErr)));
        }
        resolve();
      };

      try {
        const ret = chrome.storage.local.remove(keyList, () => done());
        if (ret && typeof ret.then === 'function') {
          ret.then(() => done(), (err) => done(err));
        }
      } catch (err) {
        done(err);
      }
    });
  }

  // In-memory fallback adapter
  for (const k of keyList) {
    delete memoryStore[k];
  }
}

/**
 * Completely purges all stored items from storage.
 * Used during Disconnect flow to wipe PAT, profile, repositories, and cache timestamps.
 *
 * @returns {Promise<void>}
 */
export async function clearStorage() {
  if (isExtensionEnvironment()) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        const lastErr = err || (chrome.runtime && chrome.runtime.lastError);
        if (lastErr) {
          return reject(new Error(lastErr.message || String(lastErr)));
        }
        resolve();
      };

      try {
        const ret = chrome.storage.local.clear(() => done());
        if (ret && typeof ret.then === 'function') {
          ret.then(() => done(), (err) => done(err));
        }
      } catch (err) {
        done(err);
      }
    });
  }

  // In-memory fallback adapter
  memoryStore = {};
}

/**
 * Test helper: returns a copy of the in-memory mock store
 * @returns {object}
 */
export function getMockStorage() {
  return cloneValue(memoryStore);
}

/**
 * Test helper: completely resets the in-memory mock store
 */
export function resetMockStorage() {
  memoryStore = {};
}

// Default export combining all methods and constants
export default {
  STORAGE_KEYS,
  GH_PAT_TOKEN_KEY,
  GH_USER_PROFILE_KEY,
  GH_CACHED_REPOS_KEY,
  GH_LAST_CACHED_AT_KEY,
  isExtensionEnvironment,
  getStorage,
  setStorage,
  removeStorage,
  clearStorage,
  getMockStorage,
  resetMockStorage
};

// CommonJS compatibility export for test runners using require()
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEYS,
    GH_PAT_TOKEN_KEY,
    GH_USER_PROFILE_KEY,
    GH_CACHED_REPOS_KEY,
    GH_LAST_CACHED_AT_KEY,
    isExtensionEnvironment,
    getStorage,
    setStorage,
    removeStorage,
    clearStorage,
    getMockStorage,
    resetMockStorage
  };
}
