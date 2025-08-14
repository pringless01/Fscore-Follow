const fs = require('fs');
codex/yeniden-yaplandr-ve-analiz-et-xaur2w
const { parseMatches } = require('../src/lib/parser.js');

// Demo: parse bundled HTML sample and print first 5 matches.
const html = fs.readFileSync('html_ornegi.html', 'utf8');
const matches = parseMatches(html, { limit: 5, base: 'https://www.flashscore.com' });
console.log(JSON.stringify(matches, null, 2));


const { JSDOM } = require('jsdom');

// Stub chrome runtime for utils
global.chrome = { runtime: {} };

// Load HTML sample
const html = fs.readFileSync('html_ornegi.html', 'utf8');
const dom = new JSDOM(html);

global.window = dom.window;
global.document = dom.window.document;

// Load extension utilities and selectors
require('../src/lib/utils.js');
// expose FSUtils globally for selectors
global.FSUtils = window.FSUtils;
require('../src/lib/selectors.js');

const { S, extractMatchId, extractTeams, extractStage, extractScore, extractUrl } = window.FSSelectors;

// Extract first 5 match rows as a demo
const rows = Array.from(document.querySelectorAll(S.ROW)).slice(0, 5);
const matches = rows.map(row => {
  const id = extractMatchId(row);
  const teams = extractTeams(row);
  const score = extractScore(row);
  const stage = extractStage(row);
  const url = extractUrl(row);
  return { id, ...teams, score, stage, url };
});

console.log(JSON.stringify(matches, null, 2));
main
