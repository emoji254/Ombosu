/* Phone checks, run by run.js (they need a real browser with a touch screen, so they can't be pasted into the console).
   - Layout: no sideways page scroll at phone widths (320 px, the smallest phones, and 412 px) on the main screens and in
     the set logger, at the normal text size and with the phone's text size at 130 % and 200 %.
   - The set logger by touch: swipe a set left to delete it, right to copy the previous set; a short swipe or an up/down
     drag changes nothing; a tap on ✓ ticks the set.
   - Touch targets in the set logger: at least 24 × 24 px (the WCAG minimum); smaller than 44 px is listed as a note.
   - Offline: the service worker caches the app, the app starts with no network, and a new version waits for
     "Reload to update" instead of reloading by itself. */
const { devices } = require('playwright');
const fs = require('fs'), path = require('path');

module.exports = async ({ browser, base, openApp, waitReady, reporter, overrides, ROOT }) => {
  const { results, ok, note } = reporter();
  const phone = devices['Pixel 7'];

  /* A client with a 3-set back squat and a 3-set bench press, and a strength session started for them. */
  const startWorkout = page => page.evaluate(async () => {
    S.clients.phC = { name: 'Phone Test', programId: 'phP', currentWeek: 1, status: 'active', createdAt: '2026-01-01' };
    S.programs.phP = { name: 'Phone block', weeks: 1, days: [{ name: 'Day A', items: [
      { exId: 'seed-back-squat', sets: '3', reps: '5', load: '', rest: '90s' }, { exId: 'seed-bench-press', sets: '3', reps: '8', load: '', rest: '90s' }] }] };
    await Store.put('clients', 'phC', S.clients.phC); await Store.put('programs', 'phP', S.programs.phP);
    beginClientWorkout('phC', 'strength');
    await new Promise(r => setTimeout(r, 300));
    return !!S.sel.draft;
  });
  /* How far the page scrolls sideways (0 = it fits the screen), and the widest thing poking out. */
  const overflow = page => page.evaluate(() => {
    const vw = document.documentElement.clientWidth, extra = document.documentElement.scrollWidth - vw;
    let widest = '';
    if (extra > 0) {
      let max = vw;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect(); if (r.width && r.right > max + 1 && getComputedStyle(el).position !== 'fixed') { max = r.right; widest = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + ' (' + Math.round(r.right) + ' px)'; }
      }
    }
    return { extra, widest };
  });
  const go = (page, view, sub) => page.evaluate(([view, sub]) => { S.sel = {}; S.view = view; S.sub = sub; render(); }, [view, sub]);
  const SCREENS = [['dashboard', 'today', 'Today'], ['dashboard', 'calendar', 'Schedule'], ['dashboard', 'clients', 'Clients'], ['programs', '', 'Programs'],
                   ['conditioning', '', 'Conditioning'], ['exercises', '', 'Movements'], ['history', '', 'History'], ['dashboard', 'data', 'Settings']];

  // ---- layout at phone widths and text sizes
  for (const [width, textPct] of [[320, 100], [412, 100], [412, 130], [412, 200], [320, 200]]) {
    const { ctx, page } = await openApp(browser, base, { ...phone, viewport: { width, height: 800 } });
    try {
      // (The phone's text-size setting reaches the page as a bigger root font size.)
      if (textPct !== 100) await page.evaluate(pct => { document.documentElement.style.fontSize = pct + '%'; window.dispatchEvent(new Event('resize')); }, textPct);
      if (textPct >= 130) ok(`${width} px, text ${textPct} %: the app switches to its large-text layout`, await page.evaluate(() => document.documentElement.classList.contains('text-large')));
      const bad = [];
      for (const [view, sub, label] of SCREENS) {
        await go(page, view, sub); await page.waitForTimeout(80);
        const o = await overflow(page); if (o.extra > 1) bad.push(`${label}: ${o.extra} px too wide, ${o.widest}`);
      }
      await startWorkout(page); await page.waitForTimeout(150);
      const o = await overflow(page); if (o.extra > 1) bad.push(`Set logger: ${o.extra} px too wide, ${o.widest}`);
      const boxes = await page.evaluate(() => [...document.querySelectorAll('.exblock[data-ei="0"] .setrow[data-si="0"] [data-set-input], .exblock[data-ei="0"] .setrow[data-si="0"] [data-done]')]
        .map(el => { const r = el.getBoundingClientRect(); return { w: r.width, left: r.left, right: r.right }; }));
      const vw = width;
      ok(`${width} px, text ${textPct} %: kg, reps and ✓ of a set are all on screen and usable`, boxes.length === 3 && boxes.every(b => b.w >= 24 && b.left >= 0 && b.right <= vw + 1), boxes.map(b => Math.round(b.w) + 'px').join(' / '));
      ok(`${width} px, text ${textPct} %: no screen scrolls sideways`, !bad.length, bad.join('; '));
    } finally { await ctx.close(); }
  }

  // ---- the exercise library: names wrap only between words, at the smallest and a normal phone width
  for (const width of [320, 412]) {
    const { ctx, page } = await openApp(browser, base, { ...phone, viewport: { width, height: 800 } });
    try {
      const out = await page.evaluate(async () => {
        const long = [{ id: 'phLong1', name: 'Single-arm landmine Romanian deadlift', category: 'Hinge', equipment: 'Barbell' },
                      { id: 'phLong2', name: 'Bulgarian split squat', category: 'Legs', equipment: 'Kettlebell' }];
        const before = S.exercises; S.exercises = [...before, ...long]; navigateTo('exercises'); await new Promise(r => setTimeout(r, 150));
        // A word is split when its letters land on more than one line.
        const split = [];
        document.querySelectorAll('.exercise-library-table td:first-child').forEach(td => {
          const text = td.firstChild; if (!text || text.nodeType !== 3) return;
          const re = /\S+/g; let m;
          while ((m = re.exec(text.data))) {
            const r = document.createRange(); r.setStart(text, m.index); r.setEnd(text, m.index + m[0].length);
            const tops = new Set([...r.getClientRects()].map(x => Math.round(x.top)));
            if (tops.size > 1) split.push(m[0] + ' in ' + text.data);
          }
        });
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        S.exercises = before; S.view = 'dashboard'; S.sub = 'today'; render();
        return { split, overflow };
      });
      ok(`${width} px: exercise library names wrap only between words`, !out.split.length, out.split.join('; '));
      ok(`${width} px: the exercise library does not scroll sideways`, out.overflow <= 1, out.overflow + ' px');
    } finally { await ctx.close(); }
  }

  // ---- the set logger by touch
  {
    const { ctx, page } = await openApp(browser, base, phone);
    try {
      const cdp = await ctx.newCDPSession(page);
      const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      const drag = async (sel, dx, dy) => {
        const box = await page.locator(sel).first().boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await touch('touchStart', x, y);
        for (let i = 1; i <= 12; i++) { await touch('touchMove', x + dx * i / 12, y + dy * i / 12); await page.waitForTimeout(16); }
        await touch('touchEnd'); await page.waitForTimeout(250);
      };
      const sets = ei => page.evaluate(ei => S.sel.draft.entries[ei].sets.map(s => ({ w: s.weight, r: s.reps, done: s.done })), ei);
      ok('phone: a workout starts', await startWorkout(page));
      const row = (ei, si) => `.exblock[data-ei="${ei}"] .setrow[data-si="${si}"]`;
      const width = (await page.locator(row(1, 0)).boundingBox()).width;

      await drag(row(1, 2), -width * 0.15, 0);
      ok('phone: a short swipe left changes nothing (the set snaps back)', (await sets(1)).length === 3);
      await drag(row(1, 2), -width * 0.6, 0);
      ok('phone: swiping a set left deletes it', (await sets(1)).length === 2, (await sets(1)).length + ' sets left');
      ok('phone: deleting by swipe offers Undo', await page.locator('.undo-toast .undo-btn').count() > 0);
      await drag(row(1, 0), 0, -200);
      ok('phone: an up/down drag over a set scrolls and deletes nothing', (await sets(1)).length === 2);

      await page.evaluate(() => { const s = S.sel.draft.entries[1].sets[0]; s.weight = 62.5; s.reps = 8; render({ keepScroll: true }); });
      await page.waitForTimeout(100);
      await drag(row(1, 1), width * 0.6, 0);
      const after = await sets(1);
      ok('phone: swiping a set right copies the set above (and ticks it)', after[1].w === 62.5 && after[1].r === 8 && after[1].done, JSON.stringify(after[1]));

      const tick = page.locator(row(0, 0) + ' [data-done]');
      await page.evaluate(() => { const s = S.sel.draft.entries[0].sets[0]; s.weight = 100; s.reps = 5; render({ keepScroll: true }); });
      await tick.tap(); await page.waitForTimeout(150);
      ok('phone: a tap on ✓ ticks the set', (await sets(0))[0].done === true);

      // touch targets in the logger: tap points 12 px around each control's middle (a 24 × 24 px area, the WCAG minimum)
      // must land on the control, its label, or something inside it. Smaller than 44 px is listed as a note.
      const sizes = await page.evaluate(() => [...document.querySelectorAll('#main button, #main input, #main select, #main [role=button], #timerBar button, .bottom-nav button')]
        .filter(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.opacity !== '0' && !el.closest('[hidden],[aria-hidden="true"]') && r.bottom > 0 && r.top < innerHeight; })
        .map(el => {
          const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const mine = hit => !!hit && (el.contains(hit) || (el.labels && [...el.labels].some(l => l.contains(hit))) || hit.closest('label') === el.closest('label') && !!el.closest('label'));
          if (!mine(document.elementFromPoint(cx, cy))) return null;   // covered by something else here (a closed menu, a bar): not a size problem
          const reach = [[11, 0], [-11, 0], [0, 11], [0, -11]].every(([dx, dy]) => mine(document.elementFromPoint(cx + dx, cy + dy)));
          const label = el.closest('label'), box = label ? label.getBoundingClientRect() : r;
          return { reach, w: Math.round(box.width), h: Math.round(box.height), what: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30) };
        }).filter(Boolean));
      const tiny = sizes.filter(t => !t.reach), under44 = sizes.filter(t => t.reach && (t.w < 44 || t.h < 44));
      ok('phone: every button and box in the set logger can be tapped in a 24 × 24 px area', !tiny.length, tiny.map(t => `${t.what} ${t.w}×${t.h}`).join('; '));
      if (under44.length) note('phone: controls under the 44 px comfortable size (still usable)', under44.length + ': ' + [...new Set(under44.map(t => `${t.what} ${t.w}×${t.h}`))].slice(0, 12).join('; '));
      ok('phone: no uncaught errors', !page.errors.length, page.errors.join(' | '));
    } finally { await ctx.close(); }
  }

  // ---- offline and updates (service worker)
  {
    const { ctx, page } = await openApp(browser, base, phone);
    try {
      const swOk = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return !!reg.active; }).catch(() => false);
      ok('offline: the service worker installs', swOk);
      await page.reload(); await waitReady(page);
      ok('offline: the service worker controls the app after a reload', await page.evaluate(() => !!navigator.serviceWorker.controller));
      const cached = await page.evaluate(async () => { const keys = await caches.keys(), c = await caches.open(keys.find(k => k.startsWith('nyaega-'))); return (await c.keys()).map(r => r.url.replace(location.origin + '/', '')); });
      ok('offline: the app, its icons and the three export libraries are cached', ['index.html', 'manifest.webmanifest', 'icon-192.png'].every(f => cached.includes(f)) && cached.filter(u => u.startsWith('https://cdnjs')).length === 3, cached.length + ' files');
      ok('offline: no client data or API responses are cached', cached.every(u => !/supabase|\/rest\/|\/auth\//.test(u)));

      await ctx.setOffline(true);
      await page.reload(); await waitReady(page);
      ok('offline: the app starts with no network', await page.evaluate(() => S.bootState === 'ready'));
      ok('offline: a session can be started and a set ticked offline', await page.evaluate(async () => {
        S.clients.phC = { name: 'Offline Test', status: 'active', createdAt: '2026-01-01' }; await Store.put('clients', 'phC', S.clients.phC);
        beginClientWorkout('phC', 'strength'); await new Promise(r => setTimeout(r, 200));
        const d = S.sel.draft; d.entries.push({ exId: 'seed-back-squat', name: 'Back squat', sets: [ensureSetDefaults({ weight: 100, reps: 5 })] });
        return completeWorkoutSet(0, 0) && d.entries[0].sets[0].done;
      }));
      await page.evaluate(async () => { S.sel = {}; await clearWorkoutAutosave(); await Store.del('clients', 'phC'); delete S.clients.phC; render(); });
      await ctx.setOffline(false);

      // A new version of the app: it waits until "Reload to update" is tapped.
      overrides.set('sw.js', fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').replace(/const CACHE = '([^']+)'/, "const CACHE = '$1-test'"));
      try {
        await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
        const bar = page.locator('#updateBar');
        await bar.waitFor({ timeout: 10000 }).catch(() => {});
        ok('update: a new version shows "Update ready" and does not reload by itself', await bar.count() === 1 && await page.evaluate(() => S.bootState === 'ready'));
        if (await bar.count()) {
          await Promise.all([page.waitForEvent('load', { timeout: 10000 }).catch(() => null), page.locator('#updateNow').tap()]);
          await waitReady(page);
          const keys = await page.evaluate(() => caches.keys());
          ok('update: "Reload to update" switches to the new version and removes the old cache', keys.length === 1 && keys[0].endsWith('-test'), keys.join(', '));
        }
      } finally { overrides.delete('sw.js'); }
      ok('offline: no uncaught errors', !page.errors.length, page.errors.join(' | '));
    } finally { await ctx.close(); }
  }
  // ---- offline when a CDN library fails on the first visit: the app is still cached, the library is cached once it loads
  {
    const { ctx, page } = await openApp(browser, base, phone);
    try {
      const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      let cdnDown = true;
      await ctx.route(XLSX_URL, r => cdnDown ? r.fulfill({ status: 503, body: 'down' }) : r.fallback());   // (added last, so it runs first)
      const cachedLibs = () => page.evaluate(async () => { const k = (await caches.keys()).find(n => n.startsWith('nyaega-')); return k ? (await (await caches.open(k)).keys()).filter(r => r.url.startsWith('https://cdnjs')).length : -1; });
      ok('CDN down on the first visit: the service worker still installs', await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active).catch(() => false));
      await ctx.setOffline(true); await page.reload(); await waitReady(page);
      ok('CDN down on the first visit: the app still starts offline', await page.evaluate(() => S.bootState === 'ready' && !!navigator.serviceWorker.controller));
      ok('CDN down on the first visit: the two libraries that loaded are cached', await cachedLibs() === 2, await cachedLibs());
      await ctx.setOffline(false); cdnDown = false; await page.reload(); await waitReady(page);
      ok('the missing library is cached the next time it loads', await cachedLibs() === 3, await cachedLibs());
    } finally { await ctx.close(); }
  }
  return results;
};
