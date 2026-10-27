/* Nyaega exercise library test. Run it like smoke.js: open the app from localhost, open the browser console, paste this
   whole file and press Enter (or run all the tests with tests/run.js). It puts the library back as it was afterwards.
   Covers the Exercise library screen: every movement listed under its category with the right counts, search by name,
   category and equipment, Add and Edit opening the exercise dialog, Archive asking first (Cancel keeps it), Archive and
   Restore, and Show / Hide archived. */
(async () => {
  const results = [], ok = (name, pass, info) => results.push({ check: name, result: pass ? 'PASS' : 'FAIL', info: info === undefined ? '' : String(info) });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const original = S.exercises.slice(), main = () => document.getElementById('main');
  const search = async q => { const box = document.getElementById('search_exercises'); box.value = q; box.dispatchEvent(new Event('input', { bubbles: true })); await wait(400); };
  const dlg = () => document.getElementById('dlg'), dlgButton = label => [...document.querySelectorAll('#dlg[open] #dlgFoot button')].find(b => b.textContent === label);
  try {
    ok('app is ready', S.bootState === 'ready', S.bootState);
    S.sel = {}; S.view = 'exercises'; S.search.exercises = ''; render(); await wait(100);
    const active = activeExercises(), rows = main().querySelectorAll('[data-editex]');
    ok('every active movement is listed', rows.length === active.length, rows.length + ' of ' + active.length);
    ok('the title shows the movement count', main().textContent.includes(active.length + ' movements'));
    const cats = [...new Set(active.map(e => e.category || 'Other'))];
    const heads = [...main().querySelectorAll('.exlib h3')].filter(h => h.querySelector('.exlib-count'));
    ok('one heading per category, each with its count', heads.length === cats.length && heads.every(h => Number(h.querySelector('.exlib-count').textContent) === active.filter(e => (e.category || 'Other') === h.firstChild.textContent.trim()).length), heads.map(h => h.textContent.replace(/\s+/g, ' ')).join(', '));
    ok('every row has its Edit and Archive buttons', main().querySelectorAll('[data-archiveex]').length === active.length);

    await search('curl');
    const want = active.filter(e => [e.name, e.category, e.equipment].some(v => String(v || '').toLowerCase().includes('curl'))).length;
    ok('search by name', main().querySelectorAll('[data-editex]').length === want && want > 0, want + ' match');
    await search('core');
    ok('search by category', main().querySelectorAll('[data-editex]').length === active.filter(e => /core/i.test([e.name, e.category, e.equipment].join(' '))).length);
    await search('kettlebell');
    ok('search by equipment', main().querySelectorAll('[data-editex]').length === active.filter(e => /kettlebell/i.test([e.name, e.category, e.equipment].join(' '))).length);
    await search('zzz-nothing');
    ok('no match says so', /No exercises match/.test(main().textContent));
    await search('');

    document.getElementById('newEx').click(); await wait(150);
    ok('Add exercise opens the exercise dialog', dlg().open && /exercise/i.test(document.getElementById('dlgBody').textContent));
    dlg().close(); await wait(50);
    const first = main().querySelector('[data-editex]'), firstId = first.dataset.editex;
    first.click(); await wait(150);
    ok('Edit opens the dialog for that movement', dlg().open && document.getElementById('dlgBody').innerHTML.includes(esc(S.exercises.find(e => e.id === firstId).name)));
    dlg().close(); await wait(50);

    // Archive asks first; Cancel keeps it; Archive archives it; Restore brings it back.
    const arch = () => main().querySelector(`[data-archiveex="${firstId}"]`);
    arch().click(); await wait(150);
    ok('Archive asks first', dlg().open && /^Archive /.test(document.querySelector('#dlgBody h2').textContent));
    dlgButton('Cancel').click(); await wait(150);
    ok('Cancel keeps the movement', !S.exercises.find(e => e.id === firstId).archived && !!arch());
    arch().click(); await wait(150); dlgButton('Archive').click(); await wait(400);
    ok('Archive archives it and takes it off the list', !!S.exercises.find(e => e.id === firstId).archived && !arch());
    const toggle = document.getElementById('toggleArchivedExercises');
    ok('archived movements are hidden behind "Show archived"', !!toggle && /Show archived/.test(toggle.textContent) && !main().querySelector(`[data-restoreex="${firstId}"]`));
    toggle.click(); await wait(150);
    const restore = main().querySelector(`[data-restoreex="${firstId}"]`);
    ok('Show archived lists it with Restore', !!restore);
    restore.click(); await wait(400);
    ok('Restore brings it back to the list', !S.exercises.find(e => e.id === firstId).archived && !!arch());
  } catch (e) {
    ok('test ran without an exception', false, e && e.message);
  }
  try {
    if (dlg().open) dlg().close();
    if (!(await saveExerciseList(original))) throw new Error('could not put the library back');
    S.search.exercises = ''; S.sel = {}; S.view = 'dashboard'; S.sub = 'today'; render();
    ok('the library is back as it was', S.exercises.length === original.length && S.exercises.every((e, i) => e === original[i]));
  } catch (e) { ok('clean-up', false, e && e.message); }
  console.table(results);
  const failed = results.filter(r => r.result === 'FAIL').length;
  console.log(failed ? failed + ' check(s) FAILED' : 'All ' + results.length + ' checks passed');
  return { total: results.length, failed, results };
})();
