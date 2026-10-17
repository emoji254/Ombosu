/* ---------------------------------------------------------------
   N7: a rest that ends for a client who is not on screen still beeps, vibrates and names the client.
----------------------------------------------------------------*/
function openDrafts(){
  const list = [];
  if (S.sel && S.sel.draft) list.push({ draft:S.sel.draft, cid:S.sel.draft.clientId });
  if (S.parkedWorkout && S.parkedWorkout.draft) list.push({ draft:S.parkedWorkout.draft, cid:S.parkedWorkout.logClient });
  S.sessions.forEach(r => { if (r.draft && r.draft.entries) list.push({ draft:r.draft, cid:r.logClient }); });
  return list;
}
function checkOtherRests(current){
  for (const { draft, cid } of openDrafts()){
    if (draft === current || !draft.restRunning || !draft.restEndAt || draft.restEndAt > Date.now()) continue;
    draft.restRunning = false; draft.restEndAt = null; draft.restRemainingMs = 0;
    const n = (S.clients[cid] || {}).name || 'a client';
    toast('Rest done: ' + n); announce('Rest finished for ' + n); cue('restEnd'); scheduleWorkoutAutosave();
  }
}
/* The soonest-ending rest of a client who is not the one on screen (shown beside the main rest clock). */
function otherRestInfo(current){
  let best = null;
  for (const { draft, cid } of openDrafts()){
    if (draft === current || !draft.restRunning || !draft.restEndAt) continue;
    const left = draft.restEndAt - Date.now();
    if (left <= 0) continue;
    if (!best || left < best.left) best = { left, name:(S.clients[cid] || {}).name || 'Client' };
  }
  return best;
}

