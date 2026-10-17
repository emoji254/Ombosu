/* ---- keep the coach's place when the same screen is redrawn ---- */
// Which screen is showing. Redrawing the same screen (add set, ±kg, swipe, day switch…) keeps
// scroll, focus and open panels; moving to a different screen starts at the top.
let lastRouteKey = null;
function routeKey(){
  const s = S.sel || {};
  return [S.view, S.view === 'dashboard' ? (S.sub || 'today') : '', s.client, s.clientPanel, s.program, s.programsKind, s.conditioningId,
    s.historyClient, s.historyDay, s.logClient, s.conditioningClient].map(v => v == null ? '' : String(v)).join('|');
}
const attrSel = a => `[${a.name}="${CSS.escape(a.value)}"]`;
function captureFocus(m){
  const el = document.activeElement;
  if (!el || el === document.body || !m.contains(el)) return null;
  let sel;
  if (el.id) sel = '#' + CSS.escape(el.id);
  else {
    const own = [...el.attributes].filter(a => a.name.startsWith('data-') || a.name === 'name').map(attrSel).join('');
    if (!own) return null;   // nothing that identifies it reliably after a redraw
    const scope = [];
    for (let p = el.parentElement; p && p !== m; p = p.parentElement){
      const keys = [...p.attributes].filter(a => /^data-(ei|si|di|ii)$/.test(a.name)).map(attrSel).join('');
      if (keys) scope.unshift(p.tagName.toLowerCase() + keys);
    }
    sel = [...scope, el.tagName.toLowerCase() + own].join(' ');
  }
  let start = null, end = null; try { start = el.selectionStart; end = el.selectionEnd; } catch {}
  return { sel, start, end };
}
function restoreFocus(m, f){
  if (!f) return;
  const hits = m.querySelectorAll(f.sel); if (hits.length !== 1) return;
  const el = hits[0]; try { el.focus({ preventScroll: true }); } catch {}
  if (f.start != null) try { el.setSelectionRange(f.start, f.end); } catch {}
}
// Open "Effort · RPE / RIR" panels, per exercise block, in order.
function captureOpenPanels(m){
  const open = {};
  m.querySelectorAll('.exblock[data-ei]').forEach(b => { open[b.dataset.ei] = [...b.querySelectorAll('details.set-more')].map(d => d.open); });
  return open;
}
function restoreOpenPanels(m, open){
  if (!open) return;
  m.querySelectorAll('.exblock[data-ei]').forEach(b => { const was = open[b.dataset.ei]; if (was) b.querySelectorAll('details.set-more').forEach((d,i) => { if (was[i]) d.open = true; }); });
}
function render(opts = {}){
  normalizeSessionRoute();
  const m = document.getElementById('main');
  const key = routeKey(), keep = opts.keepScroll ?? (lastRouteKey !== null && key === lastRouteKey);
  const scrollY = window.scrollY, focus = keep ? captureFocus(m) : null, openPanels = keep ? captureOpenPanels(m) : null;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-current', String(b.dataset.k === (S.view === 'session' ? ((S.returnTo && S.returnTo.view) || 'dashboard') : S.view) || (b.dataset.k==='programs'&&S.view==='conditioning'))));
  if (S.view === 'dashboard'){
    const sub = S.sub || 'today';
    const subNav = `<nav class="subtabs" aria-label="Dashboard sections">${DASH_SUBS.map(([k,label]) =>
      `<button data-sub="${k}" aria-current="${sub===k}">${esc(label)}</button>`).join('')}</nav>`;
    m.innerHTML = subNav + DASH_VIEWFN[sub]();
  } else {
    m.innerHTML = TOP_VIEWFN[S.view]();
  }
  // Saved interrupted workouts: shown only on Today and Clients, never over a live workout.
  const showRecoveryBanner=S.recoveryArchive?.length&&!S.sel?.draft&&!S.sel?.conditioningClient&&S.view==='dashboard'&&['today','clients'].includes(S.sub||'today');
  if(showRecoveryBanner){const nav=m.querySelector('nav.subtabs');(nav||m).insertAdjacentHTML(nav?'afterend':'afterbegin',recoveryBannerHTML());}
  wire();
  enhanceKeyboard(m);
  if(!S.sel?.conditioningDraft)EditorTimer.reset();   // the template preview never outlives the editor screen
  if(showRecoveryBanner)wireRecoveryBanner();
  renderWorkoutDock();
  document.body.classList.toggle('has-workout-dock',!document.getElementById('workoutDock')?.hidden);
  renderTimerBar();
  // Focus mode: while logging on a phone/tablet, hide the sub-tabs and shrink the header (CSS: body.in-session).
  document.body.classList.toggle('in-session',!!(S.sel?.draft||(S.sel?.conditioningClient&&S.sel?.conditioningSession)));
  if (typeof updateBottomNav === 'function') updateBottomNav();
  syncWakeLock();
  startWorkoutTicker();
  if(currentWorkoutSnapshot())scheduleWorkoutAutosave();
  lastRouteKey = key;
  if (keep){ restoreOpenPanels(m, openPanels); window.scrollTo(0, scrollY); restoreFocus(m, focus); }
  else window.scrollTo({ top: 0 });
}

