#!/usr/bin/env node
const fs = require('fs');
const { parseMatches } = require('../src/lib/parser.js');

function usage() {
  console.error('Usage: node scripts/parse.js <url-or-file> [--limit N] [--base URL]');
}

async function readSource(src) {
  if (/^https?:/i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return await res.text();
  }
  return fs.readFileSync(src, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    usage();
    process.exit(1);
  }

  const target = args[0];
  let limit;
  let base;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limit') limit = parseInt(args[++i] || '', 10);
    else if (args[i] === '--base') base = args[++i];
  }

  const html = await readSource(target);
  const matches = parseMatches(html, { limit, base: base || target });
  console.log(JSON.stringify(matches, null, 2));
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});

