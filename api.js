/**
 * api.js - GitHub REST API Service & Data Logic for GitHub Chrome Extension
 *
 * Manifest V3 compatible GitHub API client targeting GitHub REST API v2022-11-28.
 * Supports Bearer authentication with fine-grained or classic Personal Access Tokens (PAT),
 * multi-page RFC 8288 Link header auto-pagination, robust error classification (401, 403, 429, network offline),
 * client-side instant search filtering, and relative date formatting.
 *
 * Environment Behavior:
 * - In Node.js runtime (tests/verification): attaches User-Agent: GitHub-Chrome-Extension/1.0
 * - In Browser/Extension popup: omits User-Agent to avoid browser console warnings
 */

export const GITHUB_BASE_URL = 'https://api.github.com';
export const GITHUB_API_VERSION = '2022-11-28';
export const USER_AGENT = 'GitHub-Chrome-Extension/1.0';

/**
 * Checks whether code is currently running in a Node.js runtime environment.
 * @returns {boolean}
 */
export function isNodeEnvironment() {
  return typeof window === 'undefined' ||
    (typeof process !== 'undefined' && Boolean(process.versions) && Boolean(process.versions.node));
}

/**
 * Validates a Personal Access Token string.
 * Rejects null, undefined, non-strings, or empty/whitespace-only tokens before network dispatch.
 * @param {any} token
 * @throws {Error} if token is invalid
 */
export function validateToken(token) {
  if (token === null || token === undefined || typeof token !== 'string' || !token.trim()) {
    throw new Error('Personal Access Token is required and cannot be empty.');
  }
}

/**
 * Generates standard GitHub API request headers.
 * Trims surrounding whitespace from token.
 * Conditionally attaches User-Agent only in Node.js environments.
 *
 * @param {string} [token] - GitHub Personal Access Token
 * @returns {Record<string, string>} Header dictionary
 */
export function getHeaders(token) {
  const cleanToken = (typeof token === 'string') ? token.trim() : '';
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${cleanToken}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION
  };

  if (isNodeEnvironment()) {
    headers['User-Agent'] = USER_AGENT;
  }

  return headers;
}

/**
 * Parses RFC 8288 Link header to extract the URL for rel="next".
 * Handles single-link, multi-link, unquoted/quoted rel values, case-insensitive rel values,
 * and malformed inputs gracefully.
 *
 * @param {string|null|undefined} linkHeader - Raw Link header from HTTP response
 * @returns {string|null} Next page URL or null if absent/invalid
 */
export function parseNextLink(linkHeader) {
  if (!linkHeader || typeof linkHeader !== 'string') return null;

  const parts = linkHeader.split(',');
  for (const part of parts) {
    const sections = part.split(';');
    if (sections.length < 2) continue;

    const urlMatch = sections[0].match(/<([^>]+)>/);
    if (!urlMatch) continue;

    const url = urlMatch[1].trim();

    for (let i = 1; i < sections.length; i++) {
      const relMatch = sections[i].match(/rel=["']?([^"'\s;]+)["']?/i);
      if (relMatch && relMatch[1].toLowerCase() === 'next') {
        return url;
      }
    }
  }

  return null;
}

/**
 * Classifies API responses and errors into categorized error objects.
 * Accurately detects network outages, invalid tokens (401), rate limits (403/429),
 * insufficient scopes, and server errors (5xx).
 *
 * @param {number} status - HTTP status code (0 for network exceptions)
 * @param {Headers|object} [headers={}] - Response headers
 * @param {object} [body={}] - Parsed response JSON body
 * @param {Error|null} [networkError=null] - Network/fetch error if caught
 * @returns {{ type: string, message: string, status: number }}
 */
export function classifyApiError(status, headers = {}, body = {}, networkError = null) {
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
    const getHeader = (key) => {
      if (!headers) return null;
      if (typeof headers.get === 'function') {
        return headers.get(key) || headers.get(key.toLowerCase());
      }
      return headers[key] || headers[key.toLowerCase()] || null;
    };

    const remaining = getHeader('x-ratelimit-remaining');
    const reset = getHeader('x-ratelimit-reset');
    const retryAfter = getHeader('retry-after');
    const bodyMsg = (body && typeof body.message === 'string') ? body.message : '';

    const isRateLimit = remaining === '0' ||
      status === 429 ||
      bodyMsg.toLowerCase().includes('rate limit');

    if (isRateLimit) {
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
      message: bodyMsg || 'Access forbidden: Insufficient token permissions. Please ensure your token has read-only access to User profile and Repositories.',
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
    message: (body && body.message) || `API error occurred (HTTP ${status}).`,
    status
  };
}

/**
 * Pure function to filter repositories in-memory by name or description.
 * Safe against special regex characters (c++, .*, [a-z], etc.) and handles null descriptions.
 *
 * @param {Array<object>} repos - Array of repository objects
 * @param {string} query - User search query
 * @returns {Array<object>} Filtered repository list
 */
export function filterRepositories(repos, query) {
  if (!Array.isArray(repos)) return [];
  if (!query || typeof query !== 'string') return repos;

  const q = query.trim().toLowerCase();
  if (!q) return repos;

  return repos.filter(repo => {
    if (!repo || typeof repo !== 'object') return false;
    const name = (typeof repo.name === 'string') ? repo.name.toLowerCase() : '';
    const desc = (typeof repo.description === 'string') ? repo.description.toLowerCase() : '';
    return name.includes(q) || desc.includes(q);
  });
}

/**
 * Formats an ISO 8601 date string into human-readable relative time.
 * Accepts an optional reference timestamp for deterministic testing.
 *
 * Output formats:
 * - < 60 seconds: "just now"
 * - < 60 minutes: "Xm ago"
 * - < 24 hours: "Xh ago"
 * - 1 day: "yesterday"
 * - < 30 days: "Xd ago"
 * - >= 30 days: "MMM DD, YYYY" (e.g. "Sep 20, 2026")
 * - invalid/null: "N/A"
 *
 * @param {string|null|undefined} isoString - ISO date string (e.g. repo.updated_at)
 * @param {number} [nowTimestamp=Date.now()] - Reference epoch milliseconds
 * @returns {string}
 */
export function formatRelativeTime(isoString, nowTimestamp = Date.now()) {
  if (!isoString || typeof isoString !== 'string') return 'N/A';

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'N/A';

  const diffMs = nowTimestamp - date.getTime();
  if (diffMs < 0) return 'just now'; // Clamp future dates due to slight clock skew

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

/**
 * Fetches authenticated user profile from GET https://api.github.com/user.
 * Maps result to standardized profile object with display name fallback to login.
 *
 * @param {string} token - GitHub PAT
 * @returns {Promise<{ login: string, name: string, avatar_url: string, html_url: string, public_repos: number }>}
 */
export async function fetchUserProfile(token) {
  validateToken(token);
  const cleanToken = token.trim();
  const url = `${GITHUB_BASE_URL}/user`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(cleanToken)
    });
  } catch (networkErr) {
    const errorInfo = classifyApiError(0, {}, {}, networkErr);
    const err = new Error(errorInfo.message);
    err.type = errorInfo.type;
    err.status = 0;
    err.originalError = networkErr;
    throw err;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const errorInfo = classifyApiError(response.status, response.headers, body);
    const err = new Error(errorInfo.message);
    err.type = errorInfo.type;
    err.status = response.status;
    err.details = errorInfo;
    throw err;
  }

  const raw = await response.json();
  const displayName = (raw.name && String(raw.name).trim()) ? raw.name : raw.login;

  return {
    ...raw,
    login: raw.login,
    name: displayName,
    avatar_url: raw.avatar_url || '',
    html_url: raw.html_url || `https://github.com/${raw.login}`,
    public_repos: typeof raw.public_repos === 'number' ? raw.public_repos : 0
  };
}

/**
 * Fetches all accessible repositories for the authenticated user from GET /user/repos.
 * Traverses RFC 8288 Link headers for pagination up to maxPages.
 *
 * @param {string} token - GitHub PAT
 * @param {number} [maxPages=10] - Safety cap for pagination
 * @returns {Promise<Array<object>>} Accumulated list of repositories
 */
export async function fetchAllUserRepos(token, maxPages = 10) {
  validateToken(token);
  const cleanToken = token.trim();
  const max = (typeof maxPages === 'number' && maxPages > 0) ? maxPages : 10;

  let url = `${GITHUB_BASE_URL}/user/repos?per_page=100&sort=updated`;
  const allRepos = [];
  let pageCount = 0;

  while (url && pageCount < max) {
    pageCount++;

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: getHeaders(cleanToken)
      });
    } catch (networkErr) {
      const errorInfo = classifyApiError(0, {}, {}, networkErr);
      const err = new Error(errorInfo.message);
      err.type = errorInfo.type;
      err.status = 0;
      err.originalError = networkErr;
      throw err;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const errorInfo = classifyApiError(response.status, response.headers, body);
      const err = new Error(errorInfo.message);
      err.type = errorInfo.type;
      err.status = response.status;
      err.details = errorInfo;
      throw err;
    }

    const repos = await response.json().catch(() => []);
    if (!Array.isArray(repos) || repos.length === 0) {
      break;
    }

    allRepos.push(...repos);

    let linkHeader = null;
    if (response.headers) {
      if (typeof response.headers.get === 'function') {
        linkHeader = response.headers.get('Link') || response.headers.get('link');
      } else {
        linkHeader = response.headers.Link || response.headers.link || response.headers.LINK || null;
      }
    }

    url = parseNextLink(linkHeader);
  }

  return allRepos;
}

export default {
  GITHUB_BASE_URL,
  GITHUB_API_VERSION,
  USER_AGENT,
  isNodeEnvironment,
  validateToken,
  getHeaders,
  parseNextLink,
  classifyApiError,
  filterRepositories,
  formatRelativeTime,
  fetchUserProfile,
  fetchAllUserRepos
};

// CommonJS compatibility export for test runners using require()
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GITHUB_BASE_URL,
    GITHUB_API_VERSION,
    USER_AGENT,
    isNodeEnvironment,
    validateToken,
    getHeaders,
    parseNextLink,
    classifyApiError,
    filterRepositories,
    formatRelativeTime,
    fetchUserProfile,
    fetchAllUserRepos,
    default: {
      GITHUB_BASE_URL,
      GITHUB_API_VERSION,
      USER_AGENT,
      isNodeEnvironment,
      validateToken,
      getHeaders,
      parseNextLink,
      classifyApiError,
      filterRepositories,
      formatRelativeTime,
      fetchUserProfile,
      fetchAllUserRepos
    }
  };
}
