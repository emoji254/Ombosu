/* Run this after every change to index.html, sw.js, the manifest or the icons:
     node tools/update-hashes.js           updates them
     node tools/update-hashes.js --check   only checks (GitHub runs this on every push); exits with 1 when something is off
   It keeps three things right that the browser enforces:
   - The Content-Security-Policy in index.html holds a hash of the app's script. An edited script with an old hash is
     refused by the browser and the app does not start at all.
   - The cache name in sw.js is made from the files the service worker caches. A change without a new name never reaches
     phones that have the app installed (they keep the old copy).
   - The three CDN libraries: each <script> has the integrity hash from lib-hashes.json, and sw.js caches the same three. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..'), check = process.argv.includes('--check');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sha = (alg, data, enc) => crypto.createHash(alg).update(data).digest(enc);
const problems = [], changed = [];

let html = read('index.html'), sw = read('sw.js');

// ---- the script hash in the Content-Security-Policy (browsers hash the script as written, line endings as LF)
const script = html.match(/<script>([\s\S]*?)<\/script>/);
if (!script) problems.push('index.html: the app script (<script> with no attributes) was not found');
else {
  const want = 'sha256-' + sha('sha256', script[1].replace(/\r\n/g, '\n'), 'base64');
  const csp = html.match(/script-src '(sha256-[^']+)'/);
  if (!csp) problems.push("index.html: no script-src 'sha256-…' in the Content-Security-Policy");
  else if (csp[1] !== want) {
    if (check) problems.push('index.html: the Content-Security-Policy has an old script hash, so the browser would refuse the app');
    else { html = html.replace(csp[0], `script-src '${want}'`); changed.push('index.html (script hash)'); }
  }
}

// ---- the CDN libraries: integrity hashes, and the same list in sw.js
const known = JSON.parse(read('lib-hashes.json').replace(/^﻿/, ''));
const tags = [...html.matchAll(/<script src="(https:\/\/cdnjs\.cloudflare\.com\/[^"]+)"([^>]*)><\/script>/g)];
for (const [, url, attrs] of tags) {
  const integrity = (attrs.match(/integrity="([^"]+)"/) || [])[1];
  if (!known[url]) problems.push(`lib-hashes.json has no hash for ${url}`);
  else if (integrity !== known[url]) problems.push(`index.html: the integrity hash of ${url} is not the one in lib-hashes.json`);
  if (!/crossorigin="anonymous"/.test(attrs)) problems.push(`index.html: ${url} needs crossorigin="anonymous" for its integrity check`);
}
const libsLine = sw.match(/const LIBS = (\[.*\]);/);
const libs = libsLine ? JSON.parse(libsLine[1]) : null;
if (!libs) problems.push('sw.js: the LIBS list was not found');
else if (JSON.stringify(libs.slice().sort()) !== JSON.stringify(tags.map(t => t[1]).sort())) problems.push('sw.js: LIBS is not the same list as the CDN scripts in index.html');

// ---- the files the service worker caches exist, and the cache name follows their contents
const shellLine = sw.match(/const SHELL = (\[.*\]);/);
const shell = shellLine ? JSON.parse(shellLine[1].replace(/'/g, '"')) : null;
if (!shell) problems.push('sw.js: the SHELL list was not found');
else {
  const files = shell.filter(f => f !== './'), missing = files.filter(f => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) problems.push('sw.js caches files that do not exist: ' + missing.join(', '));
  else {
    // (sw.js itself counts too, without its own cache name; the files are read after the script hash was updated)
    const contents = files.map(f => f === 'index.html' ? html : fs.readFileSync(path.join(ROOT, f)));
    const version = 'nyaega-' + sha('sha256', Buffer.concat([...contents.map(c => Buffer.from(c)), Buffer.from(sw.replace(/const CACHE = '[^']*'/, ''))]), 'hex').slice(0, 12);
    const cache = sw.match(/const CACHE = '([^']+)'/);
    if (!cache) problems.push("sw.js: const CACHE = '…' was not found");
    else if (cache[1] !== version) {
      if (check) problems.push('sw.js: the cache name is out of date, so installed copies of the app would not update');
      else { sw = sw.replace(cache[0], `const CACHE = '${version}'`); changed.push('sw.js (cache name)'); }
    }
  }
}

if (!check) {
  if (changed.some(c => c.startsWith('index.html'))) fs.writeFileSync(path.join(ROOT, 'index.html'), html);
  if (changed.some(c => c.startsWith('sw.js'))) fs.writeFileSync(path.join(ROOT, 'sw.js'), sw);
}
if (problems.length) { problems.forEach(p => console.error('PROBLEM: ' + p)); process.exit(1); }
console.log(check ? 'OK: hashes and cache name are up to date' : changed.length ? 'Updated: ' + changed.join(', ') : 'Nothing to update');
