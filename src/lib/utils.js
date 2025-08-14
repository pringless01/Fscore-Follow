// Genel yardımcılar (content ve toolbar için global FSUtils).
// throttle, safeSendMessage, hash, query, text, score regex, visibility lifecycle.

/* global chrome */
const SCORE_RE = /(\d+)\s*[-:]\s*(\d+)/;
// Dakika sembolü farklı Unicode olabilir (’ ′ '), ayrıca farklı dilde LIVE/canlı ibareleri
const MIN_STAGE_RE = /\b(FT|HT|[0-9]{1,3}(?:’|′|')|1st|2nd|ET|LIVE|CANLI|PEN)\b/i;

 codex/yeniden-yaplandr-ve-analiz-et-gbf6gv
const buildFSUtils = () => ({

const FSUtils = {
 main
    throttle(fn, wait) {
      let t = 0, timer = null, lastArgs = null;
      return (...args) => {
        lastArgs = args;
        const now = Date.now();
        const remaining = Math.max(0, wait - (now - t));
        if (!timer) {
          timer = setTimeout(() => {
            t = Date.now();
            timer = null;
            fn.apply(null, lastArgs);
          }, remaining);
        }
      };
    },
    safeSendMessage(msg) {
      // Callback tabanlı kullanım: chrome.runtime.lastError okunarak
      // "Unchecked runtime.lastError" konsol uyarıları tamamen engellenir.
      return new Promise((resolve) => {
        try {
          if (!chrome?.runtime?.id) return resolve({ ok: false, error: 'NO_RUNTIME' });
          chrome.runtime.sendMessage(msg, (resp) => {
            const err = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) ? chrome.runtime.lastError : null;
            if (err) return resolve({ ok: false, error: err.message || 'SEND_FAIL' });
            resolve(resp ?? { ok: true });
          });
        } catch {
          // Extension context invalidated: sessizce no-op
          resolve({ ok: false, error: 'CTX_INVALID' });
        }
      });
    },
    hash(s) {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return 'h' + (h >>> 0).toString(16);
    },
    safeQuery(root, sel) {
      try { return root.querySelector(sel); } catch { return null; }
    },
    getText(el) {
      if (!el) return '';
      const t = ('innerText' in el) ? (el.innerText || '') : (el.textContent || '');
      return t.replace(/\s+/g, ' ').trim();
    },
    isConnected(el) { try { return !!(el && el.isConnected); } catch { return false; } },
    regexScore(s) { const m = (s || '').match(SCORE_RE); return m ? `${m[1]}-${m[2]}` : ''; },
    regexStage(s) { const m = (s || '').match(MIN_STAGE_RE); return m ? m[1] : ''; },
    parseMinute(stage) {
      const m = (stage || '').match(/(\d{1,3})/);
      return m ? parseInt(m[1], 10) : null;
    },
    isLiveStage(stage) { return !!(stage && /’|1st|2nd|ET|LIVE/i.test(stage)); },
    clamp(n, a, b) { return Math.max(a, Math.min(b, n)); },

    onLifecycle(reinit) {
      // SPA/dispose durumlarında yeniden başlatıcı
      window.addEventListener('pageshow', () => reinit('pageshow'), { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reinit('visible');
      }, { passive: true });
      window.addEventListener('pagehide', () => {/* no-op */}, { passive: true });
    }
  });

 codex/yeniden-yaplandr-ve-analiz-et-gbf6gv
(function (root) {
  const FSUtils = buildFSUtils();
  if (typeof module === 'object' && module.exports) module.exports = FSUtils;
  else root.FSUtils = FSUtils;
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) module.exports = FSUtils;
if (typeof window !== 'undefined') window.FSUtils = FSUtils;
 main
