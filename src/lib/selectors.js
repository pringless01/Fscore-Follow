// Flashscore seçiciler ve veri çıkarımı; çoklu selector + fallback.
// Hem tarayıcı hem Node ortamında kullanılabilir.

const FSUtils = typeof require === 'function' ? require('./utils.js') : window.FSUtils;

const S = {
  ROW: 'div.event__match, div.event__match--live, div.event__match--scheduled, div.event__match--twoLine, div.event__match--withRowLink',
  MORE: 'div.event__more, div.event__more--static',
  SCORE: 'div.event__scores, div.event__score, .event__part--home, .event__part--away, [data-testid="wcl-matchRowScore"]',
  TIME: 'div.event__time, div.event__stage, .event__stage--block, [data-testid="wcl-matchRowTime"], [data-testid="wcl-matchRowStatus"]',
  HOME: 'div.event__participant--home, div.event__participant:nth-of-type(1), [data-testid="wcl-matchRow-participant"].event__homeParticipant',
  AWAY: 'div.event__participant--away, div.event__participant:nth-of-type(2), [data-testid="wcl-matchRow-participant"].event__awayParticipant',
  ROWLINK: 'a.eventRowLink[href*="/match/"]'
};

/** @param {Element} row */
function extractMatchId(row) {
  if (row.id && row.id.startsWith('g_')) return row.id;
  const a = row.querySelector(S.ROWLINK);
  if (a) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/match\/([A-Za-z0-9]+)\//);
    if (m) return m[1];
  }
  return FSUtils.hash((row.textContent || '').slice(0, 200));
}

function cleanParticipantText(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.event__important, [data-testid="wcl-matchRowHistory"], [data-testid="wcl-participantMessage"]').forEach(n => n.remove());
  return FSUtils.getText(clone);
}

/** @param {Element} row */
function extractTeams(row) {
  let home = cleanParticipantText(row.querySelector(S.HOME));
  let away = cleanParticipantText(row.querySelector(S.AWAY));
  if (!home || !away) {
    const parts = row.querySelectorAll('div.event__participant, [data-testid="wcl-matchRow-participant"]');
    if (parts.length >= 2) {
      home = home || cleanParticipantText(parts[0]);
      away = away || cleanParticipantText(parts[1]);
    }
  }
  home = (home || '').replace(/\s+/g, ' ').trim();
  away = (away || '').replace(/\s+/g, ' ').trim();
  return { home, away };
}

/** @param {Element} row */
function extractStage(row) {
  const t = FSUtils.getText(row.querySelector(S.TIME));
  // HT/FT/1st/2nd gibi ibareler öncelikli, değilse tüm metni döndür.
  const tok = FSUtils.regexStage(t);
  return tok || t || '';
}

/** @param {Element} row */
function extractScore(row) {
  let t = FSUtils.getText(row.querySelector(S.SCORE));
  let s = FSUtils.regexScore(t);
  if (!s) {
    const scoreEls = row.querySelectorAll('[data-testid="wcl-matchRowScore"]');
    if (scoreEls.length >= 2) {
      const home = FSUtils.getText(scoreEls[0]);
      const away = FSUtils.getText(scoreEls[1]);
      if (home && away && /\d/.test(home) && /\d/.test(away)) s = `${home}-${away}`.replace(/\s+/g, '');
    }
  }
  if (!s) {
    const home = FSUtils.getText(row.querySelector('.event__part--home'));
    const away = FSUtils.getText(row.querySelector('.event__part--away'));
    if (home && away && /\d/.test(home) && /\d/.test(away)) s = `${home}-${away}`.replace(/\s+/g, '');
  }
  return s;
}

/** @param {Element} row */
function extractUrl(row, base) {
  const a = row.querySelector(S.ROWLINK);
  const href = a?.getAttribute('href') || '';
  if (!href) return '';
  try {
    const origin = base || (typeof location !== 'undefined' ? location.origin : '');
    return new URL(href, origin).href;
  } catch {
    return href;
  }
}

function buildTitle(teams) {
  if (!teams.home && !teams.away) return 'Maç';
  return `${teams.home || 'Home'} — ${teams.away || 'Away'}`;
}

function detectSport() { return 'football'; }

/** Satır metninden basit olay sinyali (GOAL/KIRMIZI/SARI vb) çıkarır. */
function extractEventHint(row) {
  const txt = (row.textContent || '').toUpperCase();
  if (txt.includes('GOAL')) return { type: 'goal', text: 'Gol' };
  if (txt.includes('RED CARD')) return { type: 'red', text: 'Kırmızı Kart' };
  if (txt.includes('YELLOW CARD')) return { type: 'yellow', text: 'Sarı Kart' };
  return undefined;
}

const FSSelectors = { S, extractMatchId, extractTeams, extractStage, extractScore, extractUrl, buildTitle, detectSport, extractEventHint };

if (typeof module !== 'undefined' && module.exports) module.exports = FSSelectors;
if (typeof window !== 'undefined') window.FSSelectors = FSSelectors;

