/* Runs every Nyaega test in a real browser (Chromium, through Playwright) and prints one table per test.
     cd tests && npm install && npm test          (or: node run.js [smoke|logger|movements|phone|a11y ...])
   It serves the app folder (the one above tests\) on a local port, opens index.html in a fresh browser profile each time
   (so your own data is never touched), and runs:
     smoke.js, logger.js, movements.js   the same tests you can paste into the browser console
     phone.js                            phone checks: layout at phone widths, swipe gestures, large text, offline
     a11y.js                             accessibility checks (axe-core) on the main screens
   The three CDN libraries (PDF and Excel export) come from the same versions installed by npm (byte for byte the CDN files,
   so their integrity hashes match), not from the internet: the tests work offline. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css' };
// Tests can change what the server sends (phone.js uses it to publish a "new version" of sw.js).
const overrides = new Map();
function serve(){
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]), rel = url === '/' ? 'index.html' : url.slice(1);
    if (overrides.has(rel)) { res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); return res.end(overrides.get(rel)); }
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || rel.startsWith('tests/') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// The CDN libraries, served from node_modules (see package.json).
const CDN_FILES = {
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js': 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js'
};
const cdnCache = new Map();
function cdnBody(url){   // (read from the package folder: some packages don't let require.resolve reach their dist files)
  if (!cdnCache.has(url)) {
    const [pkg, ...rest] = CDN_FILES[url].split('/'), dir = require.resolve.paths(pkg).map(d => path.join(d, pkg)).find(d => fs.existsSync(d));
    if (!dir) throw new Error(`npm package ${pkg} is missing: run npm install in tests`);
    cdnCache.set(url, fs.readFileSync(path.join(dir, ...rest)));
  }
  return cdnCache.get(url);
}

/* A fresh profile with the app open and started (local mode, so no sign-in page). opts go to browser.newContext. */
async function openApp(browser, base, opts = {}){
  const ctx = await browser.newContext(opts);
  await ctx.route(/^https:\/\/cdnjs\.cloudflare\.com\//, r => {
    let body = null; try { body = CDN_FILES[r.request().url()] && cdnBody(r.request().url()); } catch (e) { console.error(e.message); }
    return body ? r.fulfill({ status: 200, contentType: 'text/javascript', body, headers: { 'Access-Control-Allow-Origin': '*' } }) : r.fulfill({ status: 404, body: 'not available' });
  });
  await ctx.route(/supabase\.co/, r => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('nyaega:skipLogin', '1'); } catch {} });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(base + '/index.html');
  await waitReady(page);
  return { ctx, page };
}
const waitReady = page => page.waitForFunction(() => typeof S !== 'undefined' && S.bootState === 'ready', null, { timeout: 20000 });

/* Collects { check, result, info } rows, like the console tests do. */
function reporter(){
  const results = [];
  return { results, ok: (check, pass, info) => results.push({ check, result: pass ? 'PASS' : 'FAIL', info: info === undefined ? '' : String(info) }),
           note: (check, info) => results.push({ check, result: 'NOTE', info: info === undefined ? '' : String(info) }) };
}

const CONSOLE_TESTS = ['smoke', 'logger', 'movements', 'library', 'analysis'];
const SUITES = {
  ...Object.fromEntries(CONSOLE_TESTS.map(name => [name, async (browser, base) => {
    const { ctx, page } = await openApp(browser, base);
    try {
      const out = await page.evaluate(fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8'));
      if (page.errors.length) out.results.push({ check: 'no uncaught errors on the page', result: 'FAIL', info: page.errors.join(' | ') });
      return out.results;
    } finally { await ctx.close(); }
  }])),
  phone: (browser, base) => require('./phone.js')({ browser, base, openApp, waitReady, reporter, overrides, ROOT }),
  a11y: (browser, base) => require('./a11y.js')({ browser, base, openApp, reporter })
};

(async () => {
  const pick = process.argv.slice(2), names = pick.length ? pick : Object.keys(SUITES);
  const unknown = names.filter(n => !SUITES[n]); if (unknown.length) { console.error('Unknown test: ' + unknown.join(', ') + '. Choose from: ' + Object.keys(SUITES).join(', ')); process.exit(2); }
  const server = await serve(), base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let failed = 0, total = 0;
  for (const name of names) {
    let rows;
    try { rows = await SUITES[name](browser, base); }
    catch (e) { rows = [{ check: 'test ran without an exception', result: 'FAIL', info: e && e.message }]; }
    console.log('\n== ' + name);
    for (const r of rows) console.log(`${r.result.padEnd(4)}  ${r.check}${r.info ? '  (' + r.info + ')' : ''}`);
    failed += rows.filter(r => r.result === 'FAIL').length; total += rows.filter(r => r.result !== 'NOTE').length;
  }
  await browser.close(); server.close();
  console.log('\n' + (failed ? failed + ' of ' + total + ' checks FAILED' : 'All ' + total + ' checks passed'));
  process.exit(failed ? 1 : 0);
})();
