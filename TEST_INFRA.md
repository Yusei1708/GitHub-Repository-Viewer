# E2E Test Infrastructure Specification: Manifest V3 GitHub Chrome Extension

## 1. Test Philosophy & Principles

The Manifest V3 GitHub Chrome Extension test suite is built on **opaque-box, requirement-driven testing** principles:

1. **Opaque-Box Requirement-Driven**: Tests are designed strictly from user requirements (`ORIGINAL_REQUEST.md`), architectural specifications (`PROJECT.md`), and authoritative protocol standards (Manifest V3, GitHub REST API v2022-11-28, RFC 8288 Web Linking). Tests evaluate behavior, contracts, and observable outputs rather than internal implementation quirks.
2. **Zero External Dependencies**: The test runner and all test suites run purely on native Node.js (v26+) without any `npm install` or third-party test framework (Jest, Mocha, Vitest, Playwright). This ensures instantaneous execution, zero dependency rot, and 100% portability.
3. **Progressive Testability & Graceful Failure**: The test harness is designed to execute at any phase of the development lifecycle. When implementation modules are missing or in-progress, tests report clear, actionable failure diagnostics rather than crashing the runner process.
4. **Deterministic & Isolated**: Each test case is self-contained. Storage state, DOM mocks, and network mocks are instantiated freshly per test with zero shared mutation or execution-order dependency.
5. **Defense-in-Depth Security Verification**: Dedicated tests enforce least-privilege permissions, token isolation, secret scrubbing from DOM and logs, and secure tab delegation.

---

## 2. Directory & File Layout

```
/home/yusei1708/code/chrome/
├── TEST_INFRA.md                  # This test infrastructure document
├── TEST_READY.md                  # Test suite readiness & execution report
├── tests/
│   ├── e2e_runner.js              # Zero-dependency test runner & mock engine
│   ├── tier1_features.test.js     # Tier 1: Core Feature Coverage (>=5 tests / feature)
│   ├── tier2_boundaries.test.js   # Tier 2: Boundary & Corner Cases (>=5 tests / feature)
│   ├── tier3_combinations.test.js # Tier 3: Cross-Feature Combinations (pairwise interactions)
│   └── tier4_workloads.test.js    # Tier 4: Real-World Workloads (end-to-end user journeys)
├── manifest.json                  # Manifest V3 extension definition
├── popup.html                     # Extension popup DOM markup
├── popup.css                      # Extension popup styling (Primer Dark)
├── popup.js                       # Popup controller and event orchestration
├── api.js                         # GitHub REST API client & data processors
├── storage.js                     # Local storage wrapper with mock adapter
├── icons/                         # Extension icons (16px, 48px, 128px)
├── verify.js                      # Automated verification script
└── README.md                      # Comprehensive Vietnamese guide
```

---

## 3. 4-Tier Test Architecture

The testing methodology is organized into four rigorous tiers:

| Tier | Focus | Test File | Target Coverage |
| :--- | :--- | :--- | :--- |
| **Tier 1: Features** | Happy path & core functionality | `tests/tier1_features.test.js` | >= 5 tests per core feature (Manifest, Permissions, Storage, Token Security, API Headers, Link Parsing, Error Mapping, Search Filter, Date Formatter, Disconnect) |
| **Tier 2: Boundaries** | Boundary values, corner cases & fault tolerance | `tests/tier2_boundaries.test.js` | >= 5 tests per edge feature (Empty inputs, 100+ repos clamp, missing Link headers, malformed tokens, rate limit reset epoch, zero repos, empty query, regex special chars, null fallbacks) |
| **Tier 3: Combinations** | Cross-feature pairwise interactions | `tests/tier3_combinations.test.js` | Multi-step interactions (Token -> Storage -> API headers; Search -> Pagination cache; Disconnect -> Purge -> UI reset; Rate limit -> Cached fallback) |
| **Tier 4: Workloads** | Real-world end-to-end user journeys | `tests/tier4_workloads.test.js` | Full realistic user journeys (First-time onboarding, high-volume account >100 repos, searching private repos, rate limit recovery, account switching) |

---

## 4. Feature Inventory Coverage Matrix

Mapping from `PROJECT.md` Feature Inventory to the E2E Test Suite:

| # | Feature Name | Source | Test Tier & IDs | Primary Invariants Verified |
|---|--------------|--------|-----------------|-----------------------------|
| 1 | Manifest V3 Configuration | R1 | Tier 1 (T1.1.1–T1.1.6) | `manifest_version: 3`, valid JSON, valid popup and icons |
| 2 | Icon Assets | R4 | Tier 1 (T1.1.5, T1.1.6) | 16x16, 48x48, 128x128 PNG headers and dimensions |
| 3 | Storage Adapter & Security | R1 | Tier 1 (T1.3.1–T1.3.6), Tier 2 (T2.1.4) | `getStorage`, `setStorage`, `clearStorage`, atomic wipe |
| 4 | Token Lifecycle & Isolation | R1 | Tier 1 (T1.4.1–T1.4.5), Tier 2 (T2.4.1–T2.4.5), Tier 3 (T3.1) | Masked password input, never in HTML/logs, trimmed |
| 5 | GitHub REST API Client | R2 | Tier 1 (T1.5.1–T1.5.6), Tier 4 (T4.1) | `Accept`, `Authorization: Bearer`, `X-GitHub-Api-Version: 2022-11-28` |
| 6 | Multi-Page Pagination | R2 | Tier 1 (T1.6.1–T1.6.6), Tier 2 (T2.2.1–T2.2.6), Tier 4 (T4.2) | RFC 8288 `Link` parsing, `rel="next"`, multi-page accumulation |
| 7 | Single-Page & Empty Detection | R2 | Tier 2 (T2.3.1–T2.3.5, T2.6.1–T2.6.5) | Single-page termination, 0 repos empty state |
| 8 | Error Classification & Reset Header | R2 | Tier 1 (T1.7.1–T1.7.6), Tier 2 (T2.5.1–T2.5.5), Tier 3 (T3.4), Tier 4 (T4.4) | 401, 403 (with reset epoch), 429 (`retry-after`), network offline |
| 9 | Client-Side Search Engine | R2 | Tier 1 (T1.8.1–T1.8.6), Tier 2 (T2.7.1–T2.8.5), Tier 3 (T3.2), Tier 4 (T4.3) | Instant substring filter, regex safety, zero re-fetch |
| 10 | Relative Date Formatter | R3 | Tier 1 (T1.9.1–T1.9.6), Tier 2 (T2.9.5) | "just now", "Xm ago", "Xh ago", "yesterday", "Xd ago", "MMM DD, YYYY" |
| 11 | Popup Layout & Primer Styling | R3 | Tier 1 (T1.1.4, T1.4.1), Tier 4 (T4.1) | 380px–420px width, max 580px, Primer Dark, no inline scripts |
| 12 | Onboarding / Setup View | R3 | Tier 1 (T1.4.1, T1.10.4), Tier 4 (T4.1) | Password input, guide text, transition to dashboard |
| 13 | Dashboard Profile Header | R3 | Tier 1 (T1.10.4), Tier 2 (T2.9.2–T2.9.3), Tier 4 (T4.1) | Avatar, handle, name fallback, disconnect trigger |
| 14 | Dashboard Toolbar & Refresh | R3 | Tier 2 (T2.6.4), Tier 3 (T3.4), Tier 4 (T4.4) | Search bar, clear button, refresh button with spinner |
| 15 | Repository Cards Display | R3 | Tier 1 (T1.8.1–T1.8.3), Tier 2 (T2.9.1), Tier 4 (T4.2) | Name, public/private badge, description fallback, timestamp |
| 16 | External Link Safe Delegation | R3 | Tier 3 (T3.3), Tier 4 (T4.1) | Safe tab opening (`chrome.tabs.create`), no popup crash |
| 17 | Empty & Error UI States | R3 | Tier 2 (T2.6.1, T2.7.5), Tier 3 (T3.4), Tier 4 (T4.4) | Empty account state, search empty state, retry banner |
| 18 | Disconnect Purge Action | R1 | Tier 1 (T1.10.1–T1.10.6), Tier 3 (T3.3), Tier 4 (T4.5) | Storage wipe, cache wipe, UI reset to setup view |

---

## 5. Test Runner Architecture & Commands

The custom test runner (`tests/e2e_runner.js`) is an asynchronous test execution framework providing:
- Suite aggregation (`describe`) and test registration (`test` / `it`).
- Asynchronous lifecycle hooks (`beforeEach`, `afterEach`).
- In-memory `chrome.storage.local` mock implementation conforming to W3C / Chrome extensions storage spec.
- In-memory `fetch` mock interceptor with request logging, header emulation, and error injection.
- Virtual DOM mock parser for inspecting popup HTML structure and UI state.
- Module loader with ESM and CommonJS interoperability.
- Rich terminal output with ANSI colors, time tracking, failure diagnostics, and summary statistics.

### Test Runner Commands

```bash
# 1. Run all test tiers (Tiers 1, 2, 3, and 4)
node tests/e2e_runner.js

# 2. Run a specific tier
node tests/e2e_runner.js tier1
node tests/e2e_runner.js tier2
node tests/e2e_runner.js tier3
node tests/e2e_runner.js tier4

# 3. Filter tests by name or pattern
node tests/e2e_runner.js --match "token"
node tests/e2e_runner.js -m "pagination"

# 4. Stop on first failure (Bail mode)
node tests/e2e_runner.js --bail

# 5. Verbose diagnostic mode
node tests/e2e_runner.js --verbose

# 6. Test runner self-test (validates mock adapters, assertion harness, and syntax)
node tests/e2e_runner.js --self-test
```

---

## 6. Expected Output Derivation & Authoritative Sources

All expected outputs in this test suite are derived from explicit authoritative specifications:
1. **Manifest V3 Standards**: W3C Extensions Specification & Chrome Extensions Developer Docs.
2. **GitHub REST API Version 2022-11-28**: Header specs (`Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`), endpoint behavior (`/user`, `/user/repos`), rate limiting (`x-ratelimit-*`, `retry-after`).
3. **RFC 8288 (Web Linking)**: Formal grammar for `Link: <url>; rel="relation"` header traversal.
4. **Specification Mining Report**: Live HTTP probe observations documented in `.agents/spec_miner_survey_1/handoff.md`.
5. **Project Specification**: Architecture and interface contracts defined in `.agents/orchestrator_1/PROJECT.md` and `.agents/ORIGINAL_REQUEST.md`.
