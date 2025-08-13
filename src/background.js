// MV3 Service Worker (module)
// Tek otorite: tracked, scores, history, ui, settings.
// DOM Modu öncelik; FS sekmesi yoksa hafif polling (~20s ≈ dakikayı üç dilimde tarama).
// Bildirimler sessiz. DND'ye saygı. OPEN_TAB delege.
// Null-safe deepMerge; icon fallback; "context invalidated" toleranslı publish.

/** @typedef {string} MatchId */
/**
 * @typedef {Object} TrackedMatch
 * @property {MatchId} id
 * @property {string} title
 * @property {"football"|"tennis"|"basketball"|"unknown"} sport
 * @property {string} url
 * @property {string=} league
 * @property {number=} kickoffAt
 * @property {number} addedAt
 * @property {boolean=} muted
 * @property {string=} logoA
 * @property {string=} logoB
 */
/**
 * @typedef {Object} ScoreState
 * @property {string} scoreText
 * @property {string=} stage
 * @property {number} updatedAt
 * @property {{type:"goal"|"red"|"yellow"|"var"|"stage"|"end"|"other", minute?:string, player?:string, team?:"home"|"away", text?:string}=} lastEvent
 */

import { pollTick } from './lib/polling.js';

const now = () => Date.now();
const STORAGE_KEY = 'fsx';
const MAX_TRACK = 20;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

const DEFAULTS = {
  tracked: /** @type {TrackedMatch[]} */([]),
  scores: /** @type {Record<MatchId, ScoreState>} */({}),
  scoresHistory: /** @type {Array<{id:MatchId; ts:number; event:ScoreState["lastEvent"]; scoreText?:string}>} */([]),
  ui: { toolbarHidden: false, toolbarPos: { right: 24, bottom: 24 } },
  settings: { notifications: true, dnd: null, pollingEnabled: true, pollingSec: 3 }
};

// ---- Bildirim ikonu: paket veya data URI fallback ----
const FALLBACK_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9o1EJ5kAAAAASUVORK5CYII=';
function resolveIconUrl() {
  try {
    const manifest = chrome.runtime.getManifest?.();
    const p = manifest?.icons?.['128'] || manifest?.icons?.['48'] || manifest?.icons?.['32'] || 'assets/icons/128.png';
    return chrome.runtime.getURL(p);
  } catch { return FALLBACK_ICON; }
}

// ---- State helpers ----
function isPlainObject(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return b.slice();
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b ?? a;
}
async function getState() {
  const o = await chrome.storage.local.get(STORAGE_KEY);
  const st = o[STORAGE_KEY];
  if (st == null || typeof st !== 'object') return structuredClone(DEFAULTS);
  return deepMerge(DEFAULTS, st);
}
async function setState(s) { await chrome.storage.local.set({ [STORAGE_KEY]: s }); }

// ---- Lifecycle ----
chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(STORAGE_KEY);
  const current = cur[STORAGE_KEY];
  if (current == null || typeof current !== 'object') {
    await setState(DEFAULTS);
  } else {
    await setState(deepMerge(DEFAULTS, current));
  }
  await fixTrackedUrls();
  ensureAlarm();
  startPollLoop();
});
chrome.runtime.onStartup.addListener(async () => { await fixTrackedUrls(); ensureAlarm(); startPollLoop(); });

// ---- Polling scheduler ----
let lastFsPing = 0; // content'ten PING_FS_OPEN (bilgi amaçlı)
let lastFsActivePing = 0; // yalnızca aktif (bağlı) DOM olduğunda güncellenir
let pollingRoundRobinIndex = 0;
const POLL_MAX_CONCURRENT = 2;
const POLL_ERROR_LIMIT = 3;
const POLL_SUSPEND_MINUTES = 10;
const pollErrorCount = new Map(); // id -> count
const pollSuspendUntil = new Map(); // id -> ts
let pollTimer = null;
function ensureAlarm() {
  chrome.alarms.clear('poll');
  chrome.alarms.create('poll', { periodInMinutes: 1 }); // 1dk; içinde 3 dilim
}
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'poll') return;
  const state = await getState();
  if (!state.settings?.pollingEnabled) return;
  const secondsSinceActivePing = (now() - lastFsActivePing) / 1000;
  // Yalnız aktif bağ yoksa poll et
  if (secondsSinceActivePing > 45 && (state.tracked?.length || 0) > 0) {
    await doRoundRobinPoll(state);
  }
  await pruneHistory();
});

function startPollLoop() {
  try { if (pollTimer) clearTimeout(pollTimer); } catch {}
  const loop = async () => {
    try {
      const state = await getState();
      if (state.settings?.pollingEnabled) {
  const secondsSinceActivePing = (now() - lastFsActivePing) / 1000;
  if (secondsSinceActivePing > 45 && (state.tracked?.length || 0) > 0) {
          await doRoundRobinPoll(state);
        }
      }
    } catch {}
    try {
      const st = await getState();
      const period = Math.max(3, Math.min(30, parseInt(st.settings?.pollingSec || 3, 10))) * 1000;
      pollTimer = setTimeout(loop, period);
    } catch { pollTimer = setTimeout(loop, 3000); }
  };
  pollTimer = setTimeout(loop, 1000);
}
async function doRoundRobinPoll(state) {
  const tracked = (state.tracked || []).slice(0, MAX_TRACK);
  const scores = state.scores || {};
  const psec = Math.max(3, Math.min(30, parseInt(state.settings?.pollingSec || 3, 10)));
  const slicesPerMinute = Math.max(1, Math.floor(60 / psec));
  const sliceSize = Math.max(1, Math.ceil(tracked.length / slicesPerMinute));
  const start = pollingRoundRobinIndex;
  const ids = [];
  for (let i = 0; i < sliceSize; i++) {
    const idx = (start + i) % tracked.length; ids.push(tracked[idx].id);
  }
  pollingRoundRobinIndex = (start + sliceSize) % tracked.length;

  const eligible = ids.filter((id) => {
    const until = pollSuspendUntil.get(id) || 0;
    return Date.now() >= until;
  });
  // Concurrency kontrolü
  for (let i = 0; i < eligible.length; i += POLL_MAX_CONCURRENT) {
    const batch = eligible.slice(i, i + POLL_MAX_CONCURRENT);
    await Promise.all(batch.map(async (id) => {
      const tm = tracked.find((t) => t.id === id);
      if (!tm?.url) return;
      try {
        // küçük jitter
        await new Promise(r => setTimeout(r, 300 + Math.random()*700));
        const polled = await pollTick(tm, scores[id] || null);
        pollErrorCount.set(id, 0);
        if (polled?.changed) await applyScoreUpdateFromPolling(tm.id, polled.state);
      } catch (e) {
        const c = (pollErrorCount.get(id) || 0) + 1; pollErrorCount.set(id, c);
        if (c >= POLL_ERROR_LIMIT) {
          pollSuspendUntil.set(id, Date.now() + POLL_SUSPEND_MINUTES * 60 * 1000);
          console.debug('[poll] suspend', id, 'for', POLL_SUSPEND_MINUTES, 'min');
          pollErrorCount.set(id, 0);
        }
      }
    }));
  }
}
async function applyScoreUpdateFromPolling(id, newState) {
  const state = await getState();
  const prev = state.scores?.[id] || null;
  if (prev && prev.scoreText === newState.scoreText && prev.stage === newState.stage) return;
  state.scores[id] = { ...newState, updatedAt: now() };
  if (newState.lastEvent) state.scoresHistory.push({ id, ts: now(), event: newState.lastEvent, scoreText: newState.scoreText });
  await setState(state);
  await publishScoresUpdated(id, state.scores[id]);
  await maybeNotify(id, state);
}
async function pruneHistory() {
  const state = await getState();
  const cutoff = now() - HISTORY_WINDOW_MS;
  state.scoresHistory = (state.scoresHistory || []).filter((h) => h.ts >= cutoff);
  await setState(state);
}

// ---- Messaging (safe) ----
let lastNotificationByMatch = new Map(); // dedup
let notifTargets = new Map(); // notifId -> url

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'PING_FS_OPEN':
          lastFsPing = now();
          // Eğer içerik aktif bir bağ olduğunu bildiriyorsa, polling’i bastırmak için aktif pingi güncelle
          if (msg && Object.prototype.hasOwnProperty.call(msg, 'active')) {
            lastFsActivePing = msg.active ? now() : 0;
          }
          sendResponse({ ok: true });
          break;

        case 'OPEN_TAB':
          try { await chrome.tabs.create({ url: msg.url || 'about:blank', active: true }); sendResponse({ ok: true }); }
          catch (e) { sendResponse({ ok: false, error: e?.message || String(e) }); }
          break;

        case 'ADD_TRACK': {
          // Yeni akış: content yalnızca { id } gönderebilir. URL ve başlığı burada üret.
          const id = msg.match?.id || msg.id;
          if (!id) { sendResponse({ ok: false, error: 'NO_ID' }); break; }
          const state = await getState();
          state.tracked = state.tracked || [];
          if (state.tracked.find((t) => t.id === id)) { sendResponse({ ok: true, dedup: true }); break; }
          if (state.tracked.length >= MAX_TRACK) { sendResponse({ ok: false, error: 'MAX_TRACK' }); break; }
          const url = ensureDetailUrl(id, msg.match?.url);
          const base = { id, sport: 'football', url, addedAt: now(), title: msg.match?.title || `Match ${id}` };
          state.tracked.push(base);
          state.scores = state.scores || {};
          if (msg.initScore) state.scores[id] = { ...msg.initScore, updatedAt: now() };
          await setState(state);
          await publishTrackedChanged();
          // İlk poll ile başlık/teams/score güncellemesi
          try {
            const polled = await pollTick(base, state.scores[id] || null);
            if (polled?.state) {
              await applyScoreUpdateFromPolling(id, polled.state);
            }
            if (polled?.meta?.title || polled?.meta?.league) {
              const st2 = await getState();
              const tm = (st2.tracked || []).find(t => t.id === id);
              if (tm) {
                let changed = false;
                if (polled.meta.title) {
                  const weak = /^Match\s+/i.test(tm.title || '') || /g_\d+_/i.test(tm.title || '') || tm.title === `Match ${id}`;
                  if (weak || !tm.title || tm.title.includes(id)) { tm.title = polled.meta.title; changed = true; }
                }
                if (polled.meta.league && tm.league !== polled.meta.league) { tm.league = polled.meta.league; changed = true; }
                if (changed) { await setState(st2); await publishTrackedChanged(); }
              }
            }
          } catch {}
          sendResponse({ ok: true });
          break;
        }

        case 'REMOVE_TRACK': {
          const state = await getState();
          state.tracked = (state.tracked || []).filter((t) => t.id !== msg.id);
          if (state.scores) delete state.scores[msg.id];
          await setState(state);
          await publishTrackedChanged();
          sendResponse({ ok: true });
          break;
        }

        case 'MUTE_MATCH': {
          const state = await getState();
          const t = (state.tracked || []).find((x) => x.id === msg.id);
          if (t) t.muted = !!msg.muted;
          await setState(state);
          await publishTrackedChanged();
          sendResponse({ ok: true });
          break;
        }

        case 'PIN_MATCH': {
          const state = await getState();
          const idx = (state.tracked || []).findIndex((x) => x.id === msg.id);
          if (idx >= 0) {
            const [it] = state.tracked.splice(idx, 1);
            // En başa al
            state.tracked.unshift(it);
            await setState(state);
            await publishTrackedChanged();
          }
          sendResponse({ ok: true });
          break;
        }

        case 'UPDATE_SCORE': {
          const state = await getState();
          state.scores = state.scores || {};
          const prev = state.scores[msg.id] || null;
          const { scoreText, stage } = msg;
          const incomingEvent = (Object.prototype.hasOwnProperty.call(msg, 'lastEvent') ? msg.lastEvent : undefined);
          if (prev && prev.scoreText === scoreText && prev.stage === stage && incomingEvent === undefined) { sendResponse({ ok: true, dedup: true }); break; }

          const st = /** @type {ScoreState} */({
            scoreText: scoreText || '',
            stage: stage || '',
            updatedAt: now(),
            lastEvent: incomingEvent === undefined ? (inferEvent(prev, scoreText, stage)) : incomingEvent || undefined
          });
          state.scores[msg.id] = st;
          state.scoresHistory = state.scoresHistory || [];
          if (incomingEvent !== null && st.lastEvent) state.scoresHistory.push({ id: msg.id, ts: now(), event: st.lastEvent, scoreText: st.scoreText });

          await setState(state);
          await publishScoresUpdated(msg.id, st);
          await maybeNotify(msg.id, state);
          sendResponse({ ok: true });
          break;
        }

        case 'SET_SETTINGS': {
          const state = await getState();
          state.settings = { ...(state.settings || {}), ...msg.settings };
          await setState(state);
          startPollLoop();
          sendResponse({ ok: true });
          break;
        }

        case 'TOGGLE_TOOLBAR': {
          const state = await getState();
          state.ui = state.ui || { toolbarHidden: false, toolbarPos: { right: 24, bottom: 24 } };
          state.ui.toolbarHidden = !!msg.hidden;
          await setState(state);
          await publishUiChanged();
          sendResponse({ ok: true });
          break;
        }

        case 'SET_POSITION': {
          const state = await getState();
          state.ui = state.ui || { toolbarHidden: false, toolbarPos: { right: 24, bottom: 24 } };
          state.ui.toolbarPos = msg.pos || state.ui.toolbarPos;
          await setState(state);
          await publishUiChanged();
          sendResponse({ ok: true });
          break;
        }

        default:
          sendResponse({ ok: false, error: 'UNKNOWN' });
      }
    } catch (e) {
      try { sendResponse({ ok: false, error: e?.message || String(e) }); } catch {}
    }
  })();
  return true; // async
});

function inferEvent(prev, scoreText, stage) {
  if (!prev) return { type: 'stage', text: 'Başlangıç', minute: stage || undefined };
  if (prev.scoreText !== scoreText) return { type: 'goal', text: 'Skor değişti', minute: stage || undefined };
  if (prev.stage !== stage) {
    if ((stage || '').toUpperCase() === 'FT') return { type: 'end', text: 'Maç bitti' };
    return { type: 'stage', text: 'Aşama değişti', minute: stage || undefined };
  }
  return undefined;
}

// ---- Pub/Sub (context invalidated toleranslı) ----
async function publishTrackedChanged() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      try {
        chrome.tabs.sendMessage(t.id, { type: 'TRACKED_CHANGED' }, () => { void (chrome.runtime && chrome.runtime.lastError); });
      } catch {}
    }
  } catch {}
}
async function publishUiChanged() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      try {
        chrome.tabs.sendMessage(t.id, { type: 'UI_CHANGED' }, () => { void (chrome.runtime && chrome.runtime.lastError); });
      } catch {}
    }
  } catch {}
}
async function publishScoresUpdated(id, state) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      try {
        chrome.tabs.sendMessage(t.id, { type: 'SCORES_UPDATED', id, state }, () => { void (chrome.runtime && chrome.runtime.lastError); });
      } catch {}
    }
  } catch {}
}

// ---- Notifications (silent) ----
async function maybeNotify(id, fullState) {
  const settings = fullState.settings || {};
  if (!settings.notifications) return;
  if (inDnd(settings.dnd)) return;

  const tracked = fullState.tracked || [];
  const scores = fullState.scores || {};
  const tm = tracked.find((t) => t.id === id);
  if (!tm || tm.muted) return;

  const st = scores[id]; if (!st) return;

  const last = lastNotificationByMatch.get(id) || {};
  if (last.scoreText === st.scoreText && last.stage === st.stage) return;

  const title = `⚽ ${tm.title}`;
  const message = buildNotifMessage(st);
  lastNotificationByMatch.set(id, { scoreText: st.scoreText, stage: st.stage });

  const notifId = `fs-${id}-${st.updatedAt}`;
  const iconUrl = resolveIconUrl();

  try {
    await chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl,
      title,
      message,
      priority: 0,
      requireInteraction: false,
      isClickable: true
    });
  } catch {
    await chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: FALLBACK_ICON,
      title,
      message,
      priority: 0,
      requireInteraction: false,
      isClickable: true
    }).catch(()=>{});
  }
  notifTargets.set(notifId, tm.url);
}
chrome.notifications.onClicked.addListener((nid) => {
  const url = notifTargets.get(nid);
  if (!url) return;
  chrome.tabs.create({ url }).catch(()=>{});
  notifTargets.delete(nid);
});
function buildNotifMessage(st) {
  const ev = st.lastEvent;
  const evText =
    ev?.type === 'goal' ? (ev.minute ? `${ev.minute} Gol` : 'Gol') :
    ev?.type === 'end'  ? 'Maç Bitti' :
    ev?.type === 'stage'? `Aşama: ${st.stage || ''}` :
    st.stage || '';
  return `${evText} | ${st.scoreText}`;
}
function inDnd(dnd) {
  if (!dnd) return false;
  const nowD = new Date();
  const cur = nowD.getHours() * 60 + nowD.getMinutes();
  const [sH, sM] = (dnd.start || '22:00').split(':').map((x) => parseInt(x, 10));
  const [eH, eM] = (dnd.end || '08:00').split(':').map((x) => parseInt(x, 10));
  const startMin = (isNaN(sH)?22:sH) * 60 + (isNaN(sM)?0:sM);
  const endMin   = (isNaN(eH)?8 :eH) * 60 + (isNaN(eM)?0:eM);
  if (startMin <= endMin) return cur >= startMin && cur < endMin;
  return cur >= startMin || cur < endMin; // gece taşması
}

// ---- Helpers: matchId -> detail URL ----
function ensureDetailUrl(id, fallbackUrl) {
  if (fallbackUrl && /^https?:\/\//i.test(fallbackUrl)) return fallbackUrl;
  // id formu: g_1_xxx veya sadece token. /match/football/<token>/
  let token = id;
  // id="g_1_84UUVsas" => token=84UUVsas
  const m = id.match(/g_\d+_([A-Za-z0-9]+)/);
  if (m) token = m[1];
  // id doğrudan token ise bırak
  // Server-render edilmiş sayfa: hash’li rota yerine çıplak detay URL’si
  return `https://www.flashscore.com/match/${token}/`;
}

async function fixTrackedUrls() {
  try {
    const state = await getState();
    let changed = false;
    for (const t of (state.tracked || [])) {
  if (!t.url) continue;
  let nu = t.url;
  if (/\/match\/football\//.test(nu)) nu = nu.replace('/match/football/', '/match/');
  // Hash’li SPA route’u temizle (ör. #/match-summary, #/lineups vb.)
  nu = nu.replace(/#.*$/, '');
  if (nu !== t.url) { t.url = nu; changed = true; }
    }
    if (changed) {
      await setState(state);
      await publishTrackedChanged();
    }
  } catch {}
}
