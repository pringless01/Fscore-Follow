#!/usr/bin/env node
const fs = require('fs');
const { parseMatches } = require('../src/lib/parser.js');

async function main() {
  const input = process.argv[2];
  const limit = parseInt(process.argv[3] || '', 10) || undefined;
  if (!input) {
    console.error('Usage: node scripts/parse.js <url-or-file> [limit]');
    process.exit(1);
  }
  let html;
  if (/^https?:/i.test(input)) {
    const res = await fetch(input);
    html = await res.text();
  } else {
    html = fs.readFileSync(input, 'utf8');
  }
  const matches = parseMatches(html, { limit, base: input });
  console.log(JSON.stringify(matches, null, 2));
}

main();

