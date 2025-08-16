#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function extractTimelineFromDocument(doc) {
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
}

function main() {
  const samplePath = path.join(__dirname, '..', 'samples', 'sample.html');
  const html = fs.readFileSync(samplePath, 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const res = extractTimelineFromDocument(doc);
  console.log(JSON.stringify(res, null, 2));
}

main();

