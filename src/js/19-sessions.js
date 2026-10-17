/* ---- parallel sessions (semi-private coaching: two clients at once) ----
   The session on screen lives in S.sel (strength: logClient + draft; conditioning: conditioningClient +
   conditioningSession). Every other open session waits in S.sessions, a list of snapshots (most recent first).
   In the combined strength + conditioning flow the strength half waits in S.parkedWorkout and travels with it. */
const sessionKey = rec => (rec && ((rec.draft && rec.draft.id) || (rec.conditioningSession && rec.conditioningSession.id))) || '';
function foregroundKey(){
  if (S.sel?.conditioningClient && S.sel?.conditioningMode === 'both' && S.parkedWorkout) return sessionKey(S.parkedWorkout);
  return (S.sel && S.sel.draft && S.sel.draft.id) || (S.sel && S.sel.conditioningSession && S.sel.conditioningSession.id) || '';
}
function upsertSession(rec, atEnd){
  const k = sessionKey(rec);
  S.sessions = S.sessions.filter(x => sessionKey(x) !== k);
  if (atEnd) S.sessions.push(rec); else S.sessions.unshift(rec);
}
const sessionFor = cid => S.sessions.find(r => r.logClient === cid || ((r.conditioningSession && r.conditioningSession.clientIds) || []).includes(cid)) || null;
const doneSetsOf = d => ((d && d.entries) || []).reduce((n, e) => n + (e.sets || []).filter(s => s.done).length, 0);
/* Moves the session on screen into the parked list (it keeps running by wall clock; nothing is lost). */
function parkWorkout(){
  if (S.sel && S.sel.logClient && S.sel.draft){
    upsertSession({ sessionType:'strength', activePhase:'strength', logClient:S.sel.logClient, dayIndex:S.sel.dayIndex||0, draft:S.sel.draft, backTo:S.sel.backTo||'' });
    return;
  }
  if (S.sel && S.sel.conditioningClient && S.sel.conditioningMode === 'both' && S.parkedWorkout){
    const p = S.parkedWorkout;
    p.draft.conditioningInProgress = S.sel.conditioningSession;
    p.activePhase = 'conditioning';
    p.conditioningId = S.sel.conditioningId;
    p.conditioningMode = 'both';
    p.conditioningSession = S.sel.conditioningSession;
    upsertSession(p); S.parkedWorkout = null;
    return;
  }
  if (S.sel && S.sel.conditioningClient && S.sel.conditioningMode !== 'both'){
    const ss = S.sel.conditioningSession || {};
    if (!ss.id) ss.id = uid();
    upsertSession({ sessionType:'conditioning', logClient:S.sel.conditioningClient, conditioningId:S.sel.conditioningId, conditioningMode:'conditioning', conditioningSession:ss, draft:{ clientId:S.sel.conditioningClient, date:ss.date||todayISO(), startedAt:ss.startedAt||Date.now(), entries:[] } });
  }
}
/* ---- banner listing saved interrupted workouts (S.recoveryArchive, newest first) ---- */
function describeSavedWorkout(w){
  const client=w.conditioningSession&&sessionClientIds(w.conditioningSession)?clientNamesOf(w.logClient,w.conditioningSession):(S.clients[w.logClient]?.name||'a client');
  const conditioning=w.sessionType==='conditioning';
  const what=conditioning?(S.conditioning[w.conditioningId]?.name||'Conditioning'):(w.draft?.dayLabel||'Workout');
  const started=Number(w.draft?.startedAt||w.conditioningSession?.startedAt)||0;
  const sets=(w.draft?.entries||[]).reduce((n,e)=>n+(e.sets||[]).filter(s=>s.done).length,0);
  const when=started?new Date(started).toLocaleString([],{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  return {client,what,when,sets,conditioning};
}
function recoveryBannerHTML(){
  const list=S.recoveryArchive||[];
  return `<section class="recovery-banner panel" aria-label="Saved interrupted workouts">
    <div><strong>${list.length===1?'1 saved interrupted workout':list.length+' saved interrupted workouts'}</strong>
      <div class="small muted">Recover to carry on where you left off, or dismiss what you don't need.</div></div>
    <div class="recovery-list">${list.map((w,i)=>{const d=describeSavedWorkout(w);return `<div class="recovery-row">
      <div><strong>${esc(d.client)}</strong> · ${esc(d.what)}<div class="small muted">${d.when?'Started '+esc(d.when):''}${d.conditioning?'':` · ${d.sets} set${d.sets===1?'':'s'} ticked`}</div></div>
      <div class="row tight"><button type="button" class="btn primary sm" data-recover-index="${i}">Recover</button><button type="button" class="btn ghost sm" data-dismiss-index="${i}">Dismiss</button></div>
    </div>`;}).join('')}</div></section>`;
}
function wireRecoveryBanner(){
  const m=document.getElementById('main');
  m.querySelectorAll('[data-recover-index]').forEach(b=>b.onclick=async()=>{
    const i=Number(b.dataset.recoverIndex),saved=S.recoveryArchive[i];if(!saved)return;
    const rest=S.recoveryArchive.filter((_,j)=>j!==i);
    try{await Store.putMeta('workoutDraftArchive',rest);S.recoveryArchive=rest;}
    catch(error){showSaveError(error);}   // still resume; it just stays in the list too
    resumeRecovery(saved);
  });
  m.querySelectorAll('[data-dismiss-index]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.dismissIndex),w=S.recoveryArchive[i];if(!w)return;
    const d=describeSavedWorkout(w);
    dialog('Discard this saved workout?',`<p>${esc(d.client)} · ${esc(d.what)}${d.when?' · started '+esc(d.when):''}.</p><p class="small muted">It was never saved to history${d.conditioning?'':` — its ${d.sets} ticked set${d.sets===1?'':'s'} will be lost`}. This can't be undone.</p>`,[
      {label:'Keep it'},
      {label:'Discard',kind:'danger',onClick:async()=>{
        const rest=S.recoveryArchive.filter(x=>x!==w);
        try{await Store.putMeta('workoutDraftArchive',rest);}catch(error){showSaveError(error);return false;}
        S.recoveryArchive=rest;toast('Saved workout discarded');render();
      }}
    ]);
  });
}
function resumeParkedWorkout(key){
  if (typeof key !== 'string') key = '';
  if (sessionOpen()){
    if (key && key === foregroundKey()) return true;   // already on screen
    if (S.sel.conditioningClient && ConditioningTimer.state()?.running) ConditioningTimer.pause();
    parkWorkout();
  }
  const i = key ? S.sessions.findIndex(r => sessionKey(r) === key) : 0;
  const parked = S.sessions[i]; if (!parked) return false;
  S.sessions.splice(i, 1);
  if (parked.sessionType === 'conditioning'){
    S.sel = { conditioningClient:parked.logClient, conditioningId:parked.conditioningId, conditioningMode:'conditioning', conditioningSession:parked.conditioningSession };
  } else if (parked.activePhase === 'conditioning' && parked.conditioningSession){
    S.parkedWorkout = parked;
    S.sel = { conditioningClient:parked.logClient, conditioningId:parked.conditioningId || parked.draft.conditioningTemplateId, conditioningMode:'both', conditioningSession:parked.conditioningSession };
  } else {
    S.sel = { logClient:parked.logClient, dayIndex:parked.dayIndex, draft:parked.draft, backTo:parked.backTo };
  }
  render(); scheduleWorkoutAutosave(); return true;
}
let activeWorkoutSaveTimer=null,activeWorkoutSaveChain=Promise.resolve(),legacyDraftCleared=false;
/* Everything open right now: the session on screen first, then the parked ones. null when nothing is open. */
function currentWorkoutSnapshot(){
  const list = [];
  if (S.sel?.logClient && S.sel?.draft) list.push({ sessionType:'strength', logClient:S.sel.logClient, dayIndex:S.sel.dayIndex||0, backTo:S.sel.backTo||'', draft:S.sel.draft });
  else if (S.sel?.conditioningClient && S.sel?.conditioningSession) list.push({ sessionType:S.sel.conditioningMode==='both'?'both':'conditioning', logClient:S.sel.conditioningClient, conditioningId:S.sel.conditioningId, conditioningMode:S.sel.conditioningMode, conditioningSession:S.sel.conditioningSession, draft:S.parkedWorkout?.draft||null, parkedWorkout:S.parkedWorkout||null });
  S.sessions.forEach(r => list.push(r));
  return list.length ? list : null;
}
/* Switch to another open session: the current one is parked, the chosen one comes up. */
function switchSession(key){ resumeParkedWorkout(key); }
function sessionChipsHTML(){
  const items = [];
  if (S.sel?.logClient && S.sel?.draft) items.push({ key:foregroundKey(), name:(S.clients[S.sel.logClient]||{}).name||'Client', label:doneSetsOf(S.sel.draft)+' sets', current:true });
  else if (S.sel?.conditioningClient && S.sel?.conditioningSession) items.push({ key:foregroundKey(), name:clientNamesOf(S.sel.conditioningClient, S.sel.conditioningSession), label:S.sel.conditioningMode==='both'?doneSetsOf(S.parkedWorkout&&S.parkedWorkout.draft)+' sets + conditioning':'conditioning', current:true });
  S.sessions.forEach(r => items.push({ key:sessionKey(r), name:clientNamesOf(r.logClient, r.conditioningSession), label:r.sessionType==='conditioning'?'conditioning':doneSetsOf(r.draft)+' sets'+(r.activePhase==='conditioning'?' + conditioning':''), current:false }));
  if (items.length < 2) return '';
  return `<nav class="session-chips" aria-label="Open sessions">${items.map(it => `<button type="button" class="session-chip${it.current?' on':''}" data-switch-session="${esc(it.key)}" aria-pressed="${it.current}"><strong>${esc(it.name)}</strong><span class="small">${esc(it.label)}</span></button>`).join('')}</nav>`;
}
function setWorkoutSaveStatus(text){const el=document.getElementById('workoutSaveStatus');if(el)el.textContent=text;}
function persistWorkoutSnapshot(snapshot){
  const saved = { sessions:snapshot, savedAt:Date.now() };
  activeWorkoutSaveChain=activeWorkoutSaveChain.then(async()=>{
    try{
      await Store.putMeta('activeSessions',JSON.parse(JSON.stringify(saved)));
      if(!legacyDraftCleared){legacyDraftCleared=true;try{await Store.putMeta('activeWorkoutDraft',null);}catch{}}
      const destination=MODE==='file'?'in data file':'on this device';
      setWorkoutSaveStatus(`Saved ${destination} · ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`);
      S.recoverySaved=true;
      return true;
    }catch(error){console.error('Workout autosave failed',error);setWorkoutSaveStatus('Save failed');showSaveError(error,{background:true});return false;}
  });
  return activeWorkoutSaveChain;
}
function scheduleWorkoutAutosave(){
  const snapshot=currentWorkoutSnapshot();if(!snapshot)return;
  setWorkoutSaveStatus('Saving…');
  clearTimeout(activeWorkoutSaveTimer);
  activeWorkoutSaveTimer=setTimeout(()=>persistWorkoutSnapshot(currentWorkoutSnapshot()||[]),350);
}
function flushWorkoutAutosave(){
  const snapshot=currentWorkoutSnapshot();if(!snapshot)return;
  clearTimeout(activeWorkoutSaveTimer);activeWorkoutSaveTimer=null;
  // localStorage writes synchronously, so a refresh/page close cannot interrupt
  // the most recent draft while an async debounce is still pending.
  if(MODE==='local'){
    try{localStorage.setItem(LOCAL==='idb'?'nyaega:pending:activeSessions':'nyaega:meta:activeSessions',JSON.stringify({sessions:snapshot,savedAt:Date.now()}));if(LOCAL!=='idb')localStorage.removeItem('nyaega:meta:activeWorkoutDraft');S.recoverySaved=true;}
    catch(error){console.error('Workout autosave flush failed',error);}
    return;
  }
  persistWorkoutSnapshot(snapshot);
}
/* The session on screen was saved or discarded: keep the backup of every OTHER open session, drop the rest. */
async function clearWorkoutAutosave(){
  clearTimeout(activeWorkoutSaveTimer);await activeWorkoutSaveChain;
  try{
    const rest=S.sessions.map(r=>JSON.parse(JSON.stringify(r)));
    await Store.putMeta('activeSessions',rest.length?{sessions:rest,savedAt:Date.now()}:null);
    await Store.putMeta('activeWorkoutDraft',null);
    try{localStorage.removeItem('nyaega:pending:activeSessions');}catch{}
    S.recoveryList=[];S.recoverySaved=rest.length>0;
  }catch(error){console.error('Could not clear workout recovery state',error);}
}
window.addEventListener('pagehide',flushWorkoutAutosave);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushWorkoutAutosave();else takeDailySnapshot();});
/* True when two saved workout snapshots are the same workout (by draft/session id, else by content). */
function sameWorkout(a,b){
  if(!a||!b)return false;
  const idOf=w=>w.draft?.id||w.conditioningSession?.id||null;
  if(idOf(a)&&idOf(b))return idOf(a)===idOf(b);
  return JSON.stringify(a.draft||null)===JSON.stringify(b.draft||null)&&JSON.stringify(a.conditioningSession||null)===JSON.stringify(b.conditioningSession||null);
}
function resumeRecovery(snapshot){
  if(!snapshot)return;
  if(sessionOpen())parkWorkout();
  const key=sessionKey(snapshot.sessionType==='both'&&snapshot.parkedWorkout?snapshot.parkedWorkout:snapshot);
  if(key)S.sessions=S.sessions.filter(r=>sessionKey(r)!==key);   // the recovered copy replaces one already parked
  if(snapshot.sessionType==='conditioning'){S.parkedWorkout=null;S.sel={conditioningClient:snapshot.logClient,conditioningId:snapshot.conditioningId,conditioningMode:'conditioning',conditioningSession:snapshot.conditioningSession};}
  else if(snapshot.sessionType==='both'&&snapshot.parkedWorkout){S.parkedWorkout=snapshot.parkedWorkout;S.sel={conditioningClient:snapshot.logClient,conditioningId:snapshot.conditioningId,conditioningMode:'both',conditioningSession:snapshot.conditioningSession};}
  else{S.parkedWorkout=null;S.sel={logClient:snapshot.logClient,dayIndex:snapshot.dayIndex||0,draft:snapshot.draft,backTo:snapshot.backTo||''};}
  S.recoveryList=[];render();scheduleWorkoutAutosave();
}
/* Recover every open session: the first comes up, the rest wait as parked sessions. */
function resumeAllRecovery(list){
  const snaps=(list||[]).slice(),first=snaps.shift();
  snaps.forEach(sn=>{
    const rec=sn.sessionType==='both'&&sn.parkedWorkout?{...sn.parkedWorkout,activePhase:'conditioning',conditioningId:sn.conditioningId,conditioningMode:'both',conditioningSession:sn.conditioningSession}:sn;
    upsertSession(rec,true);
  });
  resumeRecovery(first);
}
async function loadRecoveryList(){
  let a=await Store.getMeta('activeSessions',null);
  // A page-close copy written synchronously (IndexedDB can't finish during unload): use it if it's newer, and move it into the database.
  try{
    const raw=localStorage.getItem('nyaega:pending:activeSessions');
    if(raw){
      const p=JSON.parse(raw);
      if(p&&Array.isArray(p.sessions)&&p.sessions.length&&(!a||!a.savedAt||(p.savedAt||0)>=a.savedAt)){a=p;await Store.putMeta('activeSessions',p);}
      localStorage.removeItem('nyaega:pending:activeSessions');
    }
  }catch(e){console.warn('Could not read the page-close session copy',e);}
  if(a&&Array.isArray(a.sessions)&&a.sessions.length)return a.sessions;
  const legacy=await Store.getMeta('activeWorkoutDraft',null);   // older versions kept a single draft here
  return legacy?[legacy]:[];
}
function showWorkoutRecovery(){
  const list=S.recoveryList||[];if(!list.length)return;
  const many=list.length>1;
  const rows=list.map(sn=>{const d=describeSavedWorkout(sn);return `<li><strong>${esc(d.client)}</strong> · ${esc(d.what)}${d.conditioning?'':` · ${d.sets} set${d.sets===1?'':'s'} ticked`}</li>`;}).join('');
  const saved=list[0]&&list[0].savedAt?esc(new Date(list[0].savedAt).toLocaleString()):'during a previous session';
  dialog(many?'Unfinished sessions':'Unfinished workout',
    many?`<p>You have <strong>${list.length}</strong> unfinished sessions:</p><ul class="pr-summary">${rows}</ul><p class="small muted">Last saved ${saved}. Resume them all, keep them saved for later, or discard them.</p>`
        :`<p>You have an unfinished workout: <strong>${describeSavedWorkout(list[0]).client}</strong> · ${esc(describeSavedWorkout(list[0]).what)}. It was last saved ${saved}.</p><p class="small muted">Resume it, keep it saved and start a new workout, or discard it.</p>`,[
    {label:many?'Resume all':'Resume workout',kind:'primary',onClick:()=>resumeAllRecovery(list)},
    {label:many?'Discard all':'Discard workout',kind:'danger',onClick:async()=>{await clearWorkoutAutosave();S.recoveryList=[];render();}},
    {label:many?'Keep for later':'Log a new session',onClick:async()=>{
      S.recoveryArchive=[...list.map(sn=>JSON.parse(JSON.stringify(sn))),...(S.recoveryArchive||[])].slice(0,8);
      await Store.putMeta('workoutDraftArchive',S.recoveryArchive);await clearWorkoutAutosave();S.recoveryList=[];S.view='dashboard';S.sub='clients';S.sel={};render();}}
  ],{dismissible:false});
}
function renderWorkoutDock(){
  const dock = document.getElementById('workoutDock');
  if (!dock) return;
  const list = S.sessions;
  if (sessionOpen() || !list.length){ dock.hidden = true; dock.innerHTML = ''; return; }
  dock.hidden = false;
  dock.innerHTML = list.slice(0,3).map((parked,i) => {
    const client = S.clients[parked.logClient], clientName = client ? client.name : 'Client';
    const conditioning = parked.sessionType==='conditioning' || parked.activePhase==='conditioning';
    const sessionName = parked.sessionType==='conditioning' ? (S.conditioning[parked.conditioningId]?.name || 'Conditioning') : conditioning ? 'Conditioning in progress' : 'Workout in progress';
    const exCount = ((parked.draft && parked.draft.entries) || []).length;
    return `<button type="button" class="workout-dock-tab" data-resume-session="${esc(sessionKey(parked))}" aria-label="Resume ${esc(conditioning?'conditioning session':'workout in progress')} for ${esc(clientName)}">
      <span class="workout-dock-pulse" aria-hidden="true"></span><span class="workout-dock-label"><strong>${esc(sessionName)}${list.length>1?` · ${i+1} of ${list.length}`:''}</strong><small${i===0?' id="dockStatus"':''}>${esc(clientName)} · ${conditioning?'conditioning session':`${exCount} exercises · ${doneSetsOf(parked.draft)} sets checked`}</small></span>
    </button>`;
  }).join('') + (list.length>3?`<div class="small muted" style="text-align:center">+${list.length-3} more open sessions</div>`:'');
  dock.querySelectorAll('[data-resume-session]').forEach(b => b.onclick = () => resumeParkedWorkout(b.dataset.resumeSession));
}
let workoutTicker = null;
let lastPeriodicWorkoutAutosave=0;
function formatClock(seconds){
  const n=Math.max(0,Math.floor(Number(seconds)||0));
  const h=Math.floor(n/3600), m=Math.floor((n%3600)/60), s=n%60;
  return h ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function formatSessionClock(seconds){const n=Math.max(0,Math.floor(Number(seconds)||0));return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor((n%3600)/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function workoutProgress(d){
  const entries=d && d.entries || [];
  const all=entries.reduce((n,e)=>n+(e.sets||[]).length,0);
  const done=entries.reduce((n,e)=>n+(e.sets||[]).filter(s=>s.done).length,0);
  return `${done} of ${all} sets checked · ${entries.length} exercises`;
}
