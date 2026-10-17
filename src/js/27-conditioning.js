/* ============================ CONDITIONING ============================ */
const CONDITIONING_MODES=[['intervals','Intervals'],['emom','EMOM'],['amrap','AMRAP'],['forTime','For Time'],['tabata','Tabata'],['custom','Custom']];
function conditioningModeName(mode){return (CONDITIONING_MODES.find(x=>x[0]===mode)||['','Custom'])[1];}
function newConditioningBlock(mode='intervals'){
  const b={name:'Main Block',mode,rounds:mode==='tabata'?8:10,workSeconds:mode==='tabata'?20:30,restSeconds:mode==='tabata'?10:30,durationMinutes:mode==='emom'?10:12,exercises:[]};
  // Timed-interval blocks start with one station, ready to add more.
  if(['intervals','tabata','custom'].includes(mode)){b.steps=[{name:'Work',workSeconds:b.workSeconds,restSeconds:b.restSeconds}];b.restBetweenRounds=0;}
  return b;
}
/* Station list for intervals / tabata / custom blocks. Older blocks (no stations) keep their timing until switched. */
function conditioningStepsHTML(b,i){
  if(!['intervals','tabata','custom'].includes(b.mode))return '';
  if(!isSteppedBlock(b))return `<div class="conditioning-convert"><button type="button" class="btn ghost sm" data-convert-steps="${i}">Switch to stations</button><small class="muted">Give each exercise its own work and rest time. Each exercise becomes a station, and the rounds repeat the whole list.</small></div>`;
  return `<div class="conditioning-steps"><div class="spread"><strong>Stations <span class="muted small">— each round runs them in order</span></strong><button type="button" class="btn ghost sm" data-add-step="${i}">+ Add station</button></div>
    ${b.steps.map((s,si)=>`<div class="cond-step" data-step-row="${si}">
      <span class="cond-step-num" aria-hidden="true">${si+1}</span>
      <input type="text" class="cond-step-name" data-sf="name" list="exerciseNamesList" value="${esc(s.name||'')}" placeholder="Exercise (type or pick)" aria-label="Station ${si+1} name">
      <label class="cond-step-time"><span>Work (s)</span><input type="number" inputmode="numeric" min="1" data-sf="workSeconds" value="${esc(s.workSeconds??30)}"></label>
      <label class="cond-step-time"><span>Rest (s)</span><input type="number" inputmode="numeric" min="0" data-sf="restSeconds" value="${esc(s.restSeconds??0)}"></label>
      <div class="cond-step-actions"><button type="button" class="btn sm ghost" data-move-step="${i}.${si}.-1" aria-label="Move station ${si+1} up" ${si===0?'disabled':''}>↑</button><button type="button" class="btn sm ghost" data-move-step="${i}.${si}.1" aria-label="Move station ${si+1} down" ${si===b.steps.length-1?'disabled':''}>↓</button><button type="button" class="btn sm danger" data-remove-step="${i}.${si}" aria-label="Remove station ${si+1}" ${b.steps.length<2?'disabled':''}>✕</button></div>
    </div>`).join('')}
    <p class="small muted">Rest after the last station is the break between rounds${Number(b.restBetweenRounds)>0?` — currently ${esc(b.restBetweenRounds)} s`:' (or set it separately above)'}.</p></div>`;
}
/* Only the fields a mode actually uses. Values of hidden fields stay stored, so switching mode back restores them. */
function conditioningModeFieldsHTML(b){
  const num=(label,key,value,min,step=1)=>`<label class="field"><span>${label}</span><input type="number" min="${min}" step="${step}" data-cf="${key}" value="${esc(value??'')}"></label>`;
  switch(b.mode){
    case 'emom': return num('Duration (minutes)','durationMinutes',b.durationMinutes??10,1)+num('Interval (seconds)','intervalSeconds',b.intervalSeconds??60,5);
    case 'amrap': return num('Duration (minutes)','durationMinutes',b.durationMinutes??10,1);
    case 'forTime': return num('Target rounds (optional)','targetRounds',b.targetRounds||'',1)+num('Time cap, minutes (optional)','capMinutes',b.capMinutes||'',1);
    default:   // intervals, tabata, custom
      if(isSteppedBlock(b))return num('Rounds','rounds',b.rounds??8,1)+num('Break between rounds (s)','restBetweenRounds',b.restBetweenRounds||0,0);
      return num('Rounds','rounds',b.rounds??8,1)+num('Work (seconds)','workSeconds',b.workSeconds??30,1)+num('Rest (seconds)','restSeconds',b.restSeconds??30,0);
  }
}
function conditioningLines(block){return (block.exercises||[]).map(e=>`${e.name||''}${e.reps?' | '+e.reps:''}`).join('\n');}
function viewConditioning(){
  if(S.sel.conditioningId) return conditioningDetail(S.sel.conditioningId);
  const all=Object.entries(S.conditioning).map(([id,w])=>({id,...w})).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  return `<div class="page-head"><div><button type="button" class="btn ghost sm" data-program-kind="chooser">← Program types</button><div class="eyebrow">ENGINE · BLOCK · TIMER</div><h2>Conditioning Program</h2><p class="muted small">Build reusable sessions from warm-ups, independently timed blocks, and finishers.</p></div><button class="btn primary" id="newConditioning">New conditioning program</button></div>
    ${all.length?`<div class="grid">${all.map(w=>`<button type="button" class="conditioning-card" data-open-conditioning="${esc(w.id)}" title="Edit conditioning template" aria-label="Edit conditioning template ${esc(w.name)}"><span class="conditioning-card-icon">◷</span><strong>${esc(w.name)}</strong><span>${(w.blocks||[]).length} block${(w.blocks||[]).length===1?'':'s'} · ${(w.blocks||[]).map(b=>conditioningModeName(b.mode)).join(' + ')||'No timer mode'}</span><span class="conditioning-card-edit-hint">Click to edit template →</span></button>`).join('')}</div>`:`<div class="panel empty"><p>No conditioning templates yet. Create one, add warm-up and finisher notes, then combine blocks using any timer mode.</p><button class="btn primary" id="newConditioningEmpty">Create a conditioning template</button></div>`}`;
}
function conditioningDetail(id){
  const source=S.conditioning[id]; if(!source) return '<div class="empty"><p>Conditioning template not found.</p><button class="btn ghost" data-back-conditioning>Back</button></div>';
  const w=S.sel.conditioningDraft || (S.sel.conditioningDraft=JSON.parse(JSON.stringify(source)));
  if(!Array.isArray(w.blocks)) w.blocks=[];
  const blockOptions=(w.blocks||[]).map((b,i)=>`<option value="${i}">Block ${i+1} · ${esc(b.name||conditioningModeName(b.mode))}</option>`).join('');
  return `<datalist id="exerciseNamesList">${activeExercises().slice().sort(byName).map(e=>`<option value="${esc(e.name)}"></option>`).join('')}</datalist>
    <div class="conditioning-toolbar"><button class="btn ghost" data-back-conditioning>← Templates</button><div class="row tight"><button class="btn ghost" id="duplicateConditioning">Duplicate</button><button class="btn primary" id="saveConditioning">Save template</button></div></div>
    <div class="conditioning-title"><label class="field"><span>Template name</span><input id="conditioningName" type="text" value="${esc(w.name||'')}" placeholder="Conditioning A"></label><span class="pill">${(w.blocks||[]).length} blocks</span></div>
    <section class="conditioning-bookend"><span class="conditioning-section-mark">01</span><div><h3>Warm-up</h3><p class="small muted">Optional prep, movement, and coaching notes.</p><textarea id="conditioningWarmup" placeholder="5 min easy bike, then dynamic mobility">${esc(w.warmup||'')}</textarea>
      <label class="row tight small conditioning-check"><input type="checkbox" id="timedWarmup" ${(w.blocks||[]).some(b=>b.role==='warmup')?'checked':''} style="width:auto"> Run the warm-up as a timed block</label></div></section>
    <section class="conditioning-flow panel"><h3>How the session flows</h3>
      <div class="inline-fields">
        <label class="field"><span>Get-ready countdown (seconds)</span><input id="conditioningGetReady" type="number" min="0" step="1" inputmode="numeric" value="${esc(w.getReadySeconds??0)}"></label>
        <label class="field"><span>Rest between blocks (seconds)</span><input id="conditioningTransition" type="number" min="0" step="1" inputmode="numeric" value="${esc(w.transitionSeconds??0)}"></label>
      </div>
      <label class="row tight small conditioning-check"><input type="checkbox" id="conditioningAutoAdvance" ${w.autoAdvance?'checked':''} style="width:auto"> Start the next block automatically when one finishes</label>
      <p class="small muted">The get-ready countdown runs before every block (beeps for the last 3 seconds). With automatic start, the rest between blocks runs first and results are kept from the timer — add details afterwards from the Results list.</p>
    </section>
    <div class="conditioning-section-head"><div><span class="eyebrow">WORKOUT BUILDER</span><h3>Timed blocks</h3></div><button class="btn ghost" id="addConditioningBlock">+ Add block</button></div>
    ${(w.blocks||[]).map((b,i)=>`<section class="conditioning-block" data-conditioning-block="${i}"><header class="conditioning-block-head"><span class="conditioning-section-mark">${String(i+2).padStart(2,'0')}</span><input class="conditioning-block-name" type="text" data-cf="name" value="${esc(b.name||'Block '+(i+1))}" aria-label="Block ${i+1} name">${b.role?`<span class="pill">${b.role==='warmup'?'Warm-up':'Finisher'}</span>`:''}
        <div class="conditioning-block-tools"><button class="btn ghost sm" type="button" data-move-block="${i}.-1" aria-label="Move block ${i+1} up" ${i===0?'disabled':''}>↑</button><button class="btn ghost sm" type="button" data-move-block="${i}.1" aria-label="Move block ${i+1} down" ${i===(w.blocks||[]).length-1?'disabled':''}>↓</button><button class="btn ghost sm" type="button" data-dup-block="${i}">Duplicate</button><button class="btn danger sm" type="button" data-remove-conditioning-block="${i}">Remove</button></div></header>
      <div class="conditioning-fields"><label class="field"><span>Timer mode</span><select data-cf="mode">${CONDITIONING_MODES.map(([k,n])=>`<option value="${k}" ${b.mode===k?'selected':''}>${n}</option>`).join('')}</select></label>
        ${conditioningModeFieldsHTML(b)}</div>
      ${b.mode==='custom'?'<p class="small muted conditioning-mode-help">Custom currently runs like Intervals (work / rest / rounds). Use it for your own format names.</p>':b.mode==='forTime'?'<p class="small muted conditioning-mode-help">For Time counts up. It stops on its own when you tap “Complete round” for the last target round, or at the time cap. Leave both empty to stop it yourself.</p>':b.mode==='emom'?'<p class="small muted conditioning-mode-help">A new movement starts every interval. Set the interval to 120 for an E2MOM, 90 for E1.5MOM.</p>':''}
      ${conditioningStepsHTML(b,i)}
      ${isSteppedBlock(b)?'':`<label class="field conditioning-exercises"><span>Exercises${b.mode==='emom'?' · one line per interval':''}</span><textarea data-cf="exercises" placeholder="Sprint | 30 seconds&#10;Kettlebell swings | 15 reps">${esc(conditioningLines(b))}</textarea><small class="muted">One movement per line. Optional prescription after a |, such as 12 reps.</small></label>`}
    </section>`).join('')||'<div class="panel empty"><p>Add your first timed block.</p></div>'}
    <button class="btn ghost conditioning-add-bottom" id="addConditioningBlockBottom">+ Add block</button>
    <section class="conditioning-bookend conditioning-finisher"><span class="conditioning-section-mark">FIN</span><div><h3>Finisher</h3><p class="small muted">Optional final work or cooldown.</p><textarea id="conditioningFinisher" placeholder="Easy walk and breathing">${esc(w.finisher||'')}</textarea>
      <label class="row tight small conditioning-check"><input type="checkbox" id="timedFinisher" ${(w.blocks||[]).some(b=>b.role==='finisher')?'checked':''} style="width:auto"> Run the finisher as a timed block</label></div></section>
    <section class="conditioning-timer panel"><div class="conditioning-timer-config"><div><span class="timer-kicker">TIMER ENGINE</span><h3 id="conditioningTimerMode">Ready</h3></div><label class="field"><span>Block</span><select id="conditioningTimerBlock">${blockOptions||'<option value="">Add a block to start</option>'}</select></label></div>
      <div class="conditioning-timer-display"><span id="conditioningTimerPhase">Ready</span><strong id="conditioningTimerClock" class="num">00:00</strong><span id="conditioningTimerRound">Select a block to begin</span><span id="conditioningTimerExercise" class="conditioning-timer-exercise"></span></div>
      <div class="row tight conditioning-timer-actions"><button class="btn primary" id="conditioningTimerStart" ${w.blocks.length?'':'disabled'}>Start</button><button class="btn ghost" id="conditioningTimerPause" disabled>Pause</button><button class="btn ghost" id="conditioningTimerRoundDone" hidden>Complete round</button><button class="btn ghost" id="conditioningTimerFinish" disabled>Finish</button></div>
    </section>
    <div class="conditioning-footer"><button class="btn danger" id="deleteConditioning">Delete template</button><button class="btn primary" id="saveConditioningBottom">Save template</button></div>`;
}
function readConditioningEditor(){
  const id=S.sel.conditioningId, w=S.sel.conditioningDraft; if(!id||!w)return null;
  w.name=document.getElementById('conditioningName')?.value.trim()||w.name;
  w.warmup=document.getElementById('conditioningWarmup')?.value||'';
  w.finisher=document.getElementById('conditioningFinisher')?.value||'';
  const flowNum=id=>{const el=document.getElementById(id);return el?Math.max(0,Number(el.value)||0):null;};
  const gr=flowNum('conditioningGetReady'),tr=flowNum('conditioningTransition');
  if(gr!=null)w.getReadySeconds=gr;if(tr!=null)w.transitionSeconds=tr;
  const aa=document.getElementById('conditioningAutoAdvance');if(aa)w.autoAdvance=aa.checked;
  document.querySelectorAll('[data-conditioning-block]').forEach(row=>{
    const i=Number(row.dataset.conditioningBlock), b=w.blocks[i]; if(!b)return;
    row.querySelectorAll('[data-cf]').forEach(el=>{
      const k=el.dataset.cf;
      if(k==='exercises') b.exercises=el.value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{const parts=line.split('|');return {name:parts[0].trim(),reps:(parts[1]||'').trim()};});
      else if(['rounds','durationMinutes','workSeconds','restSeconds','intervalSeconds','restBetweenRounds'].includes(k)) b[k]=Math.max(0,Number(el.value)||0);
      else if(['targetRounds','capMinutes'].includes(k)){const n=Math.max(0,Number(el.value)||0);if(n)b[k]=n;else delete b[k];}   // empty = not set
      else b[k]=el.value;
    });
    // Stations: read each row, link names that match the exercise library, keep the plain exercise list in step.
    const stepRows=row.querySelectorAll('.cond-step');
    if(stepRows.length){
      b.steps=[...stepRows].map((r,si)=>{
        const prev=(Array.isArray(b.steps)&&b.steps[si])||{},name=r.querySelector('[data-sf="name"]').value.trim();
        const step={...prev,name,workSeconds:Math.max(1,Number(r.querySelector('[data-sf="workSeconds"]').value)||30),restSeconds:Math.max(0,Number(r.querySelector('[data-sf="restSeconds"]').value)||0)};
        const lib=name&&activeExercises().find(e=>e.name.toLocaleLowerCase()===name.toLocaleLowerCase());
        if(lib)step.exId=lib.id;else delete step.exId;
        return step;
      });
      b.exercises=b.steps.filter(s=>s.name).map(s=>({name:s.name,reps:s.reps||''}));
    }
  });
  return w;
}
async function saveConditioningDraft(){
  const w=readConditioningEditor(); if(!w||!w.name){toast('Template name is required');return false;}
  const saved=JSON.parse(JSON.stringify(w));
  try { await Store.put('conditioning',S.sel.conditioningId,saved); } catch(e){ showSaveError(e); return false; }
  S.conditioning[S.sel.conditioningId]=saved; toast('Conditioning template saved'); return true;
}
/* Everything the timer needs from a block. */
function conditioningTimerConfig(b){
  return {mode:b.mode,rounds:b.rounds,workSeconds:b.workSeconds,restSeconds:b.restSeconds,durationMinutes:b.durationMinutes,
    intervalSeconds:b.intervalSeconds,targetRounds:b.targetRounds,capMinutes:b.capMinutes,exercises:b.exercises||[],
    ...(Array.isArray(b.steps)&&b.steps.length?{steps:JSON.parse(JSON.stringify(b.steps)),restBetweenRounds:b.restBetweenRounds||0}:{})};
}
/* The template settings that shape how a session flows between blocks (copied into the session when it starts). */
function conditioningFlowOf(t){return {getReadySeconds:Number(t?.getReadySeconds)||0,autoAdvance:!!t?.autoAdvance,transitionSeconds:Number(t?.transitionSeconds)||0};}
/* A block with stations (steps): each round runs every station in order — work, then that station's rest. */
const isSteppedBlock=b=>!!b&&['intervals','tabata','custom'].includes(b.mode)&&Array.isArray(b.steps)&&b.steps.length>0;
/* One timer engine per place that needs one: the live session and the template editor's preview
   each get their own, so previewing a template can never touch a running session. */
function createConditioningTimer(){
  let config=null,state=null,tickHandle=null,listener=()=>{},timeline=null;const listeners=new Map();
  /* Stations: lays the whole block out as work/rest segments so any moment maps to "round R, station S". */
  function buildTimeline(){
    timeline=null;
    const steps=Array.isArray(config.steps)?config.steps.filter(s=>s&&Number(s.workSeconds)>0):[];
    if(!['intervals','tabata','custom'].includes(config.mode)||!steps.length)return;
    const rounds=Math.max(1,Number(config.rounds)||1),between=Math.max(0,Number(config.restBetweenRounds)||0),segs=[];let t=0;
    for(let r=1;r<=rounds;r++)steps.forEach((s,i)=>{
      const w=Math.max(1,Number(s.workSeconds)||30);segs.push({phase:'work',start:t,end:t+w,round:r,stepIndex:i,name:s.name||'',reps:s.reps||''});t+=w;
      let rest=Math.max(0,Number(s.restSeconds)||0);
      if(i===steps.length-1)rest=r<rounds?(between>0?between:rest):0;   // after the last station: the round break (none after the final round)
      if(rest>0){segs.push({phase:'rest',start:t,end:t+rest,round:r,stepIndex:i,name:s.name||''});t+=rest;}
    });
    timeline={segs,total:t,steps,rounds};
  }
  const snapshot=()=>state?{...state,leadLabel:config.getReadyLabel||'Get ready',mode:config.mode,rounds:config.mode==='forTime'?(Number(config.targetRounds)||null):(timeline?timeline.rounds:(config.rounds||null)),intervalSeconds:Math.max(5,Number(config.intervalSeconds)||60),capSeconds:(Number(config.capMinutes)||0)*60}:null;
  const elapsedNow=()=>Math.max(0,Math.floor((Date.now()-state.startedAt-state.pausedMs)/1000));
  const emit=event=>{const snap=snapshot();listener(event,snap);(listeners.get(event)||[]).forEach(fn=>fn(snap));};
  function stop(){if(tickHandle){clearInterval(tickHandle);tickHandle=null;}}
  function finish(){if(!state||state.complete)return;state.complete=true;state.running=false;state.paused=false;state.phase='complete';stop();emit('complete');}
  function tick(atMs){
    if(!state||!state.running||state.paused)return;
    // (atMs lets a restored, paused timer draw itself as it was at the moment it was paused)
    const at=typeof atMs==='number'?atMs:Date.now();
    // Optional lead-in countdown ("Get ready" / rest before the next block): the block's own clock starts after it.
    const raw=Math.max(0,Math.floor((at-state.startedAt-state.pausedMs)/1000)),lead=Math.max(0,Number(config.getReadySeconds)||0);
    if(raw<lead){
      const before=state.phase;state.phase='getReady';state.leadIn=true;state.remaining=lead-raw;state.elapsed=0;state.round=1;state.exercise='';
      if(before!=='getReady')emit('getReady');
      emit('tick');return;
    }
    state.leadIn=false;
    const elapsed=raw-lead;state.elapsed=elapsed;
    let phase='work',round=1,remaining=0,completedRounds=[],segChanged=false;
    if(timeline){
      if(elapsed>=timeline.total){
        for(let n=state.roundsCompleted+1;n<=timeline.rounds;n++){state.roundsCompleted=n;state.round=n;emit('roundComplete');}
        state.remaining=0;finish();return;
      }
      const idx=timeline.segs.findIndex(s=>elapsed<s.end),seg=timeline.segs[idx];
      phase=seg.phase;remaining=seg.end-elapsed;round=seg.round;
      if(round>state.round)for(let n=state.round;n<round;n++)completedRounds.push(n);
      const next=timeline.segs.slice(idx+1).find(s=>s.phase==='work');
      state.stepped=true;state.stepIndex=seg.stepIndex;state.stationCount=timeline.steps.length;state.stepName=seg.name;state.stepReps=seg.reps||'';state.nextName=next?(next.name||'Station '+(next.stepIndex+1)):'';
      segChanged=idx!==state.segIndex;state.segIndex=idx;
    }else if(['intervals','tabata','custom'].includes(config.mode)){
      const work=Math.max(1,Number(config.workSeconds)||30),rest=Math.max(0,Number(config.restSeconds)||0),rounds=Math.max(1,Number(config.rounds)||1),cycle=work+rest,total=rounds*work+Math.max(0,rounds-1)*rest;
      if(elapsed>=total){
        for(let n=state.roundsCompleted+1;n<=rounds;n++){state.roundsCompleted=n;state.round=n;emit('roundComplete');}
        state.remaining=0;finish();return;
      }
      round=Math.min(rounds,Math.floor(elapsed/cycle)+1);const within=elapsed%cycle;phase=within<work?'work':'rest';remaining=phase==='work'?work-within:cycle-within;
      if(round>state.round)for(let n=state.round;n<round;n++)completedRounds.push(n);
    }else if(config.mode==='emom'){
      // Every interval (60 s by default; 90 s, 2 min… for E1.5MOM, E2MOM) starts the next movement.
      const interval=Math.max(5,Number(config.intervalSeconds)||60),total=Math.max(1,Number(config.durationMinutes)||10)*60;if(elapsed>=total){state.remaining=0;finish();return;}
      round=Math.floor(elapsed/interval)+1;remaining=Math.min(interval-(elapsed%interval),total-elapsed);phase='work';
      if(round>state.round)for(let n=state.round;n<round;n++)completedRounds.push(n);
    }else if(config.mode==='amrap'){
      const total=Math.max(1,Number(config.durationMinutes)||12)*60;if(elapsed>=total){state.remaining=0;finish();return;}remaining=total-elapsed;phase='work';round=state.roundsCompleted+1;
    }else if(config.mode==='forTime'){
      // Counts up. Stops at the target rounds (if set) or the time cap (if set).
      const cap=(Number(config.capMinutes)||0)*60;
      if(cap>0&&elapsed>=cap){state.capped=true;state.remaining=cap;finish();return;}
      phase='work';remaining=elapsed;round=state.roundsCompleted+1;
    }
    const previousPhase=state.phase;state.phase=phase;state.round=round;state.remaining=remaining;
    const exercises=config.exercises||[];state.exercise=config.mode==='emom'&&exercises.length?exercises[(round-1)%exercises.length].name:exercises.map(e=>e.name).filter(Boolean).join(' · ');
    for(const n of completedRounds){state.roundsCompleted=n;emit('roundComplete');if(config.mode==='emom')emit('minute');}
    if(segChanged||previousPhase!==phase)emit(phase);   // (with stations, every new segment is announced, even work → work)
    emit('tick');
  }
  return {
    setListener(fn){listener=typeof fn==='function'?fn:()=>{};},
    on(event,fn){if(typeof fn!=='function')return()=>{};const group=listeners.get(event)||[];group.push(fn);listeners.set(event,group);return()=>{listeners.set(event,(listeners.get(event)||[]).filter(x=>x!==fn));};},
    start(cfg){stop();config={...cfg};buildTimeline();state={running:true,paused:false,complete:false,phase:'ready',round:1,roundsCompleted:0,elapsed:0,remaining:0,startedAt:Date.now(),pausedMs:0,exercise:''};emit('start');tick();tickHandle=setInterval(tick,250);},
    pause(){if(!state||state.complete)return;if(!state.paused){state.paused=true;state.pauseAt=Date.now();state.running=false;}else{state.pausedMs+=Date.now()-state.pauseAt;state.paused=false;state.running=true;}emit('tick');},
    markRound(){
      if(!state||state.complete)return;state.roundsCompleted++;emit('roundComplete');
      const target=Number(config.targetRounds)||0;
      if(config.mode==='forTime'&&target>0&&state.roundsCompleted>=target){state.elapsed=elapsedNow();state.remaining=state.elapsed;finish();return;}   // last round done: the clock stops
      emit('tick');
    },
    finish(){finish();},state(){return snapshot();},
    /* Just enough to rebuild a running or paused block later (null once it's finished or if there is none). */
    serialize(){
      if(!state||state.complete)return null;
      return {config:{...config},startedAt:state.startedAt,pausedMs:state.pausedMs||0,pauseAt:state.pauseAt||null,paused:!!state.paused,roundsCompleted:state.roundsCompleted||0,round:state.round||1,capped:!!state.capped};
    },
    /* Rebuilds a block from serialize() output. A running block carries on from the wall clock (or finishes if its time is up). */
    restore(saved){
      if(!saved||!saved.config||!saved.startedAt)return false;
      stop();config={...saved.config};buildTimeline();
      state={running:true,paused:false,complete:false,phase:'ready',round:saved.round||1,roundsCompleted:saved.roundsCompleted||0,elapsed:0,remaining:0,startedAt:saved.startedAt,pausedMs:saved.pausedMs||0,exercise:'',capped:!!saved.capped};
      if(saved.paused&&saved.pauseAt){
        tick(saved.pauseAt);
        if(state&&!state.complete){state.running=false;state.paused=true;state.pauseAt=saved.pauseAt;emit('tick');}
      }else tick();
      // The tick loop runs for a paused block too (it idles), so Resume works straight away.
      if(state&&!state.complete)tickHandle=setInterval(tick,250);
      return true;
    },
    /* Stops and forgets the block without reporting completion (used when leaving a screen). */
    reset(){stop();state=null;config=null;this.owner=null;},
    owner:null
  };
}
const ConditioningTimer=createConditioningTimer(),EditorTimer=createConditioningTimer();
/* Which timer the visible screen belongs to. */
function activeConditioningTimer(){return S.sel?.conditioningSession?ConditioningTimer:EditorTimer;}
/* A block is running or paused (not finished): switching blocks now would wreck it. */
function conditioningTimerBusy(){const s=activeConditioningTimer().state();return !!s&&!s.complete&&(s.running||s.paused);}
function updateConditioningTimerUI(event,state){
  state=state||activeConditioningTimer().state(); if(!state)return;
  const blockPicker=document.getElementById('conditioningTimerBlock');
  if(blockPicker&&blockPicker.dataset.locked!=='1')blockPicker.disabled=!state.complete&&(state.running||state.paused);
  const modeEl=document.getElementById('conditioningTimerMode'),phaseEl=document.getElementById('conditioningTimerPhase'),clockEl=document.getElementById('conditioningTimerClock'),roundEl=document.getElementById('conditioningTimerRound'),exerciseEl=document.getElementById('conditioningTimerExercise');
  const start=document.getElementById('conditioningTimerStart'),pause=document.getElementById('conditioningTimerPause'),roundBtn=document.getElementById('conditioningTimerRoundDone'),finishBtn=document.getElementById('conditioningTimerFinish');
  if(!phaseEl)return;
  if(modeEl)modeEl.textContent=conditioningModeName(state.mode);
  phaseEl.textContent=state.complete?'Complete':state.paused?'Paused':state.phase==='getReady'?state.leadLabel:state.phase==='rest'?'Rest':'Work';
  const isForTime=state.mode==='forTime';if(clockEl)clockEl.textContent=formatClock(state.remaining);
  if(roundEl)roundEl.textContent=state.phase==='getReady'&&!state.complete?'The block starts when this reaches zero'
    :state.stepped?(state.phase==='rest'?`Round ${state.round} of ${state.rounds} · Rest`:`Round ${state.round} of ${state.rounds} · Station ${state.stepIndex+1}: ${state.stepName||'Work'}${state.stepReps?' · '+state.stepReps:''}`)
    :state.mode==='amrap'?`${state.roundsCompleted} rounds completed`
    :state.mode==='forTime'?`${state.roundsCompleted}${state.rounds?' of '+state.rounds:''} rounds · elapsed${state.capSeconds?' · cap '+formatClock(state.capSeconds):''}${state.capped?' · time cap reached':''}`
    :state.mode==='emom'?(state.intervalSeconds===60?`Minute ${state.round}`:`Interval ${state.round}`)
    :`Round ${state.round} of ${state.rounds||'—'}`;
  if(exerciseEl)exerciseEl.textContent=state.stepped?(state.complete?'':state.nextName?'Next: '+state.nextName:'Last station'):(state.exercise||'');
  if(start)start.disabled=!state.complete&&(state.running||state.paused);
  if(pause){pause.disabled=!state.running&&!state.paused;pause.textContent=state.paused?'Resume':'Pause';}
  if(roundBtn)roundBtn.hidden=!(state.mode==='amrap'||isForTime)||state.complete;
  if(finishBtn)finishBtn.disabled=!state.running&&!state.paused;
  if(state.complete&&event==='complete')toast('Conditioning block complete');
}
/* Sound + vibration at each phase change, EMOM interval and block end. */
let lastLeadCue='';
function conditioningCueFor(event,state){
  if(event==='work'||event==='minute')cue('work');
  else if(event==='rest')cue('rest');
  else if(event==='complete')cue('done');
  else if(event==='tick'&&state&&state.phase==='getReady'&&state.remaining>0&&state.remaining<=3){   // 3-2-1 before the block starts
    const key=state.startedAt+':'+state.remaining;if(key!==lastLeadCue){lastLeadCue=key;cue('tick');}
  }
}
/* Timer settings for one block of a live session (or the editor preview): the block itself plus the
   template's "get ready" countdown and, for an automatic next block, the rest before it. */
function sessionBlockConfig(flow,b,{auto=false}={}){
  const cfg=conditioningTimerConfig(b),f=flow||{},transition=auto?(Number(f.transitionSeconds)||0):0,lead=transition+(Number(f.getReadySeconds)||0);
  if(lead>0){cfg.getReadySeconds=lead;cfg.getReadyLabel=transition>0?'Rest — next block soon':'Get ready';}
  return cfg;
}
// Template editor preview: draws itself (only while the editor is what's showing) and makes the same sounds.
EditorTimer.setListener((event,state)=>{
  if(!S.sel?.conditioningSession)updateConditioningTimerUI(event,state);
  conditioningCueFor(event,state);
});
// Live session. Its state is copied into the session on every event, so it survives leaving the screen or a reload.
ConditioningTimer.setListener((event,state)=>{
  const ss=ConditioningTimer.owner||(S.sel&&S.sel.conditioningSession)||(S.parkedWorkout&&S.parkedWorkout.conditioningSession)||(S.parkedWorkout&&S.parkedWorkout.draft&&S.parkedWorkout.draft.conditioningInProgress);
  if(S.sel?.conditioningSession&&S.sel.conditioningSession===ss)updateConditioningTimerUI(event,state);   // don't draw over another screen
  conditioningCueFor(event,state);
  if(!ss)return;
  const saved=ConditioningTimer.serialize();if(saved)ss.timer=saved;else delete ss.timer;
  if(event!=='tick')scheduleWorkoutAutosave();
  if(event==='complete'&&Number.isInteger(ss.currentBlockIndex)){
    ss.blocksCompleted=ss.blocksCompleted||[];
    if(!ss.blocksCompleted.includes(ss.currentBlockIndex))ss.blocksCompleted.push(ss.currentBlockIndex);
    // Automatic next block: keep the timer's numbers now (details can be added from the Results list) and carry straight on.
    const next=ss.currentBlockIndex+1,flow=ss.flow||{},advance=!!flow.autoAdvance&&!ss.completed&&next<(ss.blocks||[]).length;
    // On screen: record the result and ask for details. Finished while away: keep the timer's numbers; details can be added later.
    captureConditioningResult(ss,state,{ask:!advance&&S.sel?.conditioningSession===ss});
    if(advance)setTimeout(()=>{
      if(ConditioningTimer.owner!==ss||ss.completed||ss.currentBlockIndex+1!==next)return;
      ss.blockIndex=next;ss.currentBlockIndex=next;
      ConditioningTimer.start(sessionBlockConfig(flow,ss.blocks[next],{auto:true}));
      if(S.sel?.conditioningSession===ss)render();
    },500);
  }
});
function wireConditioning(){
  const m=document.getElementById('main');
  m.querySelectorAll('[data-back-conditioning]').forEach(b=>b.onclick=()=>{S.view='programs';S.sel={programsKind:'conditioning'};render();});
  const create=()=>dialog('New conditioning program',`<label class="field"><span>Program name</span><input id="newConditioningName" type="text" placeholder="Conditioning A" autofocus></label><label class="field"><span>First block timer mode</span><select id="newConditioningMode">${CONDITIONING_MODES.map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></label>`,[{label:'Cancel'},{label:'Create',kind:'primary',onClick:async()=>{const name=val('newConditioningName');if(!name){toast('Program name is required');return false;}const mode=val('newConditioningMode')||'intervals',id=uid();const w={name,warmup:'',finisher:'',getReadySeconds:10,transitionSeconds:0,autoAdvance:false,blocks:[newConditioningBlock(mode)]};try{await Store.put('conditioning',id,w);}catch(e){showSaveError(e);return false;}S.conditioning[id]=w;S.sel={programsKind:'conditioning',conditioningId:id,conditioningDraft:JSON.parse(JSON.stringify(w))};S.view='programs';render();}}]);
  const newBtn=document.getElementById('newConditioning')||document.getElementById('newConditioningEmpty');if(newBtn)newBtn.onclick=create;
  const draft=S.sel.conditioningDraft;
  if(!draft)return;
  const bindInputs=()=>m.querySelectorAll('#conditioningName,#conditioningWarmup,#conditioningFinisher,#conditioningGetReady,#conditioningTransition,#conditioningAutoAdvance,[data-cf],[data-sf]').forEach(el=>{el.oninput=readConditioningEditor;el.onchange=readConditioningEditor;});
  bindInputs();
  // Block order and copies
  m.querySelectorAll('[data-move-block]').forEach(b=>b.onclick=()=>{
    const [i,dir]=b.dataset.moveBlock.split('.').map(Number);readConditioningEditor();
    if(!draft.blocks[i]||!draft.blocks[i+dir])return;[draft.blocks[i],draft.blocks[i+dir]]=[draft.blocks[i+dir],draft.blocks[i]];render();
  });
  m.querySelectorAll('[data-dup-block]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.dupBlock);readConditioningEditor();const src=draft.blocks[i];if(!src)return;
    const copy=JSON.parse(JSON.stringify(src));delete copy.role;copy.name=(src.name||'Block')+' (copy)';draft.blocks.splice(i+1,0,copy);render();
  });
  // Warm-up / finisher as timed blocks: ticking creates a block in the same editor; unticking removes it (undoable).
  const roleBlock=(role,text)=>{
    const first=String(text||'').split(/\r?\n/).map(s=>s.trim()).find(Boolean),seconds=role==='warmup'?300:180,label=role==='warmup'?'Warm-up':'Finisher';
    return {name:label,role,mode:'custom',rounds:1,workSeconds:seconds,restSeconds:0,durationMinutes:Math.round(seconds/60),exercises:[{name:(first||label).slice(0,60),reps:''}],steps:[{name:(first||label).slice(0,60),workSeconds:seconds,restSeconds:0}],restBetweenRounds:0};
  };
  [['timedWarmup','warmup','conditioningWarmup'],['timedFinisher','finisher','conditioningFinisher']].forEach(([checkId,role,textId])=>{
    const box=document.getElementById(checkId);if(!box)return;
    box.onchange=()=>{
      readConditioningEditor();
      if(box.checked){
        if(!draft.blocks.some(b=>b.role===role)){const blk=roleBlock(role,document.getElementById(textId)?.value);if(role==='warmup')draft.blocks.unshift(blk);else draft.blocks.push(blk);}
        render();
      }else{
        const at=draft.blocks.findIndex(b=>b.role===role);if(at<0){render();return;}
        const removed=draft.blocks.splice(at,1)[0],blocks=draft.blocks;render();
        undoToast(`Timed ${role==='warmup'?'warm-up':'finisher'} block removed`,()=>{if(S.sel.conditioningDraft!==draft||draft.blocks!==blocks)return;readConditioningEditor();blocks.splice(Math.min(at,blocks.length),0,removed);render();});
      }
    };
  });
  // Stations
  m.querySelectorAll('[data-convert-steps]').forEach(b=>b.onclick=()=>{
    readConditioningEditor();const blk=draft.blocks[Number(b.dataset.convertSteps)];if(!blk)return;
    const names=(blk.exercises||[]).filter(e=>e.name),work=Number(blk.workSeconds)||30,rest=Number(blk.restSeconds)||0;
    blk.steps=names.length?names.map(e=>({name:e.name,...(e.reps?{reps:e.reps}:{}),workSeconds:work,restSeconds:rest})):[{name:'Work',workSeconds:work,restSeconds:rest}];
    blk.restBetweenRounds=0;render();
  });
  m.querySelectorAll('[data-add-step]').forEach(b=>b.onclick=()=>{
    readConditioningEditor();const blk=draft.blocks[Number(b.dataset.addStep)];if(!blk||!Array.isArray(blk.steps))return;
    const last=blk.steps[blk.steps.length-1]||{};blk.steps.push({name:'',workSeconds:last.workSeconds||30,restSeconds:last.restSeconds??0});render();
    const rows=document.querySelectorAll(`[data-conditioning-block="${b.dataset.addStep}"] .cond-step-name`);rows[rows.length-1]?.focus();
  });
  m.querySelectorAll('[data-move-step]').forEach(b=>b.onclick=()=>{
    const [bi,si,dir]=b.dataset.moveStep.split('.').map(Number);readConditioningEditor();
    const steps=draft.blocks[bi]?.steps;if(!steps||!steps[si+dir])return;[steps[si],steps[si+dir]]=[steps[si+dir],steps[si]];render();
  });
  m.querySelectorAll('[data-remove-step]').forEach(b=>b.onclick=()=>{
    const [bi,si]=b.dataset.removeStep.split('.').map(Number);readConditioningEditor();
    const steps=draft.blocks[bi]?.steps;if(!steps||steps.length<2)return;const removed=steps.splice(si,1)[0];render();
    undoToast(`Station ${removed.name||si+1} removed`,()=>{
      if(S.sel.conditioningDraft!==draft||!draft.blocks[bi])return;
      readConditioningEditor();   // (rebuilds the list from the screen, so re-read it afterwards)
      const cur=draft.blocks[bi].steps;if(!Array.isArray(cur))return;
      cur.splice(Math.min(si,cur.length),0,removed);render();
    });
  });
  m.querySelectorAll('[data-cf="mode"]').forEach(el=>el.onchange=()=>{readConditioningEditor();render();});
  const addBlock=()=>{readConditioningEditor();draft.blocks.push(newConditioningBlock());render();};
  ['addConditioningBlock','addConditioningBlockBottom'].forEach(id=>{const b=document.getElementById(id);if(b)b.onclick=addBlock;});
  m.querySelectorAll('[data-remove-conditioning-block]').forEach(b=>b.onclick=()=>{
    readConditioningEditor();const at=Number(b.dataset.removeConditioningBlock),blocks=draft.blocks,removed=blocks.splice(at,1)[0];render();
    if(removed)undoToast(`${removed.name||'Block'} removed`,()=>{if(S.sel.conditioningDraft!==draft||draft.blocks!==blocks)return;readConditioningEditor();blocks.splice(Math.min(at,blocks.length),0,removed);render();});
  });
  const save=()=>saveConditioningDraft();['saveConditioning','saveConditioningBottom'].forEach(id=>{const b=document.getElementById(id);if(b)b.onclick=save;});
  const dup=document.getElementById('duplicateConditioning');if(dup)dup.onclick=async()=>{readConditioningEditor();const copy=JSON.parse(JSON.stringify(draft));copy.name=(copy.name||'Conditioning')+' copy';const id=uid();try{await Store.put('conditioning',id,copy);}catch(e){showSaveError(e);return;}S.conditioning[id]=copy;S.sel={programsKind:'conditioning',conditioningId:id,conditioningDraft:JSON.parse(JSON.stringify(copy))};render();toast('Conditioning program duplicated');};
  const del=document.getElementById('deleteConditioning');if(del)del.onclick=()=>dialog('Delete conditioning program?','<p>This removes the saved conditioning program.</p>',[{label:'Keep program'},{label:'Delete',kind:'danger',onClick:async()=>{const id=S.sel.conditioningId;try{await Store.del('conditioning',id);}catch(e){showSaveError(e);return;}delete S.conditioning[id];S.view='programs';S.sel={programsKind:'conditioning'};render();}}]);
  const start=document.getElementById('conditioningTimerStart');if(start)start.onclick=async()=>{readConditioningEditor();const saved=await saveConditioningDraft();if(!saved)return;const index=Number(document.getElementById('conditioningTimerBlock')?.value||0),b=draft.blocks[index];if(!b)return;EditorTimer.start(sessionBlockConfig(conditioningFlowOf(draft),b));updateConditioningTimerUI('start',EditorTimer.state());};
  const pause=document.getElementById('conditioningTimerPause');if(pause)pause.onclick=()=>{EditorTimer.pause();updateConditioningTimerUI('tick',EditorTimer.state());};
  const done=document.getElementById('conditioningTimerRoundDone');if(done)done.onclick=()=>{EditorTimer.markRound();updateConditioningTimerUI('tick',EditorTimer.state());};
  const finish=document.getElementById('conditioningTimerFinish');if(finish)finish.onclick=()=>EditorTimer.finish();
  updateConditioningTimerUI('tick',EditorTimer.state());
}

/* ---- conditioning results: what the client actually achieved in each timed block ---- */
function parseClockInput(text){
  const t=String(text??'').trim();if(!t)return null;
  const m=t.match(/^(\d+):(\d{1,2})$/);if(m)return Number(m[1])*60+Number(m[2]);
  const n=Number(t);return Number.isFinite(n)&&n>=0?Math.round(n):null;
}
/* "7 rounds + 5 reps · RPE 8 · note" — one readable line for a block's result. */
function conditioningResultText(r,mode){
  if(!r)return '';
  const parts=[],m=mode||r.mode;
  if(m==='amrap'){if(r.roundsCompleted!=null||r.extraReps)parts.push(`${r.roundsCompleted??0} round${(r.roundsCompleted??0)===1?'':'s'}${r.extraReps?` + ${r.extraReps} rep${r.extraReps===1?'':'s'}`:''}`);}
  else if(m==='forTime'){
    if(r.timeSeconds!=null)parts.push(formatClock(r.timeSeconds)+(r.capped?' (time cap)':''));
    if(r.roundsCompleted)parts.push(`${r.roundsCompleted} round${r.roundsCompleted===1?'':'s'}`);
  }else if(r.roundsCompleted)parts.push(`${r.roundsCompleted} ${m==='emom'?'interval':'round'}${r.roundsCompleted===1?'':'s'}`);
  if(r.calories!=null)parts.push(`${r.calories} cal`);
  if(r.distance!=null)parts.push(`${r.distance} m`);
  if(r.rpe!=null)parts.push(`RPE ${r.rpe}`);
  if(r.note)parts.push(r.note);
  return parts.join(' · ');
}
/* Called when a block finishes in a live session: keep what the timer measured, then ask for the rest. */
function captureConditioningResult(ss,state,opts={ask:true}){
  const idx=ss.currentBlockIndex,block=(ss.blocks||[])[idx];if(!block)return;
  ss.results=ss.results||{};
  const prev=ss.results[idx]||{};
  ss.results[idx]={...prev,blockIndex:idx,mode:block.mode,roundsCompleted:state.roundsCompleted??0,elapsedSeconds:state.elapsed??0,
    ...(block.mode==='forTime'?{timeSeconds:state.elapsed??0,capped:!!state.capped}:{})};
  // Group session: the same timer reading is the starting point for the partner too (they can differ in the dialog).
  (ss.clientIds||[]).slice(1).forEach(p=>{
    ss.partnerResults=ss.partnerResults||{};const pr=ss.partnerResults[p]=ss.partnerResults[p]||{},m=ss.results[idx];
    pr[idx]={...(pr[idx]||{}),blockIndex:idx,mode:block.mode,roundsCompleted:m.roundsCompleted,elapsedSeconds:m.elapsedSeconds,...(block.mode==='forTime'?{timeSeconds:m.timeSeconds,capped:m.capped}:{})};
  });
  scheduleWorkoutAutosave();
  if(opts.ask!==false)openConditioningResultDialog(ss,idx);
}
function openConditioningResultDialog(ss,idx){
  const block=(ss.blocks||[])[idx];if(!block)return;
  const mode=block.mode,val=v=>v==null?'':esc(v);
  const group=!!sessionClientIds(ss),people=group?ss.clientIds:[null];   // group: one set of fields per client
  const resultOf=k=>k===0?((ss.results||{})[idx]||{}):((((ss.partnerResults||{})[people[k]])||{})[idx]||{});
  const field=(id,label,value,attrs='')=>`<label class="field"><span>${label}</span><input id="${id}" type="text" inputmode="decimal" value="${val(value)}" ${attrs}></label>`;
  const fieldsFor=k=>{
    const r=resultOf(k),s=group?'_'+k:'';
    const rpeOptions=['','6','6.5','7','7.5','8','8.5','9','9.5','10'].map(v=>`<option value="${v}" ${String(r.rpe??'')===v?'selected':''}>${v||'—'}</option>`).join('');
    return `<div class="inline-fields">
      ${mode==='forTime'?field('cr_time'+s,'Time (min:sec)',r.timeSeconds!=null?formatClock(r.timeSeconds):'','placeholder="7:42"'):''}
      ${field('cr_rounds'+s,mode==='emom'?'Intervals completed':'Rounds completed',r.roundsCompleted,'inputmode="numeric"')}
      ${mode==='amrap'?field('cr_extra'+s,'Extra reps',r.extraReps,'inputmode="numeric"'):''}
      ${field('cr_cal'+s,'Calories (optional)',r.calories,'inputmode="numeric"')}
      ${field('cr_dist'+s,'Distance, metres (optional)',r.distance,'inputmode="numeric"')}
      <label class="field"><span>RPE (optional)</span><select id="cr_rpe${s}">${rpeOptions}</select></label>
    </div>
    <label class="field"><span>Note (optional)</span><textarea id="cr_note${s}" placeholder="How did it go?">${esc(r.note||'')}</textarea></label>`;
  };
  const body=`<p class="small muted">${esc(block.name||'Block '+(idx+1))} · ${esc(conditioningModeName(mode))}. ${group?'Filled in from the shared timer — adjust each person\'s result, or skip.':'Filled in from the timer — adjust anything, or skip.'}</p>`
    +people.map((cid,k)=>group?`<fieldset class="cr-person"><legend>${esc((S.clients[cid]||{}).name||'Client')}</legend>${fieldsFor(k)}</fieldset>`:fieldsFor(k)).join('');
  dialog('Block result',body,[
    {label:'Skip'},
    {label:'Save result',kind:'primary',onClick:()=>{
      const val2=id=>document.getElementById(id)?.value.trim()??'';
      const num=id=>{const t=val2(id);if(t==='')return null;const n=Number(t);return Number.isFinite(n)&&n>=0?n:null;};
      const nexts=[];
      for(let k=0;k<people.length;k++){
        const s=group?'_'+k:'',next={...resultOf(k),blockIndex:idx,mode};
        const set=(key,v)=>{if(v==null||v==='')delete next[key];else next[key]=v;};
        set('roundsCompleted',num('cr_rounds'+s));
        if(mode==='amrap')set('extraReps',num('cr_extra'+s));
        if(mode==='forTime'){const t=parseClockInput(val2('cr_time'+s));if(val2('cr_time'+s)!==''&&t==null){toast('Enter the time as min:sec, e.g. 7:42');return false;}set('timeSeconds',t);}
        set('calories',num('cr_cal'+s));set('distance',num('cr_dist'+s));
        const rpe=val2('cr_rpe'+s);set('rpe',rpe===''?null:Number(rpe));
        set('note',val2('cr_note'+s));
        nexts.push(next);
      }
      nexts.forEach((next,k)=>{
        if(k===0){ss.results=ss.results||{};ss.results[idx]=next;}
        else{ss.partnerResults=ss.partnerResults||{};(ss.partnerResults[people[k]]=ss.partnerResults[people[k]]||{})[idx]=next;}
      });
      scheduleWorkoutAutosave();render();toast('Result saved');
    }}
  ]);
}
function conditioningResultsPanelHTML(ss,blocks){
  const group=!!sessionClientIds(ss),people=group?ss.clientIds:[null];
  const resultOf=(k,i)=>k===0?(ss.results||{})[i]:(((ss.partnerResults||{})[people[k]])||{})[i];
  const rows=blocks.map((_,i)=>i).filter(i=>people.some((_,k)=>resultOf(k,i)));
  if(!rows.length)return '';
  return `<section class="panel conditioning-results"><h3>Results</h3>${rows.map(i=>`<div class="conditioning-result-row"><div><strong>${esc(blocks[i].name||'Block '+(i+1))}</strong>${people.map((cid,k)=>`<div class="small muted">${group?esc((S.clients[cid]||{}).name||'Client')+': ':''}${esc(conditioningResultText(resultOf(k,i),blocks[i].mode)||'No result entered')}</div>`).join('')}</div><button type="button" class="btn sm ghost" data-edit-result="${i}">Edit</button></div>`).join('')}</section>`;
}
function snapshotConditioningSession(template,id,session){
  return {templateId:id,templateName:template.name||'Conditioning',warmup:template.warmup||'',finisher:template.finisher||'',blocks:JSON.parse(JSON.stringify(session.blocks||template.blocks||[])),blocksCompleted:(session.blocksCompleted||[]).slice(),results:JSON.parse(JSON.stringify(session.results||{})),startedAt:session.startedAt,completedAt:Date.now()};
}
function wireConditioningWorkout(){
  const ss=S.sel.conditioningSession;if(!S.sel.conditioningClient||!ss)return;
   const w=S.conditioning[S.sel.conditioningId],blocks=Array.isArray(ss.blocks)?ss.blocks:(ss.blocks=JSON.parse(JSON.stringify(w?.blocks||[]))),combined=S.sel.conditioningMode==='both';
  // A block that was running or paused (before a reload, or while the coach was on another screen) picks up again.
  if(ss.timer&&ConditioningTimer.owner!==ss){ConditioningTimer.owner=ss;ConditioningTimer.restore(ss.timer);}
  const blockSelect=document.getElementById('conditioningTimerBlock');
  if(blockSelect)blockSelect.onchange=()=>{ss.blockIndex=Number(blockSelect.value)||0;render();};
  const start=document.getElementById('conditioningTimerStart');if(start)start.onclick=()=>{
     if(ss.completed)return;
     const b=blocks[Number(blockSelect?.value)||0];if(!b)return;
    ss.blockIndex=Number(blockSelect?.value)||0;ss.currentBlockIndex=ss.blockIndex;
    ConditioningTimer.owner=ss;
    ConditioningTimer.start(sessionBlockConfig(ss.flow,b));
  };
  document.querySelectorAll('[data-edit-result]').forEach(b=>b.onclick=()=>openConditioningResultDialog(ss,Number(b.dataset.editResult)));
  const pause=document.getElementById('conditioningTimerPause');if(pause)pause.onclick=()=>ConditioningTimer.pause();
  const done=document.getElementById('conditioningTimerRoundDone');if(done)done.onclick=()=>ConditioningTimer.markRound();
   const finish=document.getElementById('conditioningTimerFinish');if(finish)finish.onclick=()=>ConditioningTimer.finish();
  const back=document.getElementById('leaveConditioningWorkout');if(back)back.onclick=async()=>{
    if(combined&&S.parkedWorkout){const p=S.parkedWorkout;p.draft.conditioningInProgress=ss;if(ConditioningTimer.state()?.running)ConditioningTimer.pause();S.sel={logClient:p.logClient,dayIndex:p.dayIndex,draft:p.draft,backTo:p.backTo};S.parkedWorkout=null;render();return;}
    const cid=S.sel.conditioningClient;
    if(ConditioningTimer.state()?.running)ConditioningTimer.pause();
    if(!w){
      // Template was deleted: the session can't be resumed, so discard it cleanly.
      await clearWorkoutAutosave();S.view='dashboard';S.sub='clients';S.sel={client:cid};toast('Conditioning session closed');render();return;
    }
    // Keep the session: park it (resume from the bar at the bottom) and go to the client's profile.
    parkWorkout();
    S.view='dashboard';S.sub='clients';S.sel={client:cid};render();
    toast('Conditioning session kept — resume it from the bar at the bottom');
  };
  const complete=document.getElementById('completeConditioningWorkout');if(complete)complete.onclick=async()=>{
     const cid=S.sel.conditioningClient,template=S.conditioning[S.sel.conditioningId];
     if(!ss.completed){
       ConditioningTimer.finish();
       ss.completedResult=snapshotConditioningSession(template,S.sel.conditioningId,ss);
       ss.completed=true;
       render();toast('Conditioning complete — save the session when ready');return;
     }
     const result=ss.completedResult||snapshotConditioningSession(template,S.sel.conditioningId,ss);
    if(combined&&S.parkedWorkout){
      const p=S.parkedWorkout;p.draft.conditioningSession=result;delete p.draft.conditioningInProgress;S.sel={logClient:p.logClient,dayIndex:p.dayIndex,draft:p.draft,backTo:p.backTo};S.parkedWorkout=null;render();toast('Conditioning added to the workout');
    }else{
      // One conditioning log per client (a pairing's shared session gives each their own result). The ids are fixed on the
      // session, so saving again after a failure overwrites instead of duplicating.
      const ids=sessionClientIds(ss)||[cid],group=ids.length>1;
      if(group){ss.logIds=ss.logIds||{};}
      const base=ss.completedResult||result,logs=[];
      for(let k=0;k<ids.length;k++){
        const c=ids[k],lid=k===0?(ss.id||(ss.id=uid())):(ss.logIds[c]||(ss.logIds[c]=uid()));
        const snap=k===0?{...snapshotConditioningSession(template,S.sel.conditioningId,ss),completedAt:base.completedAt}:{...snapshotConditioningSession(template,S.sel.conditioningId,{...ss,results:(ss.partnerResults||{})[c]||{}}),completedAt:base.completedAt};
        logs.push([lid,{clientId:c,date:ss.date||todayISO(),completedAt:base.completedAt,dayLabel:template.name+' · Conditioning',type:'conditioning',conditioningId:S.sel.conditioningId,conditioningSession:snap,entries:[],notes:'',...(group?{sharedSessionId:ss.id}:{})}]);
      }
      // Store first. If it fails, the conditioning session stays open and its recovery copy is kept.
      try{for(const [lid,log] of logs)await Store.put('logs',lid,log);}catch(e){showSaveError(e);return;}
      logs.forEach(([lid,log])=>{S.logs[lid]=log;});invalidateLogIndex();await clearWorkoutAutosave();
      let attendanceSaved=true;
      for(const [,log] of logs){const client=S.clients[log.clientId];try{await setAttendance(log.date,log.clientId,'attended',client&&client.groupId||'');}catch(e){attendanceSaved=false;showSaveError(e);}}
      S.sel={};toast(attendanceSaved?(group?'Conditioning saved for '+clientNamesOf(cid,ss):'Conditioning session saved'):'Conditioning session saved — attendance was NOT recorded');render();
    }
  };
  if(complete)complete.onclick=guardedClick(complete,complete.onclick,'Saving…');
   const addNormal=document.getElementById('addNormalProgram');if(addNormal)addNormal.onclick=()=>{
     const cid=S.sel.conditioningClient,template=S.conditioning[S.sel.conditioningId];
     let result=ss.completedResult;
     if(!result){ConditioningTimer.finish();result=snapshotConditioningSession(template,S.sel.conditioningId,ss);}
     const dayIndex=nextDayIndex(cid),draft=buildDraft(cid,dayIndex);draft.date=ss.date||todayISO();draft.startedAt=ss.startedAt||Date.now();draft.conditioningSession=result;
    S.sel={logClient:cid,dayIndex,draft};render();toast('Normal program added to the conditioning session');
  };
  updateConditioningTimerUI('tick',ConditioningTimer.state());
}

