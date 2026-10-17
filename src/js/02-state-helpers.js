/* --------------------------- state --------------------------- */
const S = { clients:{}, groups:{}, programs:{}, logs:{}, attendance:{}, conditioning:{}, schedule:{}, scheduleExceptions:{}, exercises:[], view:'dashboard', sub:'today', sel:{}, recoveryDraft:null, recoveryList:[], sessions:[], bootState:'loading', recoveryArchive:[] };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const isoOf = d => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const todayISO = () => isoOf(new Date());
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dowOf = iso => new Date(iso + 'T12:00:00').getDay();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byName = (a,b) => (a.name||'').localeCompare(b.name||'');

const SEED_EXERCISES = [
 ['Back squat','Legs','Barbell'],['Front squat','Legs','Barbell'],['Goblet squat','Legs','Dumbbell'],
 ['Split squat','Legs','Dumbbell'],['Walking lunge','Legs','Dumbbell'],['Leg press','Legs','Machine'],
 ['Romanian deadlift','Hinge','Barbell'],['Conventional deadlift','Hinge','Barbell'],['Trap bar deadlift','Hinge','Barbell'],
 ['Hip thrust','Hinge','Barbell'],['Back extension','Hinge','Bodyweight'],['Kettlebell swing','Hinge','Kettlebell'],
 ['Bench press','Push','Barbell'],['Incline dumbbell press','Push','Dumbbell'],['Overhead press','Push','Barbell'],
 ['Push-up','Push','Bodyweight'],['Dip','Push','Bodyweight'],['Cable fly','Push','Cable'],
 ['Pull-up','Pull','Bodyweight'],['Lat pulldown','Pull','Machine'],['Barbell row','Pull','Barbell'],
 ['Single-arm row','Pull','Dumbbell'],['Seated cable row','Pull','Cable'],['Face pull','Pull','Cable'],
 ['Plank','Core','Bodyweight'],['Dead bug','Core','Bodyweight'],['Pallof press','Core','Cable'],
 ['Hanging knee raise','Core','Bodyweight'],['Farmer carry','Core','Dumbbell'],
 ['Bicep curl','Arms','Dumbbell'],['Triceps pushdown','Arms','Cable'],['Hammer curl','Arms','Dumbbell'],
 ['Lateral raise','Shoulders','Dumbbell'],['Rear delt fly','Shoulders','Dumbbell'],
 ['Assault bike','Conditioning','Machine'],['Rower','Conditioning','Machine'],['Sled push','Conditioning','Sled'],
 ['Box jump','Power','Bodyweight'],['Medicine ball slam','Power','Med ball'],['Jump rope','Conditioning','Rope']
].map(([name,category,equipment]) => ({ id: 'seed-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, category, equipment }));   // same id on every device

/* --------------------------- helpers --------------------------- */
/* Polite screen-reader announcement that doesn't depend on a toast being on screen. */
function announce(msg){
  const r = document.getElementById('liveRegion'); if (!r) return;
  r.textContent = ''; setTimeout(() => { r.textContent = msg; }, 50);
}
/* Clickable cards are real keyboard targets: focusable, announced as buttons, Enter/Space activate them. */
function enhanceKeyboard(m){
  m.querySelectorAll('.card:not(.static):not(button):not([role])').forEach(card => {
    if (card.closest('button')) return;
    card.setAttribute('role', 'button'); if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
    card.addEventListener('keydown', e => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); card.click(); } });
  });
}
function toast(msg){
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; t.setAttribute('role','status');
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
/* A toast with an Undo button. Runs undoFn if it's tapped within 5 seconds (or 7 with keyboard focus on it). */
function undoToast(message, undoFn){
  const t = document.createElement('div');
  t.className = 'toast undo-toast'; t.setAttribute('role','status');
  const text = document.createElement('span'); text.textContent = message;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'undo-btn'; b.textContent = 'Undo';
  t.append(text, b); document.body.appendChild(t);
  let timer = setTimeout(() => t.remove(), 5000);
  b.onfocus = () => { clearTimeout(timer); timer = setTimeout(() => t.remove(), 7000); };
  b.onclick = async () => { clearTimeout(timer); t.remove(); try { await undoFn(); } catch(e){ console.warn('Undo failed', e); toast('Could not undo'); } };
  return t;
}
function exName(id){ const e = S.exercises.find(x => x.id === id); return e ? e.name : 'Exercise'; }
/* Exercises are archived, never deleted, so programs and history that use them keep working. */
function activeExercises(){ return S.exercises.filter(e => !e.archived); }
function exerciseUsage(exId){
  const key = String(exId);
  let items = 0; const programs = new Set();
  Object.entries(S.programs).forEach(([pid,p]) => (p.days||[]).forEach(d => (d.items||[]).forEach(it => { if (String(it.exId) === key){ items++; programs.add(pid); } })));
  const logs = Object.values(S.logs).filter(l => workoutLogEntries(l).some(e => String(loggedExerciseId(e) ?? '') === key)).length;
  return { programs: programs.size, items, logs };
}
/* What the program editor's exercise button shows. An archived or missing exercise keeps its
   (labelled) place, so saving can never swap it for another exercise. */
function programExerciseLabel(exId){
  const known=S.exercises.find(e=>e.id===exId);
  if(!known)return '(missing exercise)';
  return known.archived?'(archived) '+known.name:known.name;
}
/* Options list version of the same (kept for any <select> use). */
function programExerciseOptions(selectedId){
  const active = activeExercises().slice().sort(byName);
  const opts = active.map(e => `<option value="${esc(e.id)}" ${e.id===selectedId?'selected':''}>${esc(e.name)}</option>`);
  if (selectedId != null && selectedId !== '' && !active.some(e => e.id === selectedId)){
    const known = S.exercises.find(e => e.id === selectedId);
    opts.unshift(`<option value="${esc(selectedId)}" selected>${known ? '(archived) ' + esc(known.name) : '(missing exercise)'}</option>`);
  }
  return opts.join('');
}
function logMoment(log){return Number(log.completedAt||log.loggedAt||log.conditioningSession?.completedAt)||Number(log.startedAt)||Date.parse((log.date||'1970-01-01')+'T00:00:00')||0;}
/* Sessions are ordered by the day they happened. The save time only breaks ties within the
   same day — so a session logged today for last Tuesday sits at last Tuesday, not at the top. */
function compareLogsNewestFirst(a,b){ return (b.date||'').localeCompare(a.date||'') || logMoment(b)-logMoment(a); }
function isLogBefore(a,b){ return compareLogsNewestFirst(a,b) > 0; }   // a happened before b
/* ---- derived indexes: built once, rebuilt only when logs/attendance change ----
   Each index remembers which collection object and how many records it was built from, so a
   replaced or resized collection is noticed even if a write site forgets to invalidate; edits that
   keep the same count call invalidateLogIndex()/invalidateAttIndex() explicitly. */
const Idx = { logs:null, att:null, hist:new Map(), histEx:null };
const invalidateLogIndex = () => { Idx.logs = null; Idx.hist.clear(); if (Idx.prs) Idx.prs.clear(); if (Idx.prx) Idx.prx.clear(); };
const invalidateAttIndex = () => { Idx.att = null; };
function logIndex(){
  const n = Object.keys(S.logs).length;
  if (Idx.logs && Idx.logs.src === S.logs && Idx.logs.n === n) return Idx.logs;
  const byClient = {};
  for (const [id,l] of Object.entries(S.logs)) (byClient[l.clientId] || (byClient[l.clientId] = [])).push({ ...l, id });
  for (const k in byClient) byClient[k].sort(compareLogsNewestFirst);
  Idx.hist.clear(); if (Idx.prs) Idx.prs.clear(); if (Idx.prx) Idx.prx.clear();
  return Idx.logs = { src:S.logs, n, byClient };
}
function attIndex(){
  const n = Object.keys(S.attendance).length;
  if (Idx.att && Idx.att.src === S.attendance && Idx.att.n === n) return Idx.att;
  const byClient = {}, byDate = {};
  for (const a of Object.values(S.attendance)){
    (byClient[a.clientId] || (byClient[a.clientId] = [])).push(a);
    (byDate[a.date] || (byDate[a.date] = [])).push(a);
  }
  for (const k in byClient) byClient[k].sort((a,b) => (b.date||'').localeCompare(a.date||''));
  return Idx.att = { src:S.attendance, n, byClient, byDate };
}
const logsOnDate = (cid, iso) => (logIndex().byClient[cid] || []).some(l => l.date === iso);
function clientLogs(cid){ return (logIndex().byClient[cid] || []).slice(); }
function workoutLogEntries(log){
  const candidates=[log?.entries,log?.exercises,log?.workoutEntries,log?.movements,log?.lifts,log?.workout?.entries,log?.workout?.exercises,log?.session?.entries,log?.session?.exercises];
  const lists=candidates.map(value=>Array.isArray(value)?value:(value&&typeof value==='object'?Object.values(value):[]));
  return lists.find(list=>list.length)||lists.find(Array.isArray)||[];
}
function loggedExerciseSets(entry){
  const value=entry?.sets??entry?.setLogs??entry?.results;
  if(Array.isArray(value))return value;
  if(value&&typeof value==='object')return Object.values(value);
  if(entry&&(entry.weight!=null||entry.kg!=null||entry.load!=null||entry.reps!=null||entry.rep!=null||entry.actualWeight!=null||entry.actualReps!=null))return [entry];
  return [];
}
function loggedExerciseId(entry){return entry?.exId??entry?.exerciseId??entry?.movementId??entry?.exercise?.id??entry?.movement?.id??null;}
function loggedExerciseName(entry){const value=entry?.name??entry?.exerciseName??entry?.movementName??entry?.exercise?.name??entry?.movement?.name??(typeof entry?.exercise==='string'?entry.exercise:null)??(typeof entry?.movement==='string'?entry.movement:null);return value==null?'':String(value);}
/* Field readers shared by history metrics and exports, so older log shapes read the same everywhere. */
function loggedEntryName(entry){return loggedExerciseName(entry)||exName(loggedExerciseId(entry));}
function setWeight(set){return set?.weight??set?.kg??set?.load??set?.actualWeight??null;}
function setReps(set){return set?.reps??set?.rep??set?.actualReps??null;}
function setRPE(set){return set?.actualRPE??set?.rpe??null;}
function avatarHTML(name){
  const colors = ['var(--plate-blue)','var(--plate-red)','var(--plate-green)','var(--plate-yellow)'];
  let sum = 0; for (const ch of String(name||'')) sum += ch.charCodeAt(0);
  const initial = (String(name||'?').trim()[0] || '?').toUpperCase();
  return `<span class="avatar" style="background:${colors[sum % colors.length]}">${esc(initial)}</span>`;
}

/* Most recent session's set-by-set numbers, plus the heaviest weight ever
   lifted on this exercise — both computed automatically from log history
   so the floor screen can show a direct comparison without RPE. */
function exerciseHistory(cid, exId){
  const editingId=S.sel?.draft?.editing&&S.sel.draft.clientId===cid?S.sel.draft.id:null;
  logIndex();   // rebuilding the log index also clears the memo
  if (Idx.histEx !== S.exercises){ Idx.hist.clear(); Idx.histEx = S.exercises; }
  const key=cid+'|'+exId+'|'+(editingId||'');
  if (!Idx.hist.has(key)) Idx.hist.set(key, computeExerciseHistory(cid, exId));
  return JSON.parse(JSON.stringify(Idx.hist.get(key)));
}
function computeExerciseHistory(cid, exId){
  // While a saved session is being edited, "previous" and "best" only look at sessions before it.
  const editing=S.sel?.draft?.editing&&S.sel.draft.clientId===cid?S.sel.draft.id:null,editedLog=editing&&S.logs[editing];
  const target=S.exercises.find(x=>String(x.id)===String(exId));
  const normalizeName=value=>String(value||'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const targetName=normalizeName(target?.name||exName(exId));
  const history = clientLogs(cid).filter(l => !editedLog || (l.id !== editing && isLogBefore(l, editedLog))); // newest first
  let lastDate = null, lastSets = [], best = null;
  history.forEach(l => {
    const entries=workoutLogEntries(l);
    const e = entries.find(x=>String(loggedExerciseId(x)??'')===String(exId)) ||
      entries.find(x=>targetName&&normalizeName(loggedExerciseName(x))===targetName);
    if (!e) return;
    const normalized=loggedExerciseSets(e).map(s=>({...s,weight:s.weight??s.kg??s.load??s.actualWeight??null,reps:s.reps??s.rep??s.actualReps??null}));
    if(normalized.some(s=>s.weight!=null||s.reps!=null)){
      if(!lastDate)lastDate=l.date;
      normalized.forEach((s,index)=>{
        const slot=Math.max(0,(Number(s.setNumber)||index+1)-1);
        if(!lastSets[slot])lastSets[slot]={weight:null,reps:null};
        if(lastSets[slot].weight==null&&s.weight!=null)lastSets[slot].weight=s.weight;
        if(lastSets[slot].reps==null&&s.reps!=null)lastSets[slot].reps=s.reps;
        // Effort from that session, so the progression suggestion can hold back after a max effort.
        const rpe=s.actualRPE??s.rpe;if(lastSets[slot].actualRPE==null&&rpe!=null&&rpe!=='')lastSets[slot].actualRPE=rpe;
        if(lastSets[slot].actualRIR==null&&s.actualRIR!=null&&s.actualRIR!=='')lastSets[slot].actualRIR=s.actualRIR;
      });
    }
    normalized.forEach(s => { const weight=Number(s.weight);if(s.weight!=null&&Number.isFinite(weight)&&(!best||weight>best.weight))best={weight,reps:s.reps,date:l.date}; });
  });
  return { last:lastDate?{date:lastDate,sets:lastSets}:null, best };
}
function progressionSuggestion(item,last){
  if(!item || !last || !Array.isArray(last.sets)) return null;
  const reps=String(item.reps||'').match(/\d+(?:\.\d+)?/g);
  if(!reps || !reps.length) return null;
  const low=Number(reps[0]), high=Number(reps[1]||reps[0]);
  const count=Math.max(1,Number.parseInt(item.sets,10)||last.sets.length);
  const sets=last.sets.slice(0,count);
  if(sets.length<count || sets.some(s=>!s || s.weight==null || s.reps==null || !Number.isFinite(Number(s.weight)) || !Number.isFinite(Number(s.reps)))) return null;
  const mode=item.progression||'double';
  const loadStep=Math.max(0.1,Number(item.increment)||2.5);
  const observedRPE=sets.map(s=>s.actualRPE??s.rpe).filter(v=>v!==null&&v!==undefined&&v!=='').map(Number).filter(Number.isFinite),maxRPE=observedRPE.length?Math.max(...observedRPE):null;
  const observedRIR=sets.map(s=>s.actualRIR).filter(v=>v!==null&&v!==undefined&&v!==''&&v!=='5+').map(Number).filter(Number.isFinite),minRIR=observedRIR.length?Math.min(...observedRIR):null;
  const effortNote=maxRPE!=null?` · last RPE ${maxRPE}${minRIR!=null?` / RIR ${minRIR}`:''}`:'';
  if(mode==='fixed') return {mode,note:'Repeat the last logged load and reps'+effortNote,sets:sets.map(s=>({weight:Number(s.weight),reps:Number(s.reps)}))};
  const earned=sets.every(s=>Number(s.reps)>=high);
  if(earned&&((maxRPE!=null&&maxRPE>=9.5)||minRIR===0))return {mode,note:`All sets reached ${high}, but effort was ${maxRPE!=null&&maxRPE>=9.5?`RPE ${maxRPE}`:`0 RIR`}. Repeat the load before increasing.${minRIR!=null?` RIR ${minRIR}.`:''}`,sets:sets.map(s=>({weight:Number(s.weight),reps:Number(s.reps)}))};
  return earned
    ? {mode,note:`All sets reached ${high} reps. Add ${loadStep} kg and build from ${low} reps.${effortNote}`,sets:sets.map(s=>({weight:Number((Number(s.weight)+loadStep).toFixed(2)),reps:low}))}
    : {mode,note:`Keep the load and aim for one more rep per set, up to ${high}.${effortNote}`,sets:sets.map(s=>({weight:Number(s.weight),reps:Math.min(high,Math.max(low,Number(s.reps)+1))}))};
}
function est1RM(w, r){ if (!w || !r) return 0; return Math.round(w * (1 + r/30)); }
/* Sessions used = attended sessions since the pack started, plus a manual adjustment.
   Attendance is the single source of truth, so renewing or editing old attendance can't drift the count. */
function packUsedOf(c, id){
  if (!c) return 0;
  id = id || c.id || Object.keys(S.clients).find(k => S.clients[k] === c);
  if (c.packOffset === undefined) return Number(c.packUsed) || 0;
  return Math.max(0, attendedCount(id, c.packStart || '') + (Number(c.packOffset) || 0));
}
function sessionsLeft(c, id){ return Math.max(0, (Number(c.packTotal)||0) - packUsedOf(c, id)); }
/* Existing clients: turn the stored packUsed number into an offset once, so nothing changes on screen. */
async function migratePackOffsets(){
  for (const [cid, c] of Object.entries(S.clients)){
    if (c.packOffset !== undefined) continue;
    const next = { ...c, packOffset: (Number(c.packUsed)||0) - attendedCount(cid, c.packStart || '') };
    try { await Store.put('clients', cid, next); S.clients[cid] = next; } catch(e){ console.warn('Pack migration failed', e); return; }
  }
}
/* Times: <input type="time"> stores "HH:MM"; older free-text ("6:00am") is still understood and shown. */
function parseTimeMinutes(s){
  const m = String(s||'').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2]||0);
  if (m[3]){ if (h<1||h>12) return null; h = h%12 + (m[3][0]==='p'?12:0); }
  return h<24 && min<60 ? h*60+min : null;
}
function fmtTime(s){
  const n = parseTimeMinutes(s); if (n == null) return String(s||'');
  const h = Math.floor(n/60), m = n%60;
  return ((h%12)||12) + ':' + String(m).padStart(2,'0') + (h<12?'am':'pm');
}
const timeSortKey = s => { const n = parseTimeMinutes(s); return n == null ? 9999 : n; };
function timeFieldHTML(id, value, label){
  const n = parseTimeMinutes(value);
  const v = n == null ? '' : String(Math.floor(n/60)).padStart(2,'0') + ':' + String(n%60).padStart(2,'0');
  const legacy = value && n == null ? `<span class="small muted">Current: ${esc(value)} — pick a time to replace it</span>` : '';
  return `<label class="field" style="max-width:200px"><span>${esc(label)}</span><input type="time" id="${id}" value="${v}" data-legacy="${esc(n==null?(value||''):'')}">${legacy}</label>`;
}
const timeFieldVal = id => { const el = document.getElementById(id); return el ? (el.value || el.dataset.legacy || '') : ''; };

/* ---- attendance: one record per client per day, id keeps it idempotent ---- */
const attId = (date, cid) => date + '_' + cid;
const attFor = (date, cid) => S.attendance[attId(date, cid)];
function attList(cid){ return (attIndex().byClient[cid] || []).slice(); }
function attendedCount(cid, from){ return (attIndex().byClient[cid] || []).filter(a => a.status === 'attended' && (!from || a.date >= from)).length; }
function attendedOn(date){ return (attIndex().byDate[date] || []).filter(a => a.status === 'attended').length; }
const attendanceOn = date => (attIndex().byDate[date] || []).slice();
function scheduledOn(dateISO){
  const d = dowOf(dateISO);
  return Object.entries(S.groups).map(([id,g]) => ({id,...g})).filter(g => (g.dow||[]).includes(d) && !isSkipped(dateISO, g.id)).sort((a,b) => timeSortKey(a.time) - timeSortKey(b.time) || (a.name||'').localeCompare(b.name||''));
}
function groupMembers(gid){ return Object.entries(S.clients).map(([id,c]) => ({id,...c})).filter(c => c.groupId === gid && c.status !== 'archived').sort(byName); }
/* ---- scheduling: one-off and moved sessions, and skipped recurring occurrences ---- */
const skipId = (date, key) => date + '_' + key;
const isSkipped = (date, key) => !!S.scheduleExceptions[skipId(date, key)];
function oneOffsOn(date){
  return Object.entries(S.schedule).map(([id,s]) => ({id,...s})).filter(s => s.date === date && s.status !== 'cancelled')
    .sort((a,b) => timeSortKey(a.time) - timeSortKey(b.time));
}
function skippedOn(date){
  return Object.entries(S.scheduleExceptions).map(([id,e]) => ({id,...e})).filter(e => e.date === date);
}
const scheduleNames = ids => (ids||[]).map(i => (S.clients[i]||{}).name).filter(Boolean);
/* Coming up, tomorrow through `days` ahead: pairings, solo recurring clients and one-offs. */
function upcomingSessions(days = 7){
  const out = [], base = new Date();
  for (let i = 1; i <= days; i++){
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i), iso = isoOf(d);
    const slots = scheduledOn(iso);
    slots.forEach(g => out.push({ date:iso, time:g.time, label:g.name, names:groupMembers(g.id).map(c => c.name) }));
    individualsOn(iso).filter(c => !(c.groupId && slots.some(g => g.id === c.groupId)))
      .forEach(c => out.push({ date:iso, time:c.recurTime, label:c.name, names:[c.name] }));
    oneOffsOn(iso).forEach(s => out.push({ date:iso, time:s.time, label:s.label || 'One-off', names:scheduleNames(s.clientIds), note:s.note, oneOff:true }));
  }
  return out.sort((a,b) => a.date.localeCompare(b.date) || timeSortKey(a.time) - timeSortKey(b.time));
}
/* Past sessions this client was expected at (recurring or one-off, not skipped) with no attendance mark.
   Counted only once the day has ended, from when the client was added. */
function missedUnmarkedCount(cid){
  const c = S.clients[cid]; if (!c) return 0;
  const records = attList(cid);
  const from = String(c.createdAt || (records.length ? records[records.length-1].date : '')).slice(0, 10);
  const today = todayISO(); if (!from || from >= today) return 0;
  const g = c.groupId && S.groups[c.groupId];
  // A change to the weekdays, the pairing or the pairing's weekdays only counts from the day it was made:
  // sessions that were never booked under the new schedule are not "missed".
  const latest = (...ds) => ds.filter(Boolean).map(x => String(x).slice(0, 10)).reduce((a, b) => a > b ? a : b);
  const gFrom = latest(from, c.groupFrom, g && g.dowFrom), sFrom = latest(from, c.recurFrom);
  const due = new Set();
  const d = new Date(from + 'T12:00:00'); let guard = 0;
  for (; isoOf(d) < today && guard < 1200; d.setDate(d.getDate()+1), guard++){
    const iso = isoOf(d), dow = d.getDay();
    if (g && iso >= gFrom && (g.dow||[]).includes(dow) && !isSkipped(iso, c.groupId)) due.add(iso);
    if (iso >= sFrom && Array.isArray(c.recurDow) && c.recurDow.includes(dow) && !isSkipped(iso, cid)) due.add(iso);
  }
  Object.values(S.schedule).forEach(s => { if (s.status !== 'cancelled' && (s.clientIds||[]).includes(cid) && s.date >= from && s.date < today) due.add(s.date); });
  let n = 0; due.forEach(iso => { if (!attFor(iso, cid)) n++; });
  return n;
}
async function skipOccurrence(key, kind, date){
  const rec = { date, key, kind };
  try { await Store.put('scheduleExceptions', skipId(date, key), rec); } catch(e){ showSaveError(e); return false; }
  S.scheduleExceptions[skipId(date, key)] = rec; return true;
}
async function restoreOccurrence(date, key){
  const id = skipId(date, key), prev = S.scheduleExceptions[id]; if (!prev) return;
  try { await Store.del('scheduleExceptions', id); } catch(e){ showSaveError(e); return; }
  delete S.scheduleExceptions[id];
  // A moved occurrence also created a one-off on the new date; take it back out.
  for (const [sid, s] of Object.entries(S.schedule)) if (s.movedFrom === date && s.movedKey === key){
    try { await Store.del('schedule', sid); delete S.schedule[sid]; } catch(e){ showSaveError(e); }
  }
}
function scheduleSessionDialog(iso){
  const clients = Object.entries(S.clients).map(([id,c]) => ({id,...c})).filter(c => c.status !== 'archived').sort(byName);
  const dlg = dialog('Add session',
    `<label class="field"><span>Date</span><input type="date" id="s_date" value="${esc(iso)}"></label>
     ${timeFieldHTML('s_time', '', 'Time')}
     <label class="field"><span>Who — one or two clients</span></label>
     <div class="stack small">${clients.map(c => `<label class="row tight" style="gap:.4rem"><input type="checkbox" class="smem" value="${esc(c.id)}" style="width:auto"> ${esc(c.name)}</label>`).join('') || '<span class="muted">No clients yet.</span>'}</div>
     <label class="field"><span>Note</span><input type="text" id="s_note" placeholder="Optional"></label>`,
    [{label:'Cancel'},{label:'Add', kind:'primary', onClick: async () => {
      const date = val('s_date'), ids = [...document.querySelectorAll('.smem:checked')].map(i => i.value);
      if (!isISODate(date)){ toast('Choose a date'); return false; }
      if (!ids.length){ toast('Choose at least one client'); return false; }
      if (ids.length > 2){ toast('At most 2 clients per session'); return false; }
      const id = uid(), rec = { date, time: timeFieldVal('s_time'), clientIds: ids, note: val('s_note'), status:'scheduled' };
      try { await Store.put('schedule', id, rec); } catch(e){ showSaveError(e); return false; }
      S.schedule[id] = rec; S.sel.day = date; S.sel.month = date.slice(0,7); toast('Session added'); render();
    }}]);
  dlg.querySelectorAll('.smem').forEach(box => box.onchange = () => {
    if (dlg.querySelectorAll('.smem:checked').length > 2){ box.checked = false; toast('At most 2 clients per session'); }
  });
}
function moveOccurrenceDialog(kind, key, fromDate){
  const name = kind === 'group' ? (S.groups[key]||{}).name : (S.clients[key]||{}).name;
  const time = kind === 'group' ? (S.groups[key]||{}).time : (S.clients[key]||{}).recurTime;
  const d = new Date(fromDate + 'T12:00:00'); d.setDate(d.getDate() + 1);
  dialog('Move ' + (name||'session'),
    `<p class="small muted">Skips ${esc(fromDate)} and adds a one-off session on the new date.</p>
     <label class="field"><span>Move to</span><input type="date" id="mv_date" value="${esc(isoOf(d))}"></label>
     ${timeFieldHTML('mv_time', time, 'Time')}`,
    [{label:'Cancel'},{label:'Move', kind:'primary', onClick: async () => {
      const date = val('mv_date');
      if (!isISODate(date) || date === fromDate){ toast('Choose a different date'); return false; }
      const ids = kind === 'group' ? groupMembers(key).map(c => c.id) : [key];
      if (!(await skipOccurrence(key, kind, fromDate))) return false;
      const id = uid(), rec = { date, time: timeFieldVal('mv_time'), clientIds: ids, label: name, note: 'Moved from ' + fromDate, status:'scheduled', movedFrom: fromDate, movedKey: key };
      try { await Store.put('schedule', id, rec); } catch(e){ showSaveError(e); return false; }
      S.schedule[id] = rec; S.sel.day = date; S.sel.month = date.slice(0,7); toast('Moved to ' + date); render();
    }}]);
}

/* Clients with their own recurring day/time, independent of any pairing —
   covers a solo client who isn't part of a two-person slot. */
function individualsOn(dateISO){
  const d = dowOf(dateISO);
  return Object.entries(S.clients).map(([id,c]) => ({id,...c}))
    .filter(c => c.status !== 'archived' && Array.isArray(c.recurDow) && c.recurDow.includes(d) && !isSkipped(dateISO, c.id))
    .sort((a,b) => timeSortKey(a.recurTime) - timeSortKey(b.recurTime) || byName(a,b));
}

/* The pack counter is derived from attendance (packUsedOf), so marking,
   unmarking and auto-marking from a saved workout can never double-count. */
async function setAttendance(date, cid, status, groupId){
  const id = attId(date, cid), prev = S.attendance[id];
  const was = !!prev && prev.status === 'attended';
  // Storage first, then memory — a failed write leaves the screen matching what's stored.
  if (!status){ if (prev){ await Store.del('attendance', id); delete S.attendance[id]; invalidateAttIndex(); } }
  else {
    const rec = { date, clientId: cid, groupId: groupId || (prev && prev.groupId) || '', status };
    await Store.put('attendance', id, rec); S.attendance[id] = rec; invalidateAttIndex();
  }
}


