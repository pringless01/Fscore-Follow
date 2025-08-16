// sw/offscreen.js - Offscreen runtime handlers
// Receives PARSE_TIMELINE and responds with last goal info.

import { extractTimelineFromDocument } from '../offscreen/extractors.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'PARSE_TIMELINE' && msg.url) {
      try {
        const result = await parseTimelineSmart(msg.url);
        sendResponse(result);
      } catch (e) {
        console.error('PARSE_TIMELINE error', e);
        sendResponse({ minute: null, scorer: null, assist: null, type: null });
      }
    }
  })();
  return true; // keep channel open for async sendResponse
});

async function parseTimelineSmart(url) {
  // Mode 1: fetch + DOMParser
  try {
    const html = await fetchText(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tl = extractTimelineFromDocument(doc);
    if (tl) return tl;
  } catch (e) {
    console.warn('Fetch/DOMParser failed, will fallback', e?.message);
  }

  // Mode 2: navigate offscreen itself and scrape directly from DOM
  try {
    if (location.href !== url) {
      location.replace(url);
      await waitForLoad();
    }
    const tl = extractTimelineFromDocument(document);
    return tl || { minute: null, scorer: null, assist: null, type: null };
  } catch (e) {
    console.error('Fallback scrape failed', e);
    return { minute: null, scorer: null, assist: null, type: null };
  }
}

async function fetchText(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}

async function waitForLoad(timeoutMs = 8000) {
  if (document.readyState === 'complete') return;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    window.addEventListener('load', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}
