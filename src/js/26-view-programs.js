/* ============================ PROGRAMS ============================ */
function viewPrograms(){
  if (S.sel.program) return programDetail(S.sel.program);
  if(S.sel.programsKind==='conditioning')return viewConditioning();
  if(S.sel.programsKind!=='strength')return `<div class="page-head"><div><div class="eyebrow">PROGRAM LIBRARY</div><h2>Programs</h2><p class="muted small">Choose the kind of program you want to build or manage.</p></div></div><div class="grid program-kind-grid">
    <button type="button" class="card program-kind-card" data-program-kind="strength"><span class="program-kind-icon">↗</span><strong>Strength programs</strong><span class="small muted">Strength training programs</span><span class="small muted num">${Object.keys(S.programs).length} saved</span></button>
    <button type="button" class="card program-kind-card" data-program-kind="conditioning"><span class="program-kind-icon">◷</span><strong>Conditioning Program</strong><span class="small muted">Intervals, circuits, and timed blocks</span><span class="small muted num">${Object.keys(S.conditioning).length} saved</span></button>
  </div>`;
  const list = Object.entries(S.programs).map(([id,p]) => ({id,...p})).sort(byName);
  return `
  <div class="panel spread"><div><button type="button" class="btn ghost sm" data-program-kind="chooser">← Program types</button><h2>Strength programs</h2>
    <span class="muted small">Build the days once. They repeat for the length of the block — progress load week to week on the floor.</span></div>
    <button class="btn primary" id="newProgram">New program</button></div>
  <div class="grid">${list.map(p => `<div class="card" data-program="${esc(p.id)}">
    <span class="name">${esc(p.name)}</span>
    <div class="small muted num">${p.days.length} days · ${esc(p.weeks||4)} weeks</div>
    <div class="small muted">${p.days.map(d => esc(d.name)).join(' · ')}</div>
    <div class="small muted num">${Object.values(S.clients).filter(c => c.programId === p.id).length} assigned</div>
  </div>`).join('') || '<div class="empty"><p>No programs yet. Start with one 3-day full-body block — it covers most semi-private rosters.</p></div>'}</div>`;
}
function programDetail(pid){
  const p = S.programs[pid]; if (!p) return '<p>Not found.</p>';
  const wk = programWeekNow(p);
  return `
  <div class="panel spread">
    <div class="row" style="flex:1">
      <label class="field" style="flex:1;min-width:200px;margin:0"><span>Program name</span><input type="text" id="p_name" value="${esc(p.name)}"></label>
      <label class="field" style="width:110px;margin:0"><span>Weeks</span><input type="number" id="p_weeks" min="1" value="${esc(p.weeks||4)}"></label>
    </div>
    <div class="row tight"><span class="small muted" id="programSaveStatus" aria-live="polite">Changes save automatically</span><button class="btn ghost" data-back="programs">Back</button><button class="btn primary" id="saveProgram">Save</button></div>
  </div>

  ${programWeekBarHTML(p, wk)}

  ${p.days.map((d,di) => `
  <div class="panel" data-di="${di}">
    <div class="spread">
      <input type="text" class="dayname" data-di="${di}" value="${esc(d.name)}" style="max-width:260px;font-family:'Barlow Condensed';font-size:1.2rem">
      <div class="row tight"><button class="btn sm ghost" data-dupday="${di}">Duplicate day</button><button class="btn sm danger" data-rmday="${di}">Remove day</button></div>
    </div>
    <label class="field day-notes-field"><span>Day notes <span class="muted">(optional — shown at the top of this workout)</span></span><input type="text" class="daynotes" data-di="${di}" value="${esc(d.notes??'')}" placeholder="e.g. Keep it technical — knees stay behind toes"></label>
    <label class="field day-cond-field"><span>Conditioning on this day <span class="muted">(optional — offered with one tap in the workout)</span></span><select class="daycond" data-di="${di}">${dayConditioningOptions(d.conditioningId)}</select></label>
    <div class="tablewrap"><table class="progtable">
      <thead><tr><th style="min-width:170px">Exercise</th><th style="min-width:76px">Sets</th><th style="min-width:96px">Reps</th><th style="min-width:96px">Load<span class="rest-hint">kg or %1RM</span></th><th style="min-width:76px">RPE</th><th style="min-width:76px">RIR</th><th style="min-width:96px">Tempo<span class="rest-hint">e.g. 3-1-1-0</span></th><th style="min-width:96px">Rest<span class="rest-hint">e.g. 90s, 2 min, 1:30</span></th><th style="min-width:80px">+ kg</th><th style="min-width:200px">Notes / cues</th><th>Order</th><th></th></tr></thead>
      <tbody>${d.items.map((it,ii) => { const E = wk ? weekItem(it, wk) : it, ov = f => !!(wk && it.weeks && it.weeks[wk] && f in it.weeks[wk]); return `<tr data-di="${di}" data-ii="${ii}">
        <td class="program-exercise-cell" data-label="Exercise"><input type="hidden" data-f="exId" value="${esc(it.exId)}"><button type="button" class="btn ghost pick-ex" data-pick-ex aria-label="Change exercise: ${esc(programExerciseLabel(it.exId))}"><span>${esc(programExerciseLabel(it.exId))}</span><span aria-hidden="true">▾</span></button>${it.groupType?`<span class="exercise-group-chip">${esc(it.groupType)}</span>`:''}</td>
        <td data-label="Sets"${ov('sets')?' class="wk-over"':''}><input type="text" inputmode="numeric" class="num" data-f="sets" value="${esc(E.sets??'')}"></td>
        <td data-label="Reps"${ov('reps')?' class="wk-over"':''}><input type="text" class="num" data-f="reps" value="${esc(E.reps??'')}"></td>
        <td data-label="Load"${ov('load')?' class="wk-over"':''}><input type="text" class="num" data-f="load" value="${esc(E.load??'')}" placeholder="60"></td>
        <td data-label="RPE"${ov('rpe')?' class="wk-over"':''}><input type="text" class="num" data-f="rpe" value="${esc(E.rpe??'')}"></td>
        <td data-label="RIR"${ov('rir')?' class="wk-over"':''}><input type="text" class="num" data-f="rir" value="${esc(E.rir??'')}" placeholder="2"></td>
        <td data-label="Tempo"${ov('tempo')?' class="wk-over"':''}><input type="text" class="num" data-f="tempo" value="${esc(E.tempo??'')}" placeholder="3-1-1-0"></td>
        <td data-label="Rest"${ov('rest')?' class="wk-over"':''}><input type="text" data-f="rest" value="${esc(E.rest??'')}" placeholder="90s"></td>
        <td data-label="+ kg"><input type="number" inputmode="decimal" min="0.1" step="0.5" data-f="increment" value="${esc(it.increment??2.5)}" aria-label="Load increment in kilograms"></td>
        <td data-label="Notes / cues" class="notes-cell${ov('notes') ? ' wk-over' : ''}"><input type="text" data-f="notes" value="${esc(E.notes??'')}" placeholder="Cues, setup, substitutions…"></td>
        <td class="row-move-cell"><div class="row-move"><button type="button" class="btn sm ghost" data-move-item="${di}.${ii}.-1" aria-label="Move ${esc(exName(it.exId))} up" ${ii===0?'disabled':''}>↑</button><button type="button" class="btn sm ghost" data-move-item="${di}.${ii}.1" aria-label="Move ${esc(exName(it.exId))} down" ${ii===d.items.length-1?'disabled':''}>↓</button></div></td>
        <td><details class="exercise-actions-menu"><summary aria-label="Exercise actions" title="Exercise actions">⋯</summary><div class="exercise-actions-pop">
          <button type="button" data-program-group="superset" data-di="${di}" data-ii="${ii}">Create superset</button>
          <button type="button" data-program-group="triset" data-di="${di}" data-ii="${ii}">Create triset</button>
          <button type="button" data-replace-program="${di}.${ii}">Replace exercise</button>
          <button type="button" data-rmitem="${di}.${ii}" data-remove-action>Remove exercise</button>
        </div></details></td>
      </tr>`; }).join('')}</tbody>
    </table></div>
    <div class="row" style="margin-top:.5rem">
      <button type="button" class="btn ghost" data-addto="${di}">Add exercise</button>
    </div>
  </div>`).join('')}

  <div class="row"><button class="btn ghost" id="addDay">Add a day</button>
    <button class="btn ghost" data-dlblankprogram="${esc(pid)}">Download printable card (PDF)</button>
    <button class="btn ghost" id="duplicateProgram">Duplicate program</button>
    <button class="btn danger" data-delprogram="${esc(pid)}">Delete program</button></div>`;
}

