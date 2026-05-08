'use strict';

/* ============================================
   CONSTANTS
   ============================================ */
const GITHUB_API   = 'https://api.github.com';
const MAX_REPOS    = 6;
const MAX_USERNAME = 39;         // GitHub's max username length
const RATE_LIMIT   = 5;          // Max searches per window
const RATE_WINDOW  = 60 * 1000;  // 1 minute window (ms)
const DEBOUNCE_MS  = 400;

/* ============================================
   LANGUAGE COLOR MAP
   ============================================ */
const LANG_COLORS = {
  JavaScript:  '#f1e05a', TypeScript: '#3178c6',
  Python:      '#3572A5', Go:         '#00ADD8',
  Rust:        '#dea584', Java:       '#b07219',
  'C++':       '#f34b7d', 'C#':       '#178600',
  C:           '#555555', CSS:        '#563d7c',
  HTML:        '#e34c26', Ruby:       '#701516',
  PHP:         '#4F5D95', Swift:      '#F05138',
  Kotlin:      '#A97BFF', Dart:       '#00B4AB',
  Shell:       '#89e051', Vue:        '#41b883',
  Svelte:      '#ff3e00', Lua:        '#000080',
  Scala:       '#c22d40', 'R':        '#198CE7',
  Elixir:      '#6e4a7e', Haskell:    '#5e5086',
  Clojure:     '#db5855', CoffeeScript:'#244776',
  default:     '#8b949e',
};

/* ============================================
   RATE LIMITER (Client-side)
   Prevents users from hammering the API
   ============================================ */
const rateLimiter = {
  requests: [],

  canMakeRequest() {
    const now = Date.now();
    // Remove old entries outside the window
    this.requests = this.requests.filter(t => now - t < RATE_WINDOW);
    return this.requests.length < RATE_LIMIT;
  },

  record() {
    this.requests.push(Date.now());
  },

  remaining() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < RATE_WINDOW);
    return Math.max(0, RATE_LIMIT - this.requests.length);
  },

  resetIn() {
    if (this.requests.length === 0) return 0;
    const oldest = Math.min(...this.requests);
    return Math.ceil((RATE_WINDOW - (Date.now() - oldest)) / 1000);
  }
};

/* ============================================
   INPUT SANITIZER
   Prevents XSS by escaping HTML characters
   ============================================ */
function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/* ============================================
   URL VALIDATOR
   Only allows http/https to prevent
   javascript: protocol injection
   ============================================ */
function isSafeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/* ============================================
   USERNAME VALIDATOR
   GitHub usernames: alphanumeric + hyphens
   Cannot start/end with hyphen
   Max 39 chars
   ============================================ */
function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  const trimmed = username.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_USERNAME) return false;
  // GitHub username regex
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(trimmed);
}

/* ============================================
   NUMBER FORMATTER
   1234 → "1.2k", etc.
   ============================================ */
function formatNumber(num) {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000)     return (num / 1_000).toFixed(1) + 'k';
  return String(num);
}

/* ============================================
   DATE FORMATTER
   ============================================ */
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    year:  'numeric',
  });
}

/* ============================================
   LANGUAGE COLOR GETTER
   ============================================ */
function getLangColor(lang) {
  return LANG_COLORS[lang] || LANG_COLORS.default;
}

/* ============================================
   STAR BACKGROUND GENERATOR
   ============================================ */
function createStars() {
  const container = document.getElementById('stars');
  const count = 80;

  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'star';

    const size    = Math.random() * 2.5 + 0.5;
    const x       = Math.random() * 100;
    const y       = Math.random() * 100;
    const delay   = Math.random() * 6;
    const duration = Math.random() * 4 + 3;
    const opacity  = Math.random() * 0.6 + 0.1;

    star.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${x}%;
      top: ${y}%;
      --delay: ${delay}s;
      --duration: ${duration}s;
      --opacity: ${opacity};
    `;

    container.appendChild(star);
  }
}

/* ============================================
   API FETCHER
   Wraps fetch with error handling +
   GitHub-specific error messages
   ============================================ */
async function githubFetch(endpoint) {
  const url = `${GITHUB_API}${endpoint}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  // Check rate limit headers from GitHub
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const reset     = response.headers.get('X-RateLimit-Reset');

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('User not found. Check the username and try again.');
    }
    if (response.status === 403 || response.status === 429) {
      const resetTime = reset
        ? new Date(reset * 1000).toLocaleTimeString()
        : 'a few minutes';
      throw new Error(
        `GitHub API rate limit reached. Try again after ${resetTime}.`
      );
    }
    if (response.status >= 500) {
      throw new Error('GitHub servers are having issues. Try again soon.');
    }
    throw new Error('Something went wrong. Please try again.');
  }

  return { data: await response.json(), remaining, reset };
}

/* ============================================
   FETCH USER REPOS & CALCULATE LANGUAGES
   ============================================ */
async function fetchReposAndLanguages(username) {
  const encodedUser = encodeURIComponent(username);
  const { data: repos } = await githubFetch(
    `/users/${encodedUser}/repos?sort=stars&per_page=100&type=public`
  );

  // Sort by stars descending
  const sorted = [...repos].sort(
    (a, b) => b.stargazers_count - a.stargazers_count
  );

  // Top repos
  const topRepos = sorted.slice(0, MAX_REPOS);

  // Count languages
  const langCount = {};
  repos.forEach(repo => {
    if (repo.language) {
      langCount[repo.language] = (langCount[repo.language] || 0) + 1;
    }
  });

  // Sort and take top 8 languages
  const total = Object.values(langCount).reduce((a, b) => a + b, 0);
  const topLangs = Object.entries(langCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      count,
      percent: ((count / total) * 100).toFixed(1),
      color: getLangColor(name),
    }));

  return { topRepos, topLangs };
}

/* ============================================
   RENDER FUNCTIONS
   ============================================ */
function renderProfile(user) {
  // Avatar - src is from GitHub CDN (whitelisted in CSP)
  const avatar = document.getElementById('avatar');
  avatar.src = user.avatar_url;
  avatar.alt = `${sanitize(user.login)}'s GitHub avatar`;

  // Name & username
  document.getElementById('fullName').textContent =
    user.name || user.login;

  const usernameLink = document.getElementById('username');
  usernameLink.textContent = `@${user.login}`;
  usernameLink.href        = `https://github.com/${encodeURIComponent(user.login)}`;

  // Bio
  const bioEl = document.getElementById('bio');
  if (user.bio) {
    bioEl.textContent = user.bio;
    bioEl.classList.remove('hidden');
  } else {
    bioEl.classList.add('hidden');
  }

  // Location
  const locationEl = document.getElementById('location');
  if (user.location) {
    document.getElementById('locationText').textContent = user.location;
    locationEl.classList.remove('hidden');
  } else {
    locationEl.classList.add('hidden');
  }

  // Company
  const companyEl = document.getElementById('company');
  if (user.company) {
    document.getElementById('companyText').textContent = user.company;
    companyEl.classList.remove('hidden');
  } else {
    companyEl.classList.add('hidden');
  }

  // Blog / Website
  const blogEl = document.getElementById('blogLink');
  if (user.blog && isSafeUrl(user.blog)) {
    const anchor = document.getElementById('blogAnchor');
    anchor.href        = user.blog;
    anchor.textContent = user.blog.replace(/^https?:\/\//, '');
    blogEl.classList.remove('hidden');
  } else {
    blogEl.classList.add('hidden');
  }

  // Stats
  document.getElementById('repoCount').textContent =
    formatNumber(user.public_repos);
  document.getElementById('followerCount').textContent =
    formatNumber(user.followers);
  document.getElementById('followingCount').textContent =
    formatNumber(user.following);
  document.getElementById('gistCount').textContent =
    formatNumber(user.public_gists);

  // Member since
  document.getElementById('memberSince').textContent =
    `Member since ${formatDate(user.created_at)}`;

  // GitHub link
  const ghLink = document.getElementById('githubLink');
  ghLink.href = `https://github.com/${encodeURIComponent(user.login)}`;
}

function renderLanguages(topLangs) {
  const container = document.getElementById('languagesContainer');

  if (topLangs.length === 0) {
    container.innerHTML =
      '<p class="loading-placeholder">No public language data found.</p>';
    return;
  }

  // Build language bar
  const barSegments = topLangs
    .map(
      lang =>
        `<div class="lang-bar-segment" 
              style="width:${lang.percent}%; 
                     background:${lang.color}" 
              title="${sanitize(lang.name)}: ${lang.percent}%">
         </div>`
    )
    .join('');

  // Build language tags
  const tags = topLangs
    .map(
      lang =>
        `<div class="lang-tag">
           <span class="lang-dot" 
                 style="background:${lang.color}"></span>
           <span>${sanitize(lang.name)}</span>
           <span class="lang-percent">${lang.percent}%</span>
         </div>`
    )
    .join('');

  container.innerHTML = `
    <div class="lang-bar">${barSegments}</div>
    <div class="lang-tags-wrap" style="display:flex;flex-wrap:wrap;gap:8px">
      ${tags}
    </div>
  `;
}

function renderRepos(topRepos) {
  const container = document.getElementById('reposContainer');

  if (topRepos.length === 0) {
    container.innerHTML =
      '<p class="loading-placeholder">No public repositories found.</p>';
    return;
  }

  const cards = topRepos.map(repo => {
    const langDot = repo.language
      ? `<span class="repo-lang-dot" 
               style="background:${getLangColor(repo.language)}">
         </span>
         <span>${sanitize(repo.language)}</span>`
      : '';

    const desc = repo.description
      ? `<p class="repo-desc">${sanitize(repo.description)}</p>`
      : '<p class="repo-desc" style="color:var(--text-muted)">No description</p>';

    return `
      <a class="repo-card" 
         href="${sanitize(repo.html_url)}" 
         target="_blank" 
         rel="noopener noreferrer"
         aria-label="${sanitize(repo.name)} repository">
        <div class="repo-name">${sanitize(repo.name)}</div>
        ${desc}
        <div class="repo-meta">
          ${langDot}
          <span class="repo-stars">
            ⭐ ${formatNumber(repo.stargazers_count)}
          </span>
          <span class="repo-forks">
            🍴 ${formatNumber(repo.forks_count)}
          </span>
        </div>
      </a>
    `;
  });

  container.innerHTML = cards.join('');
}

/* ============================================
   UI STATE HELPERS
   ============================================ */
function showLoader() {
  document.getElementById('loader').classList.remove('hidden');
  document.getElementById('errorBox').classList.add('hidden');
  document.getElementById('profileCard').classList.add('hidden');
}

function hideLoader() {
  document.getElementById('loader').classList.add('hidden');
}

function showError(message) {
  hideLoader();
  const box = document.getElementById('errorBox');
  // Use textContent - never innerHTML for user-facing errors
  document.getElementById('errorMessage').textContent = message;
  box.classList.remove('hidden');
  document.getElementById('profileCard').classList.add('hidden');
}

function showProfile() {
  document.getElementById('profileCard').classList.remove('hidden');
}

function updateRateInfo() {
  const el = document.getElementById('rateInfo');
  const remaining = rateLimiter.remaining();

  if (remaining <= 1) {
    el.className = 'rate-info warn';
    el.textContent =
      `⚠ ${remaining} search left · Resets in ${rateLimiter.resetIn()}s`;
  } else {
    el.className = 'rate-info';
    el.textContent = remaining < RATE_LIMIT
      ? `${remaining} searches remaining this minute`
      : '';
  }
}

/* ============================================
   MAIN SEARCH HANDLER
   ============================================ */
async function searchUser(rawInput) {
  // 1. Trim input
  const username = rawInput.trim();

  // 2. Validate
  if (!username) {
    showError('Please enter a GitHub username.');
    return;
  }

  if (!isValidUsername(username)) {
    showError(
      'Invalid username format. GitHub usernames can only contain ' +
      'letters, numbers, and hyphens.'
    );
    return;
  }

  // 3. Rate limit check
  if (!rateLimiter.canMakeRequest()) {
    showError(
      `Too many searches. Please wait ${rateLimiter.resetIn()} seconds.`
    );
    updateRateInfo();
    return;
  }

  // 4. Disable UI
  const btn   = document.getElementById('searchBtn');
  const input = document.getElementById('searchInput');
  btn.disabled   = true;
  input.disabled = true;

  // 5. Show loading
  showLoader();

  try {
    // 6. Record rate limit entry
    rateLimiter.record();
    updateRateInfo();

    // 7. Fetch user profile (parallel with repos for speed)
    const encodedUser = encodeURIComponent(username);

    const [userResult, repoResult] = await Promise.all([
      githubFetch(`/users/${encodedUser}`),
      fetchReposAndLanguages(username),
    ]);

    const user = userResult.data;
    const { topRepos, topLangs } = repoResult;

    // 8. Render everything
    hideLoader();
    renderProfile(user);
    renderLanguages(topLangs);
    renderRepos(topRepos);
    showProfile();

    // 9. Smooth scroll to card
    document.getElementById('profileCard').scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

  } catch (err) {
    // Show safe error message (no stack traces, no internal details)
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    // 10. Re-enable UI
    btn.disabled   = false;
    input.disabled = false;
    input.focus();
    updateRateInfo();
  }
}

/* ============================================
   DEBOUNCE HELPER
   Prevents search spam on keypress
   ============================================ */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ============================================
   INIT
   ============================================ */
function init() {
  // Create background stars
  createStars();

  const input  = document.getElementById('searchInput');
  const btn    = document.getElementById('searchBtn');

  // Click search
  btn.addEventListener('click', () => {
    searchUser(input.value);
  });

  // Enter key search
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      searchUser(input.value);
    }
  });

  // Sanitize input live (remove dangerous chars as user types)
  input.addEventListener('input', () => {
    // Remove characters not allowed in GitHub usernames
    // Allow partial hyphens while typing
    input.value = input.value.replace(/[^a-zA-Z0-9-]/g, '');
    updateRateInfo();
  });

  // Load a demo profile on start
  searchUser('torvalds');
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
