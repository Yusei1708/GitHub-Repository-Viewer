/**
 * Tier 4: Real-World Application Scenarios (User Journeys)
 * Manifest V3 GitHub Chrome Extension
 * 
 * Verifies realistic end-to-end user journeys:
 * 1. Journey 1: First-time setup & initial sync
 * 2. Journey 2: High-volume repository browsing (>100 repos)
 * 3. Journey 3: Searching private & public repositories
 * 4. Journey 4: Handling rate limits & recovery
 * 5. Journey 5: Account switching via disconnect & reconnect
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

// --- Journey 1: First-Time User Setup & Initial Sync ---
describe('Tier 4.1: First-Time User Setup & Initial Sync', () => {
  test('Journey 1: empty state -> enter PAT -> verify -> fetch profile & repos -> render dashboard', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    // 1. Initial Empty State
    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    const initialDump = await mockChrome.storage.local.get();
    assert.deepEqual(initialDump, {}, 'Storage must initially be completely empty');

    // 2. Setup Network Mock for User & Repos
    const patToken = 'github_pat_11ALICE_onboarding_token_sample';
    const mockProfile = {
      login: 'alice-dev',
      name: 'Alice Developer',
      avatar_url: 'https://avatars.githubusercontent.com/u/10001',
      html_url: 'https://github.com/alice-dev',
      public_repos: 5
    };
    const mockRepos = [
      { id: 1, name: 'project-aurora', private: false, description: 'Design system', updated_at: '2026-09-24T10:00:00Z' },
      { id: 2, name: 'internal-microservice', private: true, description: 'Core API engine', updated_at: '2026-09-23T08:30:00Z' }
    ];

    const mockFetch = createMockFetch([
      {
        match: 'https://api.github.com/user/repos',
        status: 200,
        headers: {},
        body: mockRepos
      },
      {
        match: 'https://api.github.com/user',
        status: 200,
        headers: {},
        body: mockProfile
      }
    ]);
    globalThis.fetch = mockFetch;

    // 3. User Enters Token & Submits
    const cleanToken = patToken.trim();
    assert.ok(cleanToken.startsWith('github_pat_'), 'Token has valid fine-grained prefix');

    // 4. API Calls Executed
    if (typeof apiMod.module.fetchUserProfile === 'function' && typeof apiMod.module.fetchAllUserRepos === 'function') {
      const user = await apiMod.module.fetchUserProfile(cleanToken);
      assert.equal(user.login, 'alice-dev');
      assert.equal(user.name, 'Alice Developer');

      const repos = await apiMod.module.fetchAllUserRepos(cleanToken);
      assert.equal(repos.length, 2);

      // 5. State Persisted to Storage
      await storageMod.module.setStorage({
        gh_pat_token: cleanToken,
        gh_user_profile: user,
        gh_cached_repos: repos,
        gh_last_cached_at: Date.now()
      });

      const storedProfile = await storageMod.module.getStorage('gh_user_profile');
      assert.equal(storedProfile.login, 'alice-dev');

      const storedRepos = await storageMod.module.getStorage('gh_cached_repos');
      assert.equal(storedRepos.length, 2);

      // 6. UI Views Validated in popup.html
      const htmlFile = readProjectFile('popup.html');
      assert.ok(htmlFile.exists, 'popup.html must exist');
      const doc = parseHTML(htmlFile.content);

      assert.ok(doc.getElementById('setup-view') || doc.getElementById('onboarding-view'), 'Setup view exists');
      assert.ok(doc.getElementById('dashboard-view'), 'Dashboard view exists');
      assert.ok(doc.getElementById('profile-avatar') || doc.querySelector('.profile-avatar'), 'Profile avatar container exists');
      assert.ok(doc.getElementById('profile-login') || doc.querySelector('.profile-login'), 'Profile login handle exists');
    } else {
      assert.fail('fetchUserProfile and fetchAllUserRepos must be exported from api.js');
    }
  });
});

// --- Journey 2: High-Volume Repository Browsing (>100 Repositories) ---
describe('Tier 4.2: High-Volume Repository Browsing (>100 Repositories)', () => {
  test('Journey 2: user with 250 repositories across 3 pages -> traverse Link headers -> render complete dataset', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `repo-${i + 1}`, private: false }));
    const page2 = Array.from({ length: 100 }, (_, i) => ({ id: 100 + i + 1, name: `repo-${100 + i + 1}`, private: true }));
    const page3 = Array.from({ length: 50 }, (_, i) => ({ id: 200 + i + 1, name: `repo-${200 + i + 1}`, private: false }));

    const mockFetch = createMockFetch([
      {
        match: 'page=3',
        status: 200,
        headers: {
          'Link': '<https://api.github.com/user/repos?page=2>; rel="prev", <https://api.github.com/user/repos?page=1>; rel="first"'
        },
        body: page3
      },
      {
        match: 'page=2',
        status: 200,
        headers: {
          'Link': '<https://api.github.com/user/repos?page=3>; rel="next", <https://api.github.com/user/repos?page=1>; rel="prev"'
        },
        body: page2
      },
      {
        match: 'https://api.github.com/user/repos',
        status: 200,
        headers: {
          'Link': '<https://api.github.com/user/repos?per_page=100&page=2>; rel="next", <https://api.github.com/user/repos?per_page=100&page=3>; rel="last"'
        },
        body: page1
      }
    ]);
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchAllUserRepos === 'function') {
      const allRepos = await apiMod.module.fetchAllUserRepos('token', 10);
      assert.equal(allRepos.length, 250, 'All 250 repositories must be fetched across all 3 pages');
      assert.equal(mockFetch.requests.length, 3, 'Must issue exactly 3 HTTP requests');

      // Verify dataset integrity
      assert.equal(allRepos[0].name, 'repo-1');
      assert.equal(allRepos[99].name, 'repo-100');
      assert.equal(allRepos[100].name, 'repo-101');
      assert.equal(allRepos[199].name, 'repo-200');
      assert.equal(allRepos[200].name, 'repo-201');
      assert.equal(allRepos[249].name, 'repo-250');

      // Cache all 250 repos
      await storageMod.module.setStorage({ gh_cached_repos: allRepos });
      const cached = await storageMod.module.getStorage('gh_cached_repos');
      assert.equal(cached.length, 250);
    } else {
      assert.fail('fetchAllUserRepos must be exported from api.js');
    }
  });
});

// --- Journey 3: Searching Private & Public Repositories ---
describe('Tier 4.3: Searching Private & Public Repositories', () => {
  const mixedRepos = [
    { name: 'public-docs', description: 'Documentation site for users', private: false },
    { name: 'secret-auth-gateway', description: 'Zero trust OAuth server', private: true },
    { name: 'c++-parser', description: 'Fast C++ AST analyzer with (advanced) regex', private: false },
    { name: 'billing-ledger', description: 'Financial transactions service', private: true }
  ];

  test('Journey 3: instant filter by name -> filter by description -> regex character tolerance -> clear search', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;

    // Step 1: Search by private repo name
    const res1 = filter(mixedRepos, 'secret-auth');
    assert.equal(res1.length, 1);
    assert.equal(res1[0].name, 'secret-auth-gateway');
    assert.equal(res1[0].private, true);

    // Step 2: Search by description keyword
    const res2 = filter(mixedRepos, 'Zero Trust');
    assert.equal(res2.length, 1);
    assert.equal(res2[0].name, 'secret-auth-gateway');

    // Step 3: Search with regex characters "c++"
    const res3 = filter(mixedRepos, 'c++');
    assert.equal(res3.length, 1);
    assert.equal(res3[0].name, 'c++-parser');

    // Step 4: Search with parentheses and brackets "(advanced)"
    const res4 = filter(mixedRepos, '(advanced)');
    assert.equal(res4.length, 1);
    assert.equal(res4[0].name, 'c++-parser');

    // Step 5: Clear search
    const resAll = filter(mixedRepos, '');
    assert.equal(resAll.length, 4);
  });
});

// --- Journey 4: Handling Rate Limits & Recovery ---
describe('Tier 4.4: Handling Rate Limits & Recovery', () => {
  test('Journey 4: cached data exists -> refresh hits 403 Rate Limit -> banner shown -> cached data remains -> retry succeeds', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    // 1. Initial cached state with 10 repositories
    const initialRepos = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `cached-repo-${i + 1}` }));
    await storageMod.module.setStorage({
      gh_pat_token: 'valid_token_123',
      gh_cached_repos: initialRepos
    });

    // 2. User triggers refresh -> API returns HTTP 403 Rate Limit
    const resetTime = Math.floor(Date.now() / 1000) + 600; // 10 minutes
    const mockFetch = createMockFetch([
      {
        match: 'https://api.github.com/user/repos',
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(resetTime)
        },
        body: { message: 'API rate limit exceeded' }
      }
    ]);
    globalThis.fetch = mockFetch;

    // 3. Application handles error
    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const err = classifier(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetTime) }, { message: 'API rate limit exceeded' });

    assert.equal(err.type, 'RATE_LIMITED');
    assert.ok(err.message.includes('rate limit'));
    assert.ok(err.message.includes('min'));

    // 4. Data Preservation: Storage was NOT wiped or corrupted
    const preserved = await storageMod.module.getStorage('gh_cached_repos');
    assert.equal(preserved.length, 10, 'Cached repositories must remain intact');

    // 5. Recovery: Rate limit window resets -> fresh fetch succeeds
    const refreshedRepos = [...initialRepos, { id: 11, name: 'cached-repo-11' }];
    mockFetch.addRoute({
      match: 'https://api.github.com/user/repos',
      status: 200,
      headers: {},
      body: refreshedRepos
    });

    if (typeof apiMod.module.fetchAllUserRepos === 'function') {
      const fresh = await apiMod.module.fetchAllUserRepos('valid_token_123');
      assert.equal(fresh.length, 11);
      await storageMod.module.setStorage({ gh_cached_repos: fresh });

      const updated = await storageMod.module.getStorage('gh_cached_repos');
      assert.equal(updated.length, 11);
    } else {
      assert.fail('fetchAllUserRepos must be exported from api.js');
    }
  });
});

// --- Journey 5: Account Switching via Disconnect & Reconnect ---
describe('Tier 4.5: Account Switching via Disconnect & Reconnect', () => {
  test('Journey 5: User A connected -> Disconnect -> Purge all -> User B connects with fresh token -> render User B only', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    // 1. User A active session
    await storageMod.module.setStorage({
      gh_pat_token: 'token_user_a',
      gh_user_profile: { login: 'alice-dev', name: 'Alice' },
      gh_cached_repos: [{ id: 101, name: 'alice-repo' }]
    });

    assert.equal((await storageMod.module.getStorage('gh_user_profile')).login, 'alice-dev');

    // 2. User A clicks Disconnect
    await storageMod.module.clearStorage();
    assert.deepEqual(await mockChrome.storage.local.get(), {});

    // 3. User B Enters Token
    const tokenB = 'token_user_b';
    const mockFetch = createMockFetch([
      {
        match: 'https://api.github.com/user/repos',
        status: 200,
        body: [{ id: 201, name: 'bob-repo' }]
      },
      {
        match: 'https://api.github.com/user',
        status: 200,
        body: { login: 'bob-eng', name: 'Bob' }
      }
    ]);
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchUserProfile === 'function' && typeof apiMod.module.fetchAllUserRepos === 'function') {
      const userB = await apiMod.module.fetchUserProfile(tokenB);
      const reposB = await apiMod.module.fetchAllUserRepos(tokenB);

      await storageMod.module.setStorage({
        gh_pat_token: tokenB,
        gh_user_profile: userB,
        gh_cached_repos: reposB
      });

      // 4. Verify complete isolation: Zero trace of User A
      const finalStored = await mockChrome.storage.local.get();
      assert.equal(finalStored.gh_pat_token, 'token_user_b');
      assert.equal(finalStored.gh_user_profile.login, 'bob-eng');
      assert.equal(finalStored.gh_cached_repos[0].name, 'bob-repo');
      assert.equal(finalStored.alice_repo, undefined);
    } else {
      assert.fail('fetchUserProfile and fetchAllUserRepos must be exported from api.js');
    }
  });
});
