// content/goal-ui.js - Overlay UI for goals

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'SHOW_GOAL') {
    showGoalOverlay(msg.data);
  }
});

export function showGoalOverlay(data) {
  const existing = document.querySelector('.fscore-goal-overlay');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'fscore-goal-overlay';
  const type = data?.type ? ` <span class="type">[${data.type}]</span>` : '';
  const line1 = `GOOOOL!${type}`;
  const line2 = `${data?.home || ''} ${data?.score || ''} ${data?.away || ''}`.trim();
  const line3 = `${data?.minute ? data.minute + "' " : ''}${data?.scorer || ''}${data?.assist ? ' (' + data.assist + ')' : ''}`.trim();
  const inner = document.createElement('div');
  inner.className = 'inner';
  inner.innerHTML = `
    <div class="l1">${line1}</div>
    <div class="l2">${line2}</div>
    <div class="l3">${line3}</div>
  `;
  if (String(data?.type || '').toUpperCase().includes('PEN')) {
    inner.classList.add('shake');
  }
  div.appendChild(inner);
  document.documentElement.appendChild(div);

  // Remove after 2.8s
  setTimeout(() => div.remove(), 2800);
}
