// sw/index.js - MV3 Service Worker
// ESM modules, top-level listeners registered immediately.

import { log, err } from './log.js';

/**
 * withLifetime: Keep SW alive during async jobs by chaining promises.
 * There is no ExtendableEvent in typical message listeners, so we await internally.
 */
export async function withLifetime(promise) {
  try {
    return await promise;
  } catch (e) {
    err(e, 'withLifetime');
    throw e;
  }
}

/**
 * ensureOffscreen: create offscreen document if missing.
 */
export async function ensureOffscreen() {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    const hasOffscreen = contexts && contexts.length > 0;
    if (!hasOffscreen) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_PARSER'],
        justification: 'Flashscore timeline parse'
      });
      log('Offscreen document created');
    }
  } catch (e) {
    // Some Chrome versions may not support getContexts; fallback to create blindly
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_PARSER'],
        justification: 'Flashscore timeline parse (fallback)'
      });
      log('Offscreen document created (fallback)');
    } catch (ee) {
      err(ee, 'ensureOffscreen');
    }
  }
}

/**
 * notifyAndOverlay: create system notification (optional) and tell content to show overlay.
 * data: { tabId, url, minute, scorer, assist, type, home, away, score }
 */
export async function notifyAndOverlay(data) {
  const {
    tabId,
    minute,
    scorer,
    assist,
    type,
    home,
    away,
    score
  } = data;

  try {
    // Notification (silent by default)
    const notifId = 'goal-' + Date.now();
    await chrome.notifications.create(notifId, {
      type: 'basic',
      title: 'GOOOOL! ' + (type ? `[${type}]` : ''),
      message: `${home} vs ${away} ${score || ''}\n${minute ? minute + "' " : ''}${scorer || ''}${assist ? ' (' + assist + ')' : ''}`,
      iconUrl: 'assets/icons/128.png',
      silent: true
    });
  } catch (e) {
    // Notification permission may be blocked
    log('Notification skipped:', e?.message);
  }

  try {
    if (tabId) {
      await chrome.tabs.sendMessage(tabId, { type: 'SHOW_GOAL', data });
    } else {
      // Broadcast to all tabs as fallback
      const tabs = await chrome.tabs.query({});
      await Promise.all(
        tabs.map((t) => chrome.tabs.sendMessage(t.id, { type: 'SHOW_GOAL', data }).catch(() => {}))
      );
    }
  } catch (e) {
    err(e, 'notifyAndOverlay');
  }
}

// Lightweight cache of last timeline per match to reduce offscreen traffic
const lastTimelineByMatch = new Map();

/**
 * Handle GOAL events coming from content scripts.
 * msg: {type:'GOAL', match:{ id, url, home, away, score, stage }, tabId }
 */
async function handleGoalMessage(msg, sender) {
  const { match } = msg;
  const sourceTabId = sender?.tab?.id;
  const tabId = msg.tabId || sourceTabId;

  await ensureOffscreen();

  const detailUrl = match?.url || makeMatchUrl(match?.id);
  const payload = { url: detailUrl, match };

  const timeline = await withLifetime(
    chrome.runtime.sendMessage({ type: 'PARSE_TIMELINE', url: detailUrl }).catch((e) => {
      err(e, 'sendMessage->PARSE_TIMELINE');
      return null;
    })
  );

  const info = normalizeTimeline(timeline) || {};
  const data = {
    tabId,
    url: detailUrl,
    home: match?.home,
    away: match?.away,
    score: match?.score,
    ...info
  };

  await notifyAndOverlay(data);
}

function makeMatchUrl(matchId) {
  if (!matchId) return null;
  return `https://www.flashscore.com/match/${matchId}/#/match-summary/match-summary`;
}

function normalizeTimeline(tl) {
  if (!tl || typeof tl !== 'object') return null;
  const { minute = null, scorer = null, assist = null, type = 'GOAL' } = tl;
  return { minute, scorer, assist, type };
}

// Top-level listeners
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'GOAL' && msg.match) {
    handleGoalMessage(msg, sender);
  }
  // offscreen will respond to PARSE_TIMELINE requests
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    log('Tab updated', tabId, tab?.url || '');
  }
});

// Optional: cleanup on suspend
chrome.runtime.onSuspend?.addListener(() => {
  log('Service worker suspended');
});
