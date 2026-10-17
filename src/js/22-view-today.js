/* ============================ TODAY ============================ */
/* Today lists who trains today with their attendance status. Tapping a
   client opens quick actions (start the next program day, conditioning,
   Attended / No-show, profile) — see openTodayActions. Status comes from
   the attendance record for the date. */
/* Tomorrow through the next 7 days. */
function upcomingHTML(){
  const list = upcomingSessions(7);
  if (!list.length) return '';
  return `<div class="panel" style="margin-top:.8rem"><h3>Upcoming (next 7 days)</h3>${list.map(u => `<div class="upcoming-row">
      <span><strong>${esc(new Date(u.date + 'T12:00:00').toLocaleDateString(undefined,{weekday:'short', day:'numeric', month:'short'}))}</strong>${u.time ? ' · ' + esc(fmtTime(u.time)) : ''}</span>
      <span class="small">${esc(u.label)}${u.names.length && u.names.join(' & ') !== u.label ? ' <span class="muted">· ' + esc(u.names.join(' & ')) + '</span>' : ''}${u.oneOff ? ' <span class="pill warn">one-off</span>' : ''}</span></div>`).join('')}</div>`;
}
function viewToday(){
  const clientsAll = Object.entries(S.clients).map(([id,c]) => ({id,...c})).filter(c => c.status !== 'archived');
  if (!clientsAll.length) return `<div class="empty"><h2>No clients yet</h2><p>Add your roster first, then come back here to see who trains today.</p><button class="btn primary" data-go="clients">Add a client</button></div>`;

  const iso = todayISO();
  const slots = scheduledOn(iso);
  const pairingIds = new Set(slots.flatMap(s => groupMembers(s.id).map(c => c.id)));
  const individualIds = new Set(individualsOn(iso).map(c => c.id));
  const oneOffToday = oneOffsOn(iso);
  const oneOffIds = new Set(oneOffToday.flatMap(s => s.clientIds||[]));
  const marked = new Set(attendanceOn(iso).map(a => a.clientId));
  const relevantIds = new Set([...pairingIds, ...individualIds, ...oneOffIds, ...marked]);
  const relevant = clientsAll.filter(c => relevantIds.has(c.id)).sort(byName);

  let attended = 0, missed = 0, pending = 0;
  relevant.forEach(c => {
    const a = attFor(iso, c.id);
    if (!a) pending++;
    else if (a.status === 'attended') attended++;
    else missed++;
  });
  const total = relevant.length;
  const pct = total ? Math.round((attended / total) * 100) : 0;

  const statusPill = st => st === 'attended' ? '<span class="pill ok">✓ Trained</span>'
    : st === 'no-show' ? '<span class="pill bad">No-show</span>'
    : st === 'cancelled' ? '<span class="pill bad">Cancelled</span>'
    : '<span class="pill warn">Pending</span>';

  const clientCard = c => {
    const p = S.programs[c.programId];
    const g = S.groups[c.groupId];
    const a = attFor(iso, c.id);
    const oo = oneOffToday.find(s => (s.clientIds||[]).includes(c.id));
    const timeNote = g && g.time && pairingIds.has(c.id) ? fmtTime(g.time) : (individualIds.has(c.id) ? fmtTime(c.recurTime) : (oo ? fmtTime(oo.time) : ''));
    const nextDay = p?.days?.[nextDayIndex(c.id)]?.name;
    return `<div class="card today-card" data-today-client="${esc(c.id)}" role="button" tabindex="0" aria-label="${esc(c.name)} — actions">
      <div class="spread">
        <span class="name" style="display:flex;align-items:center;gap:.5rem">${avatarHTML(c.name)}${esc(c.name)}</span>
        ${statusPill(a ? a.status : '')}
      </div>
      <div class="small muted">${p ? esc(p.name) + ' · ' + esc(weekTextFor(p, c.currentWeek || 1)) : 'No program assigned'}${timeNote ? ' · ' + esc(timeNote) : ''}</div>
      ${nextDay ? `<div class="small"><strong>Next: ${esc(nextDay)}</strong> <span class="muted">· tap to start or mark attendance</span></div>` : `<div class="small muted">Tap to start or mark attendance</div>`}
    </div>`;
  };

  return `
  <div class="panel">
    <div class="spread">
      <h2>${new Date().toLocaleDateString(undefined,{weekday:'long', day:'numeric', month:'long'})}</h2>
      <span class="muted small num">${attended} attended · ${missed} missed · ${pending} pending</span>
    </div>
    ${total ? `<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>` : ''}
  </div>
  ${!relevant.length
    ? `<div class="empty"><p>Nothing scheduled today. Set weekdays on a pairing or a client's recurring sessions, or mark someone in from Calendar.</p></div>`
    : `<div class="stack">${relevant.map(clientCard).join('')}</div>`}
  ${exportReminderHTML()}
  ${retentionReminderHTML()}
  ${conflictsPanelHTML()}
  ${upcomingHTML()}
  <p class="small muted" style="margin-top:.8rem">Mark attendance on the cards above. No-shows, cancellations and other days are on the Calendar tab.</p>`;
}

/* Injuries, preferences and goal, pinned at the top of the workout. Open by default when there
   are notes; if the coach collapses it, it stays collapsed for this workout. */
function clientNotesBannerHTML(c){
  const notes=String(c.notes||'').trim(),goal=String(c.goal||'').trim();if(!notes&&!goal)return '';
  const open=notes&&!S.sel.notesCollapsed;
  return `<details class="panel client-notes-banner" id="clientNotesBanner" ${open?'open':''}><summary><strong>${notes?'Client notes':'Goal'}</strong>${notes&&goal?`<span class="small muted"> · Goal: ${esc(goal)}</span>`:(!notes?`<span class="small muted"> · ${esc(goal)}</span>`:'')}</summary>${notes?`<p>${esc(notes).replace(/\n/g,'<br>')}</p>`:''}</details>`;
}
function logSheet(cid){
  const c = S.clients[cid]; if (!c) return '<p>Client not found.</p>';
  const prog = S.programs[c.programId];
  const draft = S.sel.draft;
  if (!draft) return '<p>Loading…</p>';
  if (!draft.startedAt) draft.startedAt = Date.now();
  if (draft.restRemainingMs == null) draft.restRemainingMs = 90000;
  const dayOpts = prog ? prog.days.map((d,i) => `<option value="${i}" ${i===S.sel.dayIndex?'selected':''}>${esc(d.name)}</option>`).join('') : '';

  return `
  <section class="session-overview panel" aria-label="Workout details">
    <div class="session-overview-lead"><span class="overview-avatar">${avatarHTML(c.name)}</span><div><span class="timer-kicker">${draft.editing?'EDITING A SAVED SESSION':'NOW TRAINING'}</span><h2>${esc(c.name)}</h2><p>${prog ? esc(prog.name) : 'Free session'} · ${esc(prog ? weekTextFor(prog, c.currentWeek||1) : 'week ' + (c.currentWeek||1))}${draft.conditioningTemplateId&&S.conditioning[draft.conditioningTemplateId]?' · '+esc(S.conditioning[draft.conditioningTemplateId].name)+' conditioning':''}</p></div></div>
    <div class="session-overview-fields">
      ${draft.editing
        ? `<label class="overview-field"><span>DATE</span><input type="date" id="editDate" value="${esc(draft.date)}" max="${esc(todayISO())}"></label>
           <div class="overview-field"><span>SESSION</span><strong class="overview-value">${esc(draft.dayLabel||'Session')}</strong></div>`
        : `<div class="overview-field"><span>DATE</span><strong class="overview-value" aria-label="Workout date, set when session started">${esc(draft.date?new Date(draft.date+'T12:00:00').toLocaleDateString():todayISO())}</strong></div>
      ${prog ? `<label class="overview-field"><span>PROGRAM DAY</span><select id="dayPick">${dayOpts}</select></label>` : `<div class="overview-field"><span>PROGRAM DAY</span><strong>Free session</strong></div>`}`}
    </div>
  </section>
  ${clientNotesBannerHTML(c)}
  ${draft.dayNotes?`<div class="panel day-notes-banner"><strong>${esc(draft.dayLabel||'Today')}</strong> — ${esc(draft.dayNotes)}</div>`:''}
  ${draft.dayConditioningId&&S.conditioning[draft.dayConditioningId]&&!draft.conditioningSession&&!draft.conditioningInProgress&&!draft.editing?`<div class="panel day-cond-banner"><div><strong>Day includes ${esc(S.conditioning[draft.dayConditioningId].name||'conditioning')}</strong><div class="small muted">${(S.conditioning[draft.dayConditioningId].blocks||[]).length} timed block${(S.conditioning[draft.dayConditioningId].blocks||[]).length===1?'':'s'} — your strength work stays in this session.</div></div><button type="button" class="btn primary" id="startDayConditioning" data-template="${esc(draft.dayConditioningId)}">Start conditioning</button></div>`:''}

  ${draft.editing?'':`<section class="session-timer panel" aria-label="Workout timers">
    <div class="session-clock-block"><span class="timer-kicker">SESSION</span><strong id="sessionClock" class="session-clock num">00:00:00</strong><span id="exerciseProgress" class="timer-caption"></span></div>
    <div class="rest-clock-block"><div class="rest-clock-title"><span class="timer-kicker">REST</span></div><button type="button" id="restClock" class="rest-clock rest-clock-edit num" role="timer" aria-label="Edit rest timer duration">01:30</button>
      <div class="rest-controls"><button type="button" class="btn btn-light" id="restToggle">Start ${esc(draft.restDurationSeconds||90)}s</button><button type="button" class="btn btn-light" id="restReset" aria-label="Reset rest timer">Reset</button></div>
    </div>
  </section>`}
  ${draft.conditioningSession?`<div class="panel"><strong>Conditioning complete · ${esc(draft.conditioningSession.templateName||'Session')}</strong><div class="small muted">${(draft.conditioningSession.blocksCompleted||[]).length} timed blocks completed and included in this workout.</div></div>`:''}
  <div id="exList">${draft.entries.map((en,ei) => exBlock(en, ei)).join('') || '<div class="panel muted">Nothing prescribed. Add a lift below.</div>'}</div>

  <div class="panel">
    <div class="row">
      <button class="btn ghost" id="addExBtn">Add exercise</button>
    </div>
    <hr>
    ${Object.keys(S.conditioning).length&&!draft.conditioningSession&&!draft.editing?`<div class="conditioning-add-row"><div><strong>${draft.conditioningInProgress?'Conditioning block in progress':'Add a conditioning block'}</strong><small>${draft.conditioningInProgress?'Continue the conditioning part of this session.':'Choose a template and add conditioning to this session.'}</small></div><button type="button" class="btn primary" id="openSessionConditioning">${draft.conditioningInProgress?'Continue':'＋ Add conditioning'}</button></div>`:''}
    <label class="field session-notes-field"><span>Session notes</span><textarea id="sessNotes" class="session-notes-input" placeholder="How did the session feel? Add observations for next time…">${esc(draft.notes||'')}</textarea><small>Notes are saved with this workout and appear in the client’s history.</small></label>
    <div class="logger-status-row" aria-live="polite">Draft status: <strong id="workoutSaveStatus">${S.recoverySaved?'Saved offline':'Autosave ready'}</strong></div>
    <div class="row">
      <button class="btn primary" id="saveSess">${draft.editing?'Save changes':'Save session'}</button>
      <button type="button" class="btn danger" id="cancelSession">${draft.editing?'Discard changes':'Cancel workout'}</button>
    </div>
  </div>`;
}

function ensureSetDefaults(set){
  set.actualRPE=set.actualRPE??(set.rpe??null);set.actualRIR=set.actualRIR??null;set.setType=set.setType||'working';set.note=set.note||'';
  if(set.done==null)set.done=false;
  return set;
}
/* Reads a prescribed rest into seconds. Accepts "1:30", "90", "90s", "90 sec", "2m", "2 min",
   "2'", "1.5 min", "2m30s", "2 min 30", "2'30\"" and ranges such as "90-120s" or "2-3 min"
   (the lower value is used). A bare number of 10 or less ("3", "2-3") means minutes — nobody
   prescribes 3 seconds of rest; bigger bare numbers ("90") are seconds. Anything it can't read
   falls back to 90 seconds. */
const bareRestSeconds=n=>n<=10?n*60:n;
const REST_UNIT_SECONDS=[[/^(h|hr|hrs|hour|hours)$/,3600],[/^(m|min|mins|minute|minutes|')$/,60],[/^(s|sec|secs|second|seconds|"|'')$/,1]];
function restUnitSeconds(unit){if(!unit)return null;const hit=REST_UNIT_SECONDS.find(([re])=>re.test(unit));return hit?hit[1]:undefined;}
function prescribedRestSeconds(value){
  const text=String(value??'').trim().toLowerCase().replace(/,/g,'.').replace(/[’′]/g,"'").replace(/[”″]/g,'"').replace(/\s+/g,' ');
  if(!text)return 90;
  const valid=n=>Number.isFinite(n)&&n>0?Math.round(n):90;
  const clock=text.match(/^(\d+):(\d{1,2})$/);if(clock)return valid(Number(clock[1])*60+Number(clock[2]));
  const range=text.match(/^(\d+(?:\.\d+)?) ?(?:-|–|to) ?\d+(?:\.\d+)? ?([a-z'"]*)\.?$/);
  if(range){const unit=restUnitSeconds(range[2]);return unit===undefined?90:valid(unit?Number(range[1])*unit:bareRestSeconds(Number(range[1])));}
  if(/^\d+(?:\.\d+)?$/.test(text))return valid(bareRestSeconds(Number(text)));
  // One or more "number + optional unit" parts, e.g. "2m30s" or "2 min 30".
  const part=/(\d+(?:\.\d+)?) ?([a-z]+|''|'|")? ?/y;let total=0,pos=0,lastUnit=null,parts=0;
  while(pos<text.length){
    part.lastIndex=pos;const m=part.exec(text);if(!m||m[0]==='')return 90;
    let unit=restUnitSeconds(m[2]);if(unit===undefined)return 90;
    if(unit===null)unit=lastUnit===60?1:lastUnit===3600?60:1;   // bare number: seconds, or the next unit down ("2 min 30")
    total+=Number(m[1])*unit;lastUnit=unit;parts++;pos=part.lastIndex;
  }
  return parts?valid(total):90;
}
/* Each superset / tri-set gets the next letter in the order they appear (A, B, C…) and its
   members are numbered within it: A1, A2 … then B1, B2 … */
function groupPositionLabel(entry,index){
  if(!entry.groupId)return '';
  const entries=S.sel.draft.entries,order=[];
  entries.forEach(item=>{if(item.groupId&&!order.includes(item.groupId))order.push(item.groupId);});
  const letter=String.fromCharCode(65+(order.indexOf(entry.groupId)%26)),
        position=entries.filter(item=>item.groupId===entry.groupId).indexOf(entry);
  return `${entry.groupType==='triset'?'Tri-set':'Superset'} · ${letter}${position+1}`;
}
/* In a superset the rest belongs after the LAST exercise of a round. Returns the next member
   that still has this set number to do, or null when this set closes the round. */
function nextGroupMemberAt(ei,si){
  const entries=S.sel.draft.entries,entry=entries[ei];if(!entry?.groupId)return null;
  for(let j=ei+1;j<entries.length;j++){
    const other=entries[j];
    if(other.groupId===entry.groupId&&other.sets[si]&&!other.sets[si].done)return j;
  }
  return null;
}
/* The program row behind a logged exercise (for progression settings), else one built from its targets. */
function programItemFor(entry){
  const draft=S.sel?.draft,prog=draft&&S.programs[draft.programId];
  const day=prog?.days?.[S.sel?.dayIndex??0],item=day?.items?.find(it=>String(it.exId)===String(entry.exId));
  if(item)return weekItem(item,draft.week||1);
  return entry.targetReps?{sets:entry.targetSets,reps:entry.targetReps,progression:'double',increment:2.5}:null;
}
function entrySuggestion(entry){
  const item=programItemFor(entry);if(!item)return null;
  const draft=S.sel.draft;
  // A deload week, or a load set as a % of the client's max, is prescribed by the plan: no automatic "add weight" advice.
  if(isDeloadWeek(S.programs[draft.programId],draft.week||1)||percentLoad(item.load)!=null)return null;
  return progressionSuggestion(item,exerciseHistory(draft.clientId,entry.exId).last);
}
function shortDate(iso){return iso?new Date(iso+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'}):'';}
function exerciseTargetHTML(en,suggestion){
  const parts=[];
  if(en.targetSets&&en.targetReps)parts.push(`<strong>${esc(en.targetSets)} × ${esc(en.targetReps)}</strong>`);else if(en.targetReps)parts.push(`<strong>${esc(en.targetReps)} reps</strong>`);
  if(en.targetLoad)parts.push(esc(/^\d+(\.\d+)?$/.test(String(en.targetLoad))?en.targetLoad+' kg':en.targetLoad)+(percentLoad(en.targetLoad)!=null?(en.targetKg?' ≈ '+esc(en.targetKg)+' kg':' (no past lifts to work out a weight)'):''));
  if(en.targetRPE)parts.push('RPE '+esc(en.targetRPE));
  if(en.targetRIR)parts.push('RIR '+esc(en.targetRIR));
  if(en.targetTempo)parts.push('Tempo '+esc(en.targetTempo));
  if(en.targetRest)parts.push('Rest '+esc(en.targetRest));
  if(!parts.length&&!suggestion&&!en.targetNotes)return '';
  return `<div class="exercise-target">${parts.length?`<span>Target ${parts.join(' · ')}</span>`:''}${en.targetNotes?`<span class="exercise-cue">✎ ${esc(en.targetNotes)}</span>`:''}${suggestion?`<span class="exercise-suggestion">↗ ${esc(suggestion.note)}</span>`:''}</div>`;
}
function exBlock(en, ei){
  const previous=exerciseHistory(S.sel.draft.clientId,en.exId).last;
  const groupLabel=groupPositionLabel(en,ei);
  const suggestion=entrySuggestion(en),best=en.best;
  return `<div class="exblock" data-ei="${ei}" id="logger-ex-${ei}">
    <header><div><div class="exercise-title-line"><strong class="cond" style="font-size:1.15rem">${esc(en.name)}</strong>${groupLabel?`<span class="exercise-group-chip">${esc(groupLabel)}</span>`:''}</div></div>
      <div class="exhead-right">${best&&best.weight!=null?`<span class="exercise-best" title="Heaviest set logged for this client">Best ${esc(best.weight)} kg${best.reps!=null?' × '+esc(best.reps):''}${best.date?' · '+esc(shortDate(best.date)):''}</span>`:''}<details class="exercise-actions-menu"><summary aria-label="Exercise actions" title="Exercise actions">⋯</summary><div class="exercise-actions-pop">
        <button type="button" data-move-ex="${ei}.-1" ${ei===0?'disabled':''}>Move up</button><button type="button" data-move-ex="${ei}.1" ${ei===S.sel.draft.entries.length-1?'disabled':''}>Move down</button><button type="button" data-session-group="superset" data-ei="${ei}">Create superset</button><button type="button" data-session-group="triset" data-ei="${ei}">Create triset</button><button type="button" data-set-type="${ei}">Set type</button><button type="button" data-set-notes="${ei}">Set notes</button><button type="button" data-replace-session="${ei}">Replace exercise</button><button type="button" data-rmex="${ei}" data-remove-action>Remove exercise</button>
      </div></details></div>
    </header>
    ${exerciseTargetHTML(en,suggestion)}
    <div class="setheads"><span>Set</span><span>Previous</span><span>Kg</span><span>Reps</span><span></span></div>
    ${en.sets.map((rawSet,si)=>{const s=ensureSetDefaults(rawSet),prev=previous?.sets?.[si],lastWeight=previous?(prev?.weight??null):s.lastWeight,lastReps=previous?(prev?.reps??null):s.lastReps,sug=suggestion?.sets?.[si],hintWeight=sug?.weight??en.targetKg??lastWeight,hintReps=sug?.reps??lastReps;const rpeOptions=['','6','6.5','7','7.5','8','8.5','9','9.5','10'].map(v=>`<option value="${v}" ${String(s.actualRPE??'')===v?'selected':''}>${v||'—'}</option>`).join(''),rirOptions=['','0','1','2','3','4','5+'].map(v=>`<option value="${v}" ${String(s.actualRIR??'')===v?'selected':''}>${v||'—'}</option>`).join('');return `
      <div class="set-swipe-wrap"><span class="set-swipe-action copy">Copy previous</span><span class="set-swipe-action delete">Delete set</span><div class="setrow ${s.done?'done':''}" data-si="${si}"><span class="idx num">${si+1}</span><span class="last num">${lastWeight!=null||lastReps!=null?esc((lastWeight??'—')+'kg × '+(lastReps??'—')):'—'}</span>
        <input type="number" inputmode="decimal" step="0.5" class="num" data-set-input="weight" value="${esc(s.weight??'')}" placeholder="${esc(hintWeight??'')}" aria-label="Kilograms for set ${si+1}">
        <input type="number" inputmode="numeric" class="num" data-set-input="reps" value="${esc(s.reps??'')}" placeholder="${esc(hintReps??'')}" aria-label="Reps for set ${si+1}">
      <button class="tick" data-done="1" aria-pressed="${s.done?'true':'false'}" aria-label="${s.done?'Reopen':'Mark'} set ${si+1} ${s.done?'':'complete'}">${s.done?'✓':''}</button>
      </div></div>
      <details class="set-more"><summary>Effort · RPE / RIR optional</summary>
        <div class="set-more-grid"><label>Actual RPE<select data-set-input="actualRPE">${rpeOptions}</select></label><label>Actual RIR<select data-set-input="actualRIR">${rirOptions}</select></label></div>
        <div class="set-more-actions"><button type="button" class="btn sm ghost" data-adjust-set="${ei}.${si}.weight.-2.5">− 2.5 kg</button><button type="button" class="btn sm ghost" data-adjust-set="${ei}.${si}.weight.2.5">+ 2.5 kg</button><button type="button" class="btn sm ghost" data-adjust-set="${ei}.${si}.reps.-1">− 1 rep</button><button type="button" class="btn sm ghost" data-adjust-set="${ei}.${si}.reps.1">+ 1 rep</button></div>
        <div class="set-more-actions"><button type="button" class="btn sm ghost" data-copy-prev="${ei}.${si}">Copy previous</button><button type="button" class="btn sm danger" data-delete-set="${ei}.${si}">Delete set ${si+1}</button></div>
      </details>`}).join('')}
    <div style="padding:.4rem .7rem"><button class="btn sm ghost" data-addset="${ei}">Add set</button></div>
  </div>`;
}

function buildDraft(cid, dayIndex){
  // A client deleted mid-session still gets a (free) draft rather than a crash.
  const c = S.clients[cid] || {}, prog = S.programs[c.programId];
  const day = prog ? prog.days[dayIndex] : null;
  const week = c.currentWeek || 1;
  const entries = (day ? day.items : []).map(base => {
    const it = weekItem(base, week);   // this week's prescription
    const { last, best } = exerciseHistory(cid, it.exId);
    const pct = percentLoad(it.load), e1 = pct != null ? bestE1RMOf(cid, it.exId) : null;
    const wkLoad = base.weeks && base.weeks[week] && 'load' in base.weeks[week] && /^\d+(\.\d+)?$/.test(String(it.load)) ? Number(it.load) : null;
    const targetKg = pct != null ? (e1 ? roundLoad(e1 * pct / 100) : null) : wkLoad;   // shown as the grey hint in the weight box
    return {
      ...(targetKg ? { targetKg } : {}),
      exId: it.exId, name: exName(it.exId), groupId:it.groupId||null, groupType:it.groupType||null,
      target: [it.sets && it.reps ? it.sets + '×' + it.reps : '', it.load || '', it.rpe ? 'RPE ' + it.rpe : ''].filter(Boolean).join(' · '),
      targetSets:it.sets||'',targetReps:it.reps||'',targetLoad:it.load||'',targetRPE:it.rpe||'',targetRIR:it.rir||'',targetTempo:it.tempo||'',targetNotes:it.notes||'',targetRest:it.rest||'90s',
      lastDate: last ? last.date : null, best,
      sets: Array.from({length: Number(it.sets) || 3}, (_,i) => ({
        weight:null, reps:null, done:false,actualRPE:null,actualRIR:null,setType:'working',note:'',
        lastWeight: last && last.sets[i] ? last.sets[i].weight : null,
        lastReps: last && last.sets[i] ? last.sets[i].reps : null
      }))
    };
  });
  // id is fixed when the workout starts and becomes the saved log's id, so a repeated save can't duplicate it.
  return { id: uid(), clientId: cid, date: todayISO(), dayLabel: day ? day.name : 'Open session',
           programId: c.programId || null, week, entries, notes:'', ...(day&&day.notes?{dayNotes:day.notes}:{}), ...(day&&day.conditioningId?{dayConditioningId:day.conditioningId}:{}), usePack: true, startedAt:Date.now(), restRemainingMs:90000, restDurationSeconds:90,restRunning:false, restEndAt:null,autoRestAfterSet:true,focusedExerciseIndex:0 };
}

function buildRepeatWorkoutDraft(cid,log){
  const client=S.clients[cid];if(!client)return null;
  const programId=log.programId&&S.programs[log.programId]?log.programId:(client.programId&&S.programs[client.programId]?client.programId:null);
  const program=programId?S.programs[programId]:null;
  const dayIndex=program?(program.days||[]).findIndex(day=>String(day.name||'').trim().toLowerCase()===String(log.dayLabel||'').trim().toLowerCase()):0;
  const day=program?.days?.[dayIndex>=0?dayIndex:0];
  const loggedEntries=workoutLogEntries(log);
  // Older sessions may contain no exercise rows because blank sets were filtered
  // before saving. In that case, recover the workout structure from its program day.
  const source=loggedEntries.length?loggedEntries:(day?.items||[]).map(item=>({...item,exId:item.exId,name:item.name||exName(item.exId)}));
  const entries=source.map(item=>{
    const exId=loggedExerciseId(item)??item.exId, name=loggedExerciseName(item)||item.name||exName(exId),{last,best}=exerciseHistory(cid,exId);
    const sets=loggedExerciseSets(item),lastLoggedSet=Math.max(0,...sets.map((set,index)=>Number(set?.setNumber)||index+1)),count=Math.max(1,sets.length,lastLoggedSet,Number(item.targetSets??item.sets)||0);
    return {exId,name,groupId:item.groupId||null,groupType:item.groupType||null,target:item.target||'',targetSets:item.targetSets||item.sets||'',targetReps:item.targetReps||item.reps||'',targetLoad:item.targetLoad||item.load||'',targetRPE:item.targetRPE||item.rpe||'',targetRIR:item.targetRIR||item.rir||'',targetTempo:item.targetTempo||item.tempo||'',targetNotes:item.targetNotes||item.notes||'',targetRest:item.targetRest||item.rest||'90s',lastDate:last?.date||null,best,sets:Array.from({length:count},(_,i)=>({weight:null,reps:null,done:false,actualRPE:null,actualRIR:null,setType:'working',note:'',lastWeight:last?.sets?.[i]?.weight??null,lastReps:last?.sets?.[i]?.reps??null}))};
  });
  const draft={id:uid(),clientId:cid,date:todayISO(),dayLabel:day?.name||log.dayLabel||'Open session',programId,week:client.currentWeek||log.week||1,entries,notes:'',usePack:true,startedAt:Date.now(),restRemainingMs:90000,restDurationSeconds:90,restRunning:false,restEndAt:null,autoRestAfterSet:true};
  return {draft,dayIndex:dayIndex>=0?dayIndex:0};
}
/* ---- editing a saved session: reopen it in the logger, save overwrites the same log ---- */
function beginEditSession(logId){
  const log=S.logs[logId];if(!log)return;
  const cid=log.clientId;if(!S.clients[cid]){toast('That client no longer exists');return;}
  archiveParkedWorkoutBeforeStartingAnother(cid);
  const copy=JSON.parse(JSON.stringify(log));['exercises','workoutEntries','movements','lifts'].forEach(k=>delete copy[k]);
  const entries=workoutLogEntries(log).map(item=>{
    const exId=loggedExerciseId(item)??item.exId,name=loggedExerciseName(item)||exName(exId);
    const sets=loggedExerciseSets(item).map(s=>ensureSetDefaults({...s,weight:setWeight(s),reps:setReps(s),actualRPE:setRPE(s)}));
    return {exId,name,...(item.groupId?{groupId:item.groupId,groupType:item.groupType}:{groupId:null,groupType:null}),target:item.target||'',targetSets:item.targetSets||'',targetReps:item.targetReps||'',targetLoad:item.targetLoad||'',targetRPE:item.targetRPE||'',targetRIR:item.targetRIR||'',targetTempo:item.targetTempo||'',targetNotes:item.targetNotes||'',targetRest:item.targetRest||'90s',sets:sets.length?sets:[ensureSetDefaults({weight:null,reps:null})]};
  });
  const draft={...copy,id:logId,clientId:cid,entries,editing:true,
    editOriginal:{date:log.date,completedAt:log.completedAt??null,durationSeconds:Object.prototype.hasOwnProperty.call(log,'durationSeconds')?log.durationSeconds:undefined},
    notes:log.notes||'',usePack:false,startedAt:Date.now(),restRemainingMs:90000,restDurationSeconds:90,restRunning:false,restEndAt:null,autoRestAfterSet:true};
  S.sel={logClient:cid,dayIndex:0,draft,backTo:''};
  // "Previous", best and hints come from sessions BEFORE this one (exerciseHistory skips the session being edited).
  entries.forEach(e=>{const h=exerciseHistory(cid,e.exId);e.best=h.best;e.lastDate=h.last?.date||null;e.sets.forEach((s,i)=>{s.lastWeight=h.last?.sets?.[i]?.weight??null;s.lastReps=h.last?.sets?.[i]?.reps??null;});});
  render();
}
/* Ask a question with several answers; resolves with the chosen value, or null if dismissed. */
function askChoice(title,bodyHTML,choices){
  return new Promise(resolve=>{
    let settled=false;const finish=v=>{if(!settled){settled=true;resolve(v);}};
    const dlg=dialog(title,bodyHTML,choices.map(c=>({label:c.label,kind:c.kind,onClick:()=>{finish(c.value);}})));
    dlg.addEventListener('close',()=>finish(null),{once:true});
  });
}
function hasRepeatWorkoutSource(cid,log){
  if(workoutLogEntries(log).length)return true;
  const client=S.clients[cid],programId=log?.programId&&S.programs[log.programId]?log.programId:client?.programId,program=programId?S.programs[programId]:null;
  return !!program?.days?.some(day=>Array.isArray(day.items)&&day.items.length&&(!log?.dayLabel||String(day.name||'').trim().toLowerCase()===String(log.dayLabel).trim().toLowerCase()));
}

/* Starting a new session for a client moves THEIR unfinished one to the saved list. Other clients' open sessions stay open. */
function archiveParkedWorkoutBeforeStartingAnother(cid){
  const mine=S.sessions.filter(r=>r.logClient===cid);if(!mine.length)return;
  S.sessions=S.sessions.filter(r=>r.logClient!==cid);
  mine.forEach(r=>{S.recoveryArchive=[JSON.parse(JSON.stringify(r)),...(S.recoveryArchive||[])].slice(0,8);});
  Store.putMeta('workoutDraftArchive',S.recoveryArchive).catch(error=>{console.warn('Could not archive parked workout',error);showSaveError(error);});
}

/* The program day after the client's most recent strength session on their current program
   (wrapping to the first day); the first day when there's no history. */
function nextDayIndex(cid){
  const c=S.clients[cid],p=c&&S.programs[c.programId],days=p?.days||[];if(!days.length)return 0;
  const norm=v=>String(v||'').trim().toLocaleLowerCase(),names=days.map(d=>norm(d.name));
  for(const l of clientLogs(cid)){   // newest first
    if(l.type==='conditioning')continue;
    if(l.programId&&l.programId!==c.programId)continue;   // a session from a different program
    const i=names.indexOf(norm(l.dayLabel));if(i>=0)return (i+1)%days.length;
  }
  return 0;
}
function beginClientWorkout(cid,mode,templateId='',partnerId=''){
  const c=S.clients[cid];if(!c){toast('That client no longer exists');return;}
  if(consentState(c)==='withdrawn')toast('Consent was withdrawn for '+c.name+'. Consider archiving them instead of logging new data.');
  archiveParkedWorkoutBeforeStartingAnother(cid);
  if(mode==='conditioning'){
    if(!templateId||!S.conditioning[templateId]){toast('Choose a conditioning program first');return;}
    let partner='';
    if(partnerId){
      if(partnerId===cid||!S.clients[partnerId]||sessionFor(partnerId)){toast('That client already has a session open. Finish or save it first.');return;}
      partner=partnerId;
      if(consentState(S.clients[partner])==='withdrawn')toast('Consent was withdrawn for '+S.clients[partner].name+'. Consider archiving them instead of logging new data.');
    }
    S.sel={conditioningClient:cid,conditioningId:templateId,conditioningMode:'conditioning',conditioningSession:{id:uid(),date:todayISO(),startedAt:Date.now(),blocksCompleted:[],blocks:JSON.parse(JSON.stringify(S.conditioning[templateId].blocks||[])),flow:conditioningFlowOf(S.conditioning[templateId]),...(partner?{clientIds:[cid,partner],partnerResults:{}}:{})}};render();return;
  }
  const dayIndex=nextDayIndex(cid),draft=buildDraft(cid,dayIndex);
  S.sel={logClient:cid,dayIndex,draft};render();
  packLowWarning(cid);
}
function packLowWarning(cid){
  const c=S.clients[cid];if(!c||!c.packTotal)return;
  const left=sessionsLeft(c,cid);
  if(left===0)toast(c.name+'s pack is used up — renew it in their profile');
  else if(left===1)toast(c.name+' has 1 session left in the pack');
}
/* Pick a conditioning template, then start it for this client. */
function openConditioningChooser(cid){
  if(!Object.keys(S.conditioning).length){toast('Create a conditioning program first');return;}
  const partner=partnerOf(cid);
  const templates=Object.entries(S.conditioning).map(([id,w])=>`<button type="button" class="card program-kind-card" data-start-conditioning-template="${esc(id)}"><span class="program-kind-icon">◷</span><strong>${esc(w.name||'Conditioning template')}</strong><span class="small muted">${(w.blocks||[]).length} timed block${(w.blocks||[]).length===1?'':'s'}</span><span class="small muted">Start this conditioning program →</span></button>`).join('');
  const templateDialog=dialog('Choose conditioning program',`<p class="small muted">Select a program to start its conditioning session.</p>${partner?`<label class="row tight small" style="gap:.4rem;margin-bottom:.6rem"><input type="checkbox" id="condWithPartner" style="width:auto"> Also run it for ${esc(partner.name)} — one shared timer, a separate result for each</label>`:''}<div class="grid start-workout-choices">${templates}</div>`,[{label:'Cancel'}]);
  templateDialog.querySelectorAll('[data-start-conditioning-template]').forEach(button=>button.onclick=()=>{
    const templateId=button.dataset.startConditioningTemplate;
    if(!S.conditioning[templateId]){toast('This conditioning program is no longer available');return;}
    const withPartner=!!(partner&&document.getElementById('condWithPartner')?.checked);
    templateDialog.close();
    beginClientWorkout(cid,'conditioning',templateId,withPartner?partner.id:'');
  });
}
/* Today card → quick actions for that client, so the usual "who's next → start" is two taps. */
function openTodayActions(cid){
  const c=S.clients[cid];if(!c)return;
  const p=S.programs[c.programId],di=nextDayIndex(cid),dayName=p?.days?.[di]?.name;
  const iso=todayISO(),status=attFor(iso,cid)?.status||'',parked=!!sessionFor(cid);
  const statusText=status==='attended'?'Marked attended today':status==='no-show'?'Marked no-show today':status==='cancelled'?'Marked cancelled today':'Not marked yet today';
  const dlg=dialog(c.name,`<p class="small muted">${esc(statusText)}${p?` · ${esc(p.name)}`:''}</p>
    <div class="today-actions">
      ${parked?`<button type="button" class="btn primary" data-today-action="resume">Resume workout in progress</button>`:''}
      <button type="button" class="btn ${parked?'ghost':'primary'}" data-today-action="start">${dayName?'Log session · '+esc(dayName):'Log session'}</button>
      <button type="button" class="btn ghost" data-today-action="conditioning">Conditioning…</button>
      <div class="today-actions-pair">
        <button type="button" class="btn ${status==='attended'?'primary':'ghost'}" data-today-action="attended" aria-pressed="${status==='attended'}">${status==='attended'?'✓ Attended':'Attended'}</button>
        <button type="button" class="btn ${status==='no-show'?'danger':'ghost'}" data-today-action="no-show" aria-pressed="${status==='no-show'}">No-show</button>
      </div>
      <button type="button" class="btn ghost" data-today-action="profile">Open profile</button>
    </div>`,[{label:'Close'}]);
  const act=async kind=>{
    if(kind==='resume'){dlg.close();resumeParkedWorkout(sessionKey(sessionFor(cid)));return;}
    if(kind==='start'){dlg.close();beginClientWorkout(cid,'strength');return;}
    if(kind==='conditioning'){openConditioningChooser(cid);return;}
    if(kind==='profile'){dlg.close();S.view='dashboard';S.sub='clients';S.sel={client:cid};render();return;}
    const next=status===kind?'':kind;   // tapping the current status clears it
    try{await setAttendance(iso,cid,next,c.groupId||'');}catch(e){showSaveError(e);return;}
    dlg.close();
    const fresh=S.clients[cid];
    toast(next==='attended'?(fresh.packTotal&&sessionsLeft(fresh)===0?fresh.name+' has now used the last session in the pack':fresh.name+' marked attended'):next==='no-show'?fresh.name+' marked no-show':'Attendance cleared');
    render();
  };
  dlg.querySelectorAll('[data-today-action]').forEach(b=>b.onclick=()=>act(b.dataset.todayAction));
}
function markStrengthActivity(){
  const d=S.sel&&S.sel.draft;
  // (Editing a saved session must not move its strength/conditioning order.)
  if(d&&!d.editing&&(d.conditioningTemplateId||d.conditioningInProgress||d.conditioningSession))d.strengthCompletedAt=Date.now();
  if(d)scheduleWorkoutAutosave();
}
/* Opens the timed conditioning part of a strength workout (the workout stays parked and is resumed after). */
function startSessionConditioning(templateId){
  const d=S.sel?.draft,cid=S.sel?.logClient;if(!d||!S.conditioning[templateId]){toast('That conditioning program is no longer available');return false;}
  d.conditioningTemplateId=templateId;d.strengthCompletedAt=Date.now();
  const progress=d.conditioningInProgress||{id:uid(),date:d.date||todayISO(),startedAt:d.startedAt||Date.now(),blocksCompleted:[],flow:conditioningFlowOf(S.conditioning[templateId])};
  S.parkedWorkout={sessionType:'strength',activePhase:'strength',logClient:cid,dayIndex:S.sel.dayIndex||0,draft:d,backTo:S.sel.backTo||''};   // the strength half waits while conditioning runs
  S.sel={conditioningClient:cid,conditioningId:templateId,conditioningMode:'both',conditioningSession:progress};render();
}
/* Delete / copy a set — used by the buttons in the set's Effort panel and by the swipe gestures. */
function deleteSetAt(ei,si){
  const entry=S.sel.draft?.entries?.[ei],removed=entry?.sets?.[si];if(!removed)return;
  if(entry.sets.length<2){toast('Keep at least one set for this exercise');return;}
  entry.sets.splice(si,1);markStrengthActivity();render();
  undoToast(`Set ${si+1} of ${entry.name} deleted`,()=>{
    if(!S.sel.draft||!S.sel.draft.entries.includes(entry))return;   // the exercise itself is gone
    entry.sets.splice(Math.min(si,entry.sets.length),0,removed);markStrengthActivity();render();
  });
}
function copyPreviousSet(ei,si){
  const entry=S.sel.draft?.entries?.[ei],set=entry?.sets?.[si];
  const previous=entry&&exerciseHistory(S.sel.draft.clientId,entry.exId).last?.sets?.[si];
  if(!previous||!set){toast('No previous set to copy');return;}
  set.weight=previous.weight??null;set.reps=previous.reps??null;set.done=false;
  if(set.weight!=null&&set.reps!=null)completeWorkoutSet(ei,si);else{markStrengthActivity();render();}
}
/* The kg × reps shown as grey hints in this set's boxes: the progression suggestion when
   there is one, otherwise the "Previous" numbers (same sources as exBlock). ✓ on an empty set uses these. */
function previousSetValues(ei,si){
  const draft=S.sel?.draft,entry=draft?.entries?.[ei],set=entry?.sets?.[si];if(!entry)return {weight:null,reps:null};
  const previous=exerciseHistory(draft.clientId,entry.exId).last,prev=previous?.sets?.[si];
  const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);   // older logs may hold "60" as text
  const last=previous?{weight:num(prev?.weight),reps:num(prev?.reps)}:{weight:num(set?.lastWeight),reps:num(set?.lastReps)};
  const sug=entrySuggestion(entry)?.sets?.[si];
  return {weight:num(sug?.weight)??last.weight,reps:num(sug?.reps)??last.reps};
}
/* opts.advance: after a superset set, move the cursor to the same set of the next exercise
   (used for Enter and the ✓ tap; not when the set completes because a box lost focus). */
function completeWorkoutSet(ei,si,opts={}){
  const draft=S.sel?.draft,set=draft?.entries?.[ei]?.sets?.[si];if(!draft||!set||set.done)return false;
  set.done=true;
  const nextMember=nextGroupMemberAt(ei,si);
  if(nextMember==null){   // not mid-superset: start the rest
    if(!draft.restDurationManuallySet)draft.restDurationSeconds=prescribedRestSeconds(draft.entries[ei].targetRest);
    const seconds=Number(draft.restDurationSeconds)||90;draft.restRemainingMs=seconds*1000;draft.restEndAt=Date.now()+draft.restRemainingMs;draft.restRunning=true;
  }
  const row=document.querySelector(`.exblock[data-ei="${ei}"] .setrow[data-si="${si}"]`),tick=row?.querySelector('[data-done]');
  if(row)row.classList.add('done');if(tick){tick.textContent='✓';tick.setAttribute('aria-label',`Reopen set ${si+1}`);tick.setAttribute('aria-pressed','true');}
  updateWorkoutTimerUI();markStrengthActivity();
  if(nextMember!=null&&opts.advance){
    const box=document.querySelector(`.exblock[data-ei="${nextMember}"] .setrow[data-si="${si}"] [data-set-input="weight"]`);
    if(box){box.scrollIntoView({block:'center'});try{box.focus({preventScroll:true});box.select();}catch{}}
  }
  return true;
}

function conditioningWorkoutSheet(){
  const cid=S.sel.conditioningClient,w=S.conditioning[S.sel.conditioningId],ss=S.sel.conditioningSession||{};
  if(!w)return '<div class="empty"><p>Conditioning template not found.</p><button class="btn ghost" id="leaveConditioningWorkout">Back</button></div>';
  const blocks=Array.isArray(ss.blocks)?ss.blocks:(ss.blocks=JSON.parse(JSON.stringify(w.blocks||[])));
  const selected=Math.min(Number(ss.blockIndex)||0,Math.max(0,blocks.length-1));
  const options=blocks.map((b,i)=>`<option value="${i}" ${i===selected?'selected':''}>Block ${i+1} · ${esc(b.name||conditioningModeName(b.mode))}</option>`).join('');
  const combined=S.sel.conditioningMode==='both';
  return `<div class="panel spread"><div><span class="eyebrow">${combined?'COMBINED SESSION':sessionClientIds(ss)?'GROUP CONDITIONING':'CONDITIONING SESSION'}</span><h2>${esc(clientNamesOf(cid,ss))} · ${esc(w.name||'Conditioning')}</h2><p class="small muted">${combined?'Strength and conditioning stay in the same workout session.':'Run each timed block, then complete the session to save it to client history.'}</p></div><button class="btn ghost" id="leaveConditioningWorkout">${combined?'Return to strength':'Back to profile (keep session)'}</button></div>
    <section class="session-timer panel" aria-label="Workout session and rest timers"><div class="session-clock-block"><span class="timer-kicker">SESSION</span><strong id="sessionClock" class="session-clock num">00:00:00</strong><span id="exerciseProgress" class="timer-caption"></span></div><div class="rest-clock-block"><div class="rest-clock-title"><span class="timer-kicker">REST</span></div><button type="button" id="restClock" class="rest-clock rest-clock-edit num" role="timer" aria-label="Edit rest timer duration">01:30</button><div class="rest-controls"><button type="button" class="btn btn-light" id="restToggle">Start 90s</button><button type="button" class="btn btn-light" id="restReset" aria-label="Reset rest timer to 90 seconds">Reset</button></div></div></section>
    ${w.warmup?`<section class="conditioning-bookend"><span class="conditioning-section-mark">WUP</span><div><h3>Warm-up</h3><p>${esc(w.warmup).replace(/\n/g,'<br>')}</p></div></section>`:''}
     <section class="conditioning-timer panel"><div class="conditioning-timer-config"><div><span class="timer-kicker">${esc(conditioningModeName(blocks[selected]?.mode||''))}</span><h3>${esc(blocks[selected]?.name||'Conditioning timer')}</h3></div><label class="field"><span>Block</span><select id="conditioningTimerBlock" ${ss.completed?'disabled data-locked="1"':(conditioningTimerBusy()?'disabled':'')}>${options||'<option value="">No blocks</option>'}</select></label></div>
       ${ss.completed?'<p class="conditioning-session-complete-note">Conditioning complete. Review the block summary, then save this session.</p>':''}
       <div class="conditioning-timer-display"><span id="conditioningTimerPhase">${ss.completed?'Complete':'Ready'}</span><strong id="conditioningTimerClock" class="num">${ss.completed?'✓':'00:00'}</strong><span id="conditioningTimerRound">${blocks.length?'Ready when you are':'Add a block to begin'}</span><span id="conditioningTimerExercise" class="conditioning-timer-exercise"></span></div>
       <div class="row tight conditioning-timer-actions"><button class="btn primary" id="conditioningTimerStart" ${blocks.length&&!ss.completed?'':'disabled'}>Start block</button><button class="btn ghost" id="conditioningTimerPause" disabled>Pause</button><button class="btn ghost" id="conditioningTimerRoundDone" hidden>Complete round</button><button class="btn ghost" id="conditioningTimerFinish" disabled>Finish block</button></div>
       ${blocks.length>1?'<p class="small muted" style="text-align:center">Choose the next block above when this one is complete.</p>':''}</section>
    ${conditioningResultsPanelHTML(ss,blocks)}
    ${w.finisher?`<section class="conditioning-bookend conditioning-finisher"><span class="conditioning-section-mark">FIN</span><div><h3>Finisher</h3><p>${esc(w.finisher).replace(/\n/g,'<br>')}</p></div></section>`:''}
     <div class="panel spread"><span class="small muted">${ss.completed?(combined?'Add this completed conditioning block to the strength workout.':'Save this conditioning session or continue to the normal program.'):combined?'Conditioning will be added to the strength workout log.':'Add the client’s normal workout now, or complete conditioning and save it when ready.'}</span><div class="row tight">${!combined?`<button class="btn ghost" id="addNormalProgram">${ss.completed?'Go to normal program':'Add normal program'}</button>`:''}<button class="btn primary" id="completeConditioningWorkout">${ss.completed?'Save session':combined?'Finish conditioning':'Complete conditioning session'}</button></div></div>`;
}

