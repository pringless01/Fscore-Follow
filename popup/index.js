const SYNC_KEY = 'followed';

async function getFollowed() {
  const { [SYNC_KEY]: followed = {} } = await chrome.storage.sync.get(SYNC_KEY);
  return followed;
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else el.setAttribute(k, v);
  }
  for (const c of children) {
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

function matchUrl(id) {
  return id ? `https://www.flashscore.com/match/${id}/#/match-summary/match-summary` : '#';
}

async function render() {
  const listEl = document.getElementById('list');
  listEl.textContent = '';
  const followed = await getFollowed();
  const ids = Object.keys(followed).filter((k) => followed[k]);
  if (ids.length === 0) {
    listEl.appendChild(h('div', { class: 'empty' }, 'Henüz takip edilen maç yok.'));
    return;
  }
  for (const id of ids) {
    const a = h('a', { href: matchUrl(id), target: '_blank', rel: 'noreferrer' }, id);
    listEl.appendChild(h('div', { class: 'row' }, a));
  }
}

document.addEventListener('DOMContentLoaded', render);
