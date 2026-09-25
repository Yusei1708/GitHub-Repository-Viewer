/**
 * popup.js - Main Controller for GitHub Repository Viewer Chrome Extension
 *
 * Implements token authentication flow, repository search, pagination sync,
 * error notification recovery, and account disconnection.
 */

import { getStorage, setStorage, clearStorage, STORAGE_KEYS } from './storage.js';
import { fetchUserProfile, fetchAllUserRepos, filterRepositories, formatRelativeTime } from './api.js';

// Application state
let currentToken = null;
let userProfile = null;
let cachedRepos = [];
let isFetching = false;

// DOM Elements
let setupView;
let dashboardView;
let patInput;
let tokenForm;
let saveTokenBtn;
let setupError;
let setupErrorText;
let profileAvatar;
let profileLogin;
let repoCountBadge;
let refreshBtn;
let disconnectBtn;
let searchInput;
let clearSearchBtn;
let errorBanner;
let errorMessage;
let retryBtn;
let loadingSpinner;
let emptyState;
let emptyMessage;
let repoList;

/**
 * Initializes DOM element references once DOM is loaded.
 */
function initElements() {
  setupView = document.getElementById('setup-view');
  dashboardView = document.getElementById('dashboard-view');
  patInput = document.getElementById('pat-input');
  tokenForm = document.getElementById('token-form');
  saveTokenBtn = document.getElementById('save-token-btn');
  setupError = document.getElementById('setup-error');
  setupErrorText = document.getElementById('setup-error-text');
  profileAvatar = document.getElementById('profile-avatar');
  profileLogin = document.getElementById('profile-login');
  repoCountBadge = document.getElementById('repo-count-badge');
  refreshBtn = document.getElementById('refresh-btn');
  disconnectBtn = document.getElementById('disconnect-btn');
  searchInput = document.getElementById('search-input');
  clearSearchBtn = document.getElementById('clear-search-btn');
  errorBanner = document.getElementById('error-banner');
  errorMessage = document.getElementById('error-message');
  retryBtn = document.getElementById('retry-btn');
  loadingSpinner = document.getElementById('loading-spinner');
  emptyState = document.getElementById('empty-state');
  emptyMessage = document.getElementById('empty-message');
  repoList = document.getElementById('repo-list');
}

/**
 * Display the setup view for entering token.
 */
function showSetupView() {
  setupView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  if (patInput) patInput.value = '';
  hideSetupError();
  hideErrorBanner();
}

/**
 * Display the dashboard view and render profile and repositories.
 */
function showDashboardView(profile, repos) {
  setupView.classList.add('hidden');
  dashboardView.classList.remove('hidden');

  if (profile) {
    if (profile.avatar_url && profileAvatar) {
      profileAvatar.src = profile.avatar_url;
    }
    if (profileLogin) {
      profileLogin.textContent = profile.name ? `${profile.name} (@${profile.login})` : (profile.login || 'GitHub User');
    }
  }

  renderRepos(repos || []);
}

/**
 * Renders a list of repositories into the DOM.
 * @param {Array<object>} reposToRender
 */
function renderRepos(reposToRender) {
  if (!repoList) return;
  repoList.innerHTML = '';

  const total = cachedRepos.length;
  const count = reposToRender.length;

  if (repoCountBadge) {
    repoCountBadge.textContent = total > count
      ? `${count} of ${total} repos`
      : `${total} ${total === 1 ? 'repo' : 'repos'}`;
  }

  if (count === 0) {
    if (emptyState) {
      emptyState.classList.remove('hidden');
      if (emptyMessage) {
        emptyMessage.textContent = searchInput && searchInput.value.trim()
          ? 'No repositories match your search query.'
          : 'No repositories found for this account.';
      }
    }
    return;
  }

  if (emptyState) {
    emptyState.classList.add('hidden');
  }

  const fragment = document.createDocumentFragment();

  for (const repo of reposToRender) {
    const li = document.createElement('li');
    li.className = 'repo-card';

    const header = document.createElement('div');
    header.className = 'repo-card-header';

    const link = document.createElement('a');
    link.className = 'repo-name-link';
    link.href = repo.html_url || `https://github.com/${repo.full_name || repo.name}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = repo.name || 'Unnamed Repository';

    // Intercept clicks to open smoothly via chrome.tabs if available
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetUrl = link.href;
      if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function') {
        chrome.tabs.create({ url: targetUrl, active: true });
      } else {
        window.open(targetUrl, '_blank');
      }
    });

    const badge = document.createElement('span');
    const isPrivate = Boolean(repo.private);
    badge.className = `visibility-badge ${isPrivate ? 'private' : 'public'}`;
    badge.textContent = isPrivate ? 'Private' : 'Public';

    header.appendChild(link);
    header.appendChild(badge);
    li.appendChild(header);

    if (repo.description) {
      const desc = document.createElement('p');
      desc.className = 'repo-description';
      desc.textContent = repo.description;
      li.appendChild(desc);
    }

    const footer = document.createElement('div');
    footer.className = 'repo-footer';

    if (repo.language) {
      const lang = document.createElement('span');
      lang.className = 'repo-lang';
      const dot = document.createElement('span');
      dot.className = 'lang-dot';
      lang.appendChild(dot);
      lang.appendChild(document.createTextNode(repo.language));
      footer.appendChild(lang);
    }

    const updated = document.createElement('span');
    updated.className = 'repo-updated';
    updated.textContent = `Updated ${formatRelativeTime(repo.updated_at)}`;
    footer.appendChild(updated);

    li.appendChild(footer);
    fragment.appendChild(li);
  }

  repoList.appendChild(fragment);
}

/**
 * Filter repositories according to active search query.
 */
function handleSearch() {
  const query = searchInput ? searchInput.value : '';

  if (clearSearchBtn) {
    if (query.length > 0) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
  }

  const filtered = filterRepositories(cachedRepos, query);
  renderRepos(filtered);
}

/**
 * Clears the active search query and resets view.
 */
function handleClearSearch() {
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  if (clearSearchBtn) {
    clearSearchBtn.classList.add('hidden');
  }
  renderRepos(cachedRepos);
}

/**
 * Displays error banner with optional retry capability.
 * @param {string} msg
 */
function showErrorBanner(msg) {
  if (!errorBanner) return;
  if (errorMessage) {
    errorMessage.textContent = msg || 'An unexpected error occurred.';
  }
  errorBanner.classList.remove('hidden');
}

/**
 * Hides the error banner.
 */
function hideErrorBanner() {
  if (errorBanner) {
    errorBanner.classList.add('hidden');
  }
}

/**
 * Displays setup view error text.
 * @param {string} msg
 */
function showSetupError(msg) {
  if (!setupError) return;
  if (setupErrorText) {
    setupErrorText.textContent = msg || 'Invalid token. Please check and try again.';
  }
  setupError.classList.remove('hidden');
}

/**
 * Hides setup view error text.
 */
function hideSetupError() {
  if (setupError) {
    setupError.classList.add('hidden');
  }
}

/**
 * Handles user token submission.
 * @param {Event} e
 */
async function handleConnect(e) {
  if (e) e.preventDefault();
  if (isFetching) return;

  const rawToken = patInput ? patInput.value.trim() : '';
  if (!rawToken) {
    showSetupError('Please enter a valid Personal Access Token.');
    return;
  }

  isFetching = true;
  hideSetupError();
  if (saveTokenBtn) {
    saveTokenBtn.disabled = true;
    const spinner = saveTokenBtn.querySelector('.btn-spinner');
    if (spinner) spinner.classList.remove('hidden');
  }

  try {
    const profile = await fetchUserProfile(rawToken);
    const repos = await fetchAllUserRepos(rawToken);

    currentToken = rawToken;
    userProfile = profile;
    cachedRepos = repos;

    // Securely save token, profile, and repos in chrome.storage.local
    await setStorage({
      [STORAGE_KEYS.TOKEN]: rawToken,
      [STORAGE_KEYS.PROFILE]: profile,
      [STORAGE_KEYS.REPOS]: repos,
      [STORAGE_KEYS.UPDATED_AT]: Date.now()
    });

    if (patInput) patInput.value = '';
    showDashboardView(userProfile, cachedRepos);
  } catch (err) {
    showSetupError(err.message || 'Failed to authenticate token with GitHub.');
  } finally {
    isFetching = false;
    if (saveTokenBtn) {
      saveTokenBtn.disabled = false;
      const spinner = saveTokenBtn.querySelector('.btn-spinner');
      if (spinner) spinner.classList.add('hidden');
    }
  }
}

/**
 * Refreshes repositories and user profile from GitHub API.
 */
async function handleRefresh() {
  if (isFetching) return;
  isFetching = true;

  if (refreshBtn) refreshBtn.classList.add('spinning');
  hideErrorBanner();

  try {
    const token = currentToken || await getStorage(STORAGE_KEYS.TOKEN);
    if (!token) {
      showSetupView();
      return;
    }

    const [profile, repos] = await Promise.all([
      fetchUserProfile(token),
      fetchAllUserRepos(token)
    ]);

    userProfile = profile;
    cachedRepos = repos;

    await setStorage({
      [STORAGE_KEYS.PROFILE]: profile,
      [STORAGE_KEYS.REPOS]: repos,
      [STORAGE_KEYS.UPDATED_AT]: Date.now()
    });

    showDashboardView(userProfile, cachedRepos);
    if (searchInput && searchInput.value.trim()) {
      handleSearch();
    }
  } catch (err) {
    // Preserve cached repos display on error (as required by Tier 3.4.1)
    showErrorBanner(err.message || 'Failed to refresh repositories from GitHub.');
  } finally {
    isFetching = false;
    if (refreshBtn) refreshBtn.classList.remove('spinning');
  }
}

/**
 * Disconnects GitHub account, purges all local storage, and resets UI.
 */
async function handleDisconnect() {
  try {
    await clearStorage();
  } catch {
    // Storage clear is idempotent
  }

  currentToken = null;
  userProfile = null;
  cachedRepos = [];

  if (searchInput) searchInput.value = '';
  if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
  hideErrorBanner();

  showSetupView();
}

/**
 * Main application initialization.
 */
async function init() {
  initElements();

  // Attach event listeners
  if (tokenForm) {
    tokenForm.addEventListener('submit', handleConnect);
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', handleDisconnect);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefresh);
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', handleRefresh);
  }

  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', handleClearSearch);
  }

  // Load existing credentials and cached data
  try {
    const token = await getStorage(STORAGE_KEYS.TOKEN);
    if (token) {
      currentToken = token;
      userProfile = await getStorage(STORAGE_KEYS.PROFILE);
      cachedRepos = (await getStorage(STORAGE_KEYS.REPOS)) || [];

      showDashboardView(userProfile, cachedRepos);

      // Silently refresh in background to keep data fresh
      handleRefresh().catch(() => {});
    } else {
      showSetupView();
    }
  } catch (err) {
    showSetupView();
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
