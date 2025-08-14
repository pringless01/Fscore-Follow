const fs = require('fs');
const path = require('path');
const { parseMatches } = require('../src/lib/parser.js');

// Demo: parse bundled HTML sample and print first 5 matches.
const samplePath = path.join(__dirname, '..', 'html_ornegi.html');
const html = fs.readFileSync(samplePath, 'utf8');
const matches = parseMatches(html, { limit: 5, base: 'https://www.flashscore.com' });
console.log(JSON.stringify(matches, null, 2));

