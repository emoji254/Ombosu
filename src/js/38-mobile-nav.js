/* ---------------------------------------------------------------
   Phone and tablet navigation (screens up to 900px wide): a bottom bar with the five main places, within reach of a thumb,
   and a round "+" button for quick actions (start a session, add a client, log attendance) from any screen.
   Wider screens keep the left sidebar. Both are hidden while a workout is on screen (focus mode) and under the lock screen.
   The bar and the button are only drawn by CSS at those widths; this file builds them and keeps them current.
----------------------------------------------------------------*/
const NAV_ICON = {
  today:    '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clients:  '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  programs: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM8.5 12h7M8.5 16h5"/>',
  more:     '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  start:    '<path d="M8 5v14l11-7z"/>',
  addClient:'<circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M19 8v6M16 11h6"/>',
  attend:   '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12.5l2.8 2.8L16 9.5"/>',
  pairings: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 20c0-3 2.5-5 5.5-5M21.5 20c0-3-2.5-5-5.5-5"/>',
  exercises:'<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  history:  '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
};
const MOBILE_NAV = [['today', 'Dashboard'], ['calendar', 'Schedule'], ['clients', 'Clients'], ['programs', 'Programs'], ['more', 'More']];
const navSvg = (paths, w = 1.9) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/* Same effect as the top tabs: park any open workout, leave the program editor saved, go to the screen. */
function navigateTo(view, sub){
  flushProgramEditor(); parkWorkout();
  S.view = view; if (view === 'dashboard') S.sub = sub || 'today';
  S.sel = view === 'programs' ? { programSection:'programs' } : {};
  render(); window.scrollTo({ top:0 });
}
function navKeyNow(){
  const v = S.view === 'session' ? ((S.returnTo && S.returnTo.view) || 'dashboard') : S.view;
  if (v === 'dashboard'){ const s = S.sub || 'today'; return s === 'today' ? 'today' : s === 'calendar' ? 'calendar' : s === 'clients' ? 'clients' : 'more'; }
  if (v === 'programs' || v === 'conditioning') return 'programs';
  return 'more';   // exercises, history
}
function ensureMobileNav(){
  if (document.getElementById('bottomNav')) return;
  const nav = document.createElement('nav'); nav.id = 'bottomNav'; nav.setAttribute('aria-label', 'Main'); nav.hidden = true;
  nav.innerHTML = MOBILE_NAV.map(([k, label]) => `<button type="button" data-bn="${k}" aria-current="false">${navSvg(NAV_ICON[k])}<span>${label}</span></button>`).join('');
  const fab = document.createElement('button'); fab.type = 'button'; fab.id = 'fab'; fab.hidden = true;
  fab.setAttribute('aria-label', 'Quick actions'); fab.setAttribute('aria-haspopup', 'menu'); fab.setAttribute('aria-expanded', 'false'); fab.innerHTML = navSvg('<path d="M12 5v14M5 12h14"/>', 2.8);
  const menu = document.createElement('div'); menu.id = 'navMenu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  document.body.append(nav, fab, menu);
  nav.querySelectorAll('[data-bn]').forEach(b => b.onclick = () => navPress(b.dataset.bn, b));
  fab.onclick = () => navMenuIsOpen('fab') ? closeNavMenu() : openNavMenu('fab', quickActionItems());
  document.addEventListener('click', e => { if (navMenuIsOpen() && !e.target.closest('#navMenu, #fab, #bottomNav [data-bn="more"]')) closeNavMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && navMenuIsOpen()){ const a = document.getElementById('navMenu').dataset.anchor; closeNavMenu(); const f = document.querySelector(a === 'fab' ? '#fab' : '#bottomNav [data-bn="more"]'); if (f) f.focus(); } });
}
function navPress(k, button){
  if (k === 'today') return navigateTo('dashboard', 'today');
  if (k === 'calendar') return navigateTo('dashboard', 'calendar');
  if (k === 'clients') return navigateTo('dashboard', 'clients');
  if (k === 'programs') return navigateTo('programs');
  // More: everything that is not one of the four main places
  if (navMenuIsOpen('more')) return closeNavMenu();
  openNavMenu('more', [
    { label:'Pairings', icon:'pairings', go:() => navigateTo('dashboard', 'groups') },
    { label:'Exercises', icon:'exercises', go:() => navigateTo('exercises') },
    { label:'History and progress', icon:'history', go:() => navigateTo('history') },
    { label:'Settings and data', icon:'settings', go:() => { S.dataSection = undefined; navigateTo('dashboard', 'data'); } }
  ]);
}
const navMenuIsOpen = anchor => { const m = document.getElementById('navMenu'); return !!m && !m.hidden && (!anchor || m.dataset.anchor === anchor); };
function closeNavMenu(){
  const m = document.getElementById('navMenu'); if (m){ m.hidden = true; m.innerHTML = ''; }
  const f = document.getElementById('fab'); if (f){ f.setAttribute('aria-expanded', 'false'); f.classList.remove('open'); }
  const more = document.querySelector('#bottomNav [data-bn="more"]'); if (more) more.setAttribute('aria-expanded', 'false');
}
function openNavMenu(anchor, items){
  const m = document.getElementById('navMenu'); if (!m) return;
  m.dataset.anchor = anchor; m.hidden = false;
  m.innerHTML = items.map((it, i) => `<button type="button" role="menuitem" data-mi="${i}">${it.icon ? navSvg(NAV_ICON[it.icon]) : ''}<span>${esc(it.label)}</span></button>`).join('');
  m.querySelectorAll('[data-mi]').forEach(b => b.onclick = () => { const it = items[Number(b.dataset.mi)]; closeNavMenu(); it.go(); });
  const f = document.getElementById('fab'); if (f && anchor === 'fab'){ f.setAttribute('aria-expanded', 'true'); f.classList.add('open'); }
  const more = document.querySelector('#bottomNav [data-bn="more"]'); if (more && anchor === 'more') more.setAttribute('aria-expanded', 'true');
  const first = m.querySelector('button'); if (first) { try { first.focus({ preventScroll:true }); } catch {} }
}
/* Called at the end of every render(). */
function updateBottomNav(){
  ensureMobileNav();
  const show = S.bootState === 'ready' && !document.body.classList.contains('in-session');
  const nav = document.getElementById('bottomNav'), fab = document.getElementById('fab');
  nav.hidden = !show; fab.hidden = !show;
  document.body.classList.toggle('has-bottomnav', show);
  if (!show) closeNavMenu();
  const cur = navKeyNow();
  nav.querySelectorAll('[data-bn]').forEach(b => b.setAttribute('aria-current', String(b.dataset.bn === cur)));
}

/* ---- the "+" menu ---- */
function quickActionItems(){
  const items = [{ label:'Start a session', icon:'start', go:openQuickStart }];
  if (Sync.role !== 'assistant') items.push({ label:'Add a client', icon:'addClient', go:() => { navigateTo('dashboard', 'clients'); const b = document.getElementById('newClient'); if (b) b.click(); } });
  items.push({ label:'Log attendance', icon:'attend', go:openQuickAttendance });
  return items;
}
/* Active clients, those expected today first (a pairing day, their own recurring day, or a one-off session). */
function quickClientGroups(){
  const iso = todayISO(), expected = new Set();
  scheduledOn(iso).forEach(g => groupMembers(g.id).forEach(m => expected.add(m.id)));
  individualsOn(iso).forEach(c => expected.add(c.id));
  oneOffsOn(iso).forEach(s => (s.clientIds || []).forEach(i => expected.add(i)));
  const all = Object.entries(S.clients).map(([id, c]) => ({ id, ...c })).filter(c => c.status !== 'archived').sort(byName);
  return { today:all.filter(c => expected.has(c.id)), others:all.filter(c => !expected.has(c.id)), all };
}
function quickListHTML(groups, rowFn){
  if (!groups.all.length) return '<p class="small muted">No clients yet. Add one first.</p>';
  return (groups.today.length ? `<p class="small muted" style="margin:.2rem 0">Today</p>${groups.today.map(rowFn).join('')}` : '')
    + (groups.others.length ? `<p class="small muted" style="margin:.8rem 0 .2rem">${groups.today.length ? 'Other clients' : 'Clients'}</p>${groups.others.map(rowFn).join('')}` : '');
}
function openQuickStart(){
  const draw = () => {
    const g = quickClientGroups();
    return quickListHTML(g, c => {
      const p = S.programs[c.programId], parked = sessionFor(c.id);
      return `<div class="spread quick-row"><span><strong>${esc(c.name)}</strong>${p ? `<br><span class="small muted">${esc(p.name)}</span>` : ''}</span><span class="row tight"><button type="button" class="btn sm primary" data-qs="${esc(c.id)}">${parked ? 'Resume' : 'Log session'}</button><button type="button" class="btn sm ghost" data-qm="${esc(c.id)}">More</button></span></div>`;
    });
  };
  const dlg = dialog('Start a session', `<div id="qsList" class="stack">${draw()}</div>`, [{ label:'Close' }]);
  dlg.querySelectorAll('[data-qs]').forEach(b => b.onclick = () => {
    const cid = b.dataset.qs; dlg.close();
    const parked = sessionFor(cid);
    if (parked) resumeParkedWorkout(sessionKey(parked)); else beginClientWorkout(cid, 'strength');
  });
  dlg.querySelectorAll('[data-qm]').forEach(b => b.onclick = () => { const cid = b.dataset.qm; dlg.close(); openTodayActions(cid); });
}
function openQuickAttendance(){
  const iso = todayISO();
  const draw = () => quickListHTML(quickClientGroups(), c => {
    const st = (attFor(iso, c.id) || {}).status || '';
    return `<div class="spread quick-row"><strong>${esc(c.name)}</strong><span class="row tight"><button type="button" class="btn sm ${st === 'attended' ? 'primary' : 'ghost'}" data-qa="attended" data-cid="${esc(c.id)}" aria-pressed="${st === 'attended'}">Attended</button><button type="button" class="btn sm ${st === 'no-show' ? 'danger' : 'ghost'}" data-qa="no-show" data-cid="${esc(c.id)}" aria-pressed="${st === 'no-show'}">No-show</button></span></div>`;
  });
  const dlg = dialog('Log attendance · today', `<div id="qaList" class="stack">${draw()}</div><p class="small muted">Tap again to clear a mark.</p>`, [{ label:'Done', kind:'primary' }]);
  const wireRows = () => dlg.querySelectorAll('[data-qa]').forEach(b => b.onclick = async () => {
    const cid = b.dataset.cid, c = S.clients[cid]; if (!c) return;
    const cur = (attFor(iso, cid) || {}).status || '', next = cur === b.dataset.qa ? '' : b.dataset.qa;
    try { await setAttendance(iso, cid, next, c.groupId || ''); } catch(e){ showSaveError(e); return; }
    const list = dlg.querySelector('#qaList'); if (list){ list.innerHTML = draw(); wireRows(); }
    const again = dlg.querySelector(`[data-qa="${b.dataset.qa}"][data-cid="${cid}"]`); if (again) again.focus({ preventScroll:true });
    toast(next === 'attended' ? c.name + ' marked attended' : next === 'no-show' ? c.name + ' marked no-show' : 'Attendance cleared');
  });
  wireRows();
  dlg.addEventListener('close', () => { if (!sessionOpen()) render({ keepScroll:true }); }, { once:true });
}
