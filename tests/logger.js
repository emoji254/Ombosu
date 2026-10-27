/* Nyaega set-logger test. Run it like smoke.js: open the app from localhost, open the browser console, paste this whole
   file and press Enter (or run all the tests at once with tests/run.js, see tests/README.md). It prints a table of checks
   and removes everything it created (ids starting with "smk").
   Covers: a session built from the program (sets, rest, "previous" hints), typing kg and reps and ticking a set, the rest
   timer and how prescribed rest is read, supersets, warm-ups, deleting a set (and Undo), copying the previous set, saving
   (empty sets left out, set numbers kept), "previous" and "best" from history, and editing a saved session. */
(async () => {
  const results = [], ok = (name, pass, info) => results.push({ check: name, result: pass ? 'PASS' : 'FAIL', info: info === undefined ? '' : String(info) });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const C = 'smkLogC', P = 'smkLogP', made = [];
  const SQ = 'seed-back-squat', BP = 'seed-bench-press', ROW = 'seed-barbell-row', RDL_BB = 'seed-romanian-deadlift', RDL_DB = 'seed-romanian-deadlift-dumbbell';
  const putLog = async (id, log) => { S.logs[id] = log; await Store.put('logs', id, log); made.push(id); invalidateLogIndex(); };
  const set = (weight, reps, extra = {}) => ({ weight, reps, done: true, ...extra });
  try {
    ok('app is ready', S.bootState === 'ready', S.bootState);
    S.clients[C] = { name: 'Smoke Logger', programId: P, currentWeek: 1, status: 'active', createdAt: '2026-01-01' };
    S.programs[P] = { name: 'Smoke logger block', weeks: 1, days: [{ name: 'Day A', items: [
      { exId: SQ, sets: '3', reps: '5', load: '', rest: '2:30' },
      { exId: BP, sets: '', reps: '8', load: '', rest: '' },
      { exId: ROW, sets: '2', reps: '10', load: '', rest: '60s', groupId: 'smkG1', groupType: 'superset' },
      { exId: RDL_BB, sets: '2', reps: '8', load: '', rest: '90s', groupId: 'smkG1', groupType: 'superset' }
    ] }] };
    await Store.put('clients', C, S.clients[C]); await Store.put('programs', P, S.programs[P]);

    // ---- how prescribed rest is read
    const rest = { '90s': 90, '2:30': 150, '2m30s': 150, '2 min': 120, '60-90s': 60, 'nonsense': 90 };
    const restBad = Object.entries(rest).filter(([t, s]) => prescribedRestSeconds(t) !== s).map(([t]) => `"${t}" → ${prescribedRestSeconds(t)}`);
    ok('prescribed rest is read correctly (90s, 2:30, 2m30s, 2 min, 60-90s, nonsense)', !restBad.length, restBad.join(', '));
    ok('blank rest uses the default rest from Settings', prescribedRestSeconds('') === defaultRestSeconds(), prescribedRestSeconds(''));

    // ---- history: two earlier sessions (older one heavier), with a warm-up in the newer one, and a dumbbell RDL
    await putLog('smkLogH1', { clientId: C, date: '2026-01-05', completedAt: Date.parse('2026-01-05T10:00:00'), dayLabel: 'Day A', programId: P, week: 1, notes: '',
      entries: [{ exId: SQ, name: 'Back squat', sets: [set(120, 3, { setNumber: 1 }), set(110, 5, { setNumber: 2 })] }] });
    await putLog('smkLogH2', { clientId: C, date: '2026-01-12', completedAt: Date.parse('2026-01-12T10:00:00'), dayLabel: 'Day A', programId: P, week: 1, notes: '',
      entries: [{ exId: SQ, name: 'Back squat', sets: [set(60, 5, { setNumber: 1, setType: 'warmup' }), set(100, 5, { setNumber: 2 }), set(102.5, 5, { setNumber: 3 })] },
                { exId: RDL_DB, name: 'Romanian deadlift', sets: [set(30, 10, { setNumber: 1 })] }] });
    const h = exerciseHistory(C, SQ);
    ok('"previous" is the newest session, working sets only (warm-up left out)', h.last && h.last.date === '2026-01-12' && h.last.sets[0].weight === 100 && h.last.sets[1].weight === 102.5, h.last && JSON.stringify(h.last.sets));
    ok('"best" is the heaviest working set ever (120 kg in the older session)', h.best && h.best.weight === 120 && h.best.date === '2026-01-05', h.best && h.best.weight);
    ok('a dumbbell variant never picks up the barbell numbers', exerciseHistory(C, RDL_BB).last === null && exerciseHistory(C, RDL_DB).last.sets[0].weight === 30);

    // ---- a session from the program
    S.view = 'dashboard'; S.sub = 'clients'; render();
    beginClientWorkout(C, 'strength'); await wait(250);
    const d = S.sel.draft;
    ok('session starts with every exercise of the day', !!d && d.entries.length === 4, d && d.entries.length);
    ok('set count comes from the program (3), or 3 when the program leaves it blank', d.entries[0].sets.length === 3 && d.entries[1].sets.length === 3, d.entries.map(e => e.sets.length).join('/'));
    ok('each set shows last session\'s numbers as hints', d.entries[0].sets[0].lastWeight === 100 && d.entries[0].sets[1].lastWeight === 102.5, d.entries[0].sets.map(s => s.lastWeight).join('/'));
    ok('the logger screen shows one row per set', document.querySelectorAll('.exblock[data-ei="0"] .setrow').length === 3, document.querySelectorAll('.exblock[data-ei="0"] .setrow').length);

    // ---- typing kg and reps, then ticking ✓
    const row0 = () => document.querySelector('.exblock[data-ei="0"] .setrow[data-si="0"]');
    const kg = row0().querySelector('[data-set-input="weight"]'), reps = row0().querySelector('[data-set-input="reps"]');
    ok('set row has kg and reps boxes and a ✓ button', !!kg && !!reps && !!row0().querySelector('[data-done]'));
    // (A bar exercise: the Kg box takes the weight per side, the set keeps the total, per side × 2 + bar.)
    const bar = entryBar(d.entries[0]), perSide = bar ? kgBoxValue(d.entries[0], 105) : 105;
    ok('back squat uses a bar, so its Kg box is per side', !!bar && perSide === (105 - Number(bar.kg)) / 2, bar && bar.kg + ' kg bar');
    kg.focus(); kg.value = String(perSide); kg.dispatchEvent(new Event('input', { bubbles: true }));
    reps.focus(); reps.value = '5'; reps.dispatchEvent(new Event('input', { bubbles: true })); reps.blur();
    await wait(100);
    ok('typed kg (per side) and reps are kept as numbers, the set holds the total', d.entries[0].sets[0].weight === 105 && d.entries[0].sets[0].reps === 5, JSON.stringify({ w: d.entries[0].sets[0].weight, r: d.entries[0].sets[0].reps }));
    ok('the total is shown under the Kg box', /Total: 105 kg/.test(row0().textContent), (row0().querySelector('.kg-total') || {}).textContent);
    if (!d.entries[0].sets[0].done) row0().querySelector('[data-done]').click();
    await wait(100);
    ok('✓ marks the set done', d.entries[0].sets[0].done === true);
    ok('the rest timer starts with the prescribed rest (2:30 → 150 s)', d.restRunning === true && d.restDurationSeconds === 150, d.restDurationSeconds);
    ok('ticking a set that is already done does nothing', completeWorkoutSet(0, 0) === false);

    // ---- superset: the rest waits for the last exercise of the round
    d.restRunning = false;
    d.entries[2].sets[0].weight = 60; d.entries[2].sets[0].reps = 10;
    completeWorkoutSet(2, 0);
    ok('superset: the first exercise\'s set does not start the rest', d.restRunning === false);
    d.entries[3].sets[0].weight = 80; d.entries[3].sets[0].reps = 8;
    completeWorkoutSet(3, 0);
    ok('superset: the last exercise\'s set starts the rest', d.restRunning === true && d.restDurationSeconds === 90, d.restDurationSeconds);

    // ---- warm-ups
    const ws = [{ setType: 'warmup' }, { setType: 'working' }, { setType: 'warmup' }, { setType: 'working' }];
    ok('warm-ups are numbered apart from the working sets', [0, 1, 2, 3].map(i => workingIndexOf(ws, i)).join() === '-1,0,-1,1');

    // ---- delete a set, then Undo
    render(); await wait(100);
    deleteSetAt(1, 2); await wait(50);
    ok('deleting a set removes it', d.entries[1].sets.length === 2);
    const undo = [...document.querySelectorAll('.undo-toast .undo-btn')].pop();
    ok('deleting a set offers Undo', !!undo);
    if (undo) { undo.click(); await wait(100); }
    ok('Undo brings the set back', d.entries[1].sets.length === 3);
    d.entries[1].sets.splice(1); render(); await wait(50);
    deleteSetAt(1, 0);
    ok('the last set of an exercise cannot be deleted', d.entries[1].sets.length === 1);

    // ---- copy the previous set (no history for bench press: copies the set above)
    d.entries[1].sets.push(ensureSetDefaults({ weight: null, reps: null })); render(); await wait(50);
    d.entries[1].sets[0].weight = 70; d.entries[1].sets[0].reps = 8;
    copyPreviousSet(1, 1); await wait(50);
    ok('copy previous (no history): copies the set above and ticks it', d.entries[1].sets[1].weight === 70 && d.entries[1].sets[1].reps === 8 && d.entries[1].sets[1].done);
    copyPreviousSet(0, 1); await wait(50);
    ok('copy previous (with history): copies that set from last session', d.entries[0].sets[1].weight === 102.5 && d.entries[0].sets[1].reps === 5, d.entries[0].sets[1].weight);

    // ---- save: empty sets are left out, set numbers are kept
    render(); await wait(50);
    document.getElementById('saveSess').click(); await wait(900);
    const saved = S.logs[d.id];
    ok('saving stores the session under the workout\'s id', !!saved, d.id);
    if (saved) {
      made.push(d.id);
      const sq = saved.entries.find(e => e.exId === SQ);
      ok('empty sets are not saved (squat: 2 of 3 sets filled)', sq && sq.sets.length === 2, sq && sq.sets.length);
      ok('saved sets keep their set number and lose the hint fields', sq && sq.sets[0].setNumber === 1 && sq.sets[1].setNumber === 2 && !('lastWeight' in sq.sets[0]));
      ok('the superset is saved as a group', saved.entries.filter(e => e.groupId === 'smkG1').length === 2);
      ok('the session has a duration and a save time', Number.isFinite(saved.completedAt) && saved.durationSeconds >= 0);
      ok('"previous" now comes from the session just saved', exerciseHistory(C, SQ).last.sets[0].weight === 105);

      // ---- edit the saved session: same log, nothing duplicated, save time kept
      const before = Object.keys(S.logs).length, savedAt = saved.completedAt;
      S.sel = {}; render();
      beginEditSession(d.id); await wait(250);
      ok('editing reopens the saved session', S.sel.draft && S.sel.draft.editing && S.sel.draft.id === d.id);
      ok('while editing, "previous" ignores the session being edited', exerciseHistory(C, SQ).last.sets[0].weight === 100);
      S.sel.draft.entries.find(e => e.exId === SQ).sets[0].weight = 107.5;
      document.getElementById('saveSess').click(); await wait(900);
      ok('saving an edit overwrites the same session (no duplicate)', Object.keys(S.logs).length === before && S.logs[d.id].entries.find(e => e.exId === SQ).sets[0].weight === 107.5);
      ok('editing keeps the original save time', S.logs[d.id].completedAt === savedAt);
    }
  } catch (e) {
    ok('test ran without an exception', false, e && e.message);
  }
  // clean up
  try {
    S.sel = {}; S.sessions = []; S.parkedWorkout = null; await clearWorkoutAutosave();
    for (const id of made) { await Store.del('logs', id); delete S.logs[id]; }
    for (const k of Object.keys(S.attendance)) if (k.endsWith('_' + C)) { await Store.del('attendance', k); delete S.attendance[k]; }
    await Store.del('clients', C); delete S.clients[C]; await Store.del('programs', P); delete S.programs[P];
    invalidateLogIndex(); invalidateAttIndex();
    S.view = 'dashboard'; S.sub = 'today'; render();
  } catch (e) { ok('clean-up', false, e && e.message); }
  console.table(results);
  const failed = results.filter(r => r.result === 'FAIL').length;
  console.log(failed ? failed + ' check(s) FAILED' : 'All ' + results.length + ' checks passed');
  return { total: results.length, failed, results };
})();
