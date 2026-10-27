/* Nyaega movements (exercise library) test. Run it like smoke.js: open the app from localhost, open the browser console,
   paste this whole file and press Enter (or run all the tests at once with tests/run.js, see tests/README.md). It prints
   a table of checks and puts the library back exactly as it was afterwards (test data ids start with "smk").
   Covers: the starter movements and their variants, names shown with equipment, matching a coach's own names ("DB RDL"),
   which movement a logged entry belongs to, usage counts, merging duplicates and relinking programs and history, and
   bringing back movements from a safety copy. */
(async () => {
  const results = [], ok = (name, pass, info) => results.push({ check: name, result: pass ? 'PASS' : 'FAIL', info: info === undefined ? '' : String(info) });
  const original = S.exercises.slice(), C = 'smkMovC', P = 'smkMovP', L = 'smkMovL', SNAP = 'smk-movements-copy';
  try {
    ok('app is ready', S.bootState === 'ready', S.bootState);

    // ---- the starter movements
    const ids = SEED_EXERCISES.map(e => e.id), dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    ok('starter movements have unique ids', !dupIds.length, dupIds.join(', '));
    const bad = SEED_EXERCISES.filter(e => !SAFE_ID.test(e.id) || !e.name || !e.category || !e.equipment).map(e => e.id || e.name);
    ok('every starter movement has a safe id, a name, a category and equipment', !bad.length, bad.join(', '));
    const keys = SEED_EXERCISES.map(e => normExName(e.name) + '|' + normExName(e.equipment)), dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
    ok('no starter movement appears twice with the same equipment', !dupKeys.length, dupKeys.join(', '));
    ok('starter ids are the same on every device (made from the name)', SEED_EXERCISES.filter(e => !isSeedVariant(e)).every(e => e.id === 'seed-' + seedSlug(e.name)));
    const orphans = SEED_EXERCISES.filter(isSeedVariant).filter(v => !SEED_EXERCISES.some(e => !isSeedVariant(e) && e.name === v.name)).map(v => v.id);
    ok('every equipment variant has its original starter movement', !orphans.length, orphans.join(', '));
    ok('a variant\'s id includes its equipment', SEED_EXERCISES.filter(isSeedVariant).every(v => v.id === 'seed-' + seedSlug(v.name + ' ' + v.equipment)));

    // ---- the library on this device
    const libIds = S.exercises.map(e => String(e.id)), libDup = libIds.filter((id, i) => libIds.indexOf(id) !== i);
    ok('the library has no duplicate ids', !libDup.length, libDup.join(', '));
    ok('every movement in the library has a name', S.exercises.every(e => typeof e.name === 'string' && e.name.trim()), S.exercises.length + ' movements');

    // ---- names, variants and matching (on a known library: the starter movements)
    S.exercises = SEED_EXERCISES.slice();
    ok('a name with several variants is shown with its equipment', exName('seed-romanian-deadlift-dumbbell') === 'Romanian deadlift · Dumbbell', exName('seed-romanian-deadlift-dumbbell'));
    ok('a name with one variant is shown as is', exName('seed-leg-press') === 'Leg press', exName('seed-leg-press'));
    ok('an unknown id shows as "Exercise"', exName('smk-nope') === 'Exercise');
    ok('find a variant by name and equipment', (findExerciseVariant(S.exercises, 'romanian deadlift', 'kettlebell') || {}).id === 'seed-romanian-deadlift-kettlebell');
    ok('without equipment, a name with one variant still matches', (findExerciseVariant(S.exercises, 'Leg press', '') || {}).id === 'seed-leg-press');
    ok('without equipment, a name with several variants matches none', findExerciseVariant(S.exercises, 'Bench press', '') === null);
    const vk = [['DB RDL', '', 'romanian deadlift', 'dumbbell'], ['Romanian deadlift (dumbbell)', '', 'romanian deadlift', 'dumbbell'],
      ['Cable lateral raises', '', 'lateral raise', 'cable'], ['OHP', 'Kettlebell', 'overhead press', 'kettlebell']];
    const vkBad = vk.filter(([n, eq, base, e]) => { const k = variantKeyOf(n, eq); return k.base !== base || k.equipment !== e; }).map(([n, eq]) => `"${n}" → ${JSON.stringify(variantKeyOf(n, eq))}`);
    ok('a coach\'s own names are read as movement + equipment (DB RDL, Cable lateral raises, OHP…)', !vkBad.length, vkBad.join('; '));
    ok('a logged entry is matched by id first', entryExerciseKey({ exId: 'seed-back-squat', name: 'Something else' }) === 'id:seed-back-squat');
    ok('a logged entry without an id is matched by its shown name', entryExerciseKey({ name: 'Romanian deadlift · Dumbbell' }) === 'id:seed-romanian-deadlift-dumbbell');
    ok('an unknown movement is kept by name', entryExerciseKey({ name: '  Zercher   Squat ' }) === 'n:zercher squat', entryExerciseKey({ name: '  Zercher   Squat ' }));
    ok('older log shapes still give their movement and sets', loggedExerciseId({ exercise: { id: 'x1' } }) === 'x1' && loggedExerciseName({ movementName: 'Row' }) === 'Row' && loggedExerciseSets({ setLogs: { a: { kg: 50 } } }).length === 1);
    S.exercises = original.slice();

    // ---- usage counts, duplicates merged, programs and history relinked
    const own = { id: 'smkMovOwn', name: 'Smoke press', category: 'Push', equipment: 'Barbell' }, twin = { id: 'smkMovTwin', name: 'smoke  PRESS', category: 'Push', equipment: 'barbell' };
    ok('test movements can be added', await saveExerciseList([...original, own, twin]));
    S.clients[C] = { name: 'Smoke Movements', status: 'active', createdAt: '2026-01-01' };
    S.programs[P] = { name: 'Smoke movements', weeks: 1, days: [{ name: 'Day', items: [{ exId: twin.id, sets: '3', reps: '5' }, { exId: twin.id, sets: '2', reps: '8' }] }] };
    S.logs[L] = { clientId: C, date: '2026-01-02', dayLabel: 'Day', notes: '', entries: [{ exId: twin.id, name: 'smoke  PRESS', sets: [{ weight: 50, reps: 5, done: true }] }] };
    await Store.put('clients', C, S.clients[C]); await Store.put('programs', P, S.programs[P]); await Store.put('logs', L, S.logs[L]); invalidateLogIndex();
    const u = exerciseUsage(twin.id);
    ok('usage counts programs, program items and sessions', u.programs === 1 && u.items === 2 && u.logs === 1, JSON.stringify(u));
    // (Merging works on the whole library, so it only runs when the library has no duplicates of its own: the test must
    // never merge the coach's real movements.)
    const realKeys = original.filter(e => !e.archived).map(e => normExName(e.name) + '|' + normExName(e.equipment));
    if (realKeys.some((k, i) => realKeys.indexOf(k) !== i)) {
      ok('merging duplicates (skipped: this library already has duplicates, which the test leaves alone)', true, 'skipped');
      S.programs[P].days[0].items.forEach(it => { it.exId = own.id; }); S.logs[L].entries[0].exId = own.id;
      await saveExerciseList([...original, own]); invalidateLogIndex();
    } else {
      const merged = await mergeDuplicateExercises();
      ok('two movements with the same name and equipment are merged into one', merged === 1 && S.exercises.some(e => e.id === own.id) && !S.exercises.some(e => e.id === twin.id), merged);
      ok('the merged movement\'s program items now point to the one kept', S.programs[P].days[0].items.every(it => it.exId === own.id));
      ok('the merged movement\'s history now points to the one kept (what was logged is unchanged)', S.logs[L].entries[0].exId === own.id && S.logs[L].entries[0].name === 'smoke  PRESS' && S.logs[L].entries[0].sets[0].weight === 50);
      ok('history is found under the movement kept', (exerciseHistory(C, own.id).last || { sets: [{}] }).sets[0].weight === 50);
    }

    // ---- bring back movements from a safety copy
    const lost = { id: 'smkMovLost', name: 'Smoke lost movement', category: 'Pull', equipment: 'Cable' };
    const sameAsHere = { id: 'smkMovOtherId', name: 'Smoke press', category: 'Push', equipment: 'Barbell' };   // same as one there now, other id
    const unsafe = { id: 'bad id <x>', name: 'Unsafe', category: 'Other', equipment: '' };
    await IDB.put('snapshots', SNAP, { key: SNAP, at: Date.now(), exercises: [...S.exercises, lost, sameAsHere, unsafe] });
    const miss = await missingMovementsIn(SNAP);
    ok('a safety copy offers only the movements the library lost', miss.add.length === 1 && miss.add[0].id === lost.id, miss.add.map(e => e.id).join(', '));
    ok('a movement with the same name and equipment as one there now is not offered again', !miss.add.some(e => e.id === sameAsHere.id));
    ok('a movement with an unsafe id is never brought back', !miss.add.some(e => e.id === unsafe.id));
    const before = S.exercises.length, n = await restoreMovementsFrom(SNAP, miss.add);
    ok('bringing them back adds them with the same id', n === 1 && S.exercises.length === before + 1 && S.exercises.some(e => e.id === lost.id));
    ok('bringing back nothing changes nothing', (await restoreMovementsFrom(SNAP, [])) === 0 && S.exercises.length === before + 1);
    ok('a second look at the same copy offers nothing', (await missingMovementsIn(SNAP)).add.length === 0);
    let threw = false; try { await missingMovementsIn('smk-no-such-copy'); } catch { threw = true; }
    ok('a copy that no longer exists is reported, not ignored', threw);
  } catch (e) {
    ok('test ran without an exception', false, e && e.message);
  }
  // clean up: the library exactly as it was
  try {
    await IDB.del('snapshots', SNAP);
    await Store.del('logs', L); delete S.logs[L]; await Store.del('programs', P); delete S.programs[P]; await Store.del('clients', C); delete S.clients[C];
    if (!(await saveExerciseList(original))) throw new Error('could not put the library back');
    invalidateLogIndex(); render();
    ok('the library is back as it was', S.exercises.length === original.length && S.exercises.every((e, i) => e === original[i]));
  } catch (e) { ok('clean-up', false, e && e.message); }
  console.table(results);
  const failed = results.filter(r => r.result === 'FAIL').length;
  console.log(failed ? failed + ' check(s) FAILED' : 'All ' + results.length + ' checks passed');
  return { total: results.length, failed, results };
})();
