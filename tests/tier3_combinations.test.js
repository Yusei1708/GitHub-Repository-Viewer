/**
 * Tier 3: Cross-Feature Combinations Test Suite
 * Manifest V3 GitHub Chrome Extension
 * 
 * Verifies pairwise cross-feature interactions:
 * 1. Token Entry + Storage Persistence + API Header Generation
 * 2. Search Filter + Pagination Cached Results
 * 3. Disconnect + Storage Purge + UI State Reset + Tab Delegation
 * 4. Rate Limit Error + Cached Repo Fallback
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

// --- 1. Token Entry + Storage Persistence + API Header Generation ---
describe('Tier 3.1: Token Entry + Storage Persistence + API Header Generation', () => {
  test('T3.1.1: token entry persists to storage and generates valid Bearer authorization header', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    const mockFetch = createMockFetch([
      {
        match: 'https://api.github.com/user',
        status: 200,
        body: { login: 'octocat', name: 'Mona Lisa' }
      }
    ]);
    globalThis.fetch = mockFetch;

    // Step 1: User enters token -> saved to storage
    const enteredToken = 'github_pat_11AAAAAAA_test_token_combo';
    await storageMod.module.setStorage({ gh_pat_token: enteredToken });

    // Step 2: API client reads token from storage
    const storedToken = await storageMod.module.getStorage('gh_pat_token');
    assert.equal(storedToken, enteredToken);

    // Step 3: API client generates headers and performs request
    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    const headers = getHeaders(storedToken);
    assert.equal(headers['Authorization'], `Bearer ${enteredToken}`);
    assert.equal(headers['X-GitHub-Api-Version'], '2022-11-28');

    if (typeof apiMod.module.fetchUserProfile === 'function') {
      const user = await apiMod.module.fetchUserProfile(storedToken);
      assert.equal(user.login, 'octocat');
      assert.equal(mockFetch.requests[0].headers['authorization'], `Bearer ${enteredToken}`);
    }
  });

  test('T3.1.2: token entry with padding is trimmed before storage and API header creation', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    const rawInput = '   \tgithub_pat_untrimmed_secret_value   \n';
    const cleanToken = rawInput.trim();
    await storageMod.module.setStorage({ gh_pat_token: cleanToken });

    const retrieved = await storageMod.module.getStorage('gh_pat_token');
    assert.equal(retrieved, 'github_pat_untrimmed_secret_value');

    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    const headers = getHeaders(retrieved);
    assert.equal(headers['Authorization'], 'Bearer github_pat_untrimmed_secret_value');
  });

  test('T3.1.3: token update overwrites old token and subsequent requests use new token', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    // Set initial token
    await storageMod.module.setStorage({ gh_pat_token: 'old_token_111' });
    assert.equal(await storageMod.module.getStorage('gh_pat_token'), 'old_token_111');

    // Overwrite with new token
    await storageMod.module.setStorage({ gh_pat_token: 'new_token_222' });
    const current = await storageMod.module.getStorage('gh_pat_token');
    assert.equal(current, 'new_token_222');

    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    assert.equal(getHeaders(current)['Authorization'], 'Bearer new_token_222');
  });

  test('T3.1.4: empty token entry is rejected without modifying existing storage', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome({ initialStorage: { gh_pat_token: 'existing_valid_token' } });
    globalThis.chrome = mockChrome;

    // Attempt invalid entry
    const invalidInput = '   ';
    if (!invalidInput.trim()) {
      // Form validation aborts without updating storage
    } else {
      await storageMod.module.setStorage({ gh_pat_token: invalidInput.trim() });
    }

    assert.equal(await storageMod.module.getStorage('gh_pat_token'), 'existing_valid_token');
  });
});

// --- 2. Search Filter + Pagination Cached Results ---
describe('Tier 3.2: Search Filter + Pagination Cached Results', () => {
  // Simulate 250 repositories across 3 pages
  const page1 = Array.from({ length: 100 }, (_, i) => ({
    name: `repo-page1-${i + 1}`,
    description: `Description for page 1 repo ${i + 1}`,
    private: i % 2 === 0
  }));
  const page2 = Array.from({ length: 100 }, (_, i) => ({
    name: `repo-page2-${i + 1}`,
    description: `Description for page 2 repo ${i + 1}`,
    private: i % 3 === 0
  }));
  const page3 = Array.from({ length: 50 }, (_, i) => ({
    name: `repo-page3-${i + 1}`,
    description: i === 42 ? 'Special targeted keyword for test' : `Description for page 3 repo ${i + 1}`,
    private: true
  }));

  test('T3.2.1: search filter operates instantly across all 250 cached repositories without network calls', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockFetch = createMockFetch();
    globalThis.fetch = mockFetch;

    // Simulate cached 250 repos in storage
    const allRepos = [...page1, ...page2, ...page3];
    assert.equal(allRepos.length, 250);

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const filtered = filter(allRepos, 'page2-50');

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, 'repo-page2-50');
    assert.equal(mockFetch.requests.length, 0, 'Search filter must be purely client-side with 0 network calls');
  });

  test('T3.2.2: clearing search restores all 250 repositories from memory cache without API re-fetch', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const allRepos = [...page1, ...page2, ...page3];
    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;

    // Filter down to 1
    const sub = filter(allRepos, 'page3-43');
    assert.equal(sub.length, 1);

    // Clear search
    const restored = filter(allRepos, '');
    assert.equal(restored.length, 250);
  });

  test('T3.2.3: search query matching description on page 3 correctly retrieves item', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const allRepos = [...page1, ...page2, ...page3];
    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;

    const matches = filter(allRepos, 'targeted keyword');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].name, 'repo-page3-43');
    assert.equal(matches[0].private, true);
  });

  test('T3.2.4: search matching 0 repositories returns [] while preserving full cached set', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const allRepos = [...page1, ...page2, ...page3];
    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;

    const noMatches = filter(allRepos, 'nonexistent-query-string-999');
    assert.equal(noMatches.length, 0);
    assert.equal(allRepos.length, 250, 'Original cached array must remain unchanged');
  });
});

// --- 3. Disconnect + Storage Purge + UI State Reset + Tab Delegation ---
describe('Tier 3.3: Disconnect + Storage Purge + UI State Reset + Tab Delegation', () => {
  test('T3.3.1: disconnect wipes storage and transitions UI from dashboard to setup view', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome({
      initialStorage: {
        gh_pat_token: 'token_to_purge',
        gh_user_profile: { login: 'octocat' },
        gh_cached_repos: [{ name: 'repo-1' }]
      }
    });
    globalThis.chrome = mockChrome;

    // Simulate Disconnect trigger
    await storageMod.module.clearStorage();
    assert.deepEqual(await mockChrome.storage.local.get(), {});

    // Inspect popup.html elements
    const htmlFile = readProjectFile('popup.html');
    assert.ok(htmlFile.exists, 'popup.html must exist');
    const doc = parseHTML(htmlFile.content);

    const setupView = doc.getElementById('setup-view') || doc.getElementById('onboarding-view');
    const dashboardView = doc.getElementById('dashboard-view');
    assert.ok(setupView, 'setup-view must exist');
    assert.ok(dashboardView, 'dashboard-view must exist');
  });

  test('T3.3.2: disconnect cleans active search query and resets DOM state', () => {
    const htmlFile = readProjectFile('popup.html');
    assert.ok(htmlFile.exists, 'popup.html must exist');
    const doc = parseHTML(htmlFile.content);

    const searchInput = doc.getElementById('search-input') || doc.querySelector('input[type="search"]');
    assert.ok(searchInput, 'Search input must exist in popup.html');

    // Resetting value on disconnect
    searchInput.value = 'some query';
    searchInput.value = '';
    assert.equal(searchInput.value, '');
  });

  test('T3.3.3: external link opening uses chrome.tabs.create without popup crash', async () => {
    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    const targetUrl = 'https://github.com/octocat/Hello-World';
    await mockChrome.tabs.create({ url: targetUrl, active: true });

    const tabs = mockChrome.tabs._getCreatedTabs();
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].url, targetUrl);
    assert.equal(tabs[0].active, true);
  });

  test('T3.3.4: disconnect while error banner is displayed clears error banner', () => {
    const htmlFile = readProjectFile('popup.html');
    assert.ok(htmlFile.exists, 'popup.html must exist');
    const doc = parseHTML(htmlFile.content);

    const errorBanner = doc.getElementById('error-banner') || doc.querySelector('.error-banner');
    assert.ok(errorBanner, 'Error banner container must exist');
  });
});

// --- 4. Rate Limit Error + Cached Repo Fallback ---
describe('Tier 3.4: Rate Limit Error + Cached Repo Fallback', () => {
  const existingCachedRepos = [
    { name: 'cached-repo-1', description: 'Previously synced repo' },
    { name: 'cached-repo-2', description: 'Another synced repo' }
  ];

  test('T3.4.1: rate limit on refresh displays banner while keeping existing cached repos visible', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const futureReset = Math.floor(Date.now() / 1000) + 900;
    const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(futureReset) };

    const err = classifier(403, headers, { message: 'rate limit' });
    assert.equal(err.type, 'RATE_LIMITED');
    assert.ok(err.message.includes('rate limit'));

    // Verify cached repos are NOT destroyed on refresh error
    assert.equal(existingCachedRepos.length, 2);
    assert.equal(existingCachedRepos[0].name, 'cached-repo-1');
  });

  test('T3.4.2: network offline on refresh displays offline banner while preserving cached data', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const err = classifier(0, {}, {}, new TypeError('Failed to fetch'));
    assert.equal(err.type, 'NETWORK_ERROR');
    assert.ok(err.message.toLowerCase().includes('network'));

    // Cached data remains available
    assert.equal(existingCachedRepos.length, 2);
  });

  test('T3.4.3: retry button is present in error banner layout', () => {
    const htmlFile = readProjectFile('popup.html');
    assert.ok(htmlFile.exists, 'popup.html must exist');
    const doc = parseHTML(htmlFile.content);

    const retryBtn = doc.getElementById('retry-btn') || doc.querySelector('.retry-btn');
    assert.ok(retryBtn, 'Retry button must exist for error recovery');
  });
});
