/* global chrome */
(async function () {
  const els = {
    notifications: document.getElementById('notifications'),
    dndEnabled: document.getElementById('dnd-enabled'),
    dndStart: document.getElementById('dnd-start'),
    dndEnd: document.getElementById('dnd-end'),
    pollingEnabled: document.getElementById('polling-enabled'),
    pollingSec: document.getElementById('polling-sec'),
    toggleToolbar: document.getElementById('toggle-toolbar'),
    resetPos: document.getElementById('reset-pos')
  };

  let state = await getState();
  hydrate(state);

  for (const el of [els.notifications, els.dndEnabled, els.dndStart, els.dndEnd, els.pollingEnabled, els.pollingSec]) {
    el.addEventListener('change', save);
  }
  els.toggleToolbar.addEventListener('click', async () => {
    state = await getState();
    const hidden = !state.ui.toolbarHidden ? true : false;
    try { await chrome.runtime.sendMessage({ type: 'TOGGLE_TOOLBAR', hidden }); } catch {}
  });
  els.resetPos.addEventListener('click', async () => {
    try { await chrome.runtime.sendMessage({ type: 'SET_POSITION', pos: { right: 24, bottom: 24 } }); } catch {}
  });

  async function save() {
    const settings = {
      notifications: els.notifications.checked,
      dnd: els.dndEnabled.checked ? { start: els.dndStart.value || '22:00', end: els.dndEnd.value || '08:00' } : null,
      pollingEnabled: els.pollingEnabled.checked,
      pollingSec: Math.max(20, parseInt(els.pollingSec.value || '20', 10))
    };
  try { await chrome.runtime.sendMessage({ type: 'SET_SETTINGS', settings }); } catch {}
  }

  function hydrate(s) {
    els.notifications.checked = !!s.settings.notifications;
    els.pollingEnabled.checked = !!s.settings.pollingEnabled;
    els.pollingSec.value = s.settings.pollingSec || 20;
    if (s.settings.dnd) {
      els.dndEnabled.checked = true;
      els.dndStart.value = s.settings.dnd.start || '22:00';
      els.dndEnd.value = s.settings.dnd.end || '08:00';
    } else {
      els.dndEnabled.checked = false;
    }
  }

  async function getState() {
    const o = await chrome.storage.local.get('fsx');
    return o.fsx;
  }
})();
