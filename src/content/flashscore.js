// Flashscore site adapter: Follow butonu enjekte, LiveNodeBinding ile skor/dakika/olay izleme.
// SPA/sonsuz scroll rebind. Hatalar yutulur, otomatik re-init.
// Gol/kart/stage sinyali: liste satırındaki değişimlerden çıkarım (DOM Modu öncelik).

/* global FSUtils, FSSelectors, chrome */
(() => {
  if (window.__FSX_CS_FLASHSTATE__) return; // tek instance kilidi
  window.__FSX_CS_FLASHSTATE__ = true;

  // Global error guards: yakalanmamış reddi ve yaygın runtime hatalarını sessizce yut.
  try {
    if (!window.__FSX_ERR_GUARD__) {
      window.addEventListener('unhandledrejection', (e) => {
        // Tüm yakalanmamış reddi yut (özellikle context invalidated / port closed)
        e.preventDefault();
      }, { capture: true });
      window.addEventListener('error', (e) => {
        const msg = (e && (e.error?.message || e.message || '')).toString();
        if (/Extension context invalidated/i.test(msg) || /message port closed/i.test(msg) || /No tab with id/i.test(msg)) {
          e.preventDefault();
        }
      }, { capture: true });
      window.__FSX_ERR_GUARD__ = true;
    }
  } catch {}

  const { throttle, safeSendMessage, isConnected } = FSUtils;
  const { S, extractMatchId, extractTeams, extractStage, extractScore, extractUrl, buildTitle, detectSport, extractEventHint } = FSSelectors;
  const DEBUG = (() => { try { return localStorage.getItem('fsxDebug') === '1'; } catch { return false; } })();
  const dlog = (...a) => { if (DEBUG) console.debug('[fsx]', ...a); };

  const OBS_THROTTLE_MS = 400;
  const REBIND_INTERVAL_MS = 1500; // kopmuş node'u düzenli kontrol
  const MAX_BULK = 20;

  /** Bir matchId için canlı bağ (row, observers vs) tutar ve koparsa rebind eder. */
  class LiveNodeBinding {
    /**
     * @param {string} matchId
     */
    constructor(matchId) {
      this.id = matchId;
      this.row = null;
      this.obs = null;
      this.bound = false;
      this.rebindTimer = null;
    }
    /** Kök listeden row'u yeniden bul. */
    findRow() {
      const rows = document.querySelectorAll(S.ROW);
      for (const r of rows) {
        if ((r).dataset?.matchid === this.id) return r;
      }
      // data-matchid yoksa id eşleşmesi ile ara
      for (const r of rows) {
        try { if (extractMatchId(r) === this.id) return r; } catch {}
      }
      // id tipiyse (#g_...)
      if (this.id.startsWith('g_')) {
        const byId = document.getElementById(this.id);
        if (byId && byId.matches && byId.matches(S.ROW)) return byId;
      }
      return null;
    }
    /** Row'a observer bağla */
    bindIfNeeded() {
      if (this.bound && this.row && isConnected(this.row)) return true;
      const row = this.findRow();
      if (!row) { this.scheduleRebind(); return false; }
      this.row = row;
      this.attachObserver(row);
      this.bound = true;
      return true;
    }
  attachObserver(row) {
      this.detachObserver();

      const scoreNode = row.querySelector(S.SCORE) || row;
      const timeNode = row.querySelector(S.TIME) || row;

      const emit = throttle(() => {
        const score = extractScore(row);
        const stage = extractStage(row);
        const ev = extractEventHint(row);
        if (!score && !stage && !ev) return;
        // lastEvent alanını her zaman gönder: yoksa null ile temizle
        safeSendMessage({ type: 'UPDATE_SCORE', id: this.id, scoreText: score || '', stage: stage || '', lastEvent: ev || null });
      }, OBS_THROTTLE_MS);

  const obs = new MutationObserver(() => emit());
      obs.observe(scoreNode, { childList: true, subtree: true, characterData: true });
      if (timeNode !== scoreNode) obs.observe(timeNode, { childList: true, subtree: true, characterData: true });
      this.obs = obs;

      // İlk snapshot
      emit();

      // Rebind döngüsü (DOM replacement'a karşı)
      this.scheduleRebind();
    }
  scheduleRebind() {
      clearTimeout(this.rebindTimer);
      this.rebindTimer = setTimeout(() => {
        if (!this.row || !isConnected(this.row)) {
          this.bound = false;
          this.bindIfNeeded();
        }
      }, REBIND_INTERVAL_MS);
    }
    detachObserver() {
      try { this.obs?.disconnect?.(); } catch {}
      this.obs = null;
    }
    dispose() {
      clearTimeout(this.rebindTimer);
      this.detachObserver();
      this.row = null;
      this.bound = false;
    }
  }

  /** Takipli maç cache’i (id → LiveNodeBinding) */
  const liveMap = new Map();
  let trackedIds = new Set();
  let scanObserver = null;

  // ---- Lifecycle & SPA hooks ----
  FSUtils.onLifecycle(() => {
    // görünür olduğunda yeniden tara
    refreshTrackedCache().then(() => {
      scanAndInject();
      rebindAll();
    });
  });

  patchHistory();
  bindScanObserver();
  init();

  function patchHistory() {
    try {
      const origPush = history.pushState;
      history.pushState = function () {
        const r = origPush.apply(this, arguments);
        setTimeout(() => { scanAndInject(); rebindAll(); }, 120);
        return r;
      };
      window.addEventListener('popstate', () => setTimeout(() => { scanAndInject(); rebindAll(); }, 120), { passive: true });
    } catch {}
  }

  chrome.runtime.onMessage.addListener((msg) => {
    try {
      if (msg?.type === 'TRACKED_CHANGED') {
        refreshTrackedCache().then(() => { scanAndInject(); rebindAll(); });
      }
    } catch {}
  });

  async function init() {
    await refreshTrackedCache();
    injectBulkFollowButton();
    scanAndInject();
    rebindAll();
    // FS açık ping: aktif bağ varsa polling'i bastır, yoksa serbest bırak
    setInterval(() => {
      try {
        const hasActive = liveMap.size > 0; // en az bir bağlı canlı row var mı?
        FSUtils.safeSendMessage({ type: 'PING_FS_OPEN', active: hasActive });
      } catch { /* noop */ }
    }, 15000);
  // extension reload sonrası content yeniden başlatma
  setTimeout(() => { try { scanAndInject(); rebindAll(); } catch {} }, 500);
  }

  async function refreshTrackedCache() {
    const o = await chrome.storage.local.get('fsx').catch(() => ({}));
    const tracked = o?.fsx?.tracked || [];
    trackedIds = new Set(tracked.map(t => t.id));
  }

  function bindScanObserver() {
    try {
      if (scanObserver) scanObserver.disconnect();
      scanObserver = new MutationObserver(FSUtils.throttle(() => {
        scanAndInject();
        rebindAll();
      }, 250));
      scanObserver.observe(document.documentElement, { childList: true, subtree: true });
    } catch {}
  }

  // ---- Injection & Binding ----
  function scanAndInject() {
    document.querySelectorAll(S.ROW).forEach((row) => {
      if (row.dataset.fsInjected === '1') return;
      row.dataset.fsInjected = '1';
      const id = injectRow(row);
      // tracked ise işaretle & binding
      if (id && trackedIds.has(id)) {
        ensureLiveBinding(id);
      }
    });
  }

  function injectRow(row) {
    try {
      const id = extractMatchId(row);
      if (!id) return null;
      row.dataset.matchid = id;

      const teams = extractTeams(row);
  const score = extractScore(row) || '';
  const stage = extractStage(row) || '';
  dlog('row', { id, teams, score, stage });
      // Follow butonu (click-through fix: overlay anchor sibling)
      injectFollowButton(row, id, teams);
      // Stil ipucu: takipli satır çerçevesi
      if (trackedIds.has(id)) styleTrackedRow(row);
      return id;
    } catch { return null; }
  }

  function injectFollowButton(row, id, teams) {
    if (row.dataset.followInjected === '1') return;
    row.dataset.followInjected = '1';
  // Kardeş overlay anchor
    const anchor = document.createElement('div');
    anchor.className = 'fsf-follow-anchor';
    anchor.style.cssText = `position:absolute; right:8px; top:50%; transform:translateY(-50%); z-index:9; pointer-events:none;`;
  const eat = (e) => { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); };

    const btn = document.createElement('button');
    btn.className = 'fsf-follow-btn';
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-pressed', trackedIds.has(id) ? 'true' : 'false');
    btn.textContent = trackedIds.has(id) ? '★' : '☆';
    btn.style.cssText = `
      width:28px; height:28px; border-radius:50%; border:1px solid #2b7; background:#0d1117; color:#3fb950;
      display:flex; align-items:center; justify-content:center; font-size:16px; cursor:pointer; pointer-events:auto; box-shadow:0 1px 3px rgba(0,0,0,.25);
    `;

    const performAdd = async () => {
      if (trackedIds.has(id)) return;
      const initScore = { scoreText: extractScore(row) || '', stage: extractStage(row) || '', updatedAt: Date.now() };
      const url = extractUrl(row) || location.href;
      const title = buildTitle(teams);
      const resp = await safeSendMessage({ type: 'ADD_TRACK', match: { id, url, title }, initScore });
      if (resp?.ok) {
        trackedIds.add(id);
        btn.textContent = '★';
        btn.setAttribute('aria-pressed', 'true');
        styleTrackedRow(row);
        ensureLiveBinding(id);
      } else if (resp?.error === 'MAX_TRACK') {
        const old = btn.textContent; btn.textContent = '!'; btn.style.borderColor = '#f33'; btn.style.color = '#ff7b72';
        setTimeout(() => { btn.textContent = old; btn.style.borderColor = '#2b7'; btn.style.color = '#3fb950'; }, 1200);
      }
    };
    const performRemove = async () => {
      if (!trackedIds.has(id)) return;
      const resp = await safeSendMessage({ type: 'REMOVE_TRACK', id });
      if (resp?.ok) {
        trackedIds.delete(id);
        btn.textContent = '☆';
        btn.setAttribute('aria-pressed', 'false');
        unstyleTrackedRow(row);
        removeLiveBinding(id);
      }
    };

  // capture fazında yalnız butonda yut
  btn.addEventListener('pointerdown', eat, true);
  btn.addEventListener('click', (e) => { eat(e); (trackedIds.has(id) ? performRemove() : performAdd()); }, true);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { eat(e); performAdd(); }
    });

    anchor.appendChild(btn);
    // row konumu
    if (getComputedStyle(row).position === 'static') row.style.position = 'relative';
    const link = row.querySelector('a.eventRowLink');
    if (link && link.parentNode) link.parentNode.insertBefore(anchor, link.nextSibling);
    else row.appendChild(anchor);
  }

  function styleTrackedRow(row) {
    row.style.outline = '1px dashed #2b7';
    row.style.outlineOffset = '2px';
  }
  function unstyleTrackedRow(row) {
    try { row.style.outline = ''; row.style.outlineOffset = ''; } catch {}
  }

  function ensureLiveBinding(id) {
    let b = liveMap.get(id);
    if (!b) { b = new LiveNodeBinding(id); liveMap.set(id, b); }
    b.bindIfNeeded();
  }
  function removeLiveBinding(id) {
    const b = liveMap.get(id);
    if (b) { try { b.dispose(); } catch {} liveMap.delete(id); }
  }

  function rebindAll() {
    for (const [id, b] of liveMap.entries()) {
      b.bindIfNeeded();
    }
  }

  function parseKickoffFromRow(row) {
    const timeEl = row.querySelector('.event__time');
    const t = FSUtils.getText(timeEl);
    if (!/^\d{1,2}:\d{2}$/.test(t)) return undefined;
    const [h, m] = t.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() < Date.now() - 60_000) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  // Toplu takip butonu
  function injectBulkFollowButton() {
    if (document.getElementById('fsx-bulk-follow')) return;
    const btn = document.createElement('button');
    btn.id = 'fsx-bulk-follow';
    btn.textContent = 'Bu sayfadaki CANLILARI takip et (≤20)';
    btn.style.cssText = `
      position:fixed; left:12px; bottom:12px; z-index:2147483646;
      font-size:12px; padding:6px 10px; border-radius:6px;
      border:1px solid #09c; background:#e9f7ff; color:#045; cursor:pointer;
      box-shadow:0 2px 8px rgba(0,0,0,.15);
    `;
    btn.addEventListener('click', async () => {
      const rows = Array.from(document.querySelectorAll(S.ROW));
      const liveRows = rows.filter((r) => {
        const st = extractStage(r);
        return !/FT/i.test(st) && FSUtils.isLiveStage(st);
      });
      let added = 0;
      for (const row of liveRows) {
        if (added >= MAX_BULK) break;
        const id = extractMatchId(row);
        if (trackedIds.has(id)) continue;
        const teams = extractTeams(row);
        const score = extractScore(row) || '0-0';
        const stage = extractStage(row) || '';
        const url = extractUrl(row) || location.href;
        const kickoffAt = parseKickoffFromRow(row);

        const match = { id, title: buildTitle(teams), sport: detectSport(), url, addedAt: Date.now(), kickoffAt };
        const initScore = { scoreText: score, stage, updatedAt: Date.now() };
        const resp = await safeSendMessage({ type: 'ADD_TRACK', match, initScore });
        if (resp?.ok) {
          trackedIds.add(id);
          styleTrackedRow(row);
          ensureLiveBinding(id);
          added++;
        }
      }
    });
    document.documentElement.appendChild(btn);
  }
})();
