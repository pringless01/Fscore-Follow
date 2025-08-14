const $ = (s, r=document) => r.querySelector(s);
const view = $('#view');
const toaster = $('#toaster');

function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toaster.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

async function me() {
  const res = await fetch('/api/user/me', { credentials: 'include' });
  if (!res.ok) return null;
  return res.json();
}

async function ensureAdmin() {
  const u = await me();
  if (!u || !Array.isArray(u.roles) || !u.roles.includes('admin')) {
    location.href = '/login';
    return false;
  }
  return true;
}

function go(panel) {
  view.dataset.view = panel;
  [...view.querySelectorAll('section[data-panel]')].forEach(sec => {
    sec.hidden = sec.getAttribute('data-panel') !== panel;
  });
  document.querySelectorAll('.sidebar [data-go]').forEach(b => {
    b.classList.toggle('is-active', b.dataset.go === panel);
  });
}

async function fetchJSON(url, opts={}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status === 401) { location.href = '/login'; return Promise.reject(new Error('unauth')); }
  if (res.status === 403) { toast('Yetkiniz yok', 'warn'); return Promise.reject(new Error('forbidden')); }
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Hata'), { status: res.status, data });
  return data;
}

// Dashboard
async function loadDashboard() {
  const sec = $('section[data-panel="dashboard"]');
  const h = await fetchJSON('/api/admin/health');
  sec.innerHTML = `
    <div class="grid">
      <div class="card"><h4>Uptime</h4><p>${Math.round(h.uptime/60)} dk</p></div>
      <div class="card"><h4>DB</h4><p>${h.db?.ok ? 'OK' : 'FAIL'}</p></div>
      <div class="card"><h4>Redis</h4><p>${h.redis?.ok ? 'OK' : 'N/A'}</p></div>
    </div>
    <h3>Son Loglar</h3>
    <div class="table">${(h.latestAudit||[]).map(a=>`<div class="row"><span>${a.id}</span><span>${a.event}</span><span>${a.ts}</span></div>`).join('')}</div>
  `;
}

// Users
let usersOffset = 0;
let usersQ = '';
const usersLimit = 50;
async function loadUsers(reset=false) {
  if (reset) { usersOffset = 0; $('#usersTable').innerHTML = ''; }
  const data = await fetchJSON(`/api/admin/users?q=${encodeURIComponent(usersQ)}&offset=${usersOffset}&limit=${usersLimit}`);
  const host = $('#usersTable');
  (data.items||[]).forEach(u => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span>${u.id}</span><span>${u.email}</span><span>${u.username||''}</span><span>${(u.roles||[]).join(',')}</span>`;
    row.addEventListener('click', () => openUser(u.id));
    host.appendChild(row);
  });
  usersOffset += data.items.length;
}

async function openUser(id) {
  const d = await fetchJSON(`/api/admin/users/${id}`);
  const drawer = $('#userDrawer');
  drawer.hidden = false;
  drawer.innerHTML = `
    <header><h3>${d.user.email}</h3><button id="closeUser">✕</button></header>
    <div class="form">
      <label>Roles<input id="roles" value="${(d.user.roles||[]).join(',')}" /></label>
      <label>Money<input id="money" type="number" min="0" value="${d.user.money||0}" /></label>
      <button id="saveUser">Kaydet</button>
    </div>
  `;
  $('#closeUser').onclick = () => drawer.hidden = true;
  $('#saveUser').onclick = async () => {
    const payload = {
      roles: $('#roles').value.split(',').map(s=>s.trim()).filter(Boolean),
      money: Math.max(0, Number($('#money').value||0))
    };
    try {
      await fetchJSON(`/api/admin/users/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      toast('Kaydedildi','ok'); drawer.hidden=true; usersOffset=0; loadUsers(true);
    } catch(e) { toast('Kaydedilemedi','err'); }
  };
}

// Audit
let auditCursor = null;
let auditLive = true;
async function loadAudit(tick=false) {
  if (!auditLive && tick) return;
  const q = new URLSearchParams({ limit: '50' });
  if (auditCursor) q.set('cursor', auditCursor);
  const ev = $('#auditEvent').value.trim(); if (ev) q.set('event', ev);
  const us = $('#auditUser').value.trim(); if (us) q.set('user', us);
  const data = await fetchJSON(`/api/admin/audit?${q.toString()}`);
  const host = $('#auditTable');
  (data.items||[]).forEach(x => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span>${x.id}</span><span>${x.event}</span><span>${x.userId||''}</span><span>${x.ts}</span>`;
    host.prepend(row);
    auditCursor = Math.max(auditCursor||0, x.id);
  });
}

async function main() {
  if (!await ensureAdmin()) return;
  document.querySelectorAll('.sidebar [data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  await loadDashboard();
  $('#userSearch').addEventListener('input', e => { usersQ = e.target.value; loadUsers(true); });
  loadUsers(true);
  $('#auditLive').addEventListener('change', e => auditLive = e.target.checked);
  setInterval(() => loadAudit(true).catch(()=>{}), 3000);
}

main();
