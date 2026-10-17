/* ---- audio + vibration cues, and keeping the screen awake during a session ---- */
const Cues={
  ctx:null,
  muted(){try{return localStorage.getItem('nyaega:muted')==='1';}catch{return false;}},
  setMuted(v){try{v?localStorage.setItem('nyaega:muted','1'):localStorage.removeItem('nyaega:muted');}catch{}},
  // Browsers only allow sound after a tap, so the audio context is created on the first tap/keypress.
  unlock(){
    try{
      if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;if(AC)this.ctx=new AC();}
      if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume();
    }catch{}
  },
  beep(freq,seconds,startIn=0,volume=0.25){
    const ctx=this.ctx;if(!ctx||ctx.state!=='running')return;
    const t=ctx.currentTime+startIn,osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type='sine';osc.frequency.value=freq;
    gain.gain.setValueAtTime(0.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+0.01);gain.gain.exponentialRampToValueAtTime(0.0001,t+seconds);
    osc.connect(gain).connect(ctx.destination);osc.start(t);osc.stop(t+seconds+0.02);
  },
  play(type){
    if(this.muted())return;
    const shapes={
      tick:{beeps:[[880,0.09]],vibrate:[40]},
      restEnd:{beeps:[[988,0.14],[988,0.14,0.2],[1319,0.3,0.4]],vibrate:[200,100,200,100,350]},
      work:{beeps:[[1175,0.18]],vibrate:[120]},
      rest:{beeps:[[587,0.22]],vibrate:[60,60,60]},
      done:{beeps:[[784,0.15],[988,0.15,0.18],[1319,0.4,0.36]],vibrate:[300,120,300]}
    };
    const s=shapes[type];if(!s)return;
    s.beeps.forEach(([f,d,at])=>this.beep(f,d,at||0));
    // (Browsers refuse to vibrate before the first tap on the page.)
    try{if(navigator.vibrate&&(!navigator.userActivation||navigator.userActivation.hasBeenActive))navigator.vibrate(s.vibrate);}catch{}
  }
};
const cue=type=>Cues.play(type);
['pointerdown','keydown','touchstart'].forEach(ev=>window.addEventListener(ev,()=>Cues.unlock(),{passive:true}));
let wakeLockSentinel=null;
async function syncWakeLock(){
  const want=!!(S.sel?.draft||S.sel?.conditioningSession||S.parkedWorkout||S.sessions.length);
  if(want&&!wakeLockSentinel&&document.visibilityState==='visible'&&navigator.wakeLock){
    try{
      const sentinel=await navigator.wakeLock.request('screen');
      wakeLockSentinel=sentinel;sentinel.addEventListener('release',()=>{if(wakeLockSentinel===sentinel)wakeLockSentinel=null;});
    }catch(e){console.warn('Wake lock unavailable',e);}
  }else if(!want&&wakeLockSentinel){
    try{await wakeLockSentinel.release();}catch{}
    wakeLockSentinel=null;
  }
}
// The browser drops the lock when the page is hidden; take it again when the coach comes back.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncWakeLock();});

/* ---- sticky bottom timer bar (session clock + rest clock) shown while a workout is on screen ---- */
function timerBarActive(){return !!((S.sel?.draft&&!S.sel.draft.editing)||(S.sel?.conditioningClient&&S.sel?.conditioningSession));}
function renderTimerBar(){
  let bar=document.getElementById('timerBar');
  if(!bar){bar=document.createElement('div');bar.id='timerBar';bar.className='timer-bar';bar.hidden=true;document.body.appendChild(bar);}
  const on=timerBarActive();
  document.body.classList.toggle('has-timer-bar',on);
  if(!on){bar.hidden=true;bar.innerHTML='';return;}
  if(bar.hidden||!bar.firstChild){
    bar.hidden=false;
    bar.innerHTML=`<div class="timer-bar-clocks"><div><span class="timer-kicker">SESSION</span><strong id="barSession" class="num">00:00:00</strong></div><div><span class="timer-kicker">REST</span><strong id="barRest" class="num">01:30</strong></div><div id="barRestOtherWrap" hidden><span class="timer-kicker" id="barRestOtherName">OTHER</span><strong id="barRestOther" class="num">00:00</strong></div></div>
      <div class="timer-bar-actions"><button type="button" class="btn sm" id="barRestToggle">Start</button><button type="button" class="btn sm ghost" id="barMute" aria-label="Sound cues" aria-pressed="false">🔔</button></div>`;
    document.getElementById('barRestToggle').onclick=toggleRest;
    document.getElementById('barMute').onclick=()=>{Cues.setMuted(!Cues.muted());Cues.unlock();updateMuteButton();};
  }
  updateMuteButton();
}
function updateMuteButton(){
  const b=document.getElementById('barMute');if(!b)return;
  const muted=Cues.muted();b.textContent=muted?'🔕':'🔔';b.setAttribute('aria-pressed',String(!muted));b.setAttribute('aria-label',muted?'Sound cues off — tap to turn on':'Sound cues on — tap to turn off');
}
function toggleRest(){
  const d=S.sel?.draft||(S.parkedWorkout&&S.parkedWorkout.draft)||(S.sel?.conditioningClient&&S.sel.conditioningSession)||(S.sessions[0]&&S.sessions[0].draft);if(!d)return;
  if(d.restRunning){d.restRemainingMs=Math.max(0,d.restEndAt-Date.now());d.restRunning=false;d.restEndAt=null;}
  else {if(!d.restRemainingMs || d.restRemainingMs<=0)d.restRemainingMs=(Number(d.restDurationSeconds)||90)*1000;d.restEndAt=Date.now()+d.restRemainingMs;d.restRunning=true;}
  updateWorkoutTimerUI();scheduleWorkoutAutosave();
}
let lastTickCue='';
function updateWorkoutTimerUI(){
  const d=(S.sel && S.sel.draft) || (S.parkedWorkout && S.parkedWorkout.draft) || (S.sel&&S.sel.conditioningClient&&S.sel.conditioningSession) || (S.sessions[0] && S.sessions[0].draft);
  if(!d) return;
  checkOtherRests(d);
  const elapsed=Math.max(0,Math.floor((Date.now()-(Number(d.startedAt)||Date.now()))/1000));
  const session=document.getElementById('sessionClock'); if(session) session.textContent=formatSessionClock(elapsed);
  const barSession=document.getElementById('barSession'); if(barSession) barSession.textContent=formatSessionClock(elapsed);
  const progress=document.getElementById('exerciseProgress'); if(progress) progress.textContent=S.sel&&S.sel.conditioningClient&&!S.parkedWorkout&&!S.sel.draft?'Conditioning session':workoutProgress(d);
  if(d.restRemainingMs==null) d.restRemainingMs=90000;
  let remaining=Math.max(0,Math.ceil(Number(d.restRemainingMs)/1000));
  if(d.restRunning && d.restEndAt){
    remaining=Math.max(0,Math.ceil((d.restEndAt-Date.now())/1000));
    d.restRemainingMs=remaining*1000;
    if(remaining===0){d.restRunning=false;d.restEndAt=null;{const nm=openDrafts().length>1?((S.clients[d.clientId]||{}).name||''):'';toast(nm?'Rest done: '+nm:'Rest complete');announce(nm?'Rest finished for '+nm:'Rest finished');}cue('restEnd');lastTickCue='';}
    else if(remaining<=3){const key=d.restEndAt+':'+remaining;if(key!==lastTickCue){lastTickCue=key;cue('tick');}}   // 3-2-1
  }
  const rest=document.getElementById('restClock'); if(rest) rest.textContent=formatClock(remaining);
  const barRest=document.getElementById('barRest'); if(barRest){barRest.textContent=formatClock(remaining);barRest.classList.toggle('running',!!d.restRunning);}
  {const other=otherRestInfo(d),w=document.getElementById('barRestOtherWrap');if(w){w.hidden=!other;if(other){document.getElementById('barRestOtherName').textContent=other.name.toUpperCase();document.getElementById('barRestOther').textContent=formatClock(Math.max(0,Math.ceil(other.left/1000)));}}}
  const toggleText=d.restRunning?'Pause':(remaining<(Number(d.restDurationSeconds)||90)?'Resume':`Start ${Number(d.restDurationSeconds)||90}s`);
  const toggle=document.getElementById('restToggle');
  if(toggle) toggle.textContent=toggleText;
  const barToggle=document.getElementById('barRestToggle'); if(barToggle) barToggle.textContent=toggleText;
  const dock=document.getElementById('dockStatus');
  if(dock){const parked=S.sessions[0]; const cl=parked&&S.clients[parked.logClient],conditioning=parked&&(parked.sessionType==='conditioning'||parked.activePhase==='conditioning'); dock.textContent=conditioning?`${cl?cl.name:'Client'} · ${S.conditioning[parked.conditioningId]?.name||'Conditioning'} · ${formatClock(elapsed)} elapsed`:`${cl?cl.name:'Client'} · ${formatClock(elapsed)} elapsed · ${workoutProgress(d)}`;}
  if(Date.now()-lastPeriodicWorkoutAutosave>15000&&currentWorkoutSnapshot()){lastPeriodicWorkoutAutosave=Date.now();scheduleWorkoutAutosave();}
}
function startWorkoutTicker(){
  if(workoutTicker){clearInterval(workoutTicker);workoutTicker=null;}
  if((S.sel&&S.sel.draft)||(S.parkedWorkout&&S.parkedWorkout.draft)||S.sessions.length||(S.sel&&S.sel.conditioningClient&&S.sel.conditioningSession)){
    updateWorkoutTimerUI(); workoutTicker=setInterval(updateWorkoutTimerUI,1000);
  }
}
