// Filtreler, sessize alma, kaldırma, detay linki (OPEN_TAB), goal highlight, JSON export.
// Context invalidated güvenli: safeSend; shadow fallback.

// Boşaltılmış eski toolbar — manifest’ten kaldırıldı; yüklense dahi no-op.
(() => { if (window.__FSX_CS_TOOLBAR__) return; window.__FSX_CS_TOOLBAR__ = true; })();

    // Drag
    const panel = shadow.querySelector('.fsx-panel');
    const header = shadow.querySelector('.fsx-header');
    let dragging = false, sx=0, sy=0, start = { right: state.ui.toolbarPos.right, bottom: state.ui.toolbarPos.bottom };
    header.addEventListener('mousedown', (e) => {
      dragging = true; sx = e.clientX; sy = e.clientY;
      start = { ...(state?.ui?.toolbarPos || { right: 24, bottom: 24 }) };
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const right = FSUtils.clamp(start.right - dx, -10, window.innerWidth - 60);
      const bottom = FSUtils.clamp(start.bottom - dy, -10, window.innerHeight - 60);
      setPos({ right, bottom }, false);
    });
    window.addEventListener('mouseup', async () => {
      if (!dragging) return;
      dragging = false;
      await safeSend({ type: 'SET_POSITION', pos: state.ui.toolbarPos });
    });

    // Actions
    shadow.querySelector('.fsx-hide').addEventListener('click', async () => { await safeSend({ type: 'TOGGLE_TOOLBAR', hidden: true }); render(); });
    shadow.querySelector('.fsx-show').addEventListener('click', async () => { await safeSend({ type: 'TOGGLE_TOOLBAR', hidden: false }); render(); });
  shadow.querySelector('.fsx-export').addEventListener('click', () => doExport());
  shadow.querySelector('.fsx-history').addEventListener('click', () => toggleHistory());
    shadow.querySelector('.fsx-filter').addEventListener('change', render);

    applyPos(state.ui.toolbarPos);
  }

  async function loadState() {
    const o = await chrome.storage.local.get('fsx').catch(()=>({}));
    state = o.fsx || {
      tracked: [], scores: {}, scoresHistory: [],
      ui: { toolbarHidden: false, toolbarPos: { right:24, bottom:24 } },
      settings: { notifications: true, pollingEnabled: true, pollingSec: 20, dnd: null }
    };
  }

  function setPos(pos, update=true) {
    state.ui.toolbarPos = pos; applyPos(pos);
    if (update) safeSend({ type: 'SET_POSITION', pos });
  }
  function applyPos(pos) {
    root.style.right = `${pos.right}px`;
    root.style.bottom = `${pos.bottom}px`;
  }

  function render() {
  // Her render öncesi açık menü varsa kapat
  closeAllMenus();
    const panel = shadow.querySelector('.fsx-panel');
    const show = shadow.querySelector('.fsx-show');
    if (state.ui.toolbarHidden) { panel.style.display = 'none'; show.style.display = 'block'; }
    else { panel.style.display = 'block'; show.style.display = 'none'; }

    const filter = shadow.querySelector('.fsx-filter').value;
  const list = shadow.querySelector('.fsx-list');
    list.innerHTML = '';

    const itemsRaw = (state.tracked || []).map((t) => {
      const sc = (state.scores || {})[t.id];
      const stage = sc?.stage || '';
      const score = sc?.scoreText || '';
      const isLive = /’|1st|2nd|ET|LIVE/i.test(stage);
      const isFinished = /^FT$/i.test((stage||'').trim());
      const isUpcoming = !isLive && !isFinished && !score;
      return { t, sc, stage, score, isLive, isFinished, isUpcoming };
    });
    const items = itemsRaw.filter((x) => {
      if (filter === 'all') return true;
      if (filter === 'live') return x.isLive;
      if (filter === 'finished') return x.isFinished;
      if (filter === 'upcoming') return x.isUpcoming;
      return true;
    });

    list.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'fsx-empty';
      empty.textContent = 'Takip edilen maç yok';
      list.appendChild(empty);
      return;
    }

    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'fsx-item';
      row.dataset.id = it.t.id;
      const { home, away } = splitTitle(it.t.title);
      const timeText = stageShort(it.stage, it.t.kickoffAt);
      const leagueLine = it.t.league ? `<div class="fsx-league">${escapeHtml(it.t.league)}</div>` : '';
      const goalBadge = it.sc?.lastEvent?.type === 'goal' ? `<span class="fsx-goal">GOAL</span>` : '';
      row.innerHTML = `
        <div class="fsx-cell fsx-cell-logo fsx-clock ${badgeClass(it.stage)}"><span>${escapeHtml(timeText)}</span></div>
        <div class="fsx-cell fsx-cell-title">
          <div class="fsx-team fsx-team-home">${escapeHtml(home)}</div>
          <div class="fsx-team fsx-team-away">${escapeHtml(away)}</div>
          <div class="fsx-item-meta">${goalBadge}${leagueLine}</div>
        </div>
        <div class="fsx-cell fsx-cell-score">
          <div class="fsx-score">${escapeHtml(it.score || '—')}</div>
        </div>
      `;
      list.appendChild(row);

    }

  // Artık menü yok; scroll bağı gerekmez
  }

  function kickoffBadge(ts) {
    const left = ts - Date.now();
    const soon = left > 0 && left <= 5 * 60 * 1000;
    return `<span class="fsx-badge ${soon ? 'soon' : 'upcoming'}">${soon ? 'Başlıyor' : 'Yaklaşan'}</span>`;
  }

  function badgeClass(stage) {
    if (!stage) return 'idle';
    const s = stage.toUpperCase().trim();
    if (s === 'FT') return 'done';
    if (s === 'HT') return 'half';
    if (/’|1ST|2ND|ET|LIVE|PEN/.test(s)) return 'live';
    return 'idle';
  }

  function stageShort(stage, kickoffAt) {
    const s = (stage || '').trim();
    if (!s) return kickoffAt ? 'UP' : '—';
    const up = s.toUpperCase();
    if (up === 'FT' || up === 'HT' || up === 'ET' || up === 'PEN') return up;
    const mm = s.match(/\d{1,3}(?:\+\d{1,2})?/);
    return mm ? mm[0] : s;
  }

  function splitTitle(title) {
    const t = (title || '').replace(/\s+–\s+|\s+—\s+/g, ' - ');
    const parts = t.split(' - ').map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2) return { home: parts[0], away: parts[1] };
    return { home: title || 'Home', away: '' };
  }

  function closeAllMenus() { /* no-op: menü kaldırıldı */ }

  // Menü kaldırıldığı için dış tık/esc kapatma dinleyicileri gereksizdir

  function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function flashGoal(id, st) {
    if (st?.lastEvent?.type !== 'goal') return;
    const el = shadow.querySelector(`.fsx-item[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.classList.add('goal-flash');
    setTimeout(() => el.classList.remove('goal-flash'), 2000);
  }

  function doExport() {
    const payload = {
      exportedAt: new Date().toISOString(),
      tracked: state.tracked,
      scores: state.scores,
      scoresHistory: state.scoresHistory
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `flashscore-tracked-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toggleHistory() {
    // Basit modal benzeri liste
    const old = shadow.getElementById?.('fsx-history-modal');
    if (old) { old.remove(); return; }
    const wrap = document.createElement('div');
    wrap.id = 'fsx-history-modal';
    wrap.style.position = 'fixed'; wrap.style.inset = '0'; wrap.style.background = 'rgba(0,0,0,.4)';
    wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.justifyContent = 'center';
    const modal = document.createElement('div');
    modal.style.width = '360px'; modal.style.maxHeight = '70vh'; modal.style.overflow = 'auto';
    modal.style.background = '#0d1117'; modal.style.border = '1px solid #30363d'; modal.style.borderRadius = '12px';
    modal.style.color = '#e6edf3'; modal.style.padding = '8px';
    const list = (state.scoresHistory || []).slice(-200).reverse().map((h) => {
      const tm = (state.tracked || []).find(t => t.id === h.id);
      const title = tm ? tm.title : h.id;
      return `<div style="padding:6px 4px; border-bottom:1px solid #222; font-size:12px;">${new Date(h.ts).toLocaleString()} — <b>${escapeHtml(title)}</b> — ${escapeHtml(h.event?.type || '')} ${escapeHtml(h.scoreText||'')}</div>`;
    }).join('');
    modal.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;">Geçmiş <button id="fsx-close-history">Kapat</button></div><div>${list || '<div style="padding:8px;">Kayıt yok</div>'}</div>`;
    wrap.appendChild(modal);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
    shadow.appendChild(wrap);
    shadow.getElementById('fsx-close-history')?.addEventListener('click', () => wrap.remove());
  }

  function initials(title) {
    const parts = (title || '').split('—').map(s => s.trim()).filter(Boolean);
    const pick = (s) => (s.split(/\s+/)[0] || '').slice(0,1).toUpperCase();
    if (parts.length >= 2) return pick(parts[0]) + pick(parts[1]);
    return (title || 'M').slice(0,1).toUpperCase();
  }
})();
