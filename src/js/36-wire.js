/* ============================ WIRING ============================ */
function wire(){
  const m = document.getElementById('main');

  m.querySelectorAll('[data-switch-session]').forEach(b => b.onclick = () => switchSession(b.dataset.switchSession));
  m.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { parkWorkout(); S.sub = b.dataset.sub; S.sel = {}; render(); });
  m.querySelectorAll('[data-dsec]').forEach(b => b.onclick = () => { S.dataSection = b.dataset.dsec; render({ keepScroll:false }); const again = document.querySelector('[data-dsec="' + b.dataset.dsec + '"]'); if (again) again.focus({ preventScroll:true }); });
  m.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { goTo(el.dataset.go); render(); });
  m.querySelectorAll('[data-back]').forEach(el => el.onclick = () => {
    if (el.dataset.back === 'day') delete S.sel.historyDay;
    else if (el.dataset.back === 'panel') delete S.sel.clientPanel;
    else if(el.dataset.back==='programs'){flushProgramEditor();S.view='programs';S.sel={programsKind:'strength'};}
    else S.sel = {};
    render();
  });
  m.querySelectorAll('[data-client]').forEach(el => el.onclick = () => {
    const cid=el.dataset.client;
    if(sessionFor(cid)){resumeParkedWorkout(sessionKey(sessionFor(cid)));return;}
    S.sel = { client: cid }; render();
  });
  m.querySelectorAll('[data-clientmode]').forEach(el => el.onclick = () => { S.sel.clientPanel = el.dataset.clientmode; render(); });
  m.querySelectorAll('[data-viewprogress]').forEach(el => el.onclick = () => { parkWorkout(); S.view = 'history'; S.sel = { historyClient: el.dataset.viewprogress }; render(); });
  m.querySelectorAll('[data-program]').forEach(el => el.onclick = () => { S.sel = { programsKind:'strength', program: el.dataset.program }; render(); });
  m.querySelectorAll('[data-open-conditioning]').forEach(el => el.onclick = () => { S.view='programs'; S.sel={programsKind:'conditioning',conditioningId:el.dataset.openConditioning,conditioningDraft:null}; render(); });
  m.querySelectorAll('[data-program-kind]').forEach(el=>el.onclick=()=>{const kind=el.dataset.programKind;S.view='programs';S.sel=kind==='chooser'?{}:{programsKind:kind};render();});
   m.querySelectorAll('[data-start-workout]').forEach(el => el.onclick = e => {
     e.stopPropagation();
     const cid=el.dataset.startWorkout;
     const dlg=dialog('Log session',`<p class="small muted">Choose how this session should begin.</p><div class="grid start-workout-choices"><button type="button" class="card program-kind-card" id="startNormalProgram"><span class="program-kind-icon">↗</span><strong>Normal program</strong><span class="small muted">Start the client’s strength workout.</span></button><button type="button" class="card program-kind-card" id="startConditioningProgram"><span class="program-kind-icon">◷</span><strong>Conditioning program</strong><span class="small muted">Choose a conditioning template and start conditioning on its own.</span></button></div>`,[{label:'Cancel'}]);
     dlg.querySelector('#startNormalProgram').onclick=()=>{dlg.close();beginClientWorkout(cid,'strength');};
      dlg.querySelector('#startConditioningProgram').onclick=()=>openConditioningChooser(cid);
   });
  // Today: tap (or Enter/Space on) a client card for quick actions.
  m.querySelectorAll('[data-today-client]').forEach(card=>{
    card.onclick=()=>openTodayActions(card.dataset.todayClient);
    card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openTodayActions(card.dataset.todayClient);}};
  });

  /* Today's group-filter dropdown was removed — it now auto-lists expected pairings */

  /* ---- calendar ---- */
  m.querySelectorAll('[data-mon]').forEach(b => b.onclick = () => {
    const step = Number(b.dataset.mon);
    if (step === 0){ S.sel.month = todayISO().slice(0,7); S.sel.day = todayISO(); }
    else {
      const [Y,M] = (S.sel.month || todayISO().slice(0,7)).split('-').map(Number);
      const d = new Date(Y, M - 1 + step, 1);
      S.sel.month = isoOf(d).slice(0,7);
      // Select the day the panel will actually show, so attendance buttons can never fall back to today.
      S.sel.day = S.sel.month === todayISO().slice(0,7) ? todayISO() : S.sel.month + '-01';
    }
    render();
  });
  m.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { S.sel.day = b.dataset.day; render(); });
  m.querySelectorAll('[data-att]').forEach(b => b.onclick = async () => {
    const [cid, status, gid, date] = b.dataset.att.split('|');
    const iso = date || S.sel.day || todayISO();
    const existing = attFor(iso, cid);
    const next = (existing && existing.status === status) ? '' : status;
    await setAttendance(iso, cid, next, gid);
    const c = S.clients[cid];
    if (next === 'attended' && c.packTotal && sessionsLeft(c) === 0) toast(c.name + ' has now used the last session in the pack');
    render();
  });
  m.querySelectorAll('[data-skip]').forEach(b => b.onclick = async () => {
    const [kind, key, date] = b.dataset.skip.split('|');
    if (!(await skipOccurrence(key, kind, date))) return;
    render();
    undoToast('Skipped ' + date, async () => { await restoreOccurrence(date, key); render(); });
  });
  m.querySelectorAll('[data-move]').forEach(b => b.onclick = () => { const [kind, key, date] = b.dataset.move.split('|'); moveOccurrenceDialog(kind, key, date); });
  m.querySelectorAll('[data-restore-skip]').forEach(b => b.onclick = async () => { const [date, key] = b.dataset.restoreSkip.split('|'); await restoreOccurrence(date, key); render(); });
  m.querySelectorAll('[data-remove-oneoff]').forEach(b => b.onclick = async () => {
    const id = b.dataset.removeOneoff, prev = S.schedule[id]; if (!prev) return;
    try { await Store.del('schedule', id); } catch(e){ showSaveError(e); return; }
    delete S.schedule[id]; render();
    undoToast('Session removed', async () => { try { await Store.put('schedule', id, prev); S.schedule[id] = prev; } catch(e){ showSaveError(e); } render(); });
  });
  const addSessionBtn = document.getElementById('addSessionBtn');
  if (addSessionBtn) addSessionBtn.onclick = () => scheduleSessionDialog(addSessionBtn.dataset.date || S.sel.day || todayISO());
  const adhocBtn = document.getElementById('adhocBtn');
  if (adhocBtn) adhocBtn.onclick = async () => {
    const cid = val('adhoc'); if (!cid) return;
    await setAttendance(adhocBtn.dataset.date || S.sel.day || todayISO(), cid, 'attended', S.clients[cid].groupId || '');
    render();
  };
  m.querySelectorAll('[data-logdate]').forEach(b => b.onclick = () => {
    const [cid, iso] = b.dataset.logdate.split('|');
    archiveParkedWorkoutBeforeStartingAnother(cid);
    const back = S.sub;
    const dayIndex = nextDayIndex(cid);
    S.sel = { logClient: cid, dayIndex, draft: buildDraft(cid, dayIndex), backTo: back };
    S.sel.draft.date = iso;
    render();
  });

  const dp = document.getElementById('dayPick');
  if (dp) dp.onchange = () => {
    const old=S.sel.draft, next=buildDraft(S.sel.logClient,Number(dp.value));
    const oldEntries=old.entries||[],used=new Set();
    next.entries=next.entries.map(entry=>{
      const at=oldEntries.findIndex((prior,index)=>!used.has(index)&&String(prior.exId)===String(entry.exId));
      if(at<0)return entry;used.add(at);const prior=oldEntries[at];
      return {...entry,...prior,targetSets:entry.targetSets,targetReps:entry.targetReps,targetLoad:entry.targetLoad,targetRPE:entry.targetRPE,targetRest:entry.targetRest,sets:prior.sets.map((set,index)=>({...set,lastWeight:entry.sets[index]?.lastWeight??set.lastWeight,lastReps:entry.sets[index]?.lastReps??set.lastReps}))};
    });
    oldEntries.forEach((entry,index)=>{if(!used.has(index))next.entries.push(entry);});
    next.id=old.id; next.startedAt=old.startedAt; next.date=old.date;
    next.restRemainingMs=old.restRemainingMs; next.restRunning=old.restRunning; next.restEndAt=old.restEndAt;
    next.restDurationSeconds=old.restDurationSeconds;next.restDurationManuallySet=old.restDurationManuallySet;next.autoRestAfterSet=old.autoRestAfterSet;next.notes=old.notes;next.usePack=old.usePack;next.focusedExerciseIndex=old.focusedExerciseIndex;
    next.conditioningTemplateId=old.conditioningTemplateId;next.conditioningSession=old.conditioningSession;next.conditioningInProgress=old.conditioningInProgress;next.strengthCompletedAt=old.strengthCompletedAt;
    if(old.conditioningTemplateId||old.conditioningInProgress||old.conditioningSession)next.strengthCompletedAt=Date.now();
    S.sel.dayIndex=Number(dp.value); S.sel.draft=next; render();
  };

  /* ---- logging ---- */
  const openSessionConditioning=document.getElementById('openSessionConditioning');
  if(openSessionConditioning)openSessionConditioning.onclick=()=>{
    const d=S.sel.draft,cid=S.sel.logClient,options=Object.entries(S.conditioning).map(([id,w])=>`<option value="${esc(id)}" ${d.conditioningTemplateId===id?'selected':''}>${esc(w.name||'Conditioning program')}</option>`).join('');if(!options)return;
    dialog('Add conditioning block',`<label class="field"><span>Choose a conditioning template</span><select id="sessionConditioningProgram">${options}</select></label><p class="small muted">Your normal workout stays in this session while the conditioning timer is open.</p>`,[
      {label:'Cancel'},
      {label:'Start conditioning',kind:'primary',onClick:()=>{const templateId=val('sessionConditioningProgram');if(!templateId)return false;startSessionConditioning(templateId);}}
    ]);
  };
  // The program day's own conditioning template: one tap, no template question.
  const startDayConditioning=document.getElementById('startDayConditioning');
  if(startDayConditioning)startDayConditioning.onclick=()=>startSessionConditioning(startDayConditioning.dataset.template);
  const restToggle=document.getElementById('restToggle');
  if(restToggle) restToggle.onclick=toggleRest;
  const restReset=document.getElementById('restReset');
  const restClock=document.getElementById('restClock');
  if(restClock)restClock.onclick=()=>{
    const d=S.sel?.draft||S.parkedWorkout?.draft||S.sel?.conditioningSession;if(!d)return;
    const current=Number(d.restDurationSeconds)||90,dlg=dialog('Adjust rest time',`<p class="small muted">Set the rest timer length. The next completed set will use this duration.</p><div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem"><label class="field"><span>Minutes</span><input id="restEditMinutes" type="number" min="0" max="99" inputmode="numeric" value="${Math.floor(current/60)}"></label><label class="field"><span>Seconds</span><input id="restEditSeconds" type="number" min="0" max="59" inputmode="numeric" value="${current%60}"></label></div>`,[
      {label:'Cancel'},
      {label:'Save rest time',kind:'primary',onClick:()=>{const minutes=Number(dlg.querySelector('#restEditMinutes').value)||0,seconds=Number(dlg.querySelector('#restEditSeconds').value)||0,total=minutes*60+seconds;if(seconds>59||total<1){toast('Enter a rest time of at least 1 second');return false;}d.restDurationManuallySet=true;d.restDurationSeconds=total;d.restRemainingMs=total*1000;if(d.restRunning)d.restEndAt=Date.now()+d.restRemainingMs;updateWorkoutTimerUI();scheduleWorkoutAutosave();}}
    ]);dlg.querySelector('#restEditMinutes').focus();
  };
  if(restReset) restReset.onclick=()=>{const d=S.sel.draft||(S.parkedWorkout&&S.parkedWorkout.draft)||(S.sel.conditioningClient&&S.sel.conditioningSession);if(!d)return;d.restDurationSeconds=Number(d.restDurationSeconds)||90;d.restRemainingMs=d.restDurationSeconds*1000;d.restRunning=false;d.restEndAt=null;updateWorkoutTimerUI();scheduleWorkoutAutosave();};
  m.querySelectorAll('[data-set-type]').forEach(button=>button.onclick=()=>{
    const ei=Number(button.dataset.setType),entry=S.sel.draft?.entries?.[ei];if(!entry)return;
    button.closest('details')?.removeAttribute('open');
    const setTypes=[['warmup','Warm-up'],['rampup','Ramp-up'],['working','Working set'],['backoff','Back-off'],['amrap','AMRAP / top set']];
    const fields=entry.sets.map((set,si)=>`<label><span>Set ${si+1} type</span><select data-edit-set-type="${si}">${setTypes.map(([value,label])=>`<option value="${value}" ${set.setType===value?'selected':''}>${label}</option>`).join('')}</select></label>`).join('');
    const dlg=dialog(`${entry.name} · set type`,`<div class="set-note-editor">${fields||'<p class="small muted">Add a set to choose its type.</p>'}</div>`,[
      {label:'Cancel'},
      {label:'Save types',kind:'primary',onClick:()=>{dlg.querySelectorAll('[data-edit-set-type]').forEach(select=>{entry.sets[Number(select.dataset.editSetType)].setType=select.value;});markStrengthActivity();render();}}
    ]);
  });
  m.querySelectorAll('[data-set-notes]').forEach(button=>button.onclick=()=>{
    const ei=Number(button.dataset.setNotes),entry=S.sel.draft?.entries?.[ei];if(!entry)return;
    button.closest('details')?.removeAttribute('open');
    const fields=entry.sets.map((set,si)=>`<label><span>Set ${si+1} note</span><textarea data-edit-set-note="${si}" placeholder="Optional note">${esc(set.note||'')}</textarea></label>`).join('');
    const dlg=dialog(`${entry.name} · set notes`,`<div class="set-note-editor">${fields||'<p class="small muted">Add a set to write a note.</p>'}</div>`,[
      {label:'Cancel'},
      {label:'Save notes',kind:'primary',onClick:()=>{dlg.querySelectorAll('[data-edit-set-note]').forEach(input=>{entry.sets[Number(input.dataset.editSetNote)].note=input.value;});markStrengthActivity();render();}}
    ]);
  });
  m.querySelectorAll('.exblock').forEach(block => {
    const ei = Number(block.dataset.ei);
    block.querySelectorAll('.setrow').forEach(row => {
      const si = Number(row.dataset.si);
      const setInputs=[...row.querySelectorAll('[data-set-input]'),...(row.closest('.set-swipe-wrap')?.nextElementSibling?.querySelectorAll('[data-set-input]')||[])];
      const setBox=field=>row.querySelector(`[data-set-input="${field}"]`);
      setInputs.forEach(inp=>{
        const field=inp.dataset.setInput;
        // Typing only records the value; the set completes when the coach finishes entering (change / Enter).
        const read=()=>{const value=inp.value;let parsed=value;
          if(['weight','reps','actualRPE'].includes(field))parsed=value===''?null:Number(value);
          else if(field==='actualRIR')parsed=value===''?null:(value==='5+'?'5+':Number(value));
          S.sel.draft.entries[ei].sets[si][field]=parsed;markStrengthActivity();
        };
        const finish=()=>{read();const set=S.sel.draft.entries[ei].sets[si];
          if((field==='weight'||field==='reps')&&set.weight!=null&&set.reps!=null&&!set.done)completeWorkoutSet(ei,si);
        };
        if(inp.tagName==='SELECT')inp.onchange=read;
        else{
          inp.oninput=read;inp.onchange=finish;
          if(field==='weight'||field==='reps')inp.onkeydown=event=>{
            if(event.key!=='Enter')return;event.preventDefault();read();
            const set=S.sel.draft.entries[ei].sets[si];
            if(field==='weight'){const reps=setBox('reps');reps?.focus();try{reps?.select();}catch{}return;}
            if(set.weight==null){const kg=setBox('weight');kg?.focus();return;}   // reps typed, kg still empty
            if(set.reps!=null&&!set.done)completeWorkoutSet(ei,si,{advance:true});
            inp.blur();   // closes the phone keyboard for the rest period
          };
        }
      });
      const tick = row.querySelector('[data-done]');
      if (tick) tick.onclick = () => {
        const s = S.sel.draft.entries[ei].sets[si];
        if(s.done){s.done=false;row.classList.remove('done');tick.textContent='';tick.setAttribute('aria-label',`Mark set ${si+1} complete`);tick.setAttribute('aria-pressed','false');updateWorkoutTimerUI();markStrengthActivity();return;}
        // ✓ on an empty set = "same as last time": fill from the numbers shown in Previous.
        const prev=previousSetValues(ei,si);
        if(s.weight==null&&prev.weight!=null)s.weight=prev.weight;
        if(s.reps==null&&prev.reps!=null)s.reps=prev.reps;
        if(s.reps==null){toast('Enter kg and reps');setBox(s.weight==null?'weight':'reps')?.focus();return;}
        // reps but no weight and no previous weight: a bodyweight set, so complete it as is.
        const kg=setBox('weight'),reps=setBox('reps');if(kg)kg.value=s.weight??'';if(reps)reps.value=s.reps??'';
        completeWorkoutSet(ei,si,{advance:true});
      };
      let swipe=null;
      row.onpointerdown=event=>{if(event.pointerType==='mouse'&&event.button!==0)return;if(event.target.closest('button,select,textarea,summary,input'))return;swipe={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,active:false};};
      row.onpointermove=event=>{if(!swipe||swipe.id!==event.pointerId)return;const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;if(!swipe.active&&Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.2){swipe.active=true;row.classList.add('swiping');try{row.setPointerCapture(event.pointerId);}catch{}}
        if(!swipe.active)return;event.preventDefault();swipe.dx=Math.max(-row.clientWidth*.78,Math.min(row.clientWidth*.78,dx));row.style.transform=`translateX(${swipe.dx}px)`;row.closest('.set-swipe-wrap')?.classList.toggle('swipe-copying',swipe.dx>0);row.closest('.set-swipe-wrap')?.classList.toggle('swipe-deleting',swipe.dx<0);};
      const finishSwipe=event=>{if(!swipe||swipe.id!==event.pointerId)return;const state=swipe;swipe=null;row.classList.remove('swiping');row.style.transform='';const wrap=row.closest('.set-swipe-wrap');wrap?.classList.remove('swipe-copying','swipe-deleting');if(!state.active)return;const threshold=Math.max(90,row.clientWidth*.65),entry=S.sel.draft.entries[ei];
        if(state.dx<=-threshold)deleteSetAt(ei,si);
        else if(state.dx>=threshold)copyPreviousSet(ei,si);
      };
      row.onpointerup=finishSwipe;row.onpointercancel=finishSwipe;row.onlostpointercapture=()=>{if(swipe){swipe=null;row.classList.remove('swiping');row.style.transform='';row.closest('.set-swipe-wrap')?.classList.remove('swipe-copying','swipe-deleting');}};
    });
  });
  m.querySelectorAll('[data-addset]').forEach(b => b.onclick = () => {
    const entry = S.sel.draft.entries[Number(b.dataset.addset)];
    const idx = entry.sets.length;
    const { last } = exerciseHistory(S.sel.draft.clientId, entry.exId);
    entry.sets.push({ weight:null, reps:null, done:false,actualRPE:null,actualRIR:null,setType:'working',note:'',
      lastWeight: last && last.sets[idx] ? last.sets[idx].weight : null,
      lastReps: last && last.sets[idx] ? last.sets[idx].reps : null });
    markStrengthActivity();
    render();
  });
  m.querySelectorAll('[data-copy-prev]').forEach(b => b.onclick = () => { const [ei,si]=b.dataset.copyPrev.split('.').map(Number); copyPreviousSet(ei,si); });
  m.querySelectorAll('[data-delete-set]').forEach(b => b.onclick = () => { const [ei,si]=b.dataset.deleteSet.split('.').map(Number); deleteSetAt(ei,si); });
  m.querySelectorAll('[data-rmex]').forEach(b => b.onclick = () => {
    const entries=S.sel.draft.entries,index=Number(b.dataset.rmex),entry=entries[index];if(!entry)return;
    // Remember the superset partners so Undo can put the group back together.
    const partners=entry.groupId?entries.filter(x=>x!==entry&&x.groupId===entry.groupId):[],was={groupId:entry.groupId,groupType:entry.groupType};
    clearExerciseGroup(entries,entry);entries.splice(index,1);markStrengthActivity();render();
    undoToast(`${entry.name} removed`,()=>{
      if(!S.sel.draft||S.sel.draft.entries!==entries)return;
      entries.splice(Math.min(index,entries.length),0,entry);
      if(was.groupId)[entry,...partners].forEach(x=>{if(entries.includes(x)){x.groupId=was.groupId;x.groupType=was.groupType;}});
      markStrengthActivity();render();
    });
  });
  m.querySelectorAll('[data-session-group]').forEach(button=>button.onclick=()=>{
    const entries=S.sel.draft.entries,index=Number(button.dataset.ei),type=button.dataset.sessionGroup;if(!entries[index])return;
    groupExercisesDialog('Create '+type,entries,index,type==='superset'?2:3,type,async indexes=>{
      assignExerciseGroup(entries,indexes,type);markStrengthActivity();render();
    });
  });
  m.querySelectorAll('[data-replace-session]').forEach(button=>button.onclick=()=>{
    const index=Number(button.dataset.replaceSession),entry=S.sel.draft.entries[index];if(!entry)return;
    const options=activeExercises().slice().sort(byName).map(ex=>`<option value="${esc(ex.id)}" ${ex.id===entry.exId?'selected':''}>${esc(ex.name)}</option>`).join('');
    dialog('Replace exercise',`<label class="field"><span>Choose replacement</span><select id="replacementExercise">${options}</select></label>`,[
      {label:'Cancel'},
      {label:'Replace',kind:'primary',onClick:()=>{
        const replacement=val('replacementExercise');if(!replacement)return false;
        const {last,best}=exerciseHistory(S.sel.draft.clientId,replacement);
        entry.exId=replacement;entry.name=exName(replacement);entry.lastDate=last?.date||null;entry.best=best;entry.target='';entry.targetSets='';entry.targetReps='';entry.targetLoad='';entry.targetRPE='';entry.targetRest='90s';
        entry.sets=entry.sets.map((set,setIndex)=>({weight:null,reps:null,done:false,actualRPE:null,actualRIR:null,setType:'working',note:'',lastWeight:last?.sets?.[setIndex]?.weight??null,lastReps:last?.sets?.[setIndex]?.reps??null}));
        markStrengthActivity();render();
      }}
    ]);
  });
  const addExBtn = document.getElementById('addExBtn');
  if (addExBtn) addExBtn.onclick = () => exercisePicker('Add exercise to workout',async chosen=>{
    const id=chosen;
    const { last, best } = exerciseHistory(S.sel.draft.clientId, id);
    S.sel.draft.entries.push({ exId:id, name:exName(id), target:'',targetSets:'',targetReps:'',targetLoad:'',targetRPE:'',targetRest:'90s', lastDate: last ? last.date : null, best,
      sets:[{ weight:null, reps:null, done:false,actualRPE:null,actualRIR:null,setType:'working',note:'', lastWeight: last && last.sets[0] ? last.sets[0].weight : null, lastReps: last && last.sets[0] ? last.sets[0].reps : null }] });
    markStrengthActivity();
    render();
  });
  m.querySelectorAll('[data-adjust-set]').forEach(button=>button.onclick=()=>{
    // "4.1.weight.2.5": the step itself may contain a decimal point, so re-join everything after the field.
    const [ei,si,field,...deltaParts]=button.dataset.adjustSet.split('.'),delta=deltaParts.join('.'),entry=S.sel.draft.entries[Number(ei)],set=entry?.sets[Number(si)];if(!set)return;
    const previous=exerciseHistory(S.sel.draft.clientId,entry.exId).last?.sets?.[Number(si)],raw=set[field]??(field==='weight'?(set.lastWeight??previous?.weight):(set.lastReps??previous?.reps)),base=Number(raw);
    if(!Number.isFinite(base)){toast('Enter a value or copy the previous set first');return;}
    set[field]=Math.max(0,Number((base+Number(delta)).toFixed(2)));markStrengthActivity();render();
  });
  const notesBanner = document.getElementById('clientNotesBanner');
  if (notesBanner) notesBanner.ontoggle = () => { S.sel.notesCollapsed = !notesBanner.open; };
  const sn = document.getElementById('sessNotes');
  if (sn) sn.oninput = () => {S.sel.draft.notes = sn.value;markStrengthActivity();};
  const up = document.getElementById('usePack');
  if (up) up.onchange = () => {S.sel.draft.usePack = up.checked;scheduleWorkoutAutosave();};

  const editDate=document.getElementById('editDate');
  if(editDate) editDate.onchange=()=>{if(editDate.value){S.sel.draft.date=editDate.value;markStrengthActivity();}else editDate.value=S.sel.draft.date;};
  const cancelSession=document.getElementById('cancelSession');
  if(cancelSession) cancelSession.onclick=()=>{
    const editing=!!S.sel.draft?.editing,cid=S.sel.draft?.clientId,logId=S.sel.draft?.id;
    dialog(editing?'Discard your changes?':'Cancel this session?',editing?'<p>The saved session stays exactly as it was before you started editing.</p>':'<p>Your unsaved workout entries will be discarded.</p>',[
      {label:editing?'Keep editing':'Keep workout'},
      {label:editing?'Discard changes':'Discard workout',kind:'danger',onClick:async()=>{
        await clearWorkoutAutosave();S.parkedWorkout=null;
        if(editing&&S.logs[logId]){S.view='history';S.sel={historyClient:cid,historyDay:logId};}else S.sel={};
        render();
      }}
    ]);
  };

  const saveSess = document.getElementById('saveSess');
  if (saveSess) saveSess.onclick = async () => {
    const d = S.sel.draft;
    if(d.conditioningTemplateId&&!d.conditioningSession){toast('Finish the conditioning part before saving this combined session');return;}
    const clean = { ...d, entries: d.entries.map(e => ({ exId:e.exId, name:e.name, ...(e.groupId?{groupId:e.groupId,groupType:e.groupType}:{}),target:e.target||'',targetSets:e.targetSets||'',targetReps:e.targetReps||'',targetLoad:e.targetLoad||'',targetRPE:e.targetRPE||'',targetRIR:e.targetRIR||'',targetTempo:e.targetTempo||'',targetNotes:e.targetNotes||'',targetRest:e.targetRest||'',
      sets: e.sets.map((s,index)=>{const n={...ensureSetDefaults({...s}),setNumber:index+1};delete n.lastWeight;delete n.lastReps;return n;}).filter(s => s.weight != null || s.reps != null || s.actualRPE!=null || s.actualRIR!=null || s.note || s.done) })).filter(e => e.sets.length) };
    if (!clean.entries.length && !clean.notes && !clean.conditioningSession){ toast('Nothing to save yet'); return; }
    // Same id every time this workout is saved: a repeat save overwrites instead of duplicating.
    // (Workouts started before this change get their id here; it's kept on the draft.)
    const id = d.id || (d.id = uid());
    delete clean.id;
    const orig = d.editing ? (d.editOriginal || {}) : null;
    let moveAttendanceFrom = null;
    if (orig){
      // Editing keeps the original save time and duration, and doesn't touch attendance...
      if (orig.completedAt != null) clean.completedAt = orig.completedAt; else delete clean.completedAt;
      if (orig.durationSeconds !== undefined) clean.durationSeconds = orig.durationSeconds; else delete clean.durationSeconds;
      // ...unless the date changed and that day's attendance belongs to this session alone.
      const rec = orig.date && d.date !== orig.date ? S.attendance[attId(orig.date, d.clientId)] : null;
      const otherSameDay = Object.entries(S.logs).some(([lid,l]) => lid !== id && l.clientId === d.clientId && l.date === orig.date);
      if (rec && rec.status === 'attended' && !otherSameDay){
        const niceOld = new Date(orig.date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'}), niceNew = new Date(d.date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'});
        const choice = await askChoice('Move attendance too?', `<p>You changed this session's date from <strong>${esc(niceOld)}</strong> to <strong>${esc(niceNew)}</strong>. Should the "attended" mark move to the new date as well?</p>`, [
          {label:'Cancel', value:'cancel'}, {label:'Keep attendance where it is', value:'keep'}, {label:'Move attendance', value:'move', kind:'primary'}]);
        if (!choice || choice === 'cancel') return;
        if (choice === 'move') moveAttendanceFrom = rec;
      }
    } else {
      clean.completedAt=Date.now();
      clean.durationSeconds=d.startedAt?Math.max(0,Math.floor((clean.completedAt-Number(d.startedAt))/1000)):null;
    }
    const mark = !orig && clean.usePack !== false;
    delete clean.editing; delete clean.editOriginal;
    delete clean.usePack; delete clean.backTo;
    delete clean.conditioningTemplateId; delete clean.conditioningInProgress; delete clean.dayConditioningId;
    delete clean.startedAt; delete clean.restRemainingMs; delete clean.restRunning; delete clean.restEndAt;
    delete clean.restDurationSeconds;delete clean.restDurationManuallySet;delete clean.autoRestAfterSet;delete clean.focusedExerciseIndex;
    // Store first. If it fails, the workout stays open and its recovery copy is kept.
    try { await Store.put('logs', id, clean); }
    catch(e){ showSaveError(e); return; }
    S.logs[id] = clean; invalidateLogIndex(); await clearWorkoutAutosave();
    const c = S.clients[d.clientId];
    if (orig){
      let note = 'Changes saved';
      if (moveAttendanceFrom){
        try { await setAttendance(orig.date, d.clientId, '', moveAttendanceFrom.groupId || ''); await setAttendance(d.date, d.clientId, 'attended', moveAttendanceFrom.groupId || ''); note = 'Changes saved and attendance moved'; }
        catch(e){ showSaveError(e); note = 'Changes saved — attendance was NOT moved'; }
      }
      toast(note);
      S.parkedWorkout = null; S.view = 'history'; S.sel = { historyClient: d.clientId, historyDay: id };
      render(); return;
    }
    if (mark){
      let attendanceSaved = true;
      try { await setAttendance(d.date, d.clientId, 'attended', (c && c.groupId) || ''); }
      catch(e){ attendanceSaved = false; showSaveError(e); }
      if (!attendanceSaved) toast('Session saved — attendance was NOT recorded');
      else if (c && c.packTotal){
        toast('Session saved');
      } else toast('Session saved and marked attended');
    } else toast('Session saved');
    await maybeAdvanceWeek(d.clientId);
    const back = S.sel.backTo;
    S.sel = {}; S.parkedWorkout = null; if (back) S.sub = back;
    render();
    showPrSummary(id);
  };
  if (saveSess) saveSess.onclick = guardedClick(saveSess, saveSess.onclick, 'Saving…');

  /* ---- clients ---- */
  const nc = document.getElementById('newClient');
  if (nc) nc.onclick = () => dialog('Add client',
    `<label class="field"><span>Name</span><input type="text" id="n_name" autofocus></label>
     <label class="field"><span>Goal</span><input type="text" id="n_goal" placeholder="Get stronger, lose fat, return from injury…"></label>
     <div class="inline-fields">
       <label class="field"><span>Phone</span><input type="tel" id="n_phone"></label>
       <label class="field"><span>Email</span><input type="email" id="n_email"></label>
     </div>
     <div class="inline-fields">
       <label class="field"><span>Program</span><select id="n_program"><option value="">No program</option>${Object.entries(S.programs).map(([id,p]) => `<option value="${esc(id)}">${esc(p.name)}</option>`).join('')}</select></label>
       <label class="field"><span>Pairing</span><select id="n_group"><option value="">No pairing</option>${Object.entries(S.groups).map(([id,g]) => `<option value="${esc(id)}">${esc(g.name)}</option>`).join('')}</select></label>
       <label class="field"><span>Sessions in pack</span><input type="number" id="n_pack" min="0" value="0"></label>
     </div>
     <label class="field"><span>Notes — injuries, preferences</span><textarea id="n_notes"></textarea></label>`,
    [{label:'Cancel'},{label:'Add', kind:'primary', onClick: async () => {
      const name = val('n_name'); if (!name){ toast('Name is required'); return false; }
      const id = uid();
      const groupId = val('n_group');
      if (groupId && groupMembers(groupId).length >= 2){ toast('That pairing already has 2 clients'); return false; }
      const c = { name, goal: val('n_goal'), phone: val('n_phone'), email: val('n_email'), programId: val('n_program'), groupId, notes: val('n_notes'), packTotal: numVal('n_pack')||0,
                  packOffset:0, currentWeek:1, status:'active', createdAt: todayISO() };
      try { await Store.put('clients', id, c); } catch(e){ showSaveError(e); return false; }
      S.clients[id] = c; render();
    }}]);

  const sc = document.getElementById('saveClient');
  if (sc) sc.onclick = async () => {
    const cid = S.sel.client, c = S.clients[cid];
    const recurDow = [...document.querySelectorAll('.c_recurdow:checked')].map(i => Number(i.value));
    const chosenGroup = val('c_group');
    if (chosenGroup && chosenGroup !== c.groupId && groupMembers(chosenGroup).filter(m => m.id !== cid).length >= 2){
      toast('That pairing already has 2 clients — remove one first'); return;
    }
    const consent = readConsentFields(c); if (consent === null) return;   // consent is required before saving changes
    const next = { ...c, ...(consent ? { consent } : {}),
      name: val('c_name') || c.name, phone: val('c_phone'), email: val('c_email'), goal: val('c_goal'),
      groupId: val('c_group'), programId: val('c_program'), currentWeek: numVal('c_week') || 1,
      recurDow, recurTime: timeFieldVal('c_recurtime'),
      packTotal: numVal('c_packTotal') || 0, packOffset: numVal('c_packOffset') || 0,
      status: val('c_status'), notes: val('c_notes')
    };
    const dowKey = a => JSON.stringify([...(a || [])].sort());
    if (dowKey(recurDow) !== dowKey(c.recurDow)) next.recurFrom = todayISO();
    if ((next.groupId || '') !== (c.groupId || '')) next.groupFrom = todayISO();
    const autoWeek = document.getElementById('c_autoweek'); if (autoWeek) next.autoWeek = autoWeek.checked;
    if ((next.currentWeek || 1) !== (c.currentWeek || 1) || next.programId !== c.programId) next.weekFrom = todayISO();   // sessions before this belong to an earlier week
    // On failure the form stays open with the typed values, so nothing has to be re-entered.
    try { await Store.put('clients', cid, next); } catch(e){ showSaveError(e); return; }
    S.clients[cid] = next; toast('Saved'); delete S.sel.clientPanel; render();
  };
  m.querySelectorAll('[data-dlprogram]').forEach(b => b.onclick = () => {
    const c = S.clients[b.dataset.dlprogram], p = S.programs[c.programId];
    if (p) downloadProgramPdf(p, c.name, c.currentWeek || 1);
  });
  // Stored client records don't carry their own id, so attach it — the exports look up logs and attendance by c.id.
  const clientWithId = cid => S.clients[cid] ? { id: cid, ...S.clients[cid] } : null;
  wirePrivacy(m);
  m.querySelectorAll('[data-dlsummary]').forEach(b => b.onclick = () => { const c = clientWithId(b.dataset.dlsummary); if (c) downloadClientSummaryPdf(c); });
  m.querySelectorAll('[data-dlhistory]').forEach(b => b.onclick = () => { const c = clientWithId(b.dataset.dlhistory); if (c) downloadClientHistoryXlsx(c); });

  m.querySelectorAll('[data-renew]').forEach(b => b.onclick = () => {
    const cid = b.dataset.renew, c = S.clients[cid];
    dialog('Renew pack', `<p class="small muted">Resets the used count to zero and starts counting from today. Attendance history is kept.</p>
      <label class="field"><span>Sessions in the new pack</span><input type="number" id="r_total" min="1" value="${esc(c.packTotal||10)}"></label>`,
      [{label:'Cancel'},{label:'Renew', kind:'primary', onClick: async () => {
        const next = { ...S.clients[cid], packTotal: numVal('r_total') || 10, packStart: todayISO(), packOffset: -attendedCount(cid, todayISO()) };
        try { await Store.put('clients', cid, next); } catch(e){ showSaveError(e); return false; }
        S.clients[cid] = next; toast('Pack renewed'); render();
      }}]);
  });

  m.querySelectorAll('[data-search]').forEach(inp => inp.oninput = () => { S.search[inp.dataset.search] = inp.value; render(); });
  const showArch = document.getElementById('showArchivedHistory');
  if (showArch) showArch.onchange = () => { S.search.historyArchived = showArch.checked; render(); };
  const setClientStatus = async (id, status) => {
    const next = { ...S.clients[id], status };
    try { await Store.put('clients', id, next); } catch(e){ showSaveError(e); return false; }
    S.clients[id] = next; return true;
  };
  m.querySelectorAll('[data-archiveclient]').forEach(b => b.onclick = async () => {
    const id = b.dataset.archiveclient, name = S.clients[id].name;
    if (!(await setClientStatus(id, 'archived'))) return;
    S.sel = {}; render();
    undoToast(name + ' archived — history is kept', async () => { await setClientStatus(id, 'active'); render(); });
  });
  m.querySelectorAll('[data-restoreclient]').forEach(b => b.onclick = async () => {
    if (await setClientStatus(b.dataset.restoreclient, 'active')){ toast('Restored to active'); render(); }
  });
  m.querySelectorAll('[data-delclient]').forEach(b => b.onclick = () => {
    if (assistantBlocked()) return;
    const id = b.dataset.delclient, c = S.clients[id]; if (!c) return;
    const nLogs = Object.values(S.logs).filter(l => l.clientId === id).length;
    const nAtt = attList(id).length;
    const erased = [['clients', id],
      ...Object.entries(S.logs).filter(([, l]) => l.clientId === id).map(([lid]) => ['logs', lid]),
      ...Object.entries(S.attendance).filter(([, a]) => a.clientId === id).map(([aid]) => ['attendance', aid]),
      ...Object.entries(S.schedule).filter(([, s]) => (s.clientIds || []).length === 1 && s.clientIds[0] === id).map(([sid]) => ['schedule', sid]),
      ...Object.entries(S.scheduleExceptions).filter(([, x]) => x.key === id).map(([xid]) => ['scheduleExceptions', xid])];
    dialog('Delete ' + c.name + ' permanently',
      `<p>This permanently deletes <strong>${esc(c.name)}</strong>, <strong>${nLogs}</strong> logged session${nLogs===1?'':'s'} and <strong>${nAtt}</strong> attendance mark${nAtt===1?'':'s'}. There is no undo.</p>
       <p class="small muted">This also removes them from saved sessions, the daily backups kept in this browser, and (if you use online sync) your account. Files you already exported or downloaded are not touched. Archiving instead hides them but keeps their history.</p>
       <label class="field"><span>Type their name to confirm</span><input type="text" id="del_confirm" autocomplete="off"></label>`,
      [{label:'Cancel'},{label:'Delete permanently', kind:'danger', onClick: async () => {
        if (val('del_confirm').trim().toLowerCase() !== String(c.name).trim().toLowerCase()){ toast('Type the name exactly to confirm'); return false; }
        try {
          await Store.batch(async () => {
            for (const [lid, l] of Object.entries(S.logs)) if (l.clientId === id) await Store.del('logs', lid);
            for (const [aid, a] of Object.entries(S.attendance)) if (a.clientId === id) await Store.del('attendance', aid);
            for (const [sid, s] of Object.entries(S.schedule)){
              if (!(s.clientIds||[]).includes(id)) continue;
              const rest = s.clientIds.filter(x => x !== id);
              if (rest.length) await Store.put('schedule', sid, { ...s, clientIds: rest }); else await Store.del('schedule', sid);
            }
            for (const [xid, x] of Object.entries(S.scheduleExceptions)) if (x.key === id) await Store.del('scheduleExceptions', xid);
            await Store.del('clients', id);
          });
        } catch(e){ if (!isStorageError(e)) throw e; showSaveError(e); return false; }
        for (const [lid, l] of Object.entries(S.logs)) if (l.clientId === id) delete S.logs[lid];
        for (const [aid, a] of Object.entries(S.attendance)) if (a.clientId === id) delete S.attendance[aid];
        invalidateLogIndex(); invalidateAttIndex();
        for (const [sid, s] of Object.entries(S.schedule)){
          if (!(s.clientIds||[]).includes(id)) continue;
          const rest = s.clientIds.filter(x => x !== id);
          if (rest.length) S.schedule[sid] = { ...s, clientIds: rest }; else delete S.schedule[sid];
        }
        for (const [xid, x] of Object.entries(S.scheduleExceptions)) if (x.key === id) delete S.scheduleExceptions[xid];
        delete S.clients[id]; S.sel = {};
        await scrubErasedClient(id, erased);
        toast(c.name + ' deleted from this device, its backups and your account queue'); render();
      }}]);
  });
  m.querySelectorAll('[data-dellogday]').forEach(b => b.onclick = () => dialog('Delete this session',
    '<p>This removes the logged workout permanently. There is no undo.</p>',
    [{label:'Cancel'},{label:'Delete', kind:'danger', onClick: async () => {
      const id = b.dataset.dellogday;
      try { await Store.del('logs', id); } catch(e){ showSaveError(e); return; }
      delete S.logs[id]; invalidateLogIndex(); delete S.sel.historyDay; render();
    }}]));
  m.querySelectorAll('[data-edit-session]').forEach(button=>button.onclick=()=>beginEditSession(button.dataset.editSession));
  m.querySelectorAll('[data-repeat-program]').forEach(button=>button.onclick=()=>{
    const log=S.logs[button.dataset.repeatProgram],cid=log?.clientId||S.sel.historyClient,built=log&&buildRepeatWorkoutDraft(cid,log);if(!built||!built.draft.entries.length){toast('This session has no saved exercises or matching program day to repeat');return;}
    archiveParkedWorkoutBeforeStartingAnother(cid);S.sel={logClient:cid,dayIndex:built.dayIndex,draft:built.draft};render();
  });

  /* ---- groups ---- */
  const ng = document.getElementById('newGroup');
  if (ng) ng.onclick = () => groupDialog(null);
  m.querySelectorAll('[data-group]').forEach(el => el.onclick = () => groupDialog(el.dataset.group));

  /* ---- programs ---- */
  const np = document.getElementById('newProgram');
  if (np) np.onclick = () => dialog('New program',
    `<label class="field"><span>Name</span><input type="text" id="p_new_name" placeholder="Foundation block" autofocus></label>
     <label class="field"><span>Weeks in the block</span><input type="number" id="p_new_weeks" min="1" value="4"></label>`,
    [{label:'Cancel'},{label:'Create', kind:'primary', onClick: async () => {
      const name = val('p_new_name'); if (!name){ toast('Name is required'); return false; }
      const id = uid();
      const p = { name, weeks: numVal('p_new_weeks') || 4, days: [
        { name:'Day A', items:[] }, { name:'Day B', items:[] } ] };
      try { await Store.put('programs', id, p); } catch(e){ showSaveError(e); return false; }
      S.programs[id] = p; S.sel = { programsKind:'strength', program: id }; render();
    }}]);

  m.querySelectorAll('[data-pweek]').forEach(b => b.onclick = async () => { if (!(await flushProgramEditor())) return; S.sel.progWeek = Number(b.dataset.pweek); render({ keepScroll:true }); });
  const wkReset = document.getElementById('wkReset');
  if (wkReset) wkReset.onclick = async () => {
    if (!(await flushProgramEditor())) return;
    const p = S.programs[S.sel.program], wk = Number(S.sel.progWeek) || 0; if (!p || !wk) return;
    p.days.forEach(d => (d.items || []).forEach(it => { if (it.weeks){ delete it.weeks[wk]; if (!Object.keys(it.weeks).length) delete it.weeks; } }));
    if (p.weekPlan){ delete p.weekPlan[wk]; if (!Object.keys(p.weekPlan).length) delete p.weekPlan; }
    await persistProgram(S.sel.program); toast('Week ' + wk + ' is back to the base'); render({ keepScroll:true });
  };
  const wkCopy = document.getElementById('wkCopy');
  if (wkCopy) wkCopy.onclick = async () => {
    if (!(await flushProgramEditor())) return;
    const p = S.programs[S.sel.program], wk = Number(S.sel.progWeek) || 0, src = Number(val('wkCopyFrom')); if (!p || !wk || !src) { toast('Choose a week to copy from'); return; }
    p.days.forEach(d => (d.items || []).forEach(it => {
      const from = it.weeks && it.weeks[src];
      if (from){ it.weeks[wk] = JSON.parse(JSON.stringify(from)); } else if (it.weeks){ delete it.weeks[wk]; if (!Object.keys(it.weeks).length) delete it.weeks; }
    }));
    p.weekPlan = p.weekPlan || {};
    if (p.weekPlan[src]) p.weekPlan[wk] = { ...p.weekPlan[src] }; else delete p.weekPlan[wk];
    if (!Object.keys(p.weekPlan).length) delete p.weekPlan;
    await persistProgram(S.sel.program); toast('Copied the changes from week ' + src); render({ keepScroll:true });
  };
  const pWeeks = document.getElementById('p_weeks');
  if (pWeeks && programEditorOpen()) pWeeks.addEventListener('change', async () => { if (!(await flushProgramEditor())) return; render({ keepScroll:true }); });
  const sp = document.getElementById('saveProgram');
  // Save just flushes the autosave straight away.
  if (sp) sp.onclick = async () => {
    if (!(await flushProgramEditor())) return;
    toast('Program saved'); render();
  };
  m.querySelectorAll('[data-program-group]').forEach(button=>button.onclick=()=>{
    const pid=S.sel.program,di=Number(button.dataset.di),ii=Number(button.dataset.ii),type=button.dataset.programGroup;
    const items=S.programs[pid]?.days[di]?.items;if(!items?.[ii])return;
    groupExercisesDialog('Create '+type,items,ii,type==='superset'?2:3,type,async indexes=>{
      readProgramEditor(pid,m);assignExerciseGroup(items,indexes,type);await persistProgram(pid);render();
    });
  });
  m.querySelectorAll('[data-replace-program]').forEach(button=>button.onclick=()=>{
    const pid=S.sel.program,[di,ii]=button.dataset.replaceProgram.split('.').map(Number),item=S.programs[pid]?.days[di]?.items[ii];if(!item)return;
    const options=activeExercises().slice().sort(byName).map(ex=>`<option value="${esc(ex.id)}" ${ex.id===item.exId?'selected':''}>${esc(ex.name)}</option>`).join('');
    dialog('Replace exercise',`<label class="field"><span>Choose replacement</span><select id="replacementExercise">${options}</select></label>`,[
      {label:'Cancel'},
      {label:'Replace',kind:'primary',onClick:async()=>{
        const replacement=val('replacementExercise');if(!replacement)return false;
        readProgramEditor(pid,m);S.programs[pid].days[di].items[ii].exId=replacement;
        await persistProgram(pid);render();
      }}
    ]);
  });
  m.querySelectorAll('[data-addto]').forEach(button=>button.onclick=()=>exercisePicker('Add exercise to program day',async chosen=>{
    const exId=chosen;
    const pid=S.sel.program,p=S.programs[pid],di=Number(button.dataset.addto);readProgramEditor(pid,m);
    p.days[di].items.push({exId,sets:3,reps:'8-10',load:'',rpe:'',rest:'90s',progression:'double',increment:2.5});
    await persistProgram(pid);render();
  }));
  m.querySelectorAll('[data-rmitem]').forEach(b => b.onclick = async () => {
    const [di,ii] = b.dataset.rmitem.split('.').map(Number);
    const pid = S.sel.program, p = S.programs[pid];readProgramEditor(pid,m);
    const items=p.days[di].items,item=items[ii];if(!item)return;
    const partners=item.groupId?items.filter(x=>x!==item&&x.groupId===item.groupId):[],was={groupId:item.groupId,groupType:item.groupType};
    if(item.groupId)items.forEach(member=>{if(member.groupId===item.groupId){delete member.groupId;delete member.groupType;}});
    items.splice(ii,1);
    await persistProgram(pid); render();
    undoToast(`${exName(item.exId)} removed from ${p.days[di].name||'the day'}`,async()=>{
      if(S.programs[pid]!==p||p.days[di]?.items!==items)return;
      items.splice(Math.min(ii,items.length),0,item);
      if(was.groupId)[item,...partners].forEach(x=>{if(items.includes(x)){x.groupId=was.groupId;x.groupType=was.groupType;}});
      await persistProgram(pid); render();
    });
  });
  m.querySelectorAll('[data-rmday]').forEach(b => b.onclick = () => {
    const pid = S.sel.program, p = S.programs[pid], di = Number(b.dataset.rmday), day = p?.days[di]; if (!day) return;
    const dayName = m.querySelector(`.dayname[data-di="${di}"]`)?.value.trim() || day.name || 'this day';
    const n = (day.items||[]).length;
    dialog('Remove ' + dayName + '?', `<p>${n ? `It has <strong>${n} exercise${n===1?'':'s'}</strong>, which will be removed from this program.` : 'This day has no exercises.'} Logged sessions are not affected.</p>`, [
      {label:'Cancel'},
      {label:'Remove day', kind:'danger', onClick: async () => {
        readProgramEditor(pid, m);   // keep any typing on the other days
        const removedDay = p.days.splice(di,1)[0], days = p.days;
        await persistProgram(pid); render();
        undoToast(`${removedDay.name || 'Day'} removed`, async () => {
          if (S.programs[pid] !== p || p.days !== days) return;
          days.splice(Math.min(di, days.length), 0, removedDay);
          await persistProgram(pid); render();
        });
      }}
    ]);
  });
  // Exercise button in a program row: opens the searchable picker and updates the row's hidden exId.
  m.querySelectorAll('[data-pick-ex]').forEach(b => b.onclick = () => {
    const row = b.closest('tr'), hidden = row?.querySelector('input[data-f="exId"]'); if (!hidden) return;
    exercisePicker('Choose exercise', async chosen => {
      const id = chosen;
      hidden.value = id;
      const label = programExerciseLabel(id);
      b.firstElementChild.textContent = label; b.setAttribute('aria-label', 'Change exercise: ' + label);
      hidden.dispatchEvent(new Event('input', { bubbles: true }));   // triggers the program autosave
    });
  });
  // The ⋯ menus float above the page (position: fixed) so a scrolling table can never clip them.
  m.querySelectorAll('details.exercise-actions-menu').forEach(d => d.addEventListener('toggle', () => { if (d.open) positionActionsPop(d); }));
  // Reorder: a superset moves as one block.
  m.querySelectorAll('[data-move-item]').forEach(b => b.onclick = async () => {
    const [di,ii,dir] = b.dataset.moveItem.split('.').map(Number), pid = S.sel.program, p = S.programs[pid]; if (!p?.days[di]) return;
    readProgramEditor(pid, m);
    if (!moveExerciseUnit(p.days[di].items, ii, dir)) return;
    await persistProgram(pid); render();
  });
  m.querySelectorAll('[data-move-ex]').forEach(b => b.onclick = () => {
    const [ei,dir] = b.dataset.moveEx.split('.').map(Number), entries = S.sel.draft.entries;
    if (moveExerciseUnit(entries, ei, dir)) { markStrengthActivity(); render(); }
  });
  m.querySelectorAll('[data-dupday]').forEach(b => b.onclick = async () => {
    const pid = S.sel.program, p = S.programs[pid], di = Number(b.dataset.dupday); if (!p?.days[di]) return;
    readProgramEditor(pid, m);
    const copy = cloneWithFreshGroups([p.days[di]])[0];
    copy.name = /^day [a-z]$/i.test(String(copy.name||'').trim()) ? nextDayName(p) : (copy.name || 'Day') + ' (copy)';
    p.days.splice(di + 1, 0, copy);
    await persistProgram(pid); render(); toast(copy.name + ' added');
  });
  const dupProgram = document.getElementById('duplicateProgram');
  if (dupProgram) dupProgram.onclick = async () => {
    const pid = S.sel.program, p = S.programs[pid]; if (!p) return;
    readProgramEditor(pid, m); await flushProgramEditor();
    const id = uid(), copy = { ...JSON.parse(JSON.stringify(p)), name: (p.name || 'Program') + ' copy' };
    copy.days = cloneWithFreshGroups(p.days);
    try { await Store.put('programs', id, copy); } catch(e){ showSaveError(e); return; }
    S.programs[id] = copy; S.sel = { programsKind:'strength', program:id }; render(); toast('Program duplicated — clients keep the original');
  };
  const ad = document.getElementById('addDay');
  if (ad) ad.onclick = async () => {
    const pid = S.sel.program, p = S.programs[pid];
    readProgramEditor(pid, m);   // keep typing that hasn't autosaved yet
    p.days.push({ name: nextDayName(p), items: [] });
    await persistProgram(pid); render();
  };
  m.querySelectorAll('[data-dlblankprogram]').forEach(b => b.onclick = async () => { await flushProgramEditor(); downloadProgramPdf(S.programs[b.dataset.dlblankprogram]); });
  // Autosave: any typing or selection in the program editor.
  if (programEditorOpen()) m.querySelectorAll('#p_name,#p_weeks,.dayname,.daycond,.daynotes,tr[data-ii] [data-f]').forEach(el => {
    el.addEventListener('input', scheduleProgramAutosave);
    el.addEventListener('change', scheduleProgramAutosave);
  });
  m.querySelectorAll('[data-delprogram]').forEach(b => b.onclick = () => dialog('Delete program',
    '<p>Clients assigned to it will be left without a program.</p>',
    [{label:'Cancel'},{label:'Delete', kind:'danger', onClick: async () => {
      const id = b.dataset.delprogram;
      try { await Store.del('programs', id); } catch(e){ showSaveError(e); return; }
      delete S.programs[id]; S.sel = { programsKind:'strength' }; render();
    }}]));

  /* ---- exercises ---- */
  const nex = document.getElementById('newEx');
  if (nex) nex.onclick = () => dialog('Add exercise',
    `<label class="field"><span>Name</span><input type="text" id="e_name" autofocus></label>
     <div class="inline-fields">
       <label class="field"><span>Category</span><input type="text" id="e_cat" placeholder="Legs, Push, Core…"></label>
       <label class="field"><span>Equipment</span><input type="text" id="e_eq" placeholder="Barbell, Machine…"></label>
     </div>`,
    [{label:'Cancel'},{label:'Add', kind:'primary', onClick: async () => {
      const name = val('e_name'); if (!name){ toast('Name is required'); return false; }
      if (!(await saveExerciseList([...S.exercises, { id: uid(), name, category: val('e_cat') || 'Other', equipment: val('e_eq') }]))) return false;
      render();
    }}]);
  m.querySelectorAll('[data-archiveex]').forEach(b => b.onclick = () => {
    const id = b.dataset.archiveex, ex = S.exercises.find(e => e.id === id); if (!ex) return;
    const u = exerciseUsage(id);
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    const usage = u.programs || u.logs
      ? `<p>It's used in <strong>${plural(u.programs,'program')}</strong>${u.items > u.programs ? ' (' + plural(u.items,'row') + ')' : ''} and <strong>${plural(u.logs,'logged session')}</strong>. Those keep it exactly as they are.</p>`
      : `<p class="small muted">It isn't used in any program or logged session.</p>`;
    dialog('Archive ' + ex.name + '?', `${usage}<p class="small muted">Archiving hides it from the exercise pickers. You can restore it any time from "Archived exercises" at the bottom of this page.</p>`, [
      {label:'Cancel'},
      {label:'Archive', kind:'danger', onClick: async () => {
        if (!(await saveExerciseList(S.exercises.map(e => e.id === id ? { ...e, archived: true } : e)))) return false;
        toast(ex.name + ' archived'); render();
      }}
    ]);
  });
  m.querySelectorAll('[data-restoreex]').forEach(b => b.onclick = async () => {
    const id = b.dataset.restoreex;
    if (!(await saveExerciseList(S.exercises.map(e => { if (e.id !== id) return e; const { archived, ...rest } = e; return rest; })))) return;
    toast('Exercise restored'); render();
  });
  const toggleArchived = document.getElementById('toggleArchivedExercises');
  if (toggleArchived) toggleArchived.onclick = () => { S.sel.showArchivedExercises = !S.sel.showArchivedExercises; render(); };

  /* ---- history ---- */
  m.querySelectorAll('[data-historyclient]').forEach(el => el.onclick = () => { S.sel = { historyClient: el.dataset.historyclient }; render(); });
  const historyShowAll = document.getElementById('historyShowAll');
  if (historyShowAll) historyShowAll.onclick = () => { S.sel.historyAll = true; render({ keepScroll:true }); };
  const progressEx = document.getElementById('progressEx');
  if (progressEx) progressEx.onchange = () => { S.sel.progressEx = progressEx.value; render(); };
  m.querySelectorAll('[data-historyday]').forEach(el => el.onclick = () => { S.sel.historyDay = el.dataset.historyday; render(); });

  /* ---- data ---- */
  const ej = document.getElementById('exportJson');
  wireSyncPanel(m);
  wireDevices(m);
  wireTeam(m);
  wireLockPanel(m);
  wirePrivacy(m);
  const exportEnc = document.getElementById('exportEnc'); if (exportEnc) exportEnc.onclick = exportEncryptedDialog;
  if (ej) ej.onclick = exportEverything;
  const reminderBtn = document.getElementById('reminderExport'); if (reminderBtn) reminderBtn.onclick = exportEverything;
  m.querySelectorAll('[data-restore-snapshot]').forEach(b => b.onclick = () => {
    const key = b.dataset.restoreSnapshot, label = key === 'pre-restore' ? 'the copy kept from before the last restore' : 'the snapshot from ' + key;
    dialog('Restore ' + (key === 'pre-restore' ? 'the earlier copy' : key) + '?', '<p>This replaces <strong>everything</strong> now stored in this browser with ' + esc(label) + '.</p><p class="small muted">What is stored now is kept as a safety copy first, so you can undo a restore from this same list.</p>', [
      {label:'Cancel'},
      {label:'Restore', kind:'danger', onClick: async () => { try { await restoreSnapshot(key); } catch(e){ S.restoring = false; if (isStorageError(e)) showSaveError(e); else toast('Restore failed — ' + e.message); return false; } }}
    ]);
  });
  if (document.getElementById('snapshotList') || document.getElementById('storageBox')){
    (async () => {
      try {
        if (MODE === 'local' && LOCAL === 'idb'){
          const list = await listSnapshots(); await refreshStorageEstimate();
          if (JSON.stringify(list) !== JSON.stringify(S.snapshotList)){ S.snapshotList = list; render({ keepScroll:true }); return; }
          const box = document.getElementById('storageBox'); if (box){ const tmp = document.createElement('div'); tmp.innerHTML = storageUsageHTML(); box.replaceWith(tmp.firstElementChild); }
        }
      } catch(e){ console.warn('Could not refresh the backups panel', e); }
    })();
  }
  const ec = document.getElementById('exportCsv');
  if (ec) ec.onclick = () => { if (assistantBlocked()) return; Audit.log('export', { kind:'sessions csv' }); download('nyaega-sessions-' + todayISO() + '.csv', logsCsv(), 'text/csv'); };
  const ea = document.getElementById('exportAtt');
  if (ea) ea.onclick = () => { if (assistantBlocked()) return; Audit.log('export', { kind:'attendance csv' }); download('nyaega-attendance-' + todayISO() + '.csv', attendanceCsv(), 'text/csv'); };
  const er = document.getElementById('exportRoster');
  if (er) er.onclick = () => { if (assistantBlocked()) return; Audit.log('export', { kind:'roster' }); downloadRosterXlsx(); };
  const ib = document.getElementById('importBtn');
  if (ib) ib.onclick = () => document.getElementById('importFile').click();
  const fileInput = document.getElementById('importFile');
  if (fileInput) fileInput.onchange = async () => {
    const f = fileInput.files[0]; if (!f) return;
    fileInput.value = '';   // lets the same file be chosen again later
    if (f.size > MAX_IMPORT_BYTES){ toast('That file is too large to be a Nyaega backup'); return; }
    let data;
    try { data = safeParse(await f.text()); }
    catch(e){ toast('That file did not import — it isn\'t a valid backup file'); return; }
    if (isPlainObject(data) && data.app === 'nyaega-encrypted'){
      dialog('Encrypted backup', '<p class="small muted">Enter the passphrase you used when you exported it.</p><label class="field"><span>Passphrase</span><input type="password" id="impPass" autocomplete="off"></label>', [{label:'Cancel'},{label:'Unlock', kind:'primary', onClick: async () => {
        let plain;
        try { plain = safeParse(await decryptBackup(data, document.getElementById('impPass').value)); }
        catch(e){ toast(e.message || 'Could not unlock that file'); return false; }
        setTimeout(() => startImport(plain, f.name), 80);
      }}]);
      return;
    }
    startImport(data, f.name);
  };
  m.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
    const t = b.dataset.theme;
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('nyaega:theme', t); } catch {}
  });
  const fileOpen = document.getElementById('fileOpen');
  if (fileOpen) fileOpen.onclick = openDataFile;
  const fileNew = document.getElementById('fileNew');
  if (fileNew) fileNew.onclick = newDataFile;
  const fileDisconnect = document.getElementById('fileDisconnect');
  if (fileDisconnect) fileDisconnect.onclick = () => dialog('Disconnect this file',
    '<p>The page will reload and fall back to browser storage. The file itself is untouched — reconnect to it anytime.</p>',
    [{label:'Cancel'},{label:'Disconnect', kind:'danger', onClick: disconnectFile}]);

  wireConditioning();
  wireConditioningWorkout();

  const wipe = document.getElementById('wipe');
  if (wipe) wipe.onclick = () => assistantBlocked() ? null : dialog('Delete all data',
    '<p>Every client, program and logged session goes. Export a backup first if you might want any of it.</p>' + (Sync.linkedId ? '<label class="row tight small" style="gap:.4rem;align-items:flex-start;margin-top:.6rem"><input type="checkbox" id="wipeOnline" checked style="width:auto;margin-top:.2rem"> Also delete my online copy (recommended). If unticked, the online copy stays and comes back the next time you sign in.</label>' : ''),
    [{label:'Cancel'},{label:'Delete everything', kind:'danger', onClick: async () => {
      const alsoOnline = !!(document.getElementById('wipeOnline') && document.getElementById('wipeOnline').checked);
      try {
        // In data-file mode: one file write for the whole delete (undone as a whole if it fails).
        await Store.batch(async () => {
          for (const coll of COLLS){ for (const id of Object.keys(S[coll])){ await Store.del(coll, id); delete S[coll][id]; } }
          invalidateLogIndex(); invalidateAttIndex();
        });
      } catch(e){ showSaveError(e); S.sel = {}; toast(MODE === 'file' ? 'Delete failed — nothing was deleted' : 'Delete stopped part-way — some data is still stored'); render(); return; }
      if (!(await saveExerciseList(SEED_EXERCISES))){ S.sel = {}; render(); return; }
      // Unfinished-workout copies belong to the deleted clients too.
      clearTimeout(activeWorkoutSaveTimer); activeWorkoutSaveTimer = null;
      try { await Store.putMeta('activeWorkoutDraft', null); await Store.putMeta('activeSessions', null); await Store.putMeta('workoutDraftArchive', []); }
      catch(e){ showSaveError(e); }
      S.recoveryList = []; S.sessions = []; S.recoverySaved = false; S.recoveryArchive = []; S.parkedWorkout = null;
      await clearBackupsAfterWipe();
      await Audit.log('delete-all');
      if (alsoOnline){
        // the deletions are already queued: push them now, or keep them queued until the next sign-in
        S.sel = {};
        if (Sync.signedIn()){ try { await Sync.run(); } catch {} }
        toast(Sync.signedIn() && !Sync.pending ? 'Everything deleted, including your online copy' : 'Everything deleted here. The online copy is deleted when you next sign in and sync.');
        render(); return;
      }
      try { await IDB.run(['outbox', 'versions', 'conflicts'], 'readwrite', tx => { ['outbox', 'versions', 'conflicts'].forEach(s => tx.objectStore(s).clear()); }); await Store.putMeta('syncInitial', null); await Store.putMeta('syncCursor', null); S.conflicts = []; await Sync.signOut(); } catch {}
      S.sel = {}; toast('Everything deleted from this device. Your online copy was kept.'); render();
    }}]);
}

