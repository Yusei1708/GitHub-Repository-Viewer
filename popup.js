/**
 * popup.js - Main Controller for GitHub Repository Viewer Chrome Extension
 *
 * Implements token authentication flow, repository search, pagination sync,
 * error notification recovery, and account disconnection.
 */

import { getStorage, setStorage, clearStorage, STORAGE_KEYS } from './storage.js';
import {
  fetchUserProfile,
  fetchAllUserRepos,
  fetchUserContributions,
  filterRepositories,
  formatRelativeTime,
  CONTRIBUTION_LEVEL_MAP
} from './api.js';

// Application state
let currentToken = null;
let userProfile = null;
let cachedRepos = [];
let cachedContributions = null;
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
let contribSection;
let contribScrollArea;
let contribMonths;
let contribGrid;
let contribTooltip;
let contribLearnLink;

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
  contribSection = document.getElementById('contributions-section');
  contribScrollArea = document.getElementById('contrib-scroll-area');
  contribMonths = document.getElementById('contrib-months');
  contribGrid = document.getElementById('contrib-grid');
  contribTooltip = document.getElementById('contrib-tooltip');
  contribLearnLink = document.getElementById('contrib-learn-link');
}

/**
 * Display the setup view for entering token.
 */
function showSetupView() {
  setupView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  if (patInput) patInput.value = '';
  if (contribSection) contribSection.classList.add('hidden');
  if (contribTooltip) contribTooltip.classList.add('hidden');
  hideSetupError();
  hideErrorBanner();
}

/**
 * Formats a calendar day tooltip string.
 * @param {number} count
 * @param {string} dateStr (YYYY-MM-DD)
 * @returns {string} e.g. "No contributions on Nov 5, 2025"
 */
function formatDayTooltip(count, dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  const formattedDate = isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const countStr = count === 0 ? 'No contributions' : `${count} ${count === 1 ? 'contribution' : 'contributions'}`;
  return `${countStr} on ${formattedDate}`;
}

/**
 * Renders the GitHub Contributions Heatmap calendar.
 * Safe DOM rendering adhering strictly to Manifest V3 CSP.
 * @param {object|null} calendarData
 */
function renderContributions(calendarData) {
  if (!contribSection || !contribGrid) return;

  if (!calendarData || !Array.isArray(calendarData.weeks) || calendarData.weeks.length === 0) {
    contribSection.classList.add('hidden');
    return;
  }

  contribSection.classList.remove('hidden');
  contribGrid.innerHTML = '';
  if (contribMonths) contribMonths.innerHTML = '';

  const weeks = calendarData.weeks;
  const totalWeeks = weeks.length;

  // Render months row
  if (contribMonths) {
    const colWidth = 12.5; // 10px cell + 2.5px gap
    const months = Array.isArray(calendarData.months) ? calendarData.months : [];

    for (let m = 0; m < months.length; m++) {
      const monthInfo = months[m];
      if (!monthInfo || !monthInfo.firstDay) continue;

      const startCol = weeks.findIndex(w =>
        Array.isArray(w.contributionDays) &&
        w.contributionDays.some(d => d && d.date >= monthInfo.firstDay)
      );

      if (startCol === -1) continue;

      // Check distance to next month label to prevent overlapping
      let nextCol = totalWeeks;
      if (m + 1 < months.length && months[m + 1]?.firstDay) {
        const nextStart = weeks.findIndex(w =>
          Array.isArray(w.contributionDays) &&
          w.contributionDays.some(d => d && d.date >= months[m + 1].firstDay)
        );
        if (nextStart !== -1) {
          nextCol = nextStart;
        }
      }

      if (nextCol - startCol >= 2) {
        const label = document.createElement('span');
        label.className = 'contrib-month-label';
        label.textContent = monthInfo.name || '';
        label.style.left = `${startCol * colWidth}px`;
        contribMonths.appendChild(label);
      }
    }
  }

  // Render 53 weeks x 7 days grid
  const fragment = document.createDocumentFragment();

  for (let w = 0; w < totalWeeks; w++) {
    const week = weeks[w];
    const days = Array.isArray(week.contributionDays) ? week.contributionDays : [];

    for (let d = 0; d < 7; d++) {
      const day = days.find(item => item && item.weekday === d);
      const cell = document.createElement('div');
      cell.className = 'contrib-cell';
      cell.setAttribute('role', 'gridcell');

      if (day) {
        const levelNum = (CONTRIBUTION_LEVEL_MAP && day.contributionLevel)
          ? (CONTRIBUTION_LEVEL_MAP[day.contributionLevel] ?? 0)
          : 0;
        cell.classList.add(`level-${levelNum}`);
        cell.dataset.date = day.date || '';
        const count = day.contributionCount || 0;
        cell.dataset.count = String(count);
        cell.setAttribute('aria-label', formatDayTooltip(count, day.date));

        cell.addEventListener('mouseenter', handleCellMouseEnter);
        cell.addEventListener('mouseleave', handleCellMouseLeave);
      } else {
        cell.classList.add('level-0');
        cell.style.visibility = 'hidden';
      }

      fragment.appendChild(cell);
    }
  }

  contribGrid.appendChild(fragment);

  // Auto-scroll to the rightmost (most recent weeks)
  if (contribScrollArea) {
    requestAnimationFrame(() => {
      contribScrollArea.scrollLeft = contribScrollArea.scrollWidth;
    });
  }
}

/**
 * Handles mouseenter on contribution day cell to display tooltip.
 * @param {MouseEvent} e
 */
function handleCellMouseEnter(e) {
  if (!contribTooltip || !contribSection) return;
  const cell = e.currentTarget;
  const count = parseInt(cell.dataset.count || '0', 10);
  const dateStr = cell.dataset.date;
  if (!dateStr) return;

  contribTooltip.textContent = formatDayTooltip(count, dateStr);
  contribTooltip.classList.remove('hidden');

  const cardRect = contribSection.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  const left = cellRect.left - cardRect.left + (cellRect.width / 2);
  const top = cellRect.top - cardRect.top;

  contribTooltip.style.left = `${left}px`;
  contribTooltip.style.top = `${top}px`;

  // Adjust transform if near boundaries
  if (left < 75) {
    contribTooltip.style.transform = 'translate(0, -100%)';
  } else if (left > cardRect.width - 75) {
    contribTooltip.style.transform = 'translate(-100%, -100%)';
  } else {
    contribTooltip.style.transform = 'translate(-50%, -100%)';
  }
}

/**
 * Handles mouseleave on contribution day cell to hide tooltip.
 */
function handleCellMouseLeave() {
  if (contribTooltip) {
    contribTooltip.classList.add('hidden');
  }
}

/**
 * Display the dashboard view and render profile, contributions, and repositories.
 */
function showDashboardView(profile, repos, contributions = null) {
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

  if (contributions) {
    renderContributions(contributions);
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
    currentToken = rawToken;
    userProfile = profile;

    // Fetch repos and contributions in parallel using Promise.allSettled
    const [reposResult, contribResult] = await Promise.allSettled([
      fetchAllUserRepos(rawToken),
      fetchUserContributions(rawToken, profile.login)
    ]);

    const repos = reposResult.status === 'fulfilled' ? reposResult.value : [];
    const contributions = contribResult.status === 'fulfilled' ? contribResult.value : null;

    cachedRepos = repos;
    cachedContributions = contributions;

    // Securely save token, profile, repos, and contributions in chrome.storage.local
    await setStorage({
      [STORAGE_KEYS.TOKEN]: rawToken,
      [STORAGE_KEYS.PROFILE]: profile,
      [STORAGE_KEYS.REPOS]: repos,
      [STORAGE_KEYS.CONTRIBUTIONS]: contributions,
      [STORAGE_KEYS.UPDATED_AT]: Date.now()
    });

    if (patInput) patInput.value = '';
    showDashboardView(userProfile, cachedRepos, cachedContributions);
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

    const profile = await fetchUserProfile(token);
    userProfile = profile;

    // Fetch repos and contributions in parallel
    const [reposResult, contribResult] = await Promise.allSettled([
      fetchAllUserRepos(token),
      fetchUserContributions(token, profile.login)
    ]);

    if (reposResult.status === 'fulfilled') {
      cachedRepos = reposResult.value;
    }

    if (contribResult.status === 'fulfilled') {
      cachedContributions = contribResult.value;
    }

    await setStorage({
      [STORAGE_KEYS.PROFILE]: profile,
      [STORAGE_KEYS.REPOS]: cachedRepos,
      [STORAGE_KEYS.CONTRIBUTIONS]: cachedContributions,
      [STORAGE_KEYS.UPDATED_AT]: Date.now()
    });

    showDashboardView(userProfile, cachedRepos, cachedContributions);
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
  cachedContributions = null;

  if (contribSection) contribSection.classList.add('hidden');
  if (contribTooltip) contribTooltip.classList.add('hidden');
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

  if (contribLearnLink) {
    contribLearnLink.addEventListener('click', (e) => {
      e.preventDefault();
      const targetUrl = contribLearnLink.href;
      if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function') {
        chrome.tabs.create({ url: targetUrl, active: true });
      } else {
        window.open(targetUrl, '_blank');
      }
    });
  }

  // Load existing credentials and cached data
  try {
    const token = await getStorage(STORAGE_KEYS.TOKEN);
    if (token) {
      currentToken = token;
      userProfile = await getStorage(STORAGE_KEYS.PROFILE);
      cachedRepos = (await getStorage(STORAGE_KEYS.REPOS)) || [];
      cachedContributions = (await getStorage(STORAGE_KEYS.CONTRIBUTIONS)) || null;

      showDashboardView(userProfile, cachedRepos, cachedContributions);

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
