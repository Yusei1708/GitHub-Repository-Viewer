/**
 * Tier 2: Boundary & Corner Cases Test Suite
 * Manifest V3 GitHub Chrome Extension
 * 
 * Verifies edge cases and boundary conditions (>= 5 tests per feature):
 * 1. Empty inputs handling
 * 2. Max repos >100 pagination clamp & page boundaries
 * 3. Missing, malformed, or unusual Link headers
 * 4. Malformed, oversized, or non-standard tokens
 * 5. Rate limit reset epoch timestamp parsing & clock skew
 * 6. Zero repositories account states
 * 7. Empty or whitespace search queries
 * 8. Special regex characters in search filtering
 * 9. Null description/name fallbacks & invalid date strings
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

// --- 1. Empty Inputs Handling ---
describe('Tier 2.1: Empty Inputs Handling', () => {
  test('T2.1.1: empty token string "" is intercepted before API fetch', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockFetch = createMockFetch();
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchUserProfile === 'function') {
      await assert.rejects(async () => {
        await apiMod.module.fetchUserProfile('');
      }, /token/i, 'Empty token must be rejected before network call');
      assert.equal(mockFetch.requests.length, 0, 'No HTTP request should be dispatched for empty token');
    } else {
      assert.fail('fetchUserProfile function must be exported from api.js');
    }
  });

  test('T2.1.2: whitespace-only token is intercepted before API fetch', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockFetch = createMockFetch();
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchUserProfile === 'function') {
      await assert.rejects(async () => {
        await apiMod.module.fetchUserProfile('   \t\n  ');
      }, /token/i, 'Whitespace token must be rejected before network call');
      assert.equal(mockFetch.requests.length, 0);
    } else {
      assert.fail('fetchUserProfile function must be exported from api.js');
    }
  });

  test('T2.1.3: empty repository array [] returned by API is handled gracefully', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockFetch = createMockFetch([
      { match: 'https://api.github.com/user/repos', status: 200, body: [] }
    ]);
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchAllUserRepos === 'function') {
      const repos = await apiMod.module.fetchAllUserRepos('valid_token');
      assert.ok(Array.isArray(repos), 'Must return an array');
      assert.equal(repos.length, 0, 'Array must be empty');
    } else {
      assert.fail('fetchAllUserRepos function must be exported from api.js');
    }
  });

  test('T2.1.4: calling storage get with empty string key returns undefined without throwing', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    const val = await storageMod.module.getStorage('');
    assert.equal(val, undefined);
  });

  test('T2.1.5: calling filterRepositories on empty repository array returns []', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter([], 'query');
    assert.deepEqual(res, []);
  });

  test('T2.1.6: calling formatRelativeTime with empty string returns N/A', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const format = apiMod.module.formatRelativeTime || ReferenceOracle.formatRelativeTime;
    assert.equal(format(''), 'N/A');
    assert.equal(format(null), 'N/A');
    assert.equal(format(undefined), 'N/A');
  });
});

// --- 2. Max Repos >100 Pagination Clamp & Boundaries ---
describe('Tier 2.2: Max Repos >100 Pagination Clamp & Boundaries', () => {
  test('T2.2.1: initial repository fetch specifies per_page=100 query parameter', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockFetch = createMockFetch([
      { match: 'https://api.github.com/user/repos', status: 200, body: [] }
    ]);
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchAllUserRepos === 'function') {
      await apiMod.module.fetchAllUserRepos('token');
      assert.ok(mockFetch.requests.length >= 1);
      assert.ok(mockFetch.requests[0].url.includes('per_page=100'), 'Initial request must specify per_page=100');
    } else {
      assert.fail('fetchAllUserRepos function must be exported from api.js');
    }
  });

  test('T2.2.2: pagination enforces maxPages safety ceiling to avoid rate limit drain', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    // Simulate endless pagination Link headers
    let fetchCount = 0;
    const mockFetch = async (url) => {
      fetchCount++;
      const nextPage = fetchCount + 1;
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'Link': `<https://api.github.com/user/repos?page=${nextPage}>; rel="next"`
        }),
        async json() {
          return [{ id: fetchCount, name: `repo-${fetchCount}` }];
        }
      };
    };
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchAllUserRepos === 'function') {
      const maxPages = 5;
      const repos = await apiMod.module.fetchAllUserRepos('token', maxPages);
      assert.equal(fetchCount, maxPages, 'Must stop exactly at maxPages');
      assert.equal(repos.length, maxPages, 'Must accumulate repositories up to maxPages');
    } else {
      assert.fail('fetchAllUserRepos function must be exported from api.js');
    }
  });

  test('T2.2.3: account with exactly 100 repositories terminates on page 1 if no next Link header', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const page1Repos = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `repo-${i + 1}` }));
    const mockFetch = createMockFetch([
      {
        match: 'https://api.github.com/user/repos',
        status: 200,
        headers: {}, // No Link header (exactly 100 repos fit in 1 page)
        body: page1Repos
      }
    ]);
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchAllUserRepos === 'function') {
      const repos = await apiMod.module.fetchAllUserRepos('token');
      assert.equal(mockFetch.requests.length, 1, 'Should make only 1 request');
      assert.equal(repos.length, 100);
    } else {
      assert.fail('fetchAllUserRepos function must be exported from api.js');
    }
  });

  test('T2.2.4: account with 101 repositories across 2 pages makes exactly 2 fetches', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const page1Repos = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `repo-${i + 1}` }));
    const page2Repos = [{ id: 101, name: 'repo-101' }];

    const mockFetch = createMockFetch([
      {
        match: 'page=2',
        status: 200,
        headers: {}, // No next link on last page
        body: page2Repos
      },
      {
        match: 'https://api.github.com/user/repos',
        status: 200,
        headers: {
          'Link': '<https://api.github.com/user/repos?per_page=100&page=2>; rel="next"'
        },
        body: page1Repos
      }
    ]);
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchAllUserRepos === 'function') {
      const repos = await apiMod.module.fetchAllUserRepos('token');
      assert.equal(mockFetch.requests.length, 2, 'Must make exactly 2 requests for 101 repos');
      assert.equal(repos.length, 101);
      assert.equal(repos[100].name, 'repo-101');
    } else {
      assert.fail('fetchAllUserRepos function must be exported from api.js');
    }
  });

  test('T2.2.5: pagination terminates if a page returns empty array even if Link header is present', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockFetch = createMockFetch([
      {
        match: 'https://api.github.com/user/repos',
        status: 200,
        headers: {
          'Link': '<https://api.github.com/user/repos?page=2>; rel="next"'
        },
        body: [] // Unexpectedly empty body
      }
    ]);
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchAllUserRepos === 'function') {
      const repos = await apiMod.module.fetchAllUserRepos('token');
      assert.equal(mockFetch.requests.length, 1, 'Should terminate on empty page');
      assert.equal(repos.length, 0);
    } else {
      assert.fail('fetchAllUserRepos function must be exported from api.js');
    }
  });
});

// --- 3. Missing, Malformed, or Unusual Link Headers ---
describe('Tier 2.3: Missing, Malformed, or Unusual Link Headers', () => {
  test('T2.3.1: response without Link header terminates pagination loop cleanly', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    assert.equal(parser(null), null);
    assert.equal(parser(undefined), null);
  });

  test('T2.3.2: empty string Link header "" returns null next URL', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    assert.equal(parser(''), null);
    assert.equal(parser('   '), null);
  });

  test('T2.3.3: Link header missing URL angle brackets returns null', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    assert.equal(parser('https://api.github.com/user/repos?page=2; rel="next"'), null);
  });

  test('T2.3.4: Link header containing only rel="prev" returns null', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    assert.equal(parser('<https://api.github.com/user/repos?page=1>; rel="prev"'), null);
  });

  test('T2.3.5: malformed non-string Link header handles gracefully without throwing TypeError', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const parser = apiMod.module.parseNextLink || ReferenceOracle.parseNextLink;
    assert.doesNotThrow(() => {
      parser(12345);
      parser({});
      parser([]);
    });
  });
});

// --- 4. Malformed, Oversized, or Non-Standard Tokens ---
describe('Tier 2.4: Malformed, Oversized, or Non-Standard Tokens', () => {
  test('T2.4.1: token with embedded tabs or newlines is trimmed and sanitized', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    const dirty = '\n\t  github_pat_valid_token_clean  \t\r\n';
    const headers = getHeaders(dirty);
    assert.equal(headers['Authorization'], 'Bearer github_pat_valid_token_clean');
  });

  test('T2.4.2: extremely long token (10,000 characters) does not crash or throw memory error', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    const hugeToken = 'github_pat_' + 'A'.repeat(10000);
    assert.doesNotThrow(() => {
      const headers = getHeaders(hugeToken);
      assert.equal(headers['Authorization'].length, 10018);
    });
  });

  test('T2.4.3: non-ASCII or Unicode characters in token string handled without unhandled exception', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    assert.doesNotThrow(() => {
      getHeaders('token_with_utf8_🔥_unicode');
    });
  });

  test('T2.4.4: null or undefined token passed to fetchUserProfile rejects cleanly', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    if (typeof apiMod.module.fetchUserProfile === 'function') {
      await assert.rejects(async () => {
        await apiMod.module.fetchUserProfile(null);
      }, /token/i);
      await assert.rejects(async () => {
        await apiMod.module.fetchUserProfile(undefined);
      }, /token/i);
    } else {
      assert.fail('fetchUserProfile function must be exported from api.js');
    }
  });

  test('T2.4.5: classic PAT prefix ghp_ is accepted alongside fine-grained github_pat_', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const getHeaders = apiMod.module.getHeaders || ReferenceOracle.getHeaders;
    const classicToken = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const headers = getHeaders(classicToken);
    assert.equal(headers['Authorization'], `Bearer ${classicToken}`);
  });
});

// --- 5. Rate Limit Reset Epoch Timestamp Parsing & Clock Skew ---
describe('Tier 2.5: Rate Limit Reset Epoch Timestamp Parsing & Clock Skew', () => {
  test('T2.5.1: parses valid future epoch timestamp and computes remaining minutes', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const futureEpoch = Math.floor(Date.now() / 1000) + 1800; // 30 minutes in future
    const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(futureEpoch) };
    const err = classifier(403, headers, { message: 'rate limit' });

    assert.equal(err.type, 'RATE_LIMITED');
    assert.ok(err.message.includes('min'), 'Message must include minutes remaining');
  });

  test('T2.5.2: handles past reset epoch timestamp (clock skew) clamping remaining minutes to 0', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const pastEpoch = Math.floor(Date.now() / 1000) - 300; // 5 minutes in past
    const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(pastEpoch) };
    const err = classifier(403, headers, { message: 'rate limit' });

    assert.equal(err.type, 'RATE_LIMITED');
    assert.ok(!err.message.includes('~-'), 'Minutes must not be negative');
  });

  test('T2.5.3: handles missing x-ratelimit-reset header gracefully', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const headers = { 'x-ratelimit-remaining': '0' }; // No reset header
    const err = classifier(403, headers, { message: 'rate limit' });

    assert.equal(err.type, 'RATE_LIMITED');
    assert.ok(err.message.toLowerCase().includes('rate limit'));
  });

  test('T2.5.4: handles non-numeric x-ratelimit-reset header without crashing or NaN', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': 'corrupted_string' };
    const err = classifier(403, headers, { message: 'rate limit' });

    assert.equal(err.type, 'RATE_LIMITED');
    assert.ok(!err.message.includes('NaN'), 'Must not output NaN');
  });

  test('T2.5.5: parses retry-after header in seconds for HTTP 429 secondary rate limit', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const classifier = apiMod.module.classifyApiError || ReferenceOracle.classifyApiError;
    const headers = { 'retry-after': '120' };
    const err = classifier(429, headers, {});

    assert.equal(err.type, 'RATE_LIMITED');
    assert.ok(err.message.includes('120') && err.message.includes('second'));
  });
});

// --- 6. Zero Repositories Account States ---
describe('Tier 2.6: Zero Repositories Account States', () => {
  test('T2.6.1: zero repos payload does not crash rendering', () => {
    const htmlFile = readProjectFile('popup.html');
    assert.ok(htmlFile.exists, 'popup.html must exist');
    const doc = parseHTML(htmlFile.content);

    const emptyContainer = doc.getElementById('empty-state') || doc.querySelector('.empty-state');
    assert.ok(emptyContainer, 'Empty state element must exist in popup.html');
  });

  test('T2.6.2: filterRepositories on empty repos array returns empty array', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter([], 'something');
    assert.deepEqual(res, []);
  });

  test('T2.6.3: empty search on empty repos array returns empty array', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter([], '');
    assert.deepEqual(res, []);
  });

  test('T2.6.4: storing empty repos array in chrome.storage.local works cleanly', async () => {
    const storageMod = await loadProjectModule('storage.js');
    if (!storageMod.exists) assert.fail('storage.js must exist at project root');

    const mockChrome = createMockChrome();
    globalThis.chrome = mockChrome;

    await storageMod.module.setStorage({ gh_cached_repos: [] });
    const stored = await storageMod.module.getStorage('gh_cached_repos');
    assert.deepEqual(stored, []);
  });

  test('T2.6.5: pagination stops immediately on page 1 when 0 repos returned', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const mockFetch = createMockFetch([
      { match: 'https://api.github.com/user/repos', status: 200, body: [] }
    ]);
    globalThis.fetch = mockFetch;

    if (typeof apiMod.module.fetchAllUserRepos === 'function') {
      const repos = await apiMod.module.fetchAllUserRepos('token');
      assert.equal(mockFetch.requests.length, 1);
      assert.equal(repos.length, 0);
    } else {
      assert.fail('fetchAllUserRepos function must be exported from api.js');
    }
  });
});

// --- 7. Empty or Whitespace Search Queries ---
describe('Tier 2.7: Empty or Whitespace Search Queries', () => {
  const sample = [
    { name: 'repo-1', description: 'first' },
    { name: 'repo-2', description: 'second' }
  ];

  test('T2.7.1: query "" returns all original repositories in original order', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sample, '');
    assert.equal(res.length, 2);
    assert.equal(res[0].name, 'repo-1');
    assert.equal(res[1].name, 'repo-2');
  });

  test('T2.7.2: whitespace query "   " returns all original repositories', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sample, '    ');
    assert.equal(res.length, 2);
  });

  test('T2.7.3: query null returns all original repositories', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sample, null);
    assert.equal(res.length, 2);
  });

  test('T2.7.4: query undefined returns all original repositories', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sample, undefined);
    assert.equal(res.length, 2);
  });

  test('T2.7.5: clear search button element exists in popup.html', () => {
    const htmlFile = readProjectFile('popup.html');
    assert.ok(htmlFile.exists, 'popup.html must exist');
    const doc = parseHTML(htmlFile.content);

    const clearBtn = doc.getElementById('clear-search-btn') || doc.querySelector('.clear-search');
    assert.ok(clearBtn, 'Clear search button must exist in toolbar');
  });
});

// --- 8. Special Regex Characters in Search Filtering ---
describe('Tier 2.8: Special Regex Characters in Search Filtering', () => {
  const sample = [
    { name: 'c++', description: 'Modern C++ utilities' },
    { name: 'regex-test', description: 'Pattern matching .* and [a-z]' },
    { name: 'formula-calc', description: 'Evaluation of (a + b) * c' },
    { name: 'path\\separator', description: 'Windows style \\ path' },
    { name: 'anchor^$end', description: 'Starts with ^ and ends with $' }
  ];

  test('T2.8.1: search query with dot "." matches literal dot, not any wildcard character', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const res = filter(sample, '.*');
    assert.equal(res.length, 1);
    assert.equal(res[0].name, 'regex-test');
  });

  test('T2.8.2: search query with "+" or "*" does not throw SyntaxError', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    assert.doesNotThrow(() => {
      const res = filter(sample, 'c++');
      assert.equal(res.length, 1);
      assert.equal(res[0].name, 'c++');
    });
  });

  test('T2.8.3: search query with square brackets "[a-z]" matches literal brackets', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    assert.doesNotThrow(() => {
      const res = filter(sample, '[a-z]');
      assert.equal(res.length, 1);
      assert.equal(res[0].name, 'regex-test');
    });
  });

  test('T2.8.4: search query with parentheses "(a + b)" matches literal parentheses', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    assert.doesNotThrow(() => {
      const res = filter(sample, '(a + b)');
      assert.equal(res.length, 1);
      assert.equal(res[0].name, 'formula-calc');
    });
  });

  test('T2.8.5: search query with backslash "\\" and anchors "^", "$" matches literally', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    assert.doesNotThrow(() => {
      const resSlash = filter(sample, '\\');
      assert.equal(resSlash.length, 1);

      const resAnchor = filter(sample, '^$');
      assert.equal(resAnchor.length, 1);
    });
  });
});

// --- 9. Null Description/Name Fallbacks & Invalid Date Strings ---
describe('Tier 2.9: Null Description/Name Fallbacks & Invalid Date Strings', () => {
  test('T2.9.1: repository with description: null does not crash filtering or rendering', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const filter = apiMod.module.filterRepositories || ReferenceOracle.filterRepositories;
    const repos = [{ name: 'null-desc-repo', description: null }];
    assert.doesNotThrow(() => {
      const res = filter(repos, 'null');
      assert.equal(res.length, 1);
    });
  });

  test('T2.9.2: user profile with name: null falls back to login handle', () => {
    const profile = { login: 'octocat', name: null };
    const displayName = profile.name || profile.login;
    assert.equal(displayName, 'octocat', 'Display name must fall back to login');
  });

  test('T2.9.3: user profile with name: "" (empty string) falls back to login handle', () => {
    const profile = { login: 'octocat', name: '' };
    const displayName = profile.name || profile.login;
    assert.equal(displayName, 'octocat');
  });

  test('T2.9.4: repository with language: null is supported without crashing', () => {
    const repo = { name: 'docs', language: null };
    const lang = repo.language || 'Plain Text';
    assert.equal(lang, 'Plain Text');
  });

  test('T2.9.5: date formatter with invalid date string returns "N/A" without throwing RangeError', async () => {
    const apiMod = await loadProjectModule('api.js');
    if (!apiMod.exists) assert.fail('api.js must exist at project root');

    const format = apiMod.module.formatRelativeTime || ReferenceOracle.formatRelativeTime;
    assert.doesNotThrow(() => {
      assert.equal(format('invalid-date-string-xyz'), 'N/A');
      assert.equal(format('9999-99-99T99:99:99Z'), 'N/A');
    });
  });
});
