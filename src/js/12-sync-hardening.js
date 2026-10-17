/* ---------------------------------------------------------------
   Sync hardening (audit follow-up): changes are queued whenever the device has ever been linked to an account (even
   while signed out); clients only sync with recorded consent for storage outside Kenya; an erasure is a tombstone
   that always wins; queue failures are visible.
----------------------------------------------------------------*/
Object.assign(Sync, {
  linkedId:null, erased:new Set(),
  consentOk(c){ return !!(c && c.consent && c.consent.given && !c.consent.withdrawnAt && c.consent.outsideKenya); },
  /* May this record be copied to the online account? (An assistant only ever works on data the owner already shares.) */
  syncAllowed(coll, doc){
    if (this.role === 'assistant') return true;
    if (coll === 'clients') return this.consentOk(doc);
    if (coll === 'logs' || coll === 'attendance') return !!doc && this.consentOk(S.clients[doc.clientId]);
    if (coll === 'schedule') return !!doc && (doc.clientIds || []).length > 0 && doc.clientIds.every(i => this.consentOk(S.clients[i]));
    if (coll === 'scheduleExceptions'){ const c = doc && S.clients[doc.key]; return c ? this.consentOk(c) : true; }
    return true;
  },
  dependentsOf(cid){
    const out = [];
    Object.entries(S.logs).forEach(([id, d]) => { if (d.clientId === cid) out.push(['logs', id, d]); });
    Object.entries(S.attendance).forEach(([id, d]) => { if (d.clientId === cid) out.push(['attendance', id, d]); });
    Object.entries(S.schedule).forEach(([id, d]) => { if ((d.clientIds || []).includes(cid)) out.push(['schedule', id, d]); });
    Object.entries(S.scheduleExceptions).forEach(([id, d]) => { if (d.key === cid) out.push(['scheduleExceptions', id, d]); });
    return out;
  },
  async put2outbox(op, coll, id, doc){
    await IDB.put('outbox', coll + '/' + id, { coll, id, op, doc: op === 'put' ? JSON.parse(JSON.stringify(doc)) : null, queuedAt:Date.now() });
  },
  /* A client's consent changed: take their records off the server, or put them on it. */
  async consentSweep(cid, doc){
    const allowed = this.consentOk(doc);
    for (const [coll, id, d] of this.dependentsOf(cid)){
      const onServer = (await this.baseVersion(coll, id)) != null;
      if (!allowed && onServer) await this.put2outbox('unshare', coll, id, null);
      else if (allowed && !onServer && (coll !== 'schedule' || (d.clientIds || []).every(i => i === cid || this.consentOk(S.clients[i])))) await this.put2outbox('put', coll, id, d);
    }
  },
  async enqueue(op, coll, id, doc){
    if (!this.enabled() || !(this.signedIn() || this.linkedId)) return;
    try {
      if (this.role !== 'assistant' && op === 'put' && coll === 'clients'){
        await this.consentSweep(id, doc);
        if (!this.consentOk(doc)){
          if ((await this.baseVersion('clients', id)) != null) await this.put2outbox('unshare', 'clients', id, null);
          else await IDB.del('outbox', 'clients/' + id);
          this.pending = await IDB.count('outbox'); refreshSyncUI(); if (this.signedIn()) this.schedule(1500);
          return;
        }
      } else if (op === 'put' && !this.syncAllowed(coll, doc)){
        await IDB.del('outbox', coll + '/' + id); return;   // no consent for this client: stays on this device
      }
      await this.put2outbox(op, coll, id, doc);
      this.pending = await IDB.count('outbox'); refreshSyncUI();
      if (this.signedIn()) this.schedule(1500);
    } catch(e){
      console.warn('Could not queue a change for sync', e);
      if (this.signedIn()) this.setState('attention', 'some changes could not be queued for sync');
      showSaveError(new StorageWriteError('the sync queue', e), { background:true });
    }
  },
  rowOf(it){
    if (it.op === 'unshare') return { id:it.id, ...(this.role === 'assistant' && this.coachId ? { coach_id:this.coachId } : {}), data:{ unshared:true }, deleted_at:new Date().toISOString() };   // taken off the server for lack of consent; the copy on this device stays
    if (it.op === 'erase') return { id:it.id, ...(this.role === 'assistant' && this.coachId ? { coach_id:this.coachId } : {}), data:{ erased:true }, deleted_at:new Date().toISOString() };
    return this.rowFor(it.coll, it.id, it.op === 'put' ? it.doc : null);
  },
  async loadErased(){ this.erased = new Set(((await Store.getMeta('erasedClients', null)) || { list:[] }).list); },
  async markErased(cid){ this.erased.add(cid); await Store.putMeta('erasedClients', { list:[...this.erased].slice(-2000) }); },
  /* Another device erased this client: remove everything about them here and never bring it back. */
  async eraseLocal(cid){
    await this.markErased(cid);
    await purgeClientLocal(cid);
    S.sessions = S.sessions.filter(r => r.logClient !== cid); S.recoveryArchive = (S.recoveryArchive || []).filter(r => r.logClient !== cid);
    invalidateLogIndex(); invalidateAttIndex();
  }
});

Object.assign(Sync, {
  /* Every round: clients without recorded consent for storage outside Kenya are taken off the server. */
  async consentAuditAll(){
    if (this.role === 'assistant') return 0;
    let n = 0;
    for (const [cid, c] of Object.entries(S.clients)){
      if (this.consentOk(c)) continue;
      if ((await this.baseVersion('clients', cid)) != null){ await this.put2outbox('unshare', 'clients', cid, null); await this.consentSweep(cid, c); n++; }
    }
    return n;
  }
});
/* A client card shows when a client is NOT being copied online because consent for that is missing. */
function syncPillHTML(c){
  return Sync.signedIn() && Sync.role === 'owner' && c.status !== 'archived' && !Sync.consentOk(c) ? ' <span class="pill warn">Not synced (consent)</span>' : '';
}
function syncNoteHTML(c){
  return Sync.signedIn() && Sync.role === 'owner' && !Sync.consentOk(c) ? '<p class="small"><strong>Not synced online.</strong> Their data stays on this device until you record that they agree to storage outside Kenya.</p>' : '';
}

