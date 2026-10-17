/* ---------------------------------------------------------------
   Account and sync (Supabase). Local IndexedDB stays the source the screens read; signing in only adds
   a background copy to your account. Signed out, nothing leaves this device.
   Plain fetch against Supabase's Auth and REST endpoints (no extra script is loaded).
   The publishable key below is meant to be public; row-level security in the database protects the data.
   Never put the secret / service_role key in this file.
----------------------------------------------------------------*/
const SUPABASE_URL = 'https://vjibhmqinbuggeqktzzx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ivb1FJd26Q6oQP48dmfjIw_rMU1KM_D';
const SYNC_TABLES = { clients:'client', groups:'pairing', programs:'program', conditioning:'conditioning_template', logs:'log', attendance:'attendance', schedule:'schedule', scheduleExceptions:'schedule_exception', exercises:'exercise_library' };
const Sync = {
  session:null,            // { access_token, refresh_token, expires_at, user:{id,email} } — kept in memory
  state:'signed-out',      // signed-out | idle | syncing | offline | attention
  pending:0, lastError:'', lastSyncAt:0, timer:null, backoff:0, running:false, failed:new Map(),
  enabled(){ return MODE === 'local' && LOCAL === 'idb'; },
  signedIn(){ return !!(this.session && this.session.access_token); },
  label(){
    if (!this.enabled()) return '';
    if (!this.signedIn()) return 'Not signed in (data stays on this device)';
    if (this.state === 'syncing') return 'Syncing…';
    if (this.state === 'offline') return 'Offline (' + this.pending + ' change' + (this.pending === 1 ? '' : 's') + ' waiting)';
    if (this.state === 'attention') return 'Needs attention: ' + (this.lastError || 'sync problem');
    return this.pending ? 'Waiting to sync (' + this.pending + ')' + (this.auto ? '' : ' · tap Sync now') : (this.auto ? 'Synced' : 'Synced · manual sync');
  },
  setState(s, err){ this.state = s; if (err !== undefined) this.lastError = err; refreshSyncUI(); },

  /* ---- HTTP ---- */
  async raw(path, { method = 'GET', body, headers = {}, token } = {}){
    const res = await fetch(SUPABASE_URL + path, { method, headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(this.deviceId && path.startsWith('/rest/') ? { 'x-device-id': this.deviceId } : {}), ...(this.deviceSecret && path.startsWith('/rest/') ? { 'x-device-secret': this.deviceSecret } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    let data = null; const text = await res.text(); try { data = text ? safeParse(text) : null; } catch { data = text; }
    if (!res.ok){ const e = new Error((data && (data.msg || data.message || data.error_description || data.error)) || ('HTTP ' + res.status)); e.status = res.status; e.data = data; throw e; }
    return data;
  },
  async ensureToken(){
    if (!this.session) throw Object.assign(new Error('Not signed in'), { status:401 });
    if (this.session.expires_at - 60 > Date.now() / 1000) return this.session.access_token;
    const d = await this.raw('/auth/v1/token?grant_type=refresh_token', { method:'POST', body:{ refresh_token:this.session.refresh_token } });
    this.adopt(d); return this.session.access_token;
  },
  adopt(d){
    this.session = { access_token:d.access_token, refresh_token:d.refresh_token, expires_at:d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600)), user:{ id:d.user && d.user.id, email:d.user && d.user.email } };
    if (this.keep) IDB.put('meta', 'syncSession', { refresh_token:this.session.refresh_token, user:this.session.user }).catch(() => {});
  },
  async api(path, opts = {}){
    let token = await this.ensureToken();
    try { return await this.raw(path, { ...opts, token }); }
    catch(e){
      if (e.status !== 401) throw e;
      const d = await this.raw('/auth/v1/token?grant_type=refresh_token', { method:'POST', body:{ refresh_token:this.session.refresh_token } });
      this.adopt(d); return this.raw(path, { ...opts, token:this.session.access_token });
    }
  },

  /* ---- sign-in (attempts are limited here as well as on the server) ---- */
  attempts:[],
  throttle(){
    const now = Date.now(); this.attempts = this.attempts.filter(t => now - t < 60000);
    if (this.attempts.length >= 5) throw new Error('Too many attempts. Wait a minute and try again.');
    this.attempts.push(now);
  },
  redirect(){ return location.protocol.startsWith('http') ? location.origin + location.pathname : undefined; },
  async signUp(email, password){
    this.throttle();
    const r = this.redirect();
    const d = await this.raw('/auth/v1/signup' + (r ? '?redirect_to=' + encodeURIComponent(r) : ''), { method:'POST', body:{ email, password } });
    if (d && d.access_token){ await this.afterSignIn(d); return 'signed-in'; }
    return 'confirm-email';
  },
  async signIn(email, password, keep, opts = {}){
    this.throttle(); this.keep = !!keep;
    const d = await this.raw('/auth/v1/token?grant_type=password', { method:'POST', body:{ email, password } });
    // While the app is locked, only the account this device is linked to may sign in; any other is refused before it is adopted.
    if (opts.onlyUserId && !(d.user && d.user.id === opts.onlyUserId)){
      try { await this.raw('/auth/v1/logout', { method:'POST', token:d.access_token }); } catch {}
      throw new Error('This device is locked to another account. Use your PIN.');
    }
    await this.afterSignIn(d);
  },
  async magicLink(email){
    this.throttle(); const r = this.redirect();
    await this.raw('/auth/v1/otp' + (r ? '?redirect_to=' + encodeURIComponent(r) : ''), { method:'POST', body:{ email, create_user:false } });
  },
  async resetPassword(email){
    this.throttle(); const r = this.redirect();
    await this.raw('/auth/v1/recover' + (r ? '?redirect_to=' + encodeURIComponent(r) : ''), { method:'POST', body:{ email } });
  },
  async afterSignIn(d){
    this.adopt(d);
    const known = await Store.getMeta('syncUser', null);
    if (known && known.id && known.id !== this.session.user.id){
      const ok = await new Promise(res => dialog('Different account', '<p>This device\'s data was last synced to a <strong>different account</strong>. Uploading it to this one would mix the two.</p><p class="small muted">Cancel to stay signed out. To switch accounts safely, export a backup, delete the data on this device, then sign in.</p>', [{label:'Cancel', onClick:() => res(false)}, {label:'Upload it to this account', kind:'danger', onClick:() => res(true)}], { dismissible:false }));
      if (!ok){ this.session = null; this.setState('signed-out'); throw new Error('Sign-in cancelled'); }
      await IDB.run(['outbox', 'versions', 'conflicts'], 'readwrite', tx => { ['outbox', 'versions', 'conflicts'].forEach(s => tx.objectStore(s).clear()); });
      await Store.putMeta('syncInitial', null); await Store.putMeta('syncCursor', null);
    }
    await Store.putMeta('syncUser', { id:this.session.user.id, email:this.session.user.email });
    this.linkedId = this.session.user.id;
    try { await this.registerDevice(); } catch(e){ console.warn('Could not register this device', e); }
    Audit.log('sign-in');
    this.setState('idle'); this.schedule(300, true);   // signing in always syncs once, even in manual mode
    maybeOfferInvite();
  },
  async signOut(){
    if (this.session) await Audit.log('sign-out');
    try { if (this.session) await this.raw('/auth/v1/logout', { method:'POST', token:this.session.access_token }); } catch {}
    this.session = null; this.keep = false; clearTimeout(this.timer);
    try { await IDB.del('meta', 'syncSession'); } catch {}
    this.setState('signed-out');
  },
  /* A saved refresh token (only if "keep me signed in" was ticked) restores the session at start. */
  async restore(){
    if (!this.enabled()) return;
    try {
      const s = await IDB.get('meta', 'syncSession'); if (!s || !s.refresh_token) return;
      this.keep = true;
      const d = await this.raw('/auth/v1/token?grant_type=refresh_token', { method:'POST', body:{ refresh_token:s.refresh_token } });
      this.adopt(d); this.setState('idle'); this.schedule(500);
    } catch(e){
      if (e.status && e.status < 500){ try { await IDB.del('meta', 'syncSession'); } catch {} }   // token no longer valid
      else this.setState('offline');
    }
  },

  /* ---- outbox: one entry per document (a newer edit replaces an older queued one) ---- */
  async enqueue(op, coll, id, doc){
    if (!this.enabled() || !this.signedIn()) return;
    try {
      await IDB.put('outbox', coll + '/' + id, { coll, id, op, doc: op === 'put' ? JSON.parse(JSON.stringify(doc)) : null, queuedAt:Date.now() });
      this.pending = await IDB.count('outbox'); refreshSyncUI(); this.schedule(1500);
    } catch(e){ console.warn('Could not queue a change for sync', e); }
  },
  /* Automatic sync is the default. In manual mode (Data > Online account) changes are only queued; "Sync now" sends and fetches them. */
  auto:true,
  schedule(ms, force){ clearTimeout(this.timer); if (!this.auto && !force){ refreshSyncUI(); return; } this.timer = setTimeout(() => this.run(), ms); },
  async run(){
    if (this.running || !this.enabled() || !this.signedIn()) return;
    if (!navigator.onLine){ this.setState('offline'); return; }
    this.running = true; this.setState('syncing');
    try {
      let standing = await this.checkDevice();
      if (standing === 'unregistered'){ await this.registerDevice(); standing = this.deviceStatus; }
      if (standing !== 'approved'){ this.pending = await IDB.count('outbox'); this.setState('attention', this.deviceMessage()); return; }
      await this.detectRole();
      await this.flushErasures();
      await this.pull();
      await this.reconcileAssignments();
      { const dropped = await this.consentAuditAll(); if (dropped) toast(dropped + ' client' + (dropped === 1 ? '' : 's') + ' without consent for online storage ' + (dropped === 1 ? 'was' : 'were') + ' removed from your online copy. Their data is still on this device.'); }
      await this.firstUploadIfNeeded();
      await this.uploadExercisesOnce();
      await this.push();
      try { await Audit.flush(); } catch(e){ console.warn('Audit entries not sent yet', e); }
      this.pending = await IDB.count('outbox');
      this.lastSyncAt = Date.now(); this.backoff = 0;
      await loadConflicts();
      if (!S.conflicts.length) this.setState(this.failed.size ? 'attention' : 'idle', this.failed.size ? 'some changes were rejected (Sync now to retry)' : '');
    } catch(e){
      console.warn('Sync failed', e);
      this.pending = await IDB.count('outbox').catch(() => this.pending);
      if (e.status === 401 || e.status === 403) this.setState('attention', 'sign in again');
      else if (e.status && e.status < 500) this.setState('attention', e.message);
      else { this.setState('offline'); this.backoff = Math.min(60000, (this.backoff || 3000) * 2); this.schedule(this.backoff); }
    } finally { this.running = false; }
  },
  rejected:0,
  async flushErasures(){
    const p = await Store.getMeta('pendingErasures', null);
    if (!p || !Array.isArray(p.list) || !p.list.length) return;
    for (const { coll, id } of p.list) await IDB.put('outbox', coll + '/' + id, { coll, id, op:'del', doc:null, queuedAt:Date.now() });
    await Store.putMeta('pendingErasures', null);
  },
  rowFor(coll, id, doc){ return { id, ...(this.role === 'assistant' && this.coachId ? { coach_id:this.coachId } : {}), data: doc || {}, deleted_at: doc ? null : new Date().toISOString() }; },   // an erased record keeps only its id
  /* ---- push: never overwrites a newer server copy. New documents are inserted only; known ones are
     updated only if the server still has the version this device last saw. Anything else goes to resolve(). ---- */
  async baseVersion(coll, id){ const v = await IDB.get('versions', coll + '/' + id); return v == null ? null : v; },
  async markPushed(key, it, row){ if (row && row.updated_at) this.noteServerTime(row.updated_at); if (it.op === 'put') await IDB.put('versions', it.coll + '/' + it.id, row.version); else await IDB.del('versions', it.coll + '/' + it.id); await IDB.del('outbox', key); this.failed.delete(key); },   // a removed record is no longer 'on the server'
  async push(){
    const db = await IDB.all('outbox');
    const items = [];
    for (const e of Object.entries(db).sort((a, b) => a[1].queuedAt - b[1].queuedAt)){
      if (!SYNC_TABLES[e[1].coll]){ await IDB.del('outbox', e[0]); continue; }   // left over from an older build
      if (e[1].op === 'put' && !this.syncAllowed(e[1].coll, e[1].doc)){ await IDB.del('outbox', e[0]); continue; }   // no consent: never leaves this device
      items.push(e);
    }
    this.pending = items.length;
    const fresh = [], known = [];
    for (const [k, it] of items){ const v = await this.baseVersion(it.coll, it.id); (v == null ? fresh : known).push([k, it, v]); }
    try {
      for (let i = 0; i < fresh.length;){
        const table = SYNC_TABLES[fresh[i][1].coll], batch = [];
        while (i < fresh.length && SYNC_TABLES[fresh[i][1].coll] === table && batch.length < 100) batch.push(fresh[i++]);
        const rows = batch.map(([, it]) => this.rowOf(it));
        const inserted = await this.api('/rest/v1/' + table + '?on_conflict=coach_id,id', { method:'POST', headers:{ Prefer:'resolution=ignore-duplicates,return=representation' }, body:rows });
        const got = new Map((inserted || []).map(r => [r.id, r])), exists = [];
        for (const [k, it] of batch){ const r = got.get(it.id); if (r) await this.markPushed(k, it, r); else exists.push([k, it]); }
        if (exists.length) await this.resolveExisting(table, exists);
      }
      for (const [k, it, base] of known){
        const table = SYNC_TABLES[it.coll], row = this.rowOf(it);
        const res = await this.api('/rest/v1/' + table + '?id=eq.' + encodeURIComponent(it.id) + '&version=eq.' + base + this.scope(), { method:'PATCH', headers:{ Prefer:'return=representation' }, body:{ data:row.data, deleted_at:row.deleted_at } });
        if (res && res.length) await this.markPushed(k, it, res[0]); else await this.resolveExisting(table, [[k, it]]);
      }
    } catch(e){
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403) this.failed.set('batch', e.message);
      throw e;
    }
    this.pending = await IDB.count('outbox');
  },
  async resolveExisting(table, list){
    const rows = await this.api('/rest/v1/' + table + '?select=id,data,updated_at,deleted_at,version&id=in.(' + list.map(([, it]) => it.id).join(',') + ')' + this.scope());
    const byId = new Map((rows || []).map(r => [r.id, r]));
    for (const [k, it] of list){
      const r = byId.get(it.id);
      if (!r){ await IDB.del('versions', it.coll + '/' + it.id); continue; }   // the row vanished: it is inserted fresh on the next run
      await this.resolve(it.coll, it, r);
    }
  },
  /* ---- conflict rules ----
     Both sides edited a document:
       - logs and attendance are never overwritten silently: both versions are kept and listed under "Resolve";
       - everything else: the most recently edited copy wins.
     One side deleted: a delete only wins if the other side made no newer edit (an edit beats a delete). */
  async resolve(coll, item, remote){
    const key = coll + '/' + item.id, remoteDeleted = !!remote.deleted_at, localDelete = item.op === 'del';
    const settle = async () => { await IDB.del('outbox', key); await IDB.put('versions', key, remote.version); };
    if (item.op === 'erase' || item.op === 'unshare'){ await IDB.put('versions', key, remote.version); return; }   // an erasure always wins: it goes on top of whatever the server holds
    if (localDelete && remoteDeleted){ await settle(); return; }
    if (localDelete){
      await settle();
      if (!(remote.data && this.erased.has(remote.data.clientId))){ await this.applyDoc(coll, remote); this.notes.push('A deletion was undone because the record was edited on another device.'); }
      return;
    }
    if (remoteDeleted){ await IDB.put('versions', key, remote.version); return; }   // our edit stays queued and restores the record
    if (sameContent(item.doc, remote.data)){ await settle(); return; }
    if (coll === 'logs' || coll === 'attendance'){ await this.recordConflict(coll, item, remote); await settle(); return; }
    // 'newer' is judged on the server's clock: this device's edit time is corrected by the offset seen on the last push
    const lt = (Date.parse((item.doc && item.doc.updatedAt) || 0) || 0) + (this.skewMs || 0), rt = Date.parse(remote.updated_at || 0) || Date.parse((remote.data && remote.data.updatedAt) || 0) || 0;
    if (lt > rt) await IDB.put('versions', key, remote.version);     // ours is newer: stays queued on top of the server copy
    else { await settle(); await this.applyDoc(coll, remote); }       // theirs is newer (or equal): take it
  },
  notes:[],
  async recordConflict(coll, item, remote){
    await IDB.put('conflicts', coll + '/' + item.id, { coll, id:item.id, local:item.doc, remote:{ data:remote.data, version:remote.version, updated_at:remote.updated_at }, at:Date.now() });
    await loadConflicts();
  },
  /* ---- pull: keyset cursor per table (updated_at, id) so rows sharing a timestamp are never skipped ---- */
  async pull(){
    const cursors = (await Store.getMeta('syncCursor', null)) || {};
    let changed = 0;
    for (const [coll, table] of Object.entries(SYNC_TABLES)){
      let cur = cursors[table] || null;
      for (;;){
        let q = '/rest/v1/' + table + '?select=id,data,updated_at,deleted_at,version&order=updated_at.asc,id.asc&limit=500' + this.scope();
        if (cur) q += '&or=' + encodeURIComponent('(updated_at.gt.' + cur.at + ',and(updated_at.eq.' + cur.at + ',id.gt.' + cur.id + '))');
        const rows = await this.api(q);
        for (const r of rows){ if (await this.applyRemote(coll, r)) changed++; cur = { at:r.updated_at, id:r.id }; }
        if (cur) cursors[table] = cur;
        if (rows.length < 500) break;
      }
    }
    await Store.putMeta('syncCursor', cursors);
    if (changed){ invalidateLogIndex(); invalidateAttIndex(); if (!sessionOpen()) render({ keepScroll:true }); }
    if (this.notes.length){ const n = this.notes.splice(0).filter((x, i, a) => a.indexOf(x) === i); n.forEach(x => toast(x)); }
  },
  /* One change from the server. A copy this device edited since its last sync is never just overwritten. */
  async applyRemote(coll, row){
    const key = coll + '/' + row.id;
    if (!SAFE_ID.test(String(row.id))){ this.rejected++; return false; }
    if (!row.deleted_at){
      if (!validRemoteDoc(coll, row.id, row.data)){ this.rejected++; console.warn('Ignored an invalid synced record', coll, row.id); return false; }
      row.data = sanitizeDoc(row.data);
    }
    // A record taken off the server for lack of consent is NOT a deletion: the local copy stays.
    if (row.deleted_at && row.data && row.data.unshared){ await IDB.del('versions', key); return false; }
    // Erasure: a client erased on any device is removed everywhere and never restored.
    if (coll === 'clients' && row.deleted_at && row.data && row.data.erased){ if (!this.erased.has(row.id) || S.clients[row.id]){ await this.eraseLocal(row.id); return true; } return false; }
    if (coll === 'clients' && this.erased.has(row.id)){ await IDB.put('outbox', 'clients/' + row.id, { coll:'clients', id:row.id, op:'erase', doc:null, queuedAt:Date.now() }); return false; }
    if (!row.deleted_at && row.data && this.erased.has(row.data.clientId)){ await this.put2outbox('del', coll, row.id, null); return false; }
    if (coll === 'exercises' && row.id === 'library'){ if (row.deleted_at) return false; await this.mergeLegacyLibrary(row); return true; }
    const item = await IDB.get('outbox', key), known = await this.baseVersion(coll, row.id);
    if (item){ if (known === row.version) return false; await this.resolve(coll, item, row); return true; }   // our own queued edit, on the version we saw: nothing new
    const have = coll === 'exercises' ? S.exercises.find(e => e.id === row.id) : S[coll][row.id];
    // a document this device never synced but that differs from the server's: treat ours as an edit to reconcile
    if (!row.deleted_at && have && known == null && !sameContent(have, row.data)){ await this.resolve(coll, { coll, id:row.id, op:'put', doc:have }, row); return true; }
    const changed = await this.applyDoc(coll, row);
    await IDB.put('versions', key, row.version);
    return changed;
  },
  /* Writes a server row into local storage without queueing it again. */
  async applyDoc(coll, row){
    if (!SAFE_ID.test(String(row.id))) return false;
    if (!row.deleted_at){
      if (!validRemoteDoc(coll, row.id, row.data)) return false;
      row = { ...row, data:sanitizeDoc(row.data) };
    }
    if (coll === 'exercises'){
      const i = S.exercises.findIndex(e => e.id === row.id);
      if (row.deleted_at){ if (i < 0) return false; S.exercises = S.exercises.filter(e => e.id !== row.id); }
      else if (i >= 0 && stable(S.exercises[i]) === stable(row.data)) return false;
      else if (i >= 0) S.exercises = S.exercises.map((e, k) => k === i ? row.data : e);
      else S.exercises = [...S.exercises, row.data];
      if (this.exSnap){ if (row.deleted_at) this.exSnap.delete(row.id); else this.exSnap.set(row.id, stable(row.data)); }
      await IDB.put('meta', 'exercises', { list:S.exercises }); return true;
    }
    if (row.deleted_at){ if (S[coll][row.id]){ await IDB.del(coll, row.id); delete S[coll][row.id]; return true; } return false; }
    const have = S[coll][row.id];
    if (have && stable(have) === stable(row.data)) return false;
    await IDB.put(coll, row.id, row.data); S[coll][row.id] = row.data; return true;
  },
  /* The first time this device syncs, documents the server does not know are queued for upload. */
  async firstUploadIfNeeded(){
    const done = await Store.getMeta('syncInitial', null);
    if (done && done.userId === this.session.user.id) return;
    for (const coll of COLLS){
      for (const [id, doc] of Object.entries(S[coll])){
        if ((await this.baseVersion(coll, id)) != null) continue;   // already matched against the server during the pull
        if (!this.syncAllowed(coll, doc)) continue;   // no consent: stays on this device
        await IDB.put('outbox', coll + '/' + id, { coll, id, op:'put', doc:JSON.parse(JSON.stringify(doc)), queuedAt:Date.now() });
      }
    }
    // exercises are uploaded one record at a time by uploadExercisesOnce()
    await Store.putMeta('syncInitial', { userId:this.session.user.id, at:Date.now() });
  }
};
/* Same content, ignoring the bookkeeping fields and key order (the server stores JSON with sorted keys). */
function stable(v){
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => k !== 'updatedAt' && k !== 'createdAt').sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const sameContent = (a, b) => stable(a) === stable(b);

/* ---- conflicts the coach has to look at ---- */
S.conflicts = [];
async function loadConflicts(){
  try { S.conflicts = Object.values(await IDB.all('conflicts')).sort((a, b) => a.at - b.at); } catch { S.conflicts = []; }
  if (Sync.signedIn()) Sync.setState(S.conflicts.length ? 'attention' : (Sync.state === 'attention' ? 'idle' : Sync.state), S.conflicts.length ? S.conflicts.length + ' conflict' + (S.conflicts.length === 1 ? '' : 's') + ' to resolve' : '');
  refreshSyncUI();
}
function describeConflictDoc(coll, doc){
  if (!doc) return '<p class="small muted">(nothing)</p>';
  if (coll === 'attendance') return `<p class="small"><strong>${esc(doc.status || '')}</strong> on ${esc(doc.date || '')}${doc.groupId && S.groups[doc.groupId] ? ' · ' + esc(S.groups[doc.groupId].name) : ''}</p>`;
  const entries = workoutLogEntries(doc);
  return `<p class="small"><strong>${esc(doc.dayLabel || 'Session')}</strong> · ${esc(doc.date || '')}${doc.notes ? '<br>' + esc(doc.notes) : ''}</p>` +
    (entries.length ? entries.map(e => `<div class="small">${esc(loggedEntryName(e))}: <span class="num">${loggedExerciseSets(e).map(s => esc((setWeight(s) ?? '—') + '×' + (setReps(s) ?? '—'))).join(', ')}</span></div>`).join('') : '<div class="small muted">No sets recorded</div>');
}
function conflictTitle(c){
  const d = c.local || (c.remote && c.remote.data) || {};
  const who = (S.clients[d.clientId] || {}).name || 'a client';
  return (c.coll === 'attendance' ? 'Attendance' : 'Session') + ' · ' + who + ' · ' + (d.date || '');
}
function conflictsPanelHTML(){
  if (!S.conflicts.length) return '';
  return `<div class="panel stack" id="conflictsPanel" style="border-left:4px solid var(--warn)"><h3>${S.conflicts.length} conflict${S.conflicts.length === 1 ? '' : 's'} to resolve</h3>
    <p class="small muted">The same record was changed on this device and on another. Nothing was overwritten. Choose which to keep.</p>
    ${S.conflicts.map(c => `<div class="spread"><span class="small">${esc(conflictTitle(c))}</span><button type="button" class="btn sm primary" data-resolve="${esc(c.coll + '/' + c.id)}">Review</button></div>`).join('')}</div>`;
}
function openConflict(key){
  const c = S.conflicts.find(x => x.coll + '/' + x.id === key); if (!c) return;
  const mine = S[c.coll][c.id] || c.local, theirs = c.remote.data;
  const when = c.remote.updated_at ? new Date(c.remote.updated_at).toLocaleString() : '';
  dialog('Resolve: ' + conflictTitle(c),
    `<div class="conflict-cols"><div class="panel"><h3>This device</h3>${describeConflictDoc(c.coll, mine)}</div>
       <div class="panel"><h3>Other device</h3><p class="small muted">${esc(when)}</p>${describeConflictDoc(c.coll, theirs)}</div></div>`,
    [{label:'Later'},
     {label:'Keep this device\'s', kind:'primary', onClick:() => { resolveConflict(key, 'mine'); }},
     {label:'Keep the other', onClick:() => { resolveConflict(key, 'theirs'); }},
     ...(c.coll === 'logs' ? [{label:'Keep both', onClick:() => { resolveConflict(key, 'both'); }}] : [])]);
}
async function resolveConflict(key, choice){
  const c = await IDB.get('conflicts', key); if (!c) return;
  const { coll, id } = c;
  try {
    if (choice === 'theirs'){
      await IDB.put(coll, id, c.remote.data); S[coll][id] = c.remote.data;
    } else {
      const mine = S[coll][id] || c.local;
      await IDB.put('versions', key, c.remote.version);
      if (choice === 'both' && coll === 'logs'){
        const nid = id + '-b' + uid().slice(0, 4), copy = { ...c.remote.data, id:nid };
        await Store.put('logs', nid, copy); S.logs[nid] = copy;
      }
      await Store.put(coll, id, mine); S[coll][id] = mine;   // queued: goes up on top of the server's version
    }
    await IDB.put('versions', key, c.remote.version);
    await IDB.del('conflicts', key);
  } catch(e){ showSaveError(e); return; }
  invalidateLogIndex(); invalidateAttIndex();
  await loadConflicts(); toast('Conflict resolved'); render({ keepScroll:true }); Sync.schedule(300);
}
function refreshSyncUI(){
  setStatus(); if (typeof Lock !== 'undefined') Lock.updatePill();
  const box = document.getElementById('syncStatusText'); if (box) box.textContent = Sync.label();
}
function syncPanelHTML(){
  if (!Sync.enabled()) return '<div class="panel stack"><h3>Account and sync</h3><p class="small muted">Sync is available when the app stores data in this browser\'s database, in a normal browser window.</p></div>';
  if (Sync.signedIn()) return `<div class="panel stack"><h3>Account and sync</h3>
    <p class="small">Signed in as <strong>${esc(Sync.session.user.email || '')}</strong>. <span id="syncStatusText" aria-live="polite">${esc(Sync.label())}</span></p>
    <p class="small muted">${Sync.lastSyncAt ? 'Last synced ' + esc(new Date(Sync.lastSyncAt).toLocaleTimeString()) + '. ' : ''}A copy of your data is kept in your account. This device keeps working offline and catches up later.</p>
    <label class="row tight small" style="gap:.4rem;align-items:flex-start"><input type="checkbox" id="syncAuto" ${Sync.auto ? 'checked' : ''} style="width:auto;margin-top:.2rem"><span style="flex:1;min-width:0">Sync automatically (recommended). Turn this off to sync only when you tap Sync now.</span></label>
    <div class="row"><button type="button" class="btn ${Sync.auto ? 'ghost' : 'primary'} sm" id="syncNow">Sync now</button><button type="button" class="btn ghost sm" id="syncSignOut">Sign out</button></div></div>`;
  return `<div class="panel stack"><h3>Account and sync</h3>
    <p class="small muted">Optional. Sign in to keep a copy of your data in your account and use it on your other devices; after that it syncs by itself. Signed out, everything stays on this device.</p>
    <div class="row"><button type="button" class="btn primary sm" id="syncOpenLogin">Sign in or create an account</button></div>
    <p class="small muted">The sign-in page has email and password, "Forgot password?" and Continue with Google.</p></div>`;
}
function wireSyncPanel(m){
  const login = document.getElementById('syncOpenLogin'); if (login) login.onclick = () => Lock.show({ view:'credentials', closable:true });
  m.querySelectorAll('[data-resolve]').forEach(b => b.onclick = () => openConflict(b.dataset.resolve));
  const now = document.getElementById('syncNow'); if (now) now.onclick = () => { Sync.failed.clear(); Sync.run(); };
  const out = document.getElementById('syncSignOut'); if (out) out.onclick = async () => { await Sync.signOut(); render({ keepScroll:true }); };
  const auto = document.getElementById('syncAuto');
  if (auto) auto.onchange = async () => {
    Sync.auto = auto.checked;
    try { await Store.putMeta('syncAuto', { on:auto.checked }); } catch(e){ showSaveError(e); }
    toast(auto.checked ? 'Syncing automatically' : 'Manual sync: tap Sync now when you want to sync');
    if (auto.checked) Sync.schedule(300);
    render({ keepScroll:true });
  };
}
window.addEventListener('online', () => { if (Sync.signedIn()) Sync.schedule(500); });
window.addEventListener('offline', () => { if (Sync.signedIn()) Sync.setState('offline'); });
setInterval(() => { if (Sync.signedIn() && Sync.auto && document.visibilityState === 'visible') Sync.run(); }, 60000);
// Coming back to the app (for example opening the phone again) syncs straight away, so a change made on another device shows up.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Sync.signedIn() && Sync.auto) Sync.schedule(400); });


