// content/dom-watch.js - Watches list page for score changes
// ESM not supported directly in content without type module; we keep as script.

/** storage helpers **/
const SYNC_KEY = 'followed';

async function getFollowed() {
  const { [SYNC_KEY]: followed = {} } = await chrome.storage.sync.get(SYNC_KEY);
  return followed;
}

async function setFollowed(followed) {
  await chrome.storage.sync.set({ [SYNC_KEY]: followed });
}

function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

const lastHashById = new Map();
const clickedMoreButton = new Set();

function computeHash(m) {
  return `${m.home}|${m.away}|${m.score}|${m.stage}`;
}

function parseRow(row) {
  // Try to obtain a stable match id and url
  const id = row.getAttribute('id') || row.dataset.eventId || row.dataset.id || null;
  const home = row.querySelector('.event__participant--home, .participant-home, .team-home')?.textContent?.trim() || '';
  const away = row.querySelector('.event__participant--away, .participant-away, .team-away')?.textContent?.trim() || '';
  const score = row.querySelector('.event__scores, .event__score, .score')?.textContent?.trim() || '';
  const stage = row.querySelector('.event__stage, .stage, .status-name')?.textContent?.trim() || '';

  let matchId = null;
  const anchor = row.querySelector('a[href*="/match/"]');
  const href = anchor?.getAttribute('href') || '';
  const m = href.match(/match\/([a-z0-9]+)\//i);
  if (m) matchId = m[1];
  const url = matchId ? `https://www.flashscore.com/match/${matchId}/#/match-summary/match-summary` : null;

  return { id: matchId || id, url, home, away, score, stage };
}

function injectPin(row, matchId) {
  if (!matchId) return;
  if (row.querySelector('.fscore-pin')) return;
  const pin = document.createElement('button');
  pin.className = 'fscore-pin';
  pin.textContent = '📌';
  pin.title = 'Takip et / bırak';
  pin.style.cssText = 'margin-left:6px;font-size:12px;cursor:pointer;background:none;border:none';
  row.querySelector('.event__participant--home')?.appendChild(pin);

  pin.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const followed = await getFollowed();
    const cur = !!followed[matchId];
    followed[matchId] = !cur;
    await setFollowed(followed);
    pin.style.opacity = followed[matchId] ? '1' : '0.4';
  });

  getFollowed().then((followed) => {
    pin.style.opacity = followed[matchId] ? '1' : '0.4';
  });
}

function scanOnce() {
  // Click "load more" once if visible
  if (!clickedMoreButton.has('more')) {
    const more = document.querySelector('button, .event__more, .show-more');
    if (more && isElementInViewport(more)) {
      clickedMoreButton.add('more');
      more.click();
    }
  }

  const rows = document.querySelectorAll('[id^="g_"], .event__match');
  rows.forEach((row) => {
    const match = parseRow(row);
    if (!match.id) return;

    injectPin(row, match.id);

    const hash = computeHash(match);
    const last = lastHashById.get(match.id);
    if (last !== undefined && last !== hash) {
      // score/stage changed
      shouldSendGoal(match.id).then((ok) => {
        if (ok) sendGoal(match);
      });
    }
    lastHashById.set(match.id, hash);
  });
}

async function shouldSendGoal(matchId) {
  const followed = await getFollowed();
  // Only track followed matches
  return !!followed[matchId];
}

const debouncedScan = debounce(scanOnce, 300);

const mo = new MutationObserver(() => debouncedScan());
mo.observe(document.documentElement, { childList: true, subtree: true });

// Initial
scanOnce();

function isElementInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

async function sendGoal(match) {
  try {
    await chrome.runtime.sendMessage({ type: 'GOAL', match });
  } catch (e) {
    // ignore
  }
}
