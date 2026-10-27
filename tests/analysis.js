/* Nyaega program analysis test. Run it like smoke.js: open the app from localhost, open the browser console, paste this
   whole file and press Enter (or run all the tests with tests/run.js). Everything it creates has an id starting "smk" and
   is removed afterwards; the movement library and the analysis settings are put back as they were.
   Covers: reading the Sets box (numbers, ranges, blank, unreadable), direct and indirect sets, warm-ups never counted,
   periodised weeks, a 3-day full-body, a 4-day upper/lower and a 5-day uneven program, an unmapped movement, weekly
   frequency from schedules (weekly, every 2 weeks, none, ended), planned vs completed, findings and their rules, target
   changes leaving the program alone, program edits refreshing the screen, the heatmap, proposals only on approval,
   assigning muscles to a movement, the AI coach (not set up, failing, invalid and valid replies), and navigation. */
(async () => {
  const results = [], ok = (name, pass, info) => results.push({ check: name, result: pass ? 'PASS' : 'FAIL', info: info === undefined ? '' : String(info) });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const near = (r, lo, hi = lo) => Math.abs(r.lo - lo) < 1e-9 && Math.abs(r.hi - hi) < 1e-9;
  const originalExercises = S.exercises.slice(), originalSettings = await Store.getMeta('analysisSettings', null), originalCached = S.analysisSettings;
  const P = { fb:'smkFB', ul:'smkUL', un:'smkUN', pz:'smkPZ' }, C = { a:'smkCa', b:'smkCb', c:'smkCc', d:'smkCd' }, G = 'smkG', L = ['smkL1', 'smkL2'];
  const it = (exId, sets, extra = {}) => ({ exId, sets, reps:'8', ...extra });
  const D = analysisSettingsFrom(null);
  try {
    ok('app is ready', S.bootState === 'ready', S.bootState);
    S.analysisSettings = D;

    // ---- reading the Sets box
    const ps = parsePlannedSets;
    ok('sets "3" is 3', near(ps('3'), 3) && near(ps(3), 3));
    ok('sets "3-4", "3–4" and "3 to 4" are ranges', near(ps('3-4'), 3, 4) && near(ps('3–4'), 3, 4) && near(ps('3 to 4'), 3, 4));
    ok('blank sets are "not set"; text, decimals, reversed or huge are "not readable"', ps('').missing && ps(null).missing && ps('three').bad && ps('2.5').bad && ps('4-3').bad && ps('60').bad);
    ok('target RPE reads 8, 7.5 and 7-8; "hard" is not readable', near(parseTargetRpe('8'), 8) && near(parseTargetRpe('7.5'), 7.5) && near(parseTargetRpe('7-8'), 7, 8) && parseTargetRpe('hard').bad);
    ok('settings: bad values fall back to the defaults', (s => s.indirectCredit === 0.5 && s.targets.chest.min === 10 && s.dayRatio === 2)(analysisSettingsFrom({ indirectCredit:'x', targets:{ chest:{ min:30, max:5 } }, dayRatio:-1 })));
    ok('settings: good values are kept', (s => s.indirectCredit === 0.25 && s.targets.chest.min === 12 && s.targets.chest.max === 18)(analysisSettingsFrom({ indirectCredit:'0.25', targets:{ chest:{ min:'12', max:'18' } } })));

    // ---- fixtures: programs
    S.exercises = [...originalExercises, { id:'smkOwn', name:'Smoke landmine press', category:'Push', equipment:'Barbell' }];
    S.programs[P.fb] = { name:'Smoke full body', weeks:2, days:[
      { name:'Day A', items:[it('seed-back-squat', '4'), it('seed-bench-press', '3'), it('seed-barbell-row', '3')] },
      { name:'Day B', items:[it('seed-romanian-deadlift', '3'), it('seed-overhead-press', '3-4'), it('seed-pull-up', '3')] },
      { name:'Day C', items:[it('seed-leg-press', '3'), it('seed-incline-dumbbell-press', '3'), it('seed-lat-pulldown', '3'), it('seed-assault-bike', '1')] }] };
    S.programs[P.ul] = { name:'Smoke upper lower', weeks:1, days:[
      { name:'Upper A', items:[it('seed-bench-press', '4'), it('seed-barbell-row', '4')] },
      { name:'Lower A', items:[it('seed-back-squat', '6'), it('seed-romanian-deadlift', '3')] },
      { name:'Lower B', items:[it('seed-front-squat', '6'), it('seed-hip-thrust', '3')] },
      { name:'Upper B', items:[it('seed-overhead-press', '3'), it('seed-pull-up', '4')] }] };
    S.programs[P.un] = { name:'Smoke uneven', weeks:1, days:[
      { name:'Mon', items:[it('seed-bench-press', '6'), it('seed-incline-dumbbell-press', '6'), it('seed-cable-fly', '6'), it('seed-dip', '4')] },
      { name:'Tue', items:[it('seed-back-squat', '4')] }, { name:'Wed', items:[it('seed-bench-press', '4')] },
      { name:'Thu', items:[it('smkOwn', '3'), it('seed-bicep-curl', '')] }, { name:'Fri', items:[it('seed-plank', 'lots'), it('seed-lateral-raise', '4')] }] };
    S.programs[P.pz] = { name:'Smoke periodised', weeks:3, weekPlan:{ 3:{ deload:true } }, days:[
      { name:'Day A', items:[it('seed-back-squat', '4', { weeks:{ 2:{ sets:'5' }, 3:{ sets:'2' } } }), it('seed-bench-press', '3', { rpe:'8', weeks:{ 3:{ rpe:'6' } } })] }] };
    for (const id of Object.values(P)) await Store.put('programs', id, S.programs[id]);

    // ---- 3-day full body
    const fb = analyzeProgram(S.programs[P.fb], 0, D);
    ok('full body: 3 training days a program week', fb.days.length === 3);
    ok('full body: total working sets (with the 3-4 range kept as a range)', near(fb.total, 29, 30), rangeText(fb.total));
    ok('full body: sets per day', near(fb.days[0].total, 10) && near(fb.days[1].total, 9, 10) && near(fb.days[2].total, 10), fb.days.map(d => rangeText(d.total)).join(' / '));
    ok('full body: quads direct from back squat and leg press (4 + 3)', near(fb.muscles.quads.direct, 7));
    ok('full body: chest direct (bench 3 + incline 3), no indirect', near(fb.muscles.chest.direct, 6) && near(fb.muscles.chest.indirect, 0));
    ok('full body: triceps get only indirect sets, at 0.5 a set (bench 3, OHP 3-4, incline 3)', near(fb.muscles.triceps.direct, 0) && near(fb.muscles.triceps.indirect, 4.5, 5), rangeText(fb.muscles.triceps.indirect));
    ok('full body: a secondary muscle never gets a full set by default', MUSCLE_IDS.every(m => fb.muscles[m].sources.every(s => s.kind === 'direct' ? s.share === 1 : s.share === 0.5)));
    ok('full body: the conditioning movement (assault bike) adds no muscle sets and is noted', fb.issues.noVolume.length === 1 && MUSCLE_IDS.every(m => !fb.muscles[m].sources.some(s => /Assault/.test(s.name))));
    const credit = analyzeProgram(S.programs[P.fb], 0, { ...D, indirectCredit:0.25 });
    ok('the indirect credit setting changes indirect sets only', near(credit.muscles.triceps.indirect, 2.25, 2.5) && near(credit.muscles.chest.direct, 6));

    // ---- 4-day upper/lower, frequency and recovery
    S.groups[G] = { name:'Smoke pair', dow:[1, 3], every:2, start:todayISO(), time:'' };
    S.clients[C.a] = { name:'Smoke A', programId:P.ul, currentWeek:1, status:'active', recurDow:[1, 2, 4, 5], recurTime:'07:00' };
    S.clients[C.b] = { name:'Smoke B', status:'active', groupId:G };
    S.clients[C.c] = { name:'Smoke C', status:'active' };
    S.clients[C.d] = { name:'Smoke D', status:'active', recurDow:[1, 2], recurEnd:'2020-01-01' };
    const ul = analyzeProgram(S.programs[P.ul], 0, D);
    ok('upper/lower: 4 training days, sets per day 8 / 9 / 9 / 7', ul.days.length === 4 && ul.days.map(d => d.total.lo).join() === '8,9,9,7');
    const schA = clientWeeklySchedule(C.a);
    ok('frequency: 4 weekdays a week is 4 sessions', schA && schA.perWeek === 4 && schA.days.join() === '1,2,4,5', JSON.stringify(schA));
    ok('frequency: a pairing every 2 weeks on 2 days is 1 session a week', clientWeeklySchedule(C.b).perWeek === 1);
    ok('frequency: no schedule is "not known" (null), not assumed', clientWeeklySchedule(C.c) === null);
    ok('frequency: an ended schedule counts 0', (s => s && s.ended && s.perWeek === 0)(clientWeeklySchedule(C.d)));
    const recA = analysisFindings(ul, D, { schedule:schA, clientName:'Smoke A' }).find(f => /back to back/.test(f.title));
    ok('recovery: quads on Lower A then Lower B with back-to-back weekdays is flagged as a possibility', !!recA && /Quadriceps/.test(recA.detail) && /possibility/.test(recA.detail), recA && recA.detail);
    ok('recovery: not assessed without a schedule', !analysisFindings(ul, D, {}).some(f => /back to back/.test(f.title)));
    ok('recovery: not flagged when the scheduled days are not consecutive', !analysisFindings(ul, D, { schedule:{ perWeek:2, days:[1, 4] }, clientName:'x' }).some(f => /back to back/.test(f.title)));

    // ---- 5-day uneven, unmapped, unreadable
    const un = analyzeProgram(S.programs[P.un], 0, D), fu = analysisFindings(un, D, {});
    ok('uneven: chest is above target (6 + 6 + 6 + 4 + 4 = 26 direct)', near(un.muscles.chest.direct, 26) && muscleStatus(un, 'chest', D) === 'above', rangeText(un.muscles.chest.total));
    ok('uneven: the days are flagged as uneven', fu.some(f => f.title === 'Uneven days' && /Mon has 22/.test(f.detail)), (fu.find(f => f.title === 'Uneven days') || {}).detail);
    ok('uneven: 22 chest sets in one session is flagged', fu.some(f => /a lot in one session/.test(f.title) && f.muscle === 'chest'));
    ok('uneven: chest vs back imbalance is flagged', fu.some(f => /differ/.test(f.title) && /Chest/.test(f.title)));
    ok('unmapped: the own movement without muscles is listed and not counted', un.issues.unmapped.length === 1 && fu.some(f => f.kind === 'unmapped' && /Smoke landmine/.test(f.detail)));
    ok('blank sets: listed, counted as nothing', un.issues.missingSets.length === 1 && fu.some(f => /Sets not set/.test(f.title)));
    ok('unreadable sets: listed with what was typed', un.issues.badSets.length === 1 && fu.some(f => /not readable/.test(f.title) && /"lots"/.test(f.detail)));
    ok('biceps needs review: its curl row has no readable sets', muscleStatus(un, 'biceps', D) === 'review');
    ok('a muscle with no counted sets while movements are unmapped is "insufficient data"', muscleStatus(un, 'hamstrings', D) === 'insufficient');
    ok('every finding says which rule it comes from', fu.every(f => f.basis && f.detail));
    ok('no finding claims overtraining', !fu.some(f => /overtrain/i.test(f.title + f.detail)));

    // ---- periodised weeks
    const pz0 = analyzeProgram(S.programs[P.pz], 0, D), pz2 = analyzeProgram(S.programs[P.pz], 2, D), pz3 = analyzeProgram(S.programs[P.pz], 3, D);
    ok('periodised: base 7, week 2 8 (squat 5), week 3 5 (squat 2)', pz0.total.lo === 7 && pz2.total.lo === 8 && pz3.total.lo === 5);
    ok('periodised: a week\'s RPE override is used for that week only', pz0.rpe.some(r => r.lo === 8) && pz3.rpe.some(r => r.lo === 6) && !pz0.rpe.some(r => r.lo === 6));

    // ---- planned vs completed (warm-ups and unticked sets left out)
    const st = (weight, reps, extra = {}) => ({ weight, reps, done:true, ...extra });
    S.logs[L[0]] = { clientId:C.a, date:'2026-10-20', completedAt:1, dayLabel:'Upper A', programId:P.ul, week:1, notes:'', entries:[
      { exId:'seed-bench-press', name:'Bench press', sets:[st(40, 8, { setType:'warmup' }), st(60, 8, { setType:'warmup' }), st(80, 5), st(80, 5), st(80, 5), st(80, 5, { done:false })] },
      { exId:'seed-barbell-row', name:'Barbell row', sets:[st(60, 8), st(60, 8), st(60, 8), st(60, 8)] }] };
    S.logs[L[1]] = { clientId:C.a, date:'2026-10-21', completedAt:2, dayLabel:'Lower A', programId:'smkOther', week:1, notes:'', entries:[{ exId:'seed-back-squat', name:'Back squat', sets:[st(100, 5)] }] };
    for (const id of L) await Store.put('logs', id, S.logs[id]);
    invalidateLogIndex();
    const pvc = plannedVsCompleted(S.programs[P.ul], P.ul, ul, C.a, 1);
    ok('completed: ticked working sets only (2 warm-ups and 1 unticked left out): 7', pvc[0].completed === 7 && near(pvc[0].planned, 8), JSON.stringify(pvc[0]));
    ok('completed: a session from another program is not counted', pvc[1].completed === null);
    ok('planned work is unchanged by saved sessions', near(analyzeProgram(S.programs[P.ul], 0, D).total, ul.total.lo));

    // ---- the screen: navigation from a program, heatmap, targets, program edits
    S.view = 'programs'; S.sel = { programsKind:'strength', program:P.fb }; render(); await wait(150);
    const analyse = document.getElementById('analyseProgram');
    ok('the program page has an Analyse button', !!analyse);
    analyse.click(); await wait(400);
    ok('Analyse opens Program analysis for that program', S.view === 'analysis' && S.sel.analysisProgram === P.fb && !!document.querySelector('.pa'));
    ok('the Programs tab stays the current tab', navKeyNow() === 'programs');
    const tileSets = () => [...document.querySelectorAll('.pa-tile')].find(t => /Working sets/i.test(t.textContent)).querySelector('.pa-tile-value').firstChild.textContent.trim();
    ok('the screen shows the calculated working sets', tileSets() === '29–30', tileSets());
    ok('the heatmap has front and back regions for every muscle', MUSCLE_IDS.every(m => document.querySelector(`.pa-map [data-hm="${m}"]`)));
    const chestRegion = () => document.querySelector('.pa-map [data-hm="chest"]');
    ok('heatmap: chest (6 sets, target 10-20) is below target, with a text label', chestRegion().classList.contains('hm-below') && /below target/.test(chestRegion().getAttribute('aria-label')));
    chestRegion().dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })); await wait(100);
    ok('heatmap: a region opens its detail by keyboard, with exercises and days', /Chest/.test(document.querySelector('.pa-detail h4').textContent) && /Bench press/.test(document.querySelector('.pa-detail').textContent) && /Day A/.test(document.querySelector('.pa-detail').textContent));
    const before = JSON.stringify(S.programs[P.fb]);
    document.querySelector('[data-pa-min="chest"]').value = '4'; document.querySelector('[data-pa-max="chest"]').value = '8';
    document.getElementById('paSaveSettings').click(); await wait(300);
    ok('a target change updates the heatmap (chest now within 4-8)', chestRegion().classList.contains('hm-within'));
    ok('a target change never changes the program', JSON.stringify(S.programs[P.fb]) === before);
    ok('targets are saved as their own settings', (await Store.getMeta('analysisSettings', null)).targets.chest.max === 8);
    document.getElementById('paResetSettings').click(); await wait(300);
    ok('targets can be reset to the starting values', S.analysisSettings.targets.chest.min === 10 && chestRegion().classList.contains('hm-below'));
    S.programs[P.fb].days[0].items[1].sets = '6'; render({ keepScroll:true }); await wait(100);
    ok('editing the program refreshes the analysis (bench 3 to 6: 32-33 sets)', tileSets() === '32–33', tileSets());
    S.programs[P.fb].days[0].items[1].sets = '3'; render({ keepScroll:true });
    const sel = document.getElementById('paWeek'); sel.value = '0';
    document.getElementById('paProgram').value = P.pz; document.getElementById('paProgram').dispatchEvent(new Event('change')); await wait(100);
    document.getElementById('paWeek').value = '3'; document.getElementById('paWeek').dispatchEvent(new Event('change')); await wait(100);
    ok('choosing a program and a week updates the screen (periodised week 3: 5 sets)', tileSets() === '5', tileSets());
    document.getElementById('paProgram').value = P.ul; document.getElementById('paProgram').dispatchEvent(new Event('change')); await wait(100);
    document.getElementById('paClient').value = C.a; document.getElementById('paClient').dispatchEvent(new Event('change')); await wait(100);
    ok('with a client: weekly frequency from their schedule, marked as an estimate', /4 sessions a week/.test(document.querySelector('.pa-cal').textContent) && /estimate/.test(document.querySelector('.pa-cal').textContent));
    ok('with a client: planned and completed side by side', /Planned and completed/.test(document.getElementById('main').textContent) && [...document.querySelectorAll('.pa-table td')].some(td => td.textContent.trim() === '7'));
    document.getElementById('paClient').value = C.c; document.getElementById('paClient').dispatchEvent(new Event('change')); await wait(100);
    ok('a client without a schedule: frequency is "insufficient data", not assumed', /insufficient data/i.test(document.querySelector('.pa-cal').textContent));

    // ---- a proposed change: only on approval
    document.getElementById('paProgram').value = P.fb; document.getElementById('paProgram').dispatchEvent(new Event('change')); await wait(100);
    const fbBefore = JSON.stringify(S.programs[P.fb]);
    const prop = document.querySelector('[data-pa-propose="chest"]');
    ok('a below-target muscle offers "Preview a change"', !!prop);
    ok('no "Preview a change" where no row trains the muscle as a primary (triceps)', !document.querySelector('[data-pa-propose="triceps"]'));
    prop.click(); await wait(200);
    const dlg = document.getElementById('dlg');
    ok('the preview shows the program now and proposed, side by side', dlg.open && /Now/.test(dlg.textContent) && /Proposed/.test(dlg.textContent) && /Chest/.test(dlg.textContent));
    ok('opening the preview changes nothing', JSON.stringify(S.programs[P.fb]) === fbBefore);
    [...dlg.querySelectorAll('#dlgFoot button')].find(b => b.textContent === 'Reject').click(); await wait(200);
    ok('Reject leaves the program as it was', JSON.stringify(S.programs[P.fb]) === fbBefore && !dlg.open);
    document.querySelector('[data-pa-propose="chest"]').click(); await wait(200);
    [...dlg.querySelectorAll('#dlgFoot button')].find(b => b.textContent === 'Accept change').click(); await wait(400);
    const after = analyzeProgram(S.programs[P.fb], 0, S.analysisSettings);
    ok('Accept changes the program and the analysis recalculates (chest reaches 10)', after.muscles.chest.direct.lo === 10 && JSON.stringify(S.programs[P.fb]) !== fbBefore, rangeText(after.muscles.chest.direct));
    ok('the accepted change is saved to storage', LOCAL !== 'idb' || JSON.stringify(await IDB.get('programs', P.fb)) === JSON.stringify(S.programs[P.fb]));
    const pzBefore = JSON.stringify(S.programs[P.pz].days[0].items[1]);
    const pzProp = proposeVolumeChange(S.programs[P.pz], 3, S.analysisSettings, 'chest');
    applyProgramSetChanges(S.programs[P.pz], 3, pzProp.changes);
    ok('a change for one week goes into that week only; the base stays', S.programs[P.pz].days[0].items[1].sets === '3' && S.programs[P.pz].days[0].items[1].weeks[3].sets === String(pzProp.changes[0].to), JSON.stringify(S.programs[P.pz].days[0].items[1]) + ' was ' + pzBefore);

    // ---- assigning muscles to a movement
    S.programs[P.un] && (document.getElementById('paProgram').value = P.un, document.getElementById('paProgram').dispatchEvent(new Event('change'))); await wait(150);
    const assign = document.querySelector('[data-editex="smkOwn"]');
    ok('an unmapped movement offers "Assign muscles"', !!assign);
    assign.click(); await wait(150);
    dlg.querySelector('[data-ex-mus="p"][value="frontDelts"]').checked = true; dlg.querySelector('[data-ex-mus="s"][value="triceps"]').checked = true;
    [...dlg.querySelectorAll('#dlgFoot button')].find(b => b.textContent === 'Save').click(); await wait(400);
    const own = S.exercises.find(e => e.id === 'smkOwn');
    ok('the muscles are saved on the existing movement (no new record)', own && own.muscles && own.muscles.primary.join() === 'frontDelts' && own.muscles.secondary.join() === 'triceps' && S.exercises.filter(e => e.id === 'smkOwn').length === 1);
    ok('the analysis now counts it', analyzeProgram(S.programs[P.un], 0, S.analysisSettings).issues.unmapped.length === 0);
    openExerciseDialog('seed-bench-press'); await wait(100);
    [...dlg.querySelectorAll('#dlgFoot button')].find(b => b.textContent === 'Save').click(); await wait(400);
    ok('saving a starter movement without touching its muscles adds no muscles field', !('muscles' in S.exercises.find(e => e.id === 'seed-bench-press')));

    // ---- AI coach
    const a1 = analyzeProgram(S.programs[P.fb], 0, S.analysisSettings), f1 = analysisFindings(a1, S.analysisSettings, {}), sum = coachSummary(a1, f1, S.analysisSettings, 'general');
    ok('the coach summary has no client names or history', !/Smoke A|Smoke B|clientId|logs/.test(JSON.stringify(sum)));
    const good = { overall:'Balanced lower body; pressing is light.', strengths:['Squat and hinge both trained.'], findings:f1.slice(0, 1).map(f => ({ findingId:f.id, explanation:'Explained.' })),
      adjustments:[{ change:'Add a set of rows', rationale:'Back is close to target.', expectedEffect:{ muscle:'back', fromSets:a1.muscles.back.total.lo, toSets:a1.muscles.back.total.lo + 1 } }], confidence:'medium', limitations:['Planned only.'], missingInformation:[] };
    ok('a well-formed reply that uses the calculated numbers is accepted', validateCoachReply(good, sum).ok, JSON.stringify(validateCoachReply(good, sum).errors || ''));
    ok('a reply citing a finding that does not exist is rejected', !validateCoachReply({ ...good, findings:[{ findingId:'f999', explanation:'x' }] }, sum).ok);
    ok('a reply with made-up current sets is rejected', !validateCoachReply({ ...good, adjustments:[{ ...good.adjustments[0], expectedEffect:{ muscle:'back', fromSets:99, toSets:100 } }] }, sum).ok);
    ok('a reply missing confidence is rejected', !validateCoachReply({ ...good, confidence:'sure' }, sum).ok);
    ok('without a server the coach is "not set up"', (await requestCoach(sum)).status === 'unavailable' && /Not set up/.test(document.getElementById('main').textContent));
    document.getElementById('paProgram').value = P.fb; document.getElementById('paProgram').dispatchEvent(new Event('change')); await wait(150);
    AI_COACH.transport = async () => { throw new Error('offline'); }; render({ keepScroll:true }); await wait(100);
    document.getElementById('paAskCoach').click(); await wait(300);
    ok('a failed request keeps the analysis and offers "Try again"', /could not be used/.test(document.getElementById('main').textContent) && document.getElementById('paAskCoach').textContent === 'Try again' && !!document.querySelector('.pa-map'));
    AI_COACH.transport = async () => ({ overall:'x' }); document.getElementById('paAskCoach').click(); await wait(300);
    ok('an invalid reply is not shown', /did not match the analysis/.test(document.getElementById('main').textContent));
    AI_COACH.transport = async body => { const f = body.summary.findings[0]; const b = body.summary.muscles.find(m => m.id === 'back'); return { ...good, findings:f ? [{ findingId:f.id, explanation:'Uses the calculated value.' }] : [], adjustments:[{ ...good.adjustments[0], expectedEffect:{ muscle:'back', fromSets:b.total.lo, toSets:b.total.lo + 1 } }] }; };
    const progBeforeAi = JSON.stringify(S.programs[P.fb]);
    document.getElementById('paAskCoach').click(); await wait(300);
    ok('a valid reply is shown, citing the analysis findings', /Uses the calculated value/.test(document.getElementById('main').textContent) && /Optional changes/.test(document.getElementById('main').textContent));
    ok('the coach never changes the program', JSON.stringify(S.programs[P.fb]) === progBeforeAi);

    // ---- merging duplicates keeps the muscles
    S.exercises = [...S.exercises, { id:'smkDupA', name:'Smoke twin', category:'Pull', equipment:'Cable' }, { id:'smkDupB', name:'smoke twin', category:'Pull', equipment:'cable', muscles:{ primary:['back'], secondary:[] } }];
    await saveExerciseList(S.exercises);
    const realKeys = originalExercises.filter(e => !e.archived).map(e => normExName(e.name) + '|' + normExName(e.equipment));
    if (realKeys.some((k, i) => realKeys.indexOf(k) !== i)) ok('merging duplicates (skipped: this library already has duplicates)', true, 'skipped');
    else { await mergeDuplicateExercises(); const kept = S.exercises.find(e => e.id === 'smkDupA'); ok('merging two copies keeps the muscles of the one removed', kept && kept.muscles && kept.muscles.primary.join() === 'back' && !S.exercises.some(e => e.id === 'smkDupB')); }

    // ---- back to the program
    const back = document.querySelector('[data-back="analysis"]');
    if (back){ back.click(); await wait(150); ok('Back from the analysis returns to the program', S.view === 'programs' && S.sel.program === P.fb); }
  } catch (e) {
    ok('test ran without an exception', false, e && (e.stack || e.message));
  }
  // clean up
  try {
    AI_COACH.transport = null;
    const d = document.getElementById('dlg'); if (d.open) d.close();
    for (const id of L){ await Store.del('logs', id); delete S.logs[id]; }
    for (const id of Object.values(P)){ await Store.del('programs', id); delete S.programs[id]; }
    for (const id of Object.values(C)){ await Store.del('clients', id); delete S.clients[id]; }
    delete S.groups[G];
    await Store.putMeta('analysisSettings', originalSettings); S.analysisSettings = originalCached;
    if (!(await saveExerciseList(originalExercises))) throw new Error('could not put the library back');
    invalidateLogIndex(); S.view = 'dashboard'; S.sub = 'today'; S.sel = {}; render();
    ok('everything is put back', S.exercises.length === originalExercises.length && !Object.keys(S.programs).some(k => k.startsWith('smk')));
  } catch (e) { ok('clean-up', false, e && e.message); }
  console.table(results);
  const failed = results.filter(r => r.result === 'FAIL').length;
  console.log(failed ? failed + ' check(s) FAILED' : 'All ' + results.length + ' checks passed');
  return { total: results.length, failed, results };
})();
