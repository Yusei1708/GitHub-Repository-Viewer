/**
 * Zero-Dependency E2E Test Runner & Harness
 * Manifest V3 GitHub Chrome Extension
 * 
 * Provides:
 * - Test suite registration (describe, test, it, beforeEach, afterEach)
 * - In-memory Chrome Extension API mocks (chrome.storage.local, chrome.tabs.create)
 * - In-memory Fetch API mock & network simulator
 * - DOM inspection & CSP verification helpers
 * - Opaque-box Module Loader (ESM & CJS)
 * - Reference Specification Oracles
 * - Multi-tier CLI execution & reporting
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// --- ANSI Colors ---
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

// --- Test Registry State ---
const currentSuites = [];
let currentSuite = null;
const globalResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  suites: [],
  startTime: 0,
  endTime: 0
};

class Suite {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.tests = [];
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    this.children = [];
  }
}

class TestCase {
  constructor(name, fn, suite) {
    this.name = name;
    this.fn = fn;
    this.suite = suite;
    this.status = 'pending'; // 'passed', 'failed', 'skipped'
    this.error = null;
    this.duration = 0;
  }
}

// --- Test Definition DSL ---
export function describe(name, fn) {
  const newSuite = new Suite(name, currentSuite);
  if (currentSuite) {
    currentSuite.children.push(newSuite);
  } else {
    currentSuites.push(newSuite);
  }
  const prevSuite = currentSuite;
  currentSuite = newSuite;
  try {
    fn();
  } finally {
    currentSuite = prevSuite;
  }
}

export function test(name, fn) {
  const suite = currentSuite || defaultSuite();
  const testCase = new TestCase(name, fn, suite);
  suite.tests.push(testCase);
  return testCase;
}

export const it = test;

export function beforeEach(fn) {
  const suite = currentSuite || defaultSuite();
  suite.beforeEachHooks.push(fn);
}

export function afterEach(fn) {
  const suite = currentSuite || defaultSuite();
  suite.afterEachHooks.push(fn);
}

function defaultSuite() {
  if (currentSuites.length === 0) {
    currentSuites.push(new Suite('Default Suite'));
  }
  return currentSuites[0];
}

// --- Chrome Storage Mock ---
export function createMockStorage(initialData = {}) {
  const store = { ...initialData };

  const storageLocal = {
    async get(keys) {
      if (keys === null || keys === undefined) {
        return { ...store };
      }
      if (typeof keys === 'string') {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const result = {};
        for (const k of keys) {
          if (k in store) result[k] = store[k];
        }
        return result;
      }
      if (typeof keys === 'object') {
        const result = { ...keys };
        for (const k of Object.keys(keys)) {
          if (k in store) result[k] = store[k];
        }
        return result;
      }
      return {};
    },

    async set(items) {
      if (!items || typeof items !== 'object') {
        throw new Error('Argument to set must be an object');
      }
      for (const [key, value] of Object.entries(items)) {
        // Deep clone or serialize to mimic chrome.storage serialization
        store[key] = JSON.parse(JSON.stringify(value));
      }
    },

    async remove(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        delete store[k];
      }
    },

    async clear() {
      for (const k of Object.keys(store)) {
        delete store[k];
      }
    },

    _dump() {
      return { ...store };
    },

    _has(key) {
      return key in store;
    }
  };

  return {
    local: storageLocal,
    sync: {
      async set() { throw new Error('chrome.storage.sync is forbidden by security specification'); },
      async get() { return {}; }
    }
  };
}

// --- Mock Chrome Extension Environment ---
export function createMockChrome(options = {}) {
  const storage = createMockStorage(options.initialStorage || {});
  const createdTabs = [];

  const mockChrome = {
    storage,
    tabs: {
      async create(createProperties) {
        createdTabs.push(createProperties);
        return { id: 100 + createdTabs.length, ...createProperties };
      },
      _getCreatedTabs() {
        return [...createdTabs];
      }
    },
    runtime: {
      lastError: null,
      id: 'mock-extension-id'
    }
  };

  return mockChrome;
}

// --- Mock Fetch & Network Simulator ---
export function createMockFetch(routes = []) {
  const requests = [];
  const registeredRoutes = [...routes];

  const mockFetch = async (input, init = {}) => {
    const urlStr = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    const headers = init.headers || {};

    const reqRecord = {
      url: urlStr,
      method,
      headers: normalizeHeaders(headers),
      body: init.body || null,
      timestamp: Date.now()
    };
    requests.push(reqRecord);

    // Find matching route
    for (const route of registeredRoutes) {
      let matches = false;
      if (typeof route.match === 'string') {
        matches = urlStr.includes(route.match);
      } else if (route.match instanceof RegExp) {
        matches = route.match.test(urlStr);
      } else if (typeof route.match === 'function') {
        matches = route.match(urlStr, init);
      }

      if (matches) {
        if (route.networkError) {
          throw new TypeError('Failed to fetch');
        }

        const status = route.status || 200;
        const responseBody = typeof route.body === 'function' ? route.body(urlStr, init) : route.body;
        const resHeaders = new Headers(route.headers || {});

        return {
          ok: status >= 200 && status < 300,
          status,
          headers: resHeaders,
          async json() {
            if (typeof responseBody === 'string') {
              return JSON.parse(responseBody);
            }
            return responseBody || {};
          },
          async text() {
            return typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
          }
        };
      }
    }

    // Default 404 if no route matched
    return {
      ok: false,
      status: 404,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      async json() { return { message: 'Not Found' }; },
      async text() { return '{"message":"Not Found"}'; }
    };
  };

  mockFetch.requests = requests;
  mockFetch.addRoute = (route) => registeredRoutes.unshift(route);
  mockFetch.clearHistory = () => { requests.length = 0; };

  return mockFetch;
}

function normalizeHeaders(headers) {
  const normalized = {};
  if (!headers) return normalized;
  if (typeof headers.forEach === 'function') {
    headers.forEach((v, k) => { normalized[k.toLowerCase()] = v; });
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) normalized[k.toLowerCase()] = v;
  } else {
    for (const [k, v] of Object.entries(headers)) {
      normalized[k.toLowerCase()] = v;
    }
  }
  return normalized;
}

// --- DOM Mock & Inspection Helpers ---
export class MockElement {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = attributes.id || '';
    this.className = attributes.class || '';
    this.type = attributes.type || '';
    this.value = attributes.value || '';
    this.src = attributes.src || '';
    this.href = attributes.href || '';
    this.target = attributes.target || '';
    this.disabled = !!attributes.disabled;
    this.attributes = { ...attributes };
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.eventListeners = {};
    this._textContent = '';
  }

  get textContent() {
    if (this.children.length > 0) {
      return this.children.map(c => c.textContent).join('');
    }
    return this._textContent;
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  get innerHTML() {
    return this._textContent;
  }

  set innerHTML(val) {
    this._textContent = String(val);
  }

  get classList() {
    const getClasses = () => (this.className ? this.className.split(/\s+/).filter(Boolean) : []);
    return {
      contains: (cls) => getClasses().includes(cls),
      add: (...classes) => {
        const set = new Set([...getClasses(), ...classes]);
        this.className = Array.from(set).join(' ');
      },
      remove: (...classes) => {
        const set = new Set(getClasses());
        for (const c of classes) set.delete(c);
        this.className = Array.from(set).join(' ');
      },
      toggle: (cls, force) => {
        const has = getClasses().includes(cls);
        const shouldAdd = force !== undefined ? force : !has;
        if (shouldAdd) this.classList.add(cls);
        else this.classList.remove(cls);
        return shouldAdd;
      }
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'type') this.type = String(value);
    if (name === 'value') this.value = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  hasAttribute(name) {
    return name in this.attributes;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    if (!this.eventListeners[type]) this.eventListeners[type] = [];
    this.eventListeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    if (!this.eventListeners[type]) return;
    this.eventListeners[type] = this.eventListeners[type].filter(l => l !== listener);
  }

  dispatchEvent(event) {
    const listeners = this.eventListeners[event.type] || [];
    event.target = this;
    for (const listener of listeners) {
      listener(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent({ type: 'click', preventDefault() {}, defaultPrevented: false });
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const match = (el) => {
      if (selector.startsWith('#') && el.id === selector.slice(1)) return true;
      if (selector.startsWith('.') && el.classList.contains(selector.slice(1))) return true;
      if (el.tagName.toLowerCase() === selector.toLowerCase()) return true;
      if (selector.includes('[') && selector.includes(']')) {
        const attrMatch = selector.match(/\[([^=\]]+)(?:=(?:"|')?([^"'\]]+)(?:"|')?)?\]/);
        if (attrMatch) {
          const attr = attrMatch[1];
          const val = attrMatch[2];
          if (val !== undefined) return el.getAttribute(attr) === val;
          return el.hasAttribute(attr);
        }
      }
      return false;
    };

    const traverse = (node) => {
      for (const child of node.children) {
        if (match(child)) results.push(child);
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
}

export function parseHTML(htmlString) {
  const root = new MockElement('root');
  const stack = [root];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const tokenRegex = /<!--[\s\S]*?-->|<(?:\/([a-zA-Z0-9\-]+)>|([a-zA-Z0-9\-]+)([^>]*?)(\/?)>)|([^<]+)/g;

  let token;
  while ((token = tokenRegex.exec(htmlString)) !== null) {
    const [fullMatch, closeTag, openTag, rawAttrs, selfCloseSlash, text] = token;

    if (closeTag) {
      const closing = closeTag.toUpperCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === closing) {
          stack.length = i;
          break;
        }
      }
    } else if (openTag) {
      const attrs = {};
      if (rawAttrs) {
        const attrRegex = /([a-zA-Z0-9\-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
        let m;
        while ((m = attrRegex.exec(rawAttrs)) !== null) {
          const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
          attrs[m[1]] = val;
        }
      }
      const elem = new MockElement(openTag, attrs);
      const parent = stack[stack.length - 1];
      parent.appendChild(elem);

      const isVoid = voidTags.has(openTag.toLowerCase()) || !!selfCloseSlash;
      if (!isVoid) {
        stack.push(elem);
      }
    } else if (text) {
      const trimmed = text.trim();
      if (trimmed) {
        const parent = stack[stack.length - 1];
        if (parent !== root) {
          parent._textContent = (parent._textContent ? parent._textContent + ' ' : '') + trimmed;
        }
      }
    }
  }

  return {
    root,
    getElementById: (id) => root.querySelector(`#${id}`),
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    inspectCSP: () => {
      const inlineScripts = (htmlString.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi) || []).length;
      const inlineHandlers = (htmlString.match(/\son[a-zA-Z]+\s*=/gi) || []).length;
      return {
        compliant: inlineScripts === 0 && inlineHandlers === 0,
        inlineScripts,
        inlineHandlers
      };
    }
  };
}

// --- Module Loader Helpers ---
export async function loadProjectModule(relativePath) {
  const fullPath = path.resolve(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    return {
      exists: false,
      error: `File does not exist: ${fullPath}`,
      module: null
    };
  }

  try {
    const fileUrl = url.pathToFileURL(fullPath).href;
    const rawMod = await import(fileUrl);
    const merged = { ...rawMod };
    if (rawMod.default && typeof rawMod.default === 'object') {
      Object.assign(merged, rawMod.default);
    }
    return {
      exists: true,
      error: null,
      module: merged,
      raw: rawMod
    };
  } catch (err) {
    return {
      exists: true,
      error: `Failed to import module: ${err.message}`,
      module: null
    };
  }
}

export function readProjectFile(relativePath, encoding = 'utf8') {
  const fullPath = path.resolve(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    return { exists: false, content: null, path: fullPath };
  }
  const content = fs.readFileSync(fullPath, encoding);
  return { exists: true, content, path: fullPath };
}

// --- Authoritative Reference Oracles ---
// Derived from .agents/spec_miner_survey_1/handoff.md and ORIGINAL_REQUEST.md
export const ReferenceOracle = {
  getHeaders(token) {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token ? token.trim() : ''}`,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (typeof window === 'undefined' || (typeof process !== 'undefined' && process.versions && process.versions.node)) {
      headers['User-Agent'] = 'GitHub-Chrome-Extension';
    }
    return headers;
  },

  parseNextLink(linkHeader) {
    if (!linkHeader || typeof linkHeader !== 'string') return null;
    const parts = linkHeader.split(',');
    for (const part of parts) {
      const section = part.split(';');
      if (section.length < 2) continue;
      const urlMatch = section[0].match(/<([^>]+)>/);
      if (!urlMatch) continue;
      const linkUrl = urlMatch[1].trim();
      for (let i = 1; i < section.length; i++) {
        const relMatch = section[i].match(/rel=["']?([^"'\s]+)["']?/i);
        if (relMatch && relMatch[1].toLowerCase() === 'next') {
          return linkUrl;
        }
      }
    }
    return null;
  },

  classifyApiError(status, headers = {}, body = {}, networkError = null) {
    if (networkError) {
      return {
        type: 'NETWORK_ERROR',
        message: 'Network connection error. Please check your internet connection and try again.',
        status: 0
      };
    }

    if (status === 401) {
      return {
        type: 'UNAUTHORIZED',
        message: 'Invalid or expired Personal Access Token. Please verify your token and reconnect.',
        status: 401
      };
    }

    if (status === 403 || status === 429) {
      const getHeader = (k) => {
        if (!headers) return null;
        if (typeof headers.get === 'function') return headers.get(k);
        return headers[k.toLowerCase()] || headers[k];
      };

      const remaining = getHeader('x-ratelimit-remaining');
      const reset = getHeader('x-ratelimit-reset');
      const retryAfter = getHeader('retry-after');

      if (remaining === '0' || status === 429 || (body && body.message && body.message.toLowerCase().includes('rate limit'))) {
        let details = '';
        if (retryAfter) {
          details = ` Please retry in ${retryAfter} seconds.`;
        } else if (reset) {
          const resetEpoch = parseInt(reset, 10);
          if (!isNaN(resetEpoch)) {
            const resetDate = new Date(resetEpoch * 1000);
            const diffMin = Math.max(0, Math.ceil((resetDate.getTime() - Date.now()) / 60000));
            const timeStr = resetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            details = ` Resets at ${timeStr} (in ~${diffMin} min).`;
          }
        }
        return {
          type: 'RATE_LIMITED',
          message: `GitHub API rate limit exceeded.${details}`,
          status
        };
      }

      return {
        type: 'FORBIDDEN',
        message: body.message || 'Access forbidden: Insufficient token permissions. Please ensure your token has read-only access to User profile and Repositories.',
        status: 403
      };
    }

    if (status >= 500) {
      return {
        type: 'SERVER_ERROR',
        message: `GitHub service error (HTTP ${status}). Please try again later.`,
        status
      };
    }

    return {
      type: 'UNKNOWN',
      message: body.message || `API error occurred (HTTP ${status}).`,
      status
    };
  },

  filterRepositories(repos, query) {
    if (!Array.isArray(repos)) return [];
    if (!query || typeof query !== 'string') return repos;
    const q = query.trim().toLowerCase();
    if (!q) return repos;

    return repos.filter(repo => {
      const name = (repo.name || '').toLowerCase();
      const desc = (repo.description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  },

  formatRelativeTime(isoString, nowTimestamp = Date.now()) {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'N/A';

    const diffMs = nowTimestamp - date.getTime();
    if (diffMs < 0) return 'just now'; // Clamped future dates
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
};

// --- Test Execution Engine ---
async function runSuite(suite, options = {}) {
  const { matchPattern = null, bail = false, verbose = false } = options;
  console.log(`\n${colors.bold}${colors.cyan}▶ Suite: ${suite.name}${colors.reset}`);

  for (const testCase of suite.tests) {
    if (matchPattern && !matchPattern.test(testCase.name)) {
      testCase.status = 'skipped';
      globalResults.skipped++;
      continue;
    }

    // Run beforeEach hooks
    let current = suite;
    const beforeHooks = [];
    while (current) {
      beforeHooks.unshift(...current.beforeEachHooks);
      current = current.parent;
    }
    for (const hook of beforeHooks) {
      await hook();
    }

    const tStart = performance.now();
    try {
      await testCase.fn();
      testCase.duration = performance.now() - tStart;
      testCase.status = 'passed';
      globalResults.passed++;
      console.log(`  ${colors.green}✔${colors.reset} ${testCase.name} ${colors.gray}(${testCase.duration.toFixed(1)}ms)${colors.reset}`);
    } catch (err) {
      testCase.duration = performance.now() - tStart;
      testCase.status = 'failed';
      testCase.error = err;
      globalResults.failed++;
      console.log(`  ${colors.red}✖${colors.reset} ${testCase.name} ${colors.gray}(${testCase.duration.toFixed(1)}ms)${colors.reset}`);
      console.log(`    ${colors.red}${err.name}: ${err.message}${colors.reset}`);
      if (verbose && err.stack) {
        console.log(`    ${colors.gray}${err.stack.split('\n').slice(1, 4).join('\n    ')}${colors.reset}`);
      }
      if (bail) {
        console.log(`\n${colors.yellow}Bail mode active. Halting execution after first failure.${colors.reset}`);
        return false;
      }
    } finally {
      // Run afterEach hooks
      let afterCurrent = suite;
      const afterHooks = [];
      while (afterCurrent) {
        afterHooks.push(...afterCurrent.afterEachHooks);
        afterCurrent = afterCurrent.parent;
      }
      for (const hook of afterHooks) {
        try { await hook(); } catch (e) { /* ignore cleanup error */ }
      }
    }
  }

  for (const child of suite.children) {
    const shouldContinue = await runSuite(child, options);
    if (!shouldContinue && bail) return false;
  }

  return true;
}

// --- Self-Test for Runner Infrastructure ---
async function runSelfTest() {
  console.log(`\n${colors.bold}${colors.magenta}=== RUNNER HARNESS SELF-TEST ===${colors.reset}\n`);

  // 1. Storage Mock
  const storage = createMockStorage({ key1: 'value1' });
  assert.equal((await storage.local.get('key1')).key1, 'value1', 'Storage get failed');
  await storage.local.set({ key2: 'value2' });
  assert.equal((await storage.local.get('key2')).key2, 'value2', 'Storage set failed');
  await storage.local.clear();
  assert.deepEqual(await storage.local.get(), {}, 'Storage clear failed');
  console.log(`  ${colors.green}✔${colors.reset} In-memory Chrome storage mock verified`);

  // 2. Fetch Mock
  const mockFetch = createMockFetch([
    { match: 'https://api.github.com/user', status: 200, body: { login: 'octocat' } },
    { match: 'https://api.github.com/error', status: 401, body: { message: 'Bad credentials' } },
    { match: 'https://api.github.com/offline', networkError: true }
  ]);
  const res1 = await mockFetch('https://api.github.com/user');
  assert.equal((await res1.json()).login, 'octocat');
  const res2 = await mockFetch('https://api.github.com/error');
  assert.equal(res2.status, 401);
  await assert.rejects(async () => { await mockFetch('https://api.github.com/offline'); });
  console.log(`  ${colors.green}✔${colors.reset} Network fetch interceptor & error simulator verified`);

  // 3. Reference Oracles
  assert.equal(ReferenceOracle.parseNextLink('<https://api.github.com/repos?page=2>; rel="next"'), 'https://api.github.com/repos?page=2');
  const err401 = ReferenceOracle.classifyApiError(401);
  assert.equal(err401.type, 'UNAUTHORIZED');
  const filtered = ReferenceOracle.filterRepositories([{ name: 'repo-alpha', description: 'test' }], 'ALPHA');
  assert.equal(filtered.length, 1);
  console.log(`  ${colors.green}✔${colors.reset} Reference specification oracles verified`);

  // 4. HTML Parser & CSP Inspector
  const cspTest = parseHTML('<div><script src="popup.js"></script><input id="pat" type="password"></div>');
  assert.equal(cspTest.inspectCSP().compliant, true);
  assert.equal(cspTest.getElementById('pat').type, 'password');
  console.log(`  ${colors.green}✔${colors.reset} DOM parser & CSP validator verified`);

  console.log(`\n${colors.green}${colors.bold}Runner self-test passed successfully! All test harness components operational.${colors.reset}\n`);
}

// --- CLI Entry Point ---
export async function runCli(argv = process.argv.slice(2)) {
  const args = [...argv];
  const isSelfTest = args.includes('--self-test');
  if (isSelfTest) {
    await runSelfTest();
    return 0;
  }

  let matchPattern = null;
  const matchIdx = args.findIndex(a => a === '--match' || a === '-m');
  if (matchIdx !== -1 && args[matchIdx + 1]) {
    matchPattern = new RegExp(args[matchIdx + 1], 'i');
  }

  const bail = args.includes('--bail') || args.includes('-b');
  const verbose = args.includes('--verbose') || args.includes('-v');

  // Determine target test files
  const testFiles = [];
  const positionalArgs = args.filter(a => !a.startsWith('-'));

  if (positionalArgs.length > 0) {
    for (const arg of positionalArgs) {
      if (arg.endsWith('.test.js') || arg.endsWith('.js')) {
        testFiles.push(path.resolve(PROJECT_ROOT, arg));
      } else if (arg.startsWith('tier')) {
        const tierNum = arg.replace(/\D/g, '');
        const candidate = path.resolve(__dirname, `tier${tierNum}_${getTierSuffix(tierNum)}.test.js`);
        if (fs.existsSync(candidate)) testFiles.push(candidate);
      }
    }
  }

  if (testFiles.length === 0) {
    // Default: find all tier*.test.js in tests/
    const dirEntries = fs.readdirSync(__dirname);
    for (const entry of dirEntries.sort()) {
      if (entry.startsWith('tier') && entry.endsWith('.test.js')) {
        testFiles.push(path.resolve(__dirname, entry));
      }
    }
  }

  console.log(`${colors.bold}${colors.cyan}====================================================${colors.reset}`);
  console.log(`${colors.bold}Manifest V3 GitHub Chrome Extension - E2E Test Suite${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}====================================================${colors.reset}`);
  console.log(`${colors.gray}Target suites: ${testFiles.length} file(s)${colors.reset}`);
  if (matchPattern) console.log(`${colors.gray}Filter: ${matchPattern}${colors.reset}`);

  globalResults.startTime = performance.now();

  for (const filePath of testFiles) {
    const relPath = path.relative(PROJECT_ROOT, filePath);
    console.log(`\n${colors.bold}${colors.magenta}Loading Suite: ${relPath}${colors.reset}`);
    currentSuites.length = 0; // Clear suites for this file
    currentSuite = null;

    try {
      const fileUrl = url.pathToFileURL(filePath).href;
      await import(fileUrl);
    } catch (importErr) {
      console.log(`  ${colors.red}✖ Failed to load test file: ${importErr.message}${colors.reset}`);
      if (verbose && importErr.stack) console.log(importErr.stack);
      globalResults.failed++;
      if (bail) break;
      continue;
    }

    for (const s of currentSuites) {
      const cont = await runSuite(s, { matchPattern, bail, verbose });
      if (!cont && bail) break;
    }
  }

  globalResults.endTime = performance.now();
  const totalDuration = (globalResults.endTime - globalResults.startTime).toFixed(2);
  globalResults.total = globalResults.passed + globalResults.failed + globalResults.skipped;

  console.log(`\n${colors.bold}${colors.cyan}====================================================${colors.reset}`);
  console.log(`${colors.bold}Test Execution Summary:${colors.reset}`);
  console.log(`  Total Tests:    ${colors.bold}${globalResults.total}${colors.reset}`);
  console.log(`  Passed:         ${colors.green}${colors.bold}${globalResults.passed}${colors.reset}`);
  console.log(`  Failed:         ${globalResults.failed > 0 ? colors.red : colors.gray}${colors.bold}${globalResults.failed}${colors.reset}`);
  console.log(`  Skipped:        ${colors.yellow}${globalResults.skipped}${colors.reset}`);
  console.log(`  Duration:       ${colors.gray}${totalDuration} ms${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}====================================================${colors.reset}\n`);

  if (globalResults.failed > 0) {
    console.log(`${colors.bgRed}${colors.bold} FAIL ${colors.reset} Some tests failed.`);
    return 1;
  } else {
    console.log(`${colors.bgGreen}${colors.bold} PASS ${colors.reset} All executed tests passed!`);
    return 0;
  }
}

function getTierSuffix(tierNum) {
  switch (String(tierNum)) {
    case '1': return 'features';
    case '2': return 'boundaries';
    case '3': return 'combinations';
    case '4': return 'workloads';
    default: return '';
  }
}

export { assert };

// Auto-run if executed as main script
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  runCli().then(code => process.exit(code)).catch(err => {
    console.error('Fatal runner error:', err);
    process.exit(1);
  });
}
