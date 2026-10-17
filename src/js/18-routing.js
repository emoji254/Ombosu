const VIEWS = [['dashboard','Dashboard'],['programs','Programs'],['exercises','Exercises'],['history','History']];
const DASH_SUBS = [['today','Today'],['calendar','Calendar'],['clients','Clients'],['groups','Pairings'],['data','Data']];
const DASH_VIEWFN = { today:viewToday, calendar:viewCalendar, clients:viewClients, groups:viewGroups, data:viewData };
const TOP_VIEWFN = { programs:viewPrograms, conditioning:viewConditioning, exercises:viewExercises, history:viewProgress, session:viewSession };
/* The live logger and the conditioning session are their own screen (S.view === 'session'). Starting one from
   anywhere remembers where it began; saving or leaving it returns there. */
const sessionOpen = () => !!(S.sel && (S.sel.conditioningClient || S.sel.logClient));
function normalizeSessionRoute(){
  if (sessionOpen() && S.view !== 'session'){ S.returnTo = { view:S.view, sub:S.sub }; S.view = 'session'; }
  else if (!sessionOpen() && S.view === 'session'){
    const r = S.returnTo || {};
    S.view = r.view && r.view !== 'session' ? r.view : 'dashboard';
    if (!S.sub) S.sub = r.sub || 'today';
    S.returnTo = null;
  }
}
function viewSession(){
  if (S.sel.conditioningClient) return sessionChipsHTML() + conditioningWorkoutSheet();
  if (S.sel.logClient) return sessionChipsHTML() + logSheet(S.sel.logClient);
  return '';
}

function buildTabs(){
  const nav = document.getElementById('tabs'); nav.innerHTML = '';
  VIEWS.forEach(([k,label]) => {
    const b = document.createElement('button');
    b.textContent = label; b.dataset.k = k;
    b.onclick = () => { flushProgramEditor(); parkWorkout(); S.view = k; if (k === 'dashboard' && !S.sub) S.sub = 'today'; S.sel = k==='programs'?{programSection:'programs'}:{}; render(); };
    nav.appendChild(b);
  });
}
/* Used by empty-state shortcuts (e.g. "Add a client") that need to land
   on a Dashboard sub-tab rather than a top-level tab. */
function goTo(key){
  if (DASH_SUBS.some(([k]) => k === key)){ S.view = 'dashboard'; S.sub = key; }
  else S.view = key;
  S.sel = {};
}
