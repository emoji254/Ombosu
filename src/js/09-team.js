/* ---------------------------------------------------------------
   Assistant coaches. The owner invites an assistant with a 48-hour link and assigns clients. The database lets an
   assistant see and edit ONLY those clients' sessions and attendance (see nyaega-supabase-assistants.sql); this
   code additionally hides exports, imports, deletion and settings for assistants, but the server is what enforces it.
   An assistant's browser keeps only the assigned clients' data, so it must start from a clean profile.
----------------------------------------------------------------*/
const assistantBlocked = () => { if (Sync.role === 'assistant'){ toast('Assistant accounts cannot do this'); return true; } return false; };
Object.assign(Sync, {
  role:'owner', coachId:null,
  scope(){ return this.role === 'assistant' && this.coachId ? '&coach_id=eq.' + encodeURIComponent(this.coachId) : ''; },
  /* Is this account an assistant of someone? Decided by the server, not by anything stored here. */
  async detectRole(){
    const rows = await this.api('/rest/v1/team_member?select=coach_id,role,label&member_id=eq.' + encodeURIComponent(this.session.user.id) + '&removed_at=is.null');
    if (rows && rows.length){
      this.role = 'assistant'; this.coachId = rows[0].coach_id;
      await Store.putMeta('assistantOf', { coachId:this.coachId });
    } else {
      const was = await Store.getMeta('assistantOf', null);
      this.role = 'owner'; this.coachId = null;
      if (was){ await Store.putMeta('assistantOf', null); await wipeLocalData(); toast('Your access to the other coach\'s clients was removed. Their data has been cleared from this device.'); }
    }
    document.body.classList.toggle('assistant', this.role === 'assistant');
  },
  /* Clients no longer assigned are removed from this device. */
  async reconcileAssignments(){
    if (this.role !== 'assistant') return;
    const rows = await this.api('/rest/v1/client_access?select=client_id&member_id=eq.' + encodeURIComponent(this.session.user.id) + '&coach_id=eq.' + encodeURIComponent(this.coachId));
    const ids = new Set((rows || []).map(r => r.client_id));
    let removed = 0;
    for (const cid of Object.keys(S.clients)) if (!ids.has(cid)){ await purgeClientLocal(cid); removed++; }
    if (removed){ invalidateLogIndex(); invalidateAttIndex(); if (!sessionOpen()) render({ keepScroll:true }); }
  }
});
document.body.classList.toggle('assistant', false);

/* Removes everything stored on this device (collections, sync state) without touching the account. */
async function wipeLocalData(){
  await IDB.run([...COLLS, 'outbox', 'versions', 'conflicts', 'snapshots'], 'readwrite', tx => { [...COLLS, 'outbox', 'versions', 'conflicts', 'snapshots'].forEach(s => tx.objectStore(s).clear()); });
  COLLS.forEach(c => { for (const k of Object.keys(S[c])) delete S[c][k]; });
  for (const k of ['syncInitial', 'syncCursor', 'snapshotIndex']) { try { await Store.putMeta(k, null); } catch {} }
  S.conflicts = []; invalidateLogIndex(); invalidateAttIndex(); render({ keepScroll:true });
}
/* Drops one client and everything about them from this device only (no sync entries are queued). */
async function purgeClientLocal(cid){
  const gone = [['clients', cid]];
  Object.entries(S.logs).forEach(([id, l]) => { if (l.clientId === cid) gone.push(['logs', id]); });
  Object.entries(S.attendance).forEach(([id, a]) => { if (a.clientId === cid) gone.push(['attendance', id]); });
  Object.entries(S.schedule).forEach(([id, s]) => { if ((s.clientIds || []).includes(cid)) gone.push(['schedule', id]); });
  Object.entries(S.scheduleExceptions).forEach(([id, x]) => { if (x.key === cid) gone.push(['scheduleExceptions', id]); });
  for (const [coll, id] of gone){ await IDB.del(coll, id); delete S[coll][id]; await IDB.del('outbox', coll + '/' + id); await IDB.del('versions', coll + '/' + id); }
}

/* ---- owner: invitations and assignments ---- */
S.team = { members:[], access:[], invites:[] };
const b64url = bytes => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sha256Hex(text){ return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function loadTeam(){
  if (!Sync.signedIn() || Sync.role !== 'owner' || Sync.deviceStatus !== 'approved'){ S.team = { members:[], access:[], invites:[] }; return; }
  try {
    const [members, access, invites] = await Promise.all([
      Sync.api('/rest/v1/team_member?select=member_id,label,created_at,removed_at&removed_at=is.null&order=created_at.asc'),
      Sync.api('/rest/v1/client_access?select=member_id,client_id'),
      Sync.api('/rest/v1/invite?select=id,client_ids,created_at,expires_at&used_at=is.null&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&order=created_at.desc')]);
    S.team = { members:members || [], access:access || [], invites:invites || [] };
    const n = (members || []).length;
    if (n !== S.teamSize){ S.teamSize = n; await Store.putMeta('teamSize', { n }); }   // the privacy notice mentions assistants when you have any
  } catch(e){ console.warn('Could not load the team', e); }
}
function teamPanelHTML(){
  if (!Sync.signedIn() || Sync.role !== 'owner') return '';
  const nameOf = id => (S.clients[id] || {}).name || 'a client';
  const t = S.team;
  return `<div class="panel stack owner-only" id="teamPanel"><h3>Assistant coaches</h3>
    <p class="small muted">An assistant has their own account and sees only the clients you assign. They cannot export, import, delete or change settings. Invitation links work for 48 hours and once only.</p>
    ${t.members.map(m => { const mine = t.access.filter(a => a.member_id === m.member_id); return `<div class="spread"><span class="small"><strong>${esc(m.label || 'Assistant')}</strong><br><span class="muted">${mine.length ? mine.map(a => esc(nameOf(a.client_id))).join(', ') : 'No clients assigned'}</span></span><span class="row tight"><button type="button" class="btn sm ghost" data-team-edit="${esc(m.member_id)}">Clients</button><button type="button" class="btn sm danger" data-team-remove="${esc(m.member_id)}">Remove</button></span></div>`; }).join('')}
    ${t.invites.map(i => `<div class="spread"><span class="small">Invitation for ${esc((i.client_ids || []).map(nameOf).join(', ') || 'no clients')}<br><span class="muted">expires ${esc(new Date(i.expires_at).toLocaleString())}</span></span><button type="button" class="btn sm ghost" data-invite-cancel="${esc(i.id)}">Cancel</button></div>`).join('')}
    <div class="row"><button type="button" class="btn primary sm" id="inviteAssistant">Invite an assistant</button></div></div>`;
}
function clientCheckboxes(selected){
  return Object.entries(S.clients).filter(([, c]) => c.status !== 'archived').sort((a, b) => byName(a[1], b[1])).map(([id, c]) => `<label class="row tight" style="gap:.4rem"><input type="checkbox" class="tcl" value="${esc(id)}" ${selected.has(id) ? 'checked' : ''} style="width:auto"> ${esc(c.name)}</label>`).join('') || '<p class="small muted">No clients yet.</p>';
}
function inviteDialog(){
  dialog('Invite an assistant', `<p class="small muted">Choose the clients this assistant may see. You can change this later.</p><div class="stack small">${clientCheckboxes(new Set())}</div>`, [{label:'Cancel'}, {label:'Create link', kind:'primary', onClick: async () => {
    const ids = [...document.querySelectorAll('.tcl:checked')].map(i => i.value);
    if (!ids.length){ toast('Choose at least one client'); return false; }
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    try { await Sync.api('/rest/v1/invite', { method:'POST', headers:{ Prefer:'return=minimal' }, body:{ token_hash:await sha256Hex(token), client_ids:ids } }); }
    catch(e){ toast('Could not create the invitation — ' + e.message); return false; }
    Audit.log('invite-create', { records:ids.length });
    const link = location.origin + location.pathname + '?invite=' + token;
    setTimeout(() => dialog('Invitation link', `<p class="small">Send this link to your assistant <strong>privately</strong>. It works for 48 hours and once only. Anyone with the link can accept it, so do not post it anywhere public.</p><label class="field"><span>Link</span><input type="text" id="inviteLink" readonly value="${esc(link)}"></label>`, [{label:'Done'}, {label:'Copy link', kind:'primary', onClick: async () => { try { await navigator.clipboard.writeText(link); toast('Copied'); } catch { document.getElementById('inviteLink').select(); toast('Press Ctrl+C to copy'); } return false; }}]), 80);
    await loadTeam(); render({ keepScroll:true });
  }}]);
}
function editAssistantDialog(memberId){
  const mine = new Set(S.team.access.filter(a => a.member_id === memberId).map(a => a.client_id));
  dialog('Clients this assistant can see', `<div class="stack small">${clientCheckboxes(mine)}</div>`, [{label:'Cancel'}, {label:'Save', kind:'primary', onClick: async () => {
    const want = new Set([...document.querySelectorAll('.tcl:checked')].map(i => i.value));
    const add = [...want].filter(x => !mine.has(x)), drop = [...mine].filter(x => !want.has(x));
    try {
      if (drop.length) await Sync.api('/rest/v1/client_access?member_id=eq.' + encodeURIComponent(memberId) + '&client_id=in.(' + drop.map(encodeURIComponent).join(',') + ')', { method:'DELETE', headers:{ Prefer:'return=minimal' } });
      if (add.length) await Sync.api('/rest/v1/client_access?on_conflict=coach_id,member_id,client_id', { method:'POST', headers:{ Prefer:'resolution=ignore-duplicates,return=minimal' }, body:add.map(client_id => ({ member_id:memberId, client_id })) });
    } catch(e){ toast('Could not save — ' + e.message); return false; }
    Audit.log('assistant-clients', { records:want.size });
    await loadTeam(); render({ keepScroll:true });
  }}]);
}
function wireTeam(m){
  const inv = document.getElementById('inviteAssistant'); if (inv) inv.onclick = inviteDialog;
  m.querySelectorAll('[data-team-edit]').forEach(b => b.onclick = () => editAssistantDialog(b.dataset.teamEdit));
  m.querySelectorAll('[data-team-remove]').forEach(b => b.onclick = () => dialog('Remove this assistant?', '<p>They lose access to your clients immediately. Their device clears your clients\' data the next time it connects. Anything they already copied outside the app cannot be recalled.</p>', [{label:'Cancel'}, {label:'Remove', kind:'danger', onClick: async () => {
    try {
      await Sync.api('/rest/v1/client_access?member_id=eq.' + encodeURIComponent(b.dataset.teamRemove), { method:'DELETE', headers:{ Prefer:'return=minimal' } });
      await Sync.api('/rest/v1/team_member?member_id=eq.' + encodeURIComponent(b.dataset.teamRemove), { method:'PATCH', headers:{ Prefer:'return=minimal' }, body:{ removed_at:new Date().toISOString() } });
    } catch(e){ toast('Could not remove — ' + e.message); return false; }
    Audit.log('assistant-remove'); await loadTeam(); render({ keepScroll:true });
  }}]));
  m.querySelectorAll('[data-invite-cancel]').forEach(b => b.onclick = async () => {
    try { await Sync.api('/rest/v1/invite?id=eq.' + encodeURIComponent(b.dataset.inviteCancel), { method:'DELETE', headers:{ Prefer:'return=minimal' } }); } catch(e){ toast('Could not cancel — ' + e.message); return; }
    await loadTeam(); render({ keepScroll:true });
  });
  if (document.getElementById('teamPanel') && !S.teamLoading){ S.teamLoading = true; loadTeam().then(() => { S.teamLoading = false; const el = document.getElementById('teamPanel'); if (el){ const tmp = document.createElement('div'); tmp.innerHTML = teamPanelHTML(); el.replaceWith(tmp.firstElementChild); wireTeam(document.getElementById('main')); } }); }
}

/* ---- assistant: accepting an invitation ---- */
const INVITE_KEY = 'nyaega:invite';
function captureInviteFromUrl(){
  try {
    const u = new URL(location.href), t = u.searchParams.get('invite');
    if (!t) return;
    sessionStorage.setItem(INVITE_KEY, t.slice(0, 200));
    u.searchParams.delete('invite'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);   // the token never stays in the address bar
  } catch {}
}
function pendingInvite(){ try { return sessionStorage.getItem(INVITE_KEY) || ''; } catch { return ''; } }
function maybeOfferInvite(){
  const token = pendingInvite(); if (!token) return;
  setTimeout(() => {
    if (!Sync.signedIn()){
      dialog('You have been invited', '<p>Someone has invited you to help coach their clients. Create an account or sign in (Data tab > Account and sync), and you will be asked to accept.</p>', [{label:'Later'}, {label:'Go to sign-in', kind:'primary', onClick:() => { S.view = 'dashboard'; S.sub = 'data'; S.dataSection = 'online'; S.sel = {}; render(); }}]);
      return;
    }
    dialog('Accept the invitation?', `<p>You will be able to see and update <strong>only the clients the owner assigns to you</strong>. You will not be able to export, import or delete data.</p><p class="small muted">Use a browser or profile that has no coaching data of its own: this device will hold the owner's clients while you are an assistant.</p>`, [
      {label:'Not now'},
      {label:'Decline', onClick:() => { try { sessionStorage.removeItem(INVITE_KEY); } catch {} }},
      {label:'Accept', kind:'primary', onClick: async () => {
        if (Object.keys(S.clients).length){ toast('This browser already holds client data. Open the link in a clean browser profile.'); return false; }
        try { await Sync.api('/rest/v1/rpc/accept_invite', { method:'POST', body:{ p_token:token, p_label:(Sync.session.user.email || '') } }); }
        catch(e){ toast(e.message || 'Could not accept'); return false; }
        try { sessionStorage.removeItem(INVITE_KEY); } catch {}
        Audit.log('assistant-accept');
        await Sync.detectRole(); toast('You are now an assistant'); Sync.schedule(100, true); render({ keepScroll:true });
      }}]);
  }, 600);
}

