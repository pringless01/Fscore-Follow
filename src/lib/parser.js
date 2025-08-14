const { JSDOM } = require('jsdom');
const { S, extractMatchId, extractTeams, extractStage, extractScore, extractUrl, buildTitle, detectSport, extractEventHint } = require('./selectors.js');

/**
 * Parse Flashscore match rows from given HTML.
 * @param {string} html - Flashscore sayfa HTML'i
 * @param {{limit?:number, base?:string}} [opts]
 */
function parseMatches(html, opts = {}) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const rows = Array.from(doc.querySelectorAll(S.ROW)).slice(0, opts.limit || undefined);
    return rows.map(row => {
      const id = extractMatchId(row);
      const teams = extractTeams(row);
      const score = extractScore(row);
      const stage = extractStage(row);
      const url = extractUrl(row, opts.base);
      const title = buildTitle(teams);
      const sport = detectSport(row);
      const event = extractEventHint(row);
      return { id, ...teams, score, stage, url, title, sport, ...(event ? { event } : {}) };
    });
}

module.exports = { parseMatches };

