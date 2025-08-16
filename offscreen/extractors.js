// offscreen/extractors.js
// Extracts last goal (or last event) from Flashscore timeline/summary HTML Document

/**
 * @param {Document} doc
 * @returns {{minute:string|null, scorer:string|null, assist:string|null, type:string|null}|null}
 */
export function extractTimelineFromDocument(doc) {
  if (!doc) return null;
  try {
    // Try summary tab structures
    // Common containers: .smv__list, .smv__incidents, .summary, etc.
    const candidates = [
      ...doc.querySelectorAll('.smv__list .smv__row, .summary .event, [data-id*="goal"], .detail .participant')
    ];
    if (candidates.length === 0) return null;

    const last = candidates[candidates.length - 1];
    const get = (el, sel) => el.querySelector(sel)?.textContent?.trim() || null;

    const minute = get(last, '.smv__time, .time-box, .time, .minute');
    const scorer = get(last, '.smv__playerName, .participant__player, .player-name, .participant__participantName');
    const assist = get(last, '.smv__assist, .assist, .assist-name');

    let type = 'GOAL';
    const raw = last.textContent || '';
    if (/pen/i.test(raw) || /\bP\b/.test(raw)) type = 'PEN';
    if (/own\s*goal/i.test(raw) || /\bOG\b/.test(raw)) type = 'OG';
    if (/var/i.test(raw)) type = 'VAR';

    return { minute, scorer, assist, type };
  } catch (e) {
    return null;
  }
}
