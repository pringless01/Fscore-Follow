const fs = require('fs');
const { parseMatches } = require('../src/lib/parser.js');

// Demo: parse bundled HTML sample and print first 5 matches.
const html = fs.readFileSync('html_ornegi.html', 'utf8');
const matches = parseMatches(html, { limit: 5, base: 'https://www.flashscore.com' });
console.log(JSON.stringify(matches, null, 2));

