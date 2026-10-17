/* ---------------------------------------------------------------
   Devices and audit log. Each browser that signs in registers itself as a device. The first device is approved
   automatically; every later one must be approved from an approved device, and any device can be revoked. The
   server (row-level security) refuses data requests from devices that are pending or revoked, so revoking works
   immediately even if the lost device still holds a valid sign-in. The audit log is append-only on the server.
----------------------------------------------------------------*/
function deviceLabel(){
  const ua = navigator.userAgent || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return browser + (os ? ' on ' + os : '');
}
/* Each device has an id and a secret. The id is how it is named; the secret (random, made here, never shown) is what proves
   it is that device: the server keeps only its hash. Both live only in this browser's storage and are not part of any export. */
async function ensureDeviceId(fresh){
  let m = fresh ? null : await Store.getMeta('deviceId', null), changed = false;
  if (!m || !m.id){ m = { id:(crypto.randomUUID ? crypto.randomUUID() : uid() + uid() + uid()) }; changed = true; }
  if (!m.secret){ m.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); changed = true; }
  if (changed) await Store.putMeta('deviceId', m);
  Sync.deviceId = m.id; Sync.deviceSecret = m.secret;
}
Object.assign(Sync, {
  deviceId:'', devices:[], deviceStatus:'unknown', lastSeenAt:0,
  keySupport:null,   // does the server have the device-key functions (nyaega-supabase-device-keys.sql)? null = not known yet
  async registerDevice(){
    if (!this.deviceId) await ensureDeviceId();
    let done = false;
    if (this.keySupport !== false){
      try {
        const r = await this.api('/rest/v1/rpc/register_device', { method:'POST', body:{ p_device:this.deviceId, p_name:deviceLabel(), p_hash:await sha256Hex(this.deviceSecret) } });
        this.keySupport = true; done = true;
        if (r === 'registered') Audit.log('device-register');   // so a device you did not add shows up in Recent activity
      } catch(e){ if (e.status === 404 || (e.data && e.data.code === 'PGRST202')) this.keySupport = false; else throw e; }
    }
    if (!done) await this.api('/rest/v1/device?on_conflict=coach_id,device_id', { method:'POST', headers:{ Prefer:'resolution=ignore-duplicates,return=minimal' }, body:{ device_id:this.deviceId, name:deviceLabel() } });   // server without device keys
    await this.checkDevice(true);
  },
  /* A device that was registered before device keys existed ties itself to its own secret the first time it syncs. */
  async bindDeviceKey(){
    const done = await Store.getMeta('deviceBound', null);
    if (done && done.id === this.deviceId) return;
    try {
      const r = await this.api('/rest/v1/rpc/bind_device', { method:'POST', body:{ p_hash:await sha256Hex(this.deviceSecret) } });
      if (r === 'bound' || r === 'already') await Store.putMeta('deviceBound', { id:this.deviceId });
    } catch(e){ console.warn('Could not bind this device\'s key yet', e); }
  },
  /* This device lost its key or the server does not recognise it: take a new identity (it must be approved again). */
  async newDeviceIdentity(){
    await Store.putMeta('deviceBound', null); await ensureDeviceId(true);
    this.deviceStatus = 'unknown'; this.keySupport = this.keySupport === false ? false : null;
    await this.registerDevice();
  },
  /* Our own standing, read from the server on every sync round. Anything but "approved" stops syncing. */
  async checkDevice(forceLast){
    const rows = await this.api('/rest/v1/device?select=device_id,name,created_at,last_seen,approved_at,revoked_at&order=created_at.asc');
    this.devices = rows || [];
    const me = this.devices.find(d => d.device_id === this.deviceId);
    this.deviceStatus = !me ? 'unregistered' : me.revoked_at ? 'revoked' : me.approved_at ? 'approved' : 'pending';
    // With device keys the server decides, because it also checks this device's secret.
    if (this.keySupport !== false){
      try {
        const s = await this.api('/rest/v1/rpc/device_standing', { method:'POST', body:{} });
        this.keySupport = true;
        if (['approved', 'pending', 'revoked', 'unregistered', 'mismatch'].includes(s)) this.deviceStatus = s;
      } catch(e){ if (e.status === 404 || (e.data && e.data.code === 'PGRST202')) this.keySupport = false; }
    }
    if (this.deviceStatus === 'approved' && this.keySupport) await this.bindDeviceKey();
    // Does this account ask for approval of new devices? (undefined = the server has no such switch yet)
    if (this.deviceStatus === 'approved' && this.keySupport && (forceLast || Date.now() - (this.settingAt || 0) > 10 * 60 * 1000)){
      this.settingAt = Date.now();
      try { const r = await this.api('/rest/v1/account_setting?select=require_device_approval'); this.requireApproval = !!(r && r[0] && r[0].require_device_approval); }
      catch(e){ if (e.status === 404 || (e.data && e.data.code === 'PGRST205')) this.requireApproval = undefined; }
    }
    if (this.deviceStatus === 'approved' && (forceLast || Date.now() - this.lastSeenAt > 10 * 60 * 1000)){
      this.lastSeenAt = Date.now();
      this.api('/rest/v1/device?device_id=eq.' + encodeURIComponent(this.deviceId), { method:'PATCH', headers:{ Prefer:'return=minimal' }, body:{ last_seen:new Date().toISOString() } }).catch(() => {});
    }
    return this.deviceStatus;
  },
  deviceMessage(){
    return this.deviceStatus === 'pending' ? 'this device is waiting for approval from another of your devices'
      : this.deviceStatus === 'revoked' ? 'this device was removed from your account'
      : this.deviceStatus === 'mismatch' ? 'this device\'s security key is not recognised. Register it again, then approve it from another of your devices'
      : 'this device is not registered';
  },
  async setDevice(deviceId, fields){
    const res = await this.api('/rest/v1/device?device_id=eq.' + encodeURIComponent(deviceId), { method:'PATCH', headers:{ Prefer:'return=representation' }, body:fields });
    if (!res || !res.length) throw new Error('The server refused that change. Only an approved device can do it.');
    await this.checkDevice(); return res[0];
  },
  async signOutEverywhere(){
    try { await this.api('/auth/v1/logout?scope=global', { method:'POST' }); } catch {}
    await this.signOut();
  }
});
const Audit = {
  async log(action, detail = {}){
    const entry = { action, detail, at:new Date().toISOString() };
    try {
      const l = ((await Store.getMeta('auditLocal', null)) || { list:[] }).list; l.push(entry);
      await Store.putMeta('auditLocal', { list:l.slice(-200) });
    } catch(e){ console.warn('Could not record local activity', e); }
    if (Sync.signedIn()){
      try {
        const q = ((await Store.getMeta('auditQueue', null)) || { list:[] }).list; q.push(entry);
        await Store.putMeta('auditQueue', { list:q.slice(-500) }); Sync.schedule(2000);
      } catch {}
    }
  },
  /* Sends queued entries to the account's append-only log (the server stamps time and device). */
  async flush(){
    const q = ((await Store.getMeta('auditQueue', null)) || { list:[] }).list; if (!q.length) return;
    const logged = await Sync.api('/rest/v1/audit_log', { method:'POST', headers:{ Prefer:'return=representation' }, body:q.map(e => ({ action:String(e.action).slice(0, 40), detail:{ ...e.detail, clientAt:e.at } })) });
    if (logged && logged[0] && logged[0].at) Sync.noteServerTime(logged[0].at);
    await Store.putMeta('auditQueue', null);
  },
  async recent(){
    if (Sync.signedIn() && Sync.deviceStatus === 'approved'){
      try { return (await Sync.api('/rest/v1/audit_log?select=action,detail,at,device_id&order=at.desc&limit=30')).map(r => ({ action:r.action, detail:r.detail, at:r.at, device:r.device_id })); } catch {}
    }
    return (((await Store.getMeta('auditLocal', null)) || { list:[] }).list).slice(-30).reverse();
  }
};
const AUDIT_TEXT = { 'lock-set':'Set or changed the app PIN', 'lock-off':'Turned off the app lock', 'invite-create':'Created an assistant invitation', 'assistant-accept':'Accepted an invitation', 'assistant-remove':'Removed an assistant', 'assistant-clients':'Changed an assistant\'s clients', 'sign-in':'Signed in', 'sign-out':'Signed out', export:'Exported data', import:'Imported a backup', 'delete-client':'Deleted a client', 'delete-all':'Deleted all data', restore:'Restored a snapshot', 'device-approve':'Approved a device', 'device-revoke':'Removed a device', 'device-register':'Added a new device', 'device-approval-on':'Turned on approval for new devices', 'device-approval-off':'Turned off approval for new devices' };
function auditLineText(e){
  const d = e.detail || {}, extra = d.kind ? ' (' + d.kind + ')' : d.records != null ? ' (' + d.records + ' records)' : '';
  return (AUDIT_TEXT[e.action] || e.action) + extra;
}
function devicesPanelHTML(){
  if (!Sync.signedIn()) return '';
  const mine = Sync.deviceId, list = Sync.devices || [];
  const canManage = Sync.deviceStatus === 'approved';
  const status = d => d.revoked_at ? '<span class="pill bad">Removed</span>' : d.approved_at ? '<span class="pill ok">Approved</span>' : '<span class="pill warn">Waiting for approval</span>';
  return `<div class="panel stack" id="devicesPanel"><h3>Your devices</h3>
    ${Sync.deviceStatus !== 'approved' ? `<p class="small" role="alert"><strong>Sync is paused:</strong> ${esc(Sync.deviceMessage())}.</p>` : ''}
    ${Sync.deviceStatus === 'mismatch' || Sync.deviceStatus === 'revoked' ? '<div class="row"><button type="button" class="btn primary sm" id="reRegister">Register this device again</button></div>' : ''}
    ${list.map(d => `<div class="spread"><span class="small"><strong>${esc(d.name)}</strong>${d.device_id === mine ? ' · this device' : ''} ${status(d)}<br><span class="muted">Last seen ${d.last_seen ? esc(new Date(d.last_seen).toLocaleString()) : '—'}</span></span>
      <span class="row tight">${canManage && !d.approved_at && !d.revoked_at ? `<button type="button" class="btn sm primary" data-device-approve="${esc(d.device_id)}">Approve</button>` : ''}${canManage && !d.revoked_at ? `<button type="button" class="btn sm danger" data-device-revoke="${esc(d.device_id)}">Remove</button>` : ''}</span></div>`).join('') || '<p class="small muted">No devices listed yet.</p>'}
    <div class="row"><button type="button" class="btn ghost sm" id="signOutAll">Sign out everywhere</button><button type="button" class="btn danger sm" id="deleteAccount">Delete my account and online copy</button></div>
    ${canManage && Sync.role !== 'assistant' && Sync.requireApproval !== undefined ? `<label class="row tight small" style="gap:.4rem;align-items:flex-start"><input type="checkbox" id="requireApproval" ${Sync.requireApproval ? 'checked' : ''} style="width:auto;margin-top:.2rem"><span style="flex:1;min-width:0">Ask me to approve each new device. Safer: someone who learns your password cannot add a device on their own. When this is off, any device that signs in to your account is trusted straight away.</span></label>` : ''}
    <p class="small muted">If you lose a device: remove it here from another one, then change your password and use "Sign out everywhere".${Sync.requireApproval ? ' New devices must be approved from an approved device.' : ''}</p></div>`;
}
function activityPanelHTML(){
  const rows = S.activity || [];
  return `<div class="panel stack" id="activityPanel"><h3>Recent activity</h3>
    <p class="small muted">${Sync.signedIn() ? 'From your account, all devices. Entries cannot be edited or deleted.' : 'On this device. Sign in to also keep a tamper-resistant copy in your account.'} Names and client details are never recorded.</p>
    ${rows.length ? rows.map(e => { const dev = (Sync.devices || []).find(d => d.device_id === e.device); return `<div class="small spread"><span>${esc(auditLineText(e))}${dev ? ' · <span class="muted">' + esc(dev.name) + '</span>' : ''}</span><span class="muted num">${esc(new Date(e.at).toLocaleString())}</span></div>`; }).join('') : '<p class="small muted">Nothing recorded yet.</p>'}</div>`;
}
async function refreshActivity(){
  try { S.activity = await Audit.recent(); } catch { S.activity = []; }
  const el = document.getElementById('activityPanel'); if (el){ const tmp = document.createElement('div'); tmp.innerHTML = activityPanelHTML(); el.replaceWith(tmp.firstElementChild); }
}
function wireDevices(m){
  const ra = document.getElementById('requireApproval');
  if (ra) ra.onchange = async () => {
    try {
      await Sync.api('/rest/v1/rpc/set_device_approval_required', { method:'POST', body:{ p:ra.checked } });
      Sync.requireApproval = ra.checked; Audit.log(ra.checked ? 'device-approval-on' : 'device-approval-off');
      toast(ra.checked ? 'New devices will need your approval' : 'New devices are trusted automatically'); render({ keepScroll:true });
    } catch(e){ ra.checked = !ra.checked; toast(e.message); }
  };
  m.querySelectorAll('[data-device-approve]').forEach(b => b.onclick = async () => {
    try { await Sync.setDevice(b.dataset.deviceApprove, { approved_at:new Date().toISOString() }); Audit.log('device-approve'); toast('Device approved'); render({ keepScroll:true }); }
    catch(e){ toast(e.message); }
  });
  m.querySelectorAll('[data-device-revoke]').forEach(b => b.onclick = () => dialog('Remove this device?', '<p>It will stop syncing immediately and cannot sign back in without approval. Data already on that device stays there, so also change your password if it was lost or stolen.</p>', [{label:'Cancel'}, {label:'Remove', kind:'danger', onClick: async () => {
    try { await Sync.setDevice(b.dataset.deviceRevoke, { revoked_at:new Date().toISOString() }); Audit.log('device-revoke'); toast('Device removed'); if (b.dataset.deviceRevoke === Sync.deviceId){ await Sync.signOut(); } render({ keepScroll:true }); }
    catch(e){ toast(e.message); return false; }
  }}]));
  const rr = document.getElementById('reRegister');
  if (rr) rr.onclick = async () => { try { await Sync.newDeviceIdentity(); toast(Sync.deviceStatus === 'approved' ? 'Device registered' : 'Registered. Approve it from another of your devices.'); } catch(e){ toast(e.message); } render({ keepScroll:true }); };
  const delAcc = document.getElementById('deleteAccount');
  if (delAcc) delAcc.onclick = () => {
    const email = (Sync.session && Sync.session.user && Sync.session.user.email) || '';
    dialog('Delete your account?', `<p>This permanently deletes your account and <strong>everything stored online for it</strong>: clients, sessions, attendance, devices and the activity log. It cannot be undone.</p><p class="small muted">The data on this device is not touched, and you can still use the app here without an account. Files you exported are not touched either.</p><label class="field"><span>Type your email (${esc(email)}) to confirm</span><input type="text" id="delAccEmail" autocomplete="off"></label>`, [{label:'Cancel'}, {label:'Delete account', kind:'danger', onClick: async () => {
      if (val('delAccEmail').trim().toLowerCase() !== email.toLowerCase()){ toast('Type your email exactly to confirm'); return false; }
      try { await Sync.api('/rest/v1/rpc/delete_my_account', { method:'POST', body:{} }); }
      catch(e){ toast('Could not delete the account — ' + e.message); return false; }
      await IDB.run(['outbox', 'versions', 'conflicts'], 'readwrite', tx => { ['outbox', 'versions', 'conflicts'].forEach(s => tx.objectStore(s).clear()); });
      for (const k of ['syncUser', 'syncInitial', 'syncCursor', 'pendingErasures', 'auditQueue']) { try { await Store.putMeta(k, null); } catch {} }
      S.conflicts = []; Sync.linkedId = null; Sync.session = null; clearTimeout(Sync.timer); try { await IDB.del('meta', 'syncSession'); } catch {}
      Sync.setState('signed-out'); toast('Account deleted. Your data on this device is unchanged.'); render({ keepScroll:true });
    }}]);
  };
  const all = document.getElementById('signOutAll');
  if (all) all.onclick = () => dialog('Sign out everywhere?', '<p>Every device, including this one, will be signed out. Your data stays on each device and in your account.</p>', [{label:'Cancel'}, {label:'Sign out everywhere', kind:'danger', onClick: async () => { await Sync.signOutEverywhere(); render({ keepScroll:true }); }}]);
  if (document.getElementById('activityPanel')) refreshActivity();
}

