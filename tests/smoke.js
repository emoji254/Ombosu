/* Nyaega smoke test. Open the app from localhost (see tests/README.md), open the browser console, paste this whole
   file and press Enter. It prints a table of checks and removes everything it created. It uses test data only
   (ids starting with "smk") and cleans up after itself, but run it on a profile you don't mind: it briefly adds and
   removes a client, a program, a conditioning program and two sessions.
   Covers: start up, start a session, log a set, save it (with attendance), history lookup, export, a conditioning
   session, a group (pairing) conditioning session, periodised weeks with automatic week advance.\n   If the sign-in page covers the app on a fresh profile, click "Local mode" first (or run localStorage.setItem('nyaega:skipLogin','1') and reload). */
(async () => {
  const results = [], ok = (name, pass, info) => results.push({ check: name, result: pass ? 'PASS' : 'FAIL', info: info === undefined ? '' : String(info) });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const A = 'smkA', B = 'smkB', G = 'smkG', P = 'smkP', T = 'smkT';
  const made = { logs: [] };
  try {
    ok('app is ready', S.bootState === 'ready', S.bootState);
    ok('starter exercises have stable ids', S.exercises.some(e => e.id === 'seed-back-squat'));

    // data
    S.groups[G] = { name:'Smoke pair', dow:[1], time:'' };
    S.clients[A] = { name:'Smoke A', groupId:G, programId:P, currentWeek:1, status:'active', createdAt:'2026-01-01' };
    S.clients[B] = { name:'Smoke B', groupId:G, status:'active', createdAt:'2026-01-01' };
    S.programs[P] = { name:'Smoke block', weeks:3, days:[{ name:'Day A', items:[{ exId:'seed-back-squat', sets:'3', reps:'5', load:'', rest:'60s', progression:'double', increment:2.5, weeks:{ 2:{ sets:'4' } } }] }] };
    S.conditioning[T] = { name:'Smoke conditioning', blocks:[{ name:'AMRAP', mode:'amrap', durationMinutes:5, exercises:[] }] };
    await Store.put('groups', G, S.groups[G]); await Store.put('clients', A, S.clients[A]); await Store.put('clients', B, S.clients[B]);
    await Store.put('programs', P, S.programs[P]); await Store.put('conditioning', T, S.conditioning[T]);

    // strength session: start, log a set, save
    S.view = 'dashboard'; S.sub = 'clients'; render();
    beginClientWorkout(A, 'strength'); await wait(200);
    const d = S.sel.draft;
    ok('session starts from the program', !!d && d.entries.length === 1 && d.entries[0].sets.length === 3, d && d.entries.length + ' exercise(s)');
    d.entries[0].sets[0].weight = 100; d.entries[0].sets[0].reps = 5;
    completeWorkoutSet(0, 0);
    ok('ticking a set starts the rest timer', d.entries[0].sets[0].done && d.restRunning === true);
    document.getElementById('saveSess').click(); await wait(900);
    const log = Object.entries(S.logs).find(([id, l]) => l.clientId === A && l.type !== 'conditioning');
    if (log) made.logs.push(log[0]);
    ok('session saved to history', !!log && log[1].entries[0].sets[0].weight === 100, log && log[1].dayLabel);
    ok('attendance recorded', (attFor(todayISO(), A) || {}).status === 'attended');
    ok('previous performance found', (exerciseHistory(A, 'seed-back-squat').last || { sets:[{}] }).sets[0].weight === 100);
    ok('the export contains it', Object.values(JSON.parse(exportPayload()).logs).some(l => l.clientId === A));
    ok('saving the only day of week 1 moved the client to week 2 (periodised, auto-advance)', S.clients[A].currentWeek === 2, 'week ' + S.clients[A].currentWeek);
    S.sel = {}; render();
    const w2 = buildDraft(A, 0);
    ok('week 2 uses the week-2 prescription (4 sets)', w2.entries[0].sets.length === 4);

    // conditioning, single client
    beginClientWorkout(B, 'conditioning', T); await wait(200);
    let ss = S.sel.conditioningSession; ss.currentBlockIndex = 0;
    captureConditioningResult(ss, { roundsCompleted: 4, elapsed: 300 }, { ask:false });
    ok('conditioning result captured from the timer', ss.results[0].roundsCompleted === 4);
    S.sel = {}; S.sessions = []; await clearWorkoutAutosave(); render();

    // group conditioning
    S.clients[A].groupId = G; beginClientWorkout(A, 'conditioning', T, B); await wait(200);
    ss = S.sel.conditioningSession; ss.currentBlockIndex = 0;
    ok('group session has both clients', Array.isArray(ss.clientIds) && ss.clientIds.length === 2);
    captureConditioningResult(ss, { roundsCompleted: 6, elapsed: 300 }, { ask:false });
    ss.partnerResults[B][0].roundsCompleted = 5;
    // One tap saves; with blocks not run yet the app asks first, so answer "Save session".
    document.getElementById('completeConditioningWorkout').click(); await wait(300);
    const saveBtn = [...document.querySelectorAll('#dlg[open] #dlgFoot button')].find(b => b.textContent === 'Save session');
    ok('saving with a block not run asks first', !!saveBtn);
    if (saveBtn) saveBtn.click(); await wait(900);
    const cl = Object.entries(S.logs).filter(([id, l]) => l.type === 'conditioning' && [A, B].includes(l.clientId) && l.sharedSessionId);
    cl.forEach(([id]) => made.logs.push(id));
    ok('group session saved one log per client', cl.length === 2 && cl.some(([, l]) => l.clientId === B && l.conditioningSession.results[0].roundsCompleted === 5), cl.length + ' logs');
  } catch (e) {
    ok('test ran without an exception', false, e && e.message);
  }
  // clean up
  try {
    S.sel = {}; S.sessions = []; S.parkedWorkout = null; await clearWorkoutAutosave();
    for (const [id, l] of Object.entries(S.logs)) if ([A, B].includes(l.clientId)) { await Store.del('logs', id); delete S.logs[id]; }
    for (const k of Object.keys(S.attendance)) if (k.endsWith('_' + A) || k.endsWith('_' + B)) { await Store.del('attendance', k); delete S.attendance[k]; }
    for (const [coll, id] of [['clients', A], ['clients', B], ['groups', G], ['programs', P], ['conditioning', T]]) { await Store.del(coll, id); delete S[coll][id]; }
    invalidateLogIndex(); invalidateAttIndex();
    S.view = 'dashboard'; S.sub = 'today'; render();
  } catch (e) { ok('clean-up', false, e && e.message); }
  console.table(results);
  const failed = results.filter(r => r.result === 'FAIL').length;
  console.log(failed ? failed + ' check(s) FAILED' : 'All ' + results.length + ' checks passed');
  return { total: results.length, failed, results };
})();
