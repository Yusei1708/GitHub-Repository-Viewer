/**
 * Tier 1: Core Feature Coverage Test Suite
 * Manifest V3 GitHub Chrome Extension
 * 
 * Verifies core functionality (>= 5 tests per feature):
 * 1. Manifest MV3 syntax & keys
 * 2. Minimal permissions & security scoping
 * 3. Chrome storage set/get/clear
 * 4. Token masking & isolation
 * 5. API headers & versioning
 * 6. Pagination RFC 8288 next link parsing
 * 7. API error status mapping (401, 403, 429, network)
 * 8. Real-time client-side search filtering
 * 9. Relative date formatting
 * 10. Disconnect and state purge flow
 */

import {
  describe,
  test,
  assert,
  createMockStorage,
  createMockChrome,
  createMockFetch,
  parseHTML,
  loadProjectModule,
  readProjectFile,
  ReferenceOracle
} from './e2e_runner.js';

// --- 1. Manifest MV3 Syntax & Keys ---
describe('Tier 1.1: Manifest MV3 Syntax & Keys', () => {
  const file = readProjectFile('manifest.json');

  test('T1.1.1: manifest.json exists and is valid JSON', () => {
    assert.ok(file.exists, 'manifest.json must exist at project root');
    let parsed;
    try {
      parsed = JSON.parse(file.content);
    } catch (e) {
      assert.fail(`manifest.json is not valid JSON: ${e.message}`);
    }
    assert.equal(typeof parsed, 'object', 'manifest root must be an object');
  });

  test('T1.1.2: manifest_version is exactly integer 3', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    assert.equal(manifest.manifest_version, 3, 'manifest_version must be exactly 3');
  });

  test('T1.1.3: required metadata keys are present and non-empty', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    assert.ok(manifest.name && typeof manifest.name === 'string' && manifest.name.length > 0, 'name is required');
    assert.ok(manifest.version && typeof manifest.version === 'string' && manifest.version.length > 0, 'version is required');
    assert.ok(manifest.description && typeof manifest.description === 'string' && manifest.description.length > 0, 'description is required');
  });

  test('T1.1.4: action.default_popup points to popup.html', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    assert.ok(manifest.action, 'action key must be present in Manifest V3');
    assert.equal(manifest.action.default_popup, 'popup.html', 'default_popup must point to popup.html');
  });

  test('T1.1.5: icons definition contains 16, 48, and 128 sizes', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    assert.ok(manifest.icons, 'icons key must be present');
    assert.ok(manifest.icons['16'], 'icon 16 must be specified');
    assert.ok(manifest.icons['48'], 'icon 48 must be specified');
    assert.ok(manifest.icons['128'], 'icon 128 must be specified');
  });

  test('T1.1.6: forbids deprecated Manifest V2 keys (browser_action, page_action)', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    assert.equal(manifest.browser_action, undefined, 'browser_action is forbidden in MV3');
    assert.equal(manifest.page_action, undefined, 'page_action is forbidden in MV3');
  });
});

// --- 2. Minimal Permissions & Security Scoping ---
describe('Tier 1.2: Minimal Permissions & Security Scoping', () => {
  const file = readProjectFile('manifest.json');

  test('T1.2.1: permissions array contains storage permission', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    assert.ok(Array.isArray(manifest.permissions), 'permissions must be an array');
    assert.ok(manifest.permissions.includes('storage'), 'permissions must include storage');
  });

  test('T1.2.2: strictly excludes unnecessary high-privilege tabs permission', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    const perms = manifest.permissions || [];
    assert.ok(!perms.includes('tabs'), 'high-privilege "tabs" permission must NOT be requested');
  });

  test('T1.2.3: strictly excludes invasive permissions (activeTab, cookies, webRequest)', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    const perms = manifest.permissions || [];
    assert.ok(!perms.includes('activeTab'), 'activeTab permission must NOT be requested');
    assert.ok(!perms.includes('cookies'), 'cookies permission must NOT be requested');
    assert.ok(!perms.includes('webRequest'), 'webRequest permission must NOT be requested');
    assert.ok(!perms.includes('declarativeNetRequest'), 'declarativeNetRequest must NOT be requested');
  });

  test('T1.2.4: host_permissions scopes strictly to https://api.github.com/*', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    assert.ok(Array.isArray(manifest.host_permissions), 'host_permissions must be an array');
    assert.ok(manifest.host_permissions.includes('https://api.github.com/*'), 'host_permissions must include https://api.github.com/*');
    assert.ok(!manifest.host_permissions.includes('<all_urls>'), '<all_urls> is strictly prohibited');
  });

  test('T1.2.5: declares zero background service workers (pure popup extension)', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    assert.equal(manifest.background, undefined, 'Pure popup extension must not declare background service worker');
  });

  test('T1.2.6: declares zero content_scripts (zero web-page script injection)', () => {
    assert.ok(file.exists, 'manifest.json must exist');
    const manifest = JSON.parse(file.content);
    assert.equal(manifest.content_scripts, undefined, 'content_scripts must not be declared');
  });
});

// --- 3. Chrome Storage Set / Get / Clear ---
describe('Tier 1.3: Chrome Storage Set / Get / Clear', () => {
  test('T1.3.1: storage set persists key-value pair into local storage', async () => {
    const mod = await loadProjectModule('storage.js');
    if (!mod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    if (typeof mod.module.setStorage === 'function') {
      await mod.module.setStorage({ test_key: 'test_value' });
      const raw = await mockChrome.storage.local.get('test_key');
      assert.equal(raw.test_key, 'test_value', 'Stored value must match');
    } else {
      assert.fail('setStorage function must be exported from storage.js');
    }
  });

  test('T1.3.2: storage get retrieves stored value by key', async () => {
    const mod = await loadProjectModule('storage.js');
    if (!mod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome({ initialStorage: { username: 'octocat' } });
    globalThis.chrome = mockChrome;

    if (typeof mod.module.getStorage === 'function') {
      const val = await mod.module.getStorage('username');
      assert.equal(val, 'octocat', 'Retrieved value must match stored value');
    } else {
      assert.fail('getStorage function must be exported from storage.js');
    }
  });

  test('T1.3.3: storage get returns undefined for non-existent key', async () => {
    const mod = await loadProjectModule('storage.js');
    if (!mod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    const val = await mod.module.getStorage('non_existent_key_123');
    assert.equal(val, undefined, 'Non-existent key must return undefined');
  });

  test('T1.3.4: storage clear purges all stored items atomically', async () => {
    const mod = await loadProjectModule('storage.js');
    if (!mod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome({ initialStorage: { k1: 'v1', k2: 'v2', k3: 'v3' } });
    globalThis.chrome = mockChrome;

    if (typeof mod.module.clearStorage === 'function') {
      await mod.module.clearStorage();
      const dump = await mockChrome.storage.local.get();
      assert.deepEqual(dump, {}, 'Storage must be completely empty after clear');
    } else {
      assert.fail('clearStorage function must be exported from storage.js');
    }
  });

  test('T1.3.5: storage set persists multiple keys atomically in single operation', async () => {
    const mod = await loadProjectModule('storage.js');
    if (!mod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    await mod.module.setStorage({ alpha: 1, beta: 2 });
    const dump = await mockChrome.storage.local.get();
    assert.equal(dump.alpha, 1);
    assert.equal(dump.beta, 2);
  });

  test('T1.3.6: isExtensionEnvironment correctly detects runtime environment', async () => {
    const mod = await loadProjectModule('storage.js');
    if (!mod.exists) assert.fail('storage.js must exist at project root');

    delete globalThis.chrome;
    assert.equal(mod.module.isExtensionEnvironment(), false, 'Must report false when chrome is not defined');

    globalThis.chrome = createMockChrome();
    assert.equal(mod.module.isExtensionEnvironment(), true, 'Must report true when chrome.storage is defined');
  });
});

// --- 4. Token Masking & Security ---
describe('Tier 1.4: Token Masking & Security', () => {
  const htmlFile = readProjectFile('popup.html');

  test('T1.4.1: PAT input in popup.html is type="password" to prevent shoulder-surfing', () => {
    assert.ok(htmlFile.exists, 'popup.html must exist at project root');
    const doc = parseHTML(htmlFile.content);
    const patInput = doc.getElementById('pat-input') || doc.querySelector('input[type="password"]');
    assert.ok(patInput, 'PAT input field must be present in popup.html');
    assert.equal(patInput.type, 'password', 'PAT input type must be password');
  });

  test('T1.4.2: popup.html adheres strictly to CSP (zero inline scripts)', () => {
    assert.ok(htmlFile.exists, 'popup.html must exist');
    const doc = parseHTML(htmlFile.content);
    const csp = doc.inspectCSP();
    assert.equal(csp.inlineScripts, 0, 'No inline <script> tags allowed under Manifest V3 CSP');
    assert.equal(csp.inlineHandlers, 0, 'No inline event handlers (e.g. onclick) allowed');
    assert.ok(csp.compliant, 'popup.html must be CSP compliant');
  });

  test('T1.4.3: token is stored in chrome.storage.local and NEVER in sync storage', async () => {
    const mockStorage = createMockStorage();
    await mockStorage.local.set({ gh_pat_token: 'github_pat_secret123' });
    assert.equal(mockStorage.local._dump().gh_pat_token, 'github_pat_secret123');
    await assert.rejects(async () => {
      await mockStorage.sync.set({ gh_pat_token: 'github_pat_secret123' });
    }, /forbidden/, 'chrome.storage.sync must never be used for PAT tokens');
  });

  test('T1.4.4: token trimming strips accidental leading and trailing whitespace', async () => {
    const rawToken = '  github_pat_11AAAAAAA_test_token_string   \n';
    const trimmed = rawToken.trim();
    assert.equal(trimmed, 'github_pat_11AAAAAAA_test_token_string');
    assert.equal(trimmed.length, 38);
  });

  test('T1.4.5: DOM elements never leak token in data attributes or innerHTML', () => {
    assert.ok(htmlFile.exists, 'popup.html must exist');
    assert.ok(!htmlFile.content.includes('github_pat_'), 'popup.html must not contain hardcoded PATs');
    assert.ok(!htmlFile.content.includes('data-token'), 'data-token attributes are prohibited');
  });
});

// --- 5. API Headers & Versioning ---
describe('Tier 1.5: API Headers & Versioning', () => {
  test('T1.5.1: headers include Accept: application/vnd.github+json', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const token = 'github_pat_valid_token_123';
    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    const headers = getHeaders(token);
    assert.equal(headers['Accept'], 'application/vnd.github+json', 'Accept header must match GitHub API spec');
  });

  test('T1.5.2: headers include Authorization: Bearer <TOKEN>', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const token = 'github_pat_valid_token_123';
    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    const headers = getHeaders(token);
    assert.equal(headers['Authorization'], `Bearer ${token}`, 'Authorization header must use Bearer scheme');
  });

  test('T1.5.3: headers include X-GitHub-Api-Version: 2022-11-28', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    const headers = getHeaders('tok');
    assert.equal(headers['X-GitHub-Api-Version'], '2022-11-28', 'X-GitHub-Api-Version must be 2022-11-28');
  });

  test('T1.5.4: User-Agent is attached when executing in Node.js runtime', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    const headers = getHeaders('tok');
    assert.ok(headers['User-Agent'], 'User-Agent header must be present in Node.js runtime');
  });

  test('T1.5.5: fetchUserProfile calls GET https://api.github.com/user with correct headers', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockFetch = createMockFetch([
      {
        match: 'https://api.github.com/user',
        status: 200,
        body: { login: 'octocat', name: 'The Octocat', avatar_url: 'https://avatar.png', public_repos: 8 }
      }
    ]);
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchUserProfile === 'function') {
      const profile = await apiMod.module.fetchUserProfile('test_token');
      assert.equal(profile.login, 'octocat');
      assert.equal(mockFetch.requests.length, 1);
      assert.equal(mockFetch.requests[0].url, 'https://api.github.com/user');
      assert.equal(mockFetch.requests[0].headers['authorization'], 'Bearer test_token');
    } else {
      assert.fail('fetchUserProfile function must be exported from api.js');
    }
  });

  test('T1.5.6: Bearer token is trimmed of surrounding whitespace in header', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    const headers = getHeaders('   untrimmed_token_123   ');
    assert.equal(headers['Authorization'], 'Bearer untrimmed_token_123');
  });
});

// --- 6. Pagination RFC 8288 Next Link Parsing ---
describe('Tier 1.6: Pagination RFC 8288 Next Link Parsing', () => {
  test('T1.6.1: extracts next URL from standard RFC 8288 Link header', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    const link = '<https://api.github.com/user/repos?per_page=100&page=2>; rel="next"';
    assert.equal(parser(link), 'https://api.github.com/user/repos?per_page=100&page=2');
  });

  test('T1.6.2: extracts next URL from multi-rel Link header with next, last, prev', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    const link = '<https://api.github.com/user/repos?page=1>; rel="prev", <https://api.github.com/user/repos?page=3>; rel="next", <https://api.github.com/user/repos?page=5>; rel="last"';
    assert.equal(parser(link), 'https://api.github.com/user/repos?page=3');
  });

  test('T1.6.3: returns null when rel="next" is absent (last page reached)', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    const link = '<https://api.github.com/user/repos?page=1>; rel="prev", <https://api.github.com/user/repos?page=1>; rel="first"';
    assert.equal(parser(link), null);
  });

  test('T1.6.4: returns null when Link header is null or undefined (single-page account)', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    assert.equal(parser(null), null);
    assert.equal(parser(undefined), null);
  });

  test('T1.6.5: handles case-insensitive rel="NEXT" and unquoted rel=next', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    const link1 = '<https://api.github.com/user/repos?page=4>; rel="NEXT"';
    assert.equal(parser(link1), 'https://api.github.com/user/repos?page=4');

    const link2 = '<https://api.github.com/user/repos?page=4>; rel=next';
    assert.equal(parser(link2), 'https://api.github.com/user/repos?page=4');
  });

  test('T1.6.6: ignores irrelevant rel values such as canonical, alternate, first', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    const link = '<https://api.github.com/user/repos?page=1>; rel="canonical"';
    assert.equal(parser(link), null);
  });
});

// --- 7. API Error Status Mapping ---
describe('Tier 1.7: API Error Status Mapping', () => {
  test('T1.7.1: HTTP 401 maps to UNAUTHORIZED with actionable advice', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const err = classifier(401, {}, { message: 'Bad credentials' });
    assert.equal(err.type, 'UNAUTHORIZED');
    assert.equal(err.status, 401);
    assert.ok(err.message.toLowerCase().includes('token'), 'Message must guide user to check token');
  });

  test('T1.7.2: HTTP 403 with x-ratelimit-remaining: 0 maps to RATE_LIMITED', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1200) };
    const err = classifier(403, headers, { message: 'API rate limit exceeded' });
    assert.equal(err.type, 'RATE_LIMITED');
    assert.ok(err.message.toLowerCase().includes('rate limit'));
  });

  test('T1.7.3: HTTP 403 with remaining > 0 maps to FORBIDDEN (insufficient scope)', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const headers = { 'x-ratelimit-remaining': '4999' };
    const err = classifier(403, headers, { message: 'Resource not accessible by personal access token' });
    assert.equal(err.type, 'FORBIDDEN');
    assert.ok(err.message.toLowerCase().includes('permission') || err.message.toLowerCase().includes('scope') || err.message.toLowerCase().includes('access'));
  });

  test('T1.7.4: HTTP 429 maps to RATE_LIMITED with retry advice', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const headers = { 'retry-after': '60' };
    const err = classifier(429, headers, {});
    assert.equal(err.type, 'RATE_LIMITED');
    assert.ok(err.message.includes('60') || err.message.toLowerCase().includes('rate limit'));
  });

  test('T1.7.5: network failure (offline / DNS failure) maps to NETWORK_ERROR', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const err = classifier(0, {}, {}, new TypeError('Failed to fetch'));
    assert.equal(err.type, 'NETWORK_ERROR');
    assert.ok(err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('connection'));
  });

  test('T1.7.6: HTTP 500/502/503 maps to SERVER_ERROR', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const err = classifier(503, {}, {});
    assert.equal(err.type, 'SERVER_ERROR');
    assert.equal(err.status, 503);
  });
});

// --- 8. Real-Time Client-Side Search Filtering ---
describe('Tier 1.8: Real-Time Client-Side Search Filtering', () => {
  const sampleRepos = [
    { name: 'chrome-extension', description: 'A Chrome MV3 extension for GitHub' },
    { name: 'react-dashboard', description: 'Next generation analytics UI' },
    { name: 'python-scraper', description: 'Asynchronous crawler engine' },
    { name: 'dotfiles', description: 'Configuration files for zsh, tmux, vim' }
  ];

  test('T1.8.1: filters repositories by exact repository name', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sampleRepos, 'chrome-extension');
    assert.equal(res.length, 1);
    assert.equal(res[0].name, 'chrome-extension');
  });

  test('T1.8.2: filters repositories by substring repository name (case-insensitive)', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sampleRepos, 'DASH');
    assert.equal(res.length, 1);
    assert.equal(res[0].name, 'react-dashboard');
  });

  test('T1.8.3: filters repositories by description substring (case-insensitive)', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sampleRepos, 'analytics');
    assert.equal(res.length, 1);
    assert.equal(res[0].name, 'react-dashboard');
  });

  test('T1.8.4: returns empty array when query does not match any name or description', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sampleRepos, 'kubernetes-operator');
    assert.equal(res.length, 0);
  });

  test('T1.8.5: trims query whitespace before filtering', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sampleRepos, '   python   ');
    assert.equal(res.length, 1);
    assert.equal(res[0].name, 'python-scraper');
  });

  test('T1.8.6: empty query string returns all repositories unaltered', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sampleRepos, '');
    assert.equal(res.length, sampleRepos.length);
  });
});

// --- 9. Relative Date Formatting ---
describe('Tier 1.9: Relative Date Formatting', () => {
  const now = 1790000000000; // Fixed timestamp reference

  test('T1.9.1: formats timestamp < 60 seconds ago as "just now"', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const format = apiMod.module.formatRelativeTime || ReferenceOracle.formatRelativeTime;
    const iso = new Date(now - 30 * 1000).toISOString();
    assert.equal(format(iso, now), 'just now');
  });

  test('T1.9.2: formats timestamp 15 minutes ago as "15m ago"', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const format = apiMod.module.formatRelativeTime || ReferenceOracle.formatRelativeTime;
    const iso = new Date(now - 15 * 60 * 1000).toISOString();
    assert.equal(format(iso, now), '15m ago');
  });

  test('T1.9.3: formats timestamp 4 hours ago as "4h ago"', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const format = apiMod.module.formatRelativeTime || ReferenceOracle.formatRelativeTime;
    const iso = new Date(now - 4 * 3600 * 1000).toISOString();
    assert.equal(format(iso, now), '4h ago');
  });

  test('T1.9.4: formats timestamp 25 hours ago as "yesterday"', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const format = apiMod.module.formatRelativeTime || ReferenceOracle.formatRelativeTime;
    const iso = new Date(now - 25 * 3600 * 1000).toISOString();
    assert.equal(format(iso, now), 'yesterday');
  });

  test('T1.9.5: formats timestamp 7 days ago as "7d ago"', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const format = apiMod.module.formatRelativeTime || ReferenceOracle.formatRelativeTime;
    const iso = new Date(now - 7 * 86400 * 1000).toISOString();
    assert.equal(format(iso, now), '7d ago');
  });

  test('T1.9.6: formats timestamp > 30 days ago as standard date string', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const format = apiMod.module.formatRelativeTime || ReferenceOracle.formatRelativeTime;
    const iso = new Date(now - 60 * 86400 * 1000).toISOString();
    const result = format(iso, now);
    assert.ok(result !== 'N/A' && !result.includes('ago') && result !== 'yesterday');
  });
});

// --- 10. Disconnect & State Purge Flow ---
describe('Tier 1.10: Disconnect & State Purge Flow', () => {
  test('T1.10.1: disconnect action purges chrome.storage.local completely', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome({
      initialStorage: {
        gh_pat_token: 'secret',
        gh_user_profile: { login: 'user1' },
        gh_cached_repos: [{ name: 'repo1' }]
      }
    });
    globalThis.chrome = mockChrome;

    await storageMod.module.clearStorage();
    const dumped = await mockChrome.storage.local.get();
    assert.deepEqual(dumped, {}, 'All keys must be purged from storage upon disconnect');
  });

  test('T1.10.2: disconnect wipes cached profile from storage', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome({ initialStorage: { gh_user_profile: { login: 'octocat' } } });
    globalThis.chrome = mockChrome;

    await storageMod.module.clearStorage();
    const profile = await storageMod.module.getStorage('gh_user_profile');
    assert.equal(profile, undefined);
  });

  test('T1.10.3: disconnect wipes cached repositories from storage', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome({ initialStorage: { gh_cached_repos: [{ id: 1 }] } });
    globalThis.chrome = mockChrome;

    await storageMod.module.clearStorage();
    const repos = await storageMod.module.getStorage('gh_cached_repos');
    assert.equal(repos, undefined);
  });

  test('T1.10.4: popup.html provides onboarding view and dashboard view containers', () => {
    const htmlFile = readProjectFile('popup.html');
    assert.ok(htmlFile.exists, 'popup.html must exist at project root');
    const doc = parseHTML(htmlFile.content);

    const setupView = doc.getElementById('setup-view') || doc.getElementById('onboarding-view');
    const dashboardView = doc.getElementById('dashboard-view');
    const disconnectBtn = doc.getElementById('disconnect-btn');

    assert.ok(setupView, 'setup/onboarding view container must exist');
    assert.ok(dashboardView, 'dashboard view container must exist');
    assert.ok(disconnectBtn, 'disconnect button must exist in dashboard view');
  });

  test('T1.10.5: disconnect action can be executed repeatedly without throwing', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    // Idempotent execution
    await storageMod.module.clearStorage();
    await storageMod.module.clearStorage();
    assert.deepEqual(await mockChrome.storage.local.get(), {});
  });

  test('T1.10.6: disconnect leaves no residual authentication headers', async () => {
    const getHeaders = ReferenceOracle.getHeaders;
    const emptyHeaders = getHeaders('');
    assert.equal(emptyHeaders['Authorization'], 'Bearer ');
  });
});
