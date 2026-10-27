/* Accessibility checks, run by run.js: axe-core (the standard automated accessibility checker) on each main screen, the
   set logger, a dialog, and the dark theme, at phone size. Serious and critical problems fail; moderate and minor ones
   are listed as notes. Automated checks find only part of the problems: a screen reader and keyboard pass is still needed. */
const fs = require('fs');
const { devices } = require('playwright');

module.exports = async ({ browser, base, openApp, reporter }) => {
  const { results, ok, note } = reporter();
  const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const { ctx, page } = await openApp(browser, base, { ...devices['Pixel 7'] });
  try {
    await page.evaluate(axeSource);   // (evaluate runs outside the page's Content-Security-Policy)
    const scan = async label => {
      const out = await page.evaluate(async () => {
        const r = await axe.run(document, { resultTypes: ['violations'], rules: { 'meta-viewport': { enabled: false } } });   // (pinch-zoom: checked once, below)
        return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(' ')).slice(0, 4), count: v.nodes.length }));
      });
      const bad = out.filter(v => v.impact === 'serious' || v.impact === 'critical'), minor = out.filter(v => !bad.includes(v));
      ok(`${label}: no serious accessibility problems`, !bad.length, bad.map(v => `${v.id} ×${v.count} (${v.help}): ${v.nodes.join(', ')}`).join(' | '));
      if (minor.length) note(`${label}: smaller accessibility problems`, minor.map(v => `${v.id} ×${v.count} (${v.help}): ${v.nodes.join(', ')}`).join(' | '));
    };
    const go = (view, sub) => page.evaluate(([view, sub]) => { S.sel = {}; S.view = view; S.sub = sub; render(); }, [view, sub]);
    // Some data, so the lists and the logger have something in them.
    await page.evaluate(async () => {
      S.clients.a11yC = { name: 'Access Test', programId: 'a11yP', currentWeek: 1, status: 'active', createdAt: '2026-01-01' };
      S.programs.a11yP = { name: 'Access block', weeks: 1, days: [{ name: 'Day A', items: [{ exId: 'seed-back-squat', sets: '3', reps: '5', load: '', rest: '90s' }, { exId: 'seed-dumbbell-row', sets: '3', reps: '10', load: '', rest: '60s' }] }] };
      await Store.put('clients', 'a11yC', S.clients.a11yC); await Store.put('programs', 'a11yP', S.programs.a11yP);
    });
    for (const [view, sub, label] of [['dashboard', 'today', 'Today'], ['dashboard', 'calendar', 'Schedule'], ['dashboard', 'clients', 'Clients'], ['programs', '', 'Programs'],
                                      ['conditioning', '', 'Conditioning'], ['exercises', '', 'Movements'], ['history', '', 'History'], ['dashboard', 'data', 'Settings'], ['analysis', '', 'Program analysis']]) {
      await go(view, sub); await page.waitForTimeout(100); await scan(label);
    }
    await page.evaluate(async () => { beginClientWorkout('a11yC', 'strength'); await new Promise(r => setTimeout(r, 300)); });
    await scan('Set logger');
    await page.evaluate(() => { const s = S.sel.draft.entries[0].sets[0]; s.weight = 100; s.reps = 5; completeWorkoutSet(0, 0); });
    await page.waitForTimeout(200);
    await scan('Set logger with the rest timer running');
    await page.evaluate(() => { dialog('Test dialog', '<p>Body</p><label>Name <input id="a11yName"></label>', [{ label: 'Cancel' }, { label: 'Save', kind: 'primary' }]); });
    await scan('A dialog');
    ok('a dialog moves keyboard focus into it', await page.evaluate(() => document.getElementById('dlg').contains(document.activeElement)));
    await page.evaluate(() => document.getElementById('dlg').close());
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; render(); });
    await scan('Set logger, dark theme');
    await page.evaluate(() => { S.sel = {}; S.view = 'dashboard'; S.sub = 'today'; render(); });
    await scan('Today, dark theme');

    // Things axe does not judge on its own.
    const vp = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
    // Pinch-zoom is switched off on purpose (the viewport and lockPinchZoom), with the phone's text size followed instead.
    // That fails WCAG 1.4.4 for people who zoom rather than raise the text size, so it is listed here until it is decided.
    if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0*)?\b/.test(vp)) note('pinch-zoom is switched off (WCAG 1.4.4 Resize text: a decision, not a bug)', vp);
    else ok('pinch-zoom is allowed', true);
    ok('animations calm down when the phone asks for reduced motion', await page.evaluate(() => [...document.styleSheets].some(sh => { try { return [...sh.cssRules].some(r => r.conditionText && r.conditionText.includes('prefers-reduced-motion')); } catch { return false; } })));
    ok('the page language is set', await page.evaluate(() => !!document.documentElement.lang));
    ok('status messages reach screen readers (live region)', await page.evaluate(() => { const r = document.getElementById('liveRegion'); return !!r && r.getAttribute('aria-live') === 'polite'; }));
  } finally { await ctx.close(); }
  return results;
};
