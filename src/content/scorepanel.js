// Minimalist skor paneli: modern ve sade, gölge DOM, gol anında net tepki.
/* global FSUtils, chrome */
(() => {
  if (window.__FSX_SCOREPANEL__) return; window.__FSX_SCOREPANEL__ = true;

  const CSS_URL = chrome.runtime.getURL('src/ui/scorepanel.css');
  const ROOT_ID = 'fsx-scorepanel-root';
  const safeSend = (msg) => FSUtils.safeSendMessage(msg);

  let root, shadow, state = null;

  chrome.runtime.onMessage.addListener((msg) => {
    try {
      if (msg?.type === 'SCORES_UPDATED') { updateScores(msg.id, msg.state); }
      else if (msg?.type === 'TRACKED_CHANGED' || msg?.type === 'UI_CHANGED') { loadState().then(render).catch(()=>{}); }
    } catch {}
  });

  FSUtils.onLifecycle(() => loadState().then(render).catch(()=>{}));
  init();

  async function init() {
    await loadState();
    mount();
    render();
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.fsx) return;
        state = changes.fsx.newValue || state;
        render();
      });
    } catch {}
  }

  async function loadState() {
    const o = await chrome.storage.local.get('fsx').catch(()=>({}));
    state = o.fsx || { tracked: [], scores: {}, scoresHistory: [], ui: {}, settings: {} };
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    root = document.createElement('div');
    root.id = ROOT_ID; root.style.position = 'fixed'; root.style.zIndex = 2147483647; root.style.right = '24px'; root.style.bottom = '24px';
    document.documentElement.appendChild(root);
    try { shadow = root.attachShadow({ mode: 'open' }); } catch { shadow = root; }

    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = CSS_URL; shadow.appendChild(link);
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="fsp-panel">
        <div class="fsp-header">
          <div class="fsp-title">FS Skor</div>
          <div class="fsp-actions">
            <button class="fsp-min" title="Küçült">_</button>
            <button class="fsp-refresh" title="Yenile">⟳</button>
          </div>
        </div>
        <div class="fsp-list"></div>
      </div>`;
    shadow.appendChild(wrap);

  shadow.querySelector('.fsp-refresh').addEventListener('click', async () => {
      await safeSend({ type: 'SET_SETTINGS', settings: { pollingEnabled: true } });
      render();
    });
  shadow.querySelector('.fsp-min').addEventListener('click', () => toggleMin());
  }

  function render() {
    const list = shadow.querySelector('.fsp-list');
    list.innerHTML = '';
    const items = (state.tracked || []).map((t) => {
      const sc = (state.scores || {})[t.id];
      return { t, sc, stage: sc?.stage || '', score: sc?.scoreText || '' };
    });
    if (!items.length) {
      const empty = document.createElement('div'); empty.className = 'fsp-empty'; empty.textContent = 'Takip edilen maç yok'; list.appendChild(empty); return;
    }
    for (const it of items) {
      const row = document.createElement('div'); row.className = 'fsp-item'; row.dataset.id = it.t.id;
      const { home, away } = splitTitle(it.t.title);
      const timeText = stageShort(it.stage);
      row.innerHTML = `
        <div class="fsp-left ${badgeClass(it.stage)}"><span>${esc(timeText)}</span></div>
        <div class="fsp-mid">
          <div class="fsp-home">${esc(home)}</div>
          <div class="fsp-away">${esc(away)}</div>
          ${it.t.league ? `<div class="fsp-league">${esc(it.t.league)}</div>` : ''}
        </div>
        <div class="fsp-right"><div class="fsp-score">${esc(it.score || '—')}</div><button class="fsp-remove" title="Kaldır">×</button></div>`;
      list.appendChild(row);
      row.querySelector('.fsp-remove').addEventListener('click', async () => {
        await safeSend({ type: 'REMOVE_TRACK', id: it.t.id });
        await loadState();
        render();
      });
    }
  }

  function updateScores(id, st) {
    const row = shadow?.querySelector?.(`.fsp-item[data-id="${CSS.escape(id)}"]`);
    if (!row) { loadState().then(render).catch(()=>{}); return; }
    row.querySelector('.fsp-left').className = `fsp-left ${badgeClass(st.stage)}`;
    row.querySelector('.fsp-left span').textContent = stageShort(st.stage);
    row.querySelector('.fsp-right .fsp-score').textContent = st.scoreText || '—';
    if (st.lastEvent?.type === 'goal') {
      row.classList.add('goal'); setTimeout(() => row.classList.remove('goal'), 1200);
    }
  }

  function esc(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));}
  function splitTitle(title){const t=(title||'').replace(/\s+–\s+|\s+—\s+/g,' - ');const p=t.split(' - ').map(x=>x.trim()).filter(Boolean);return p.length>=2?{home:p[0],away:p[1]}:{home:title||'Home',away:''};}
  function stageShort(s){if(!s) return 'UP'; const U=(s||'').toUpperCase().trim(); if(['FT','HT','ET','PEN'].includes(U)) return U; const m=(s||'').match(/\d{1,3}(?:\+\d{1,2})?/); return m?m[0]:s;}
  function badgeClass(s){if(!s) return 'idle'; const U=(s||'').toUpperCase(); if(U==='FT') return 'done'; if(U==='HT') return 'half'; if(/’|1ST|2ND|ET|LIVE|PEN/.test(U)) return 'live'; return 'idle';}
  function toggleMin(){
    const panel = shadow.querySelector('.fsp-panel');
    const list = shadow.querySelector('.fsp-list');
    const btn = shadow.querySelector('.fsp-min');
    const min = panel.classList.toggle('min');
    list.style.display = min ? 'none' : 'flex';
    btn.textContent = min ? '▢' : '_';
  }
})();
