/* ---------------------------------------------------------------
   Consent, data rights and retention (Kenya Data Protection Act 2019). The app records what was agreed and
   makes access and erasure one click; it is a tool, not legal advice. Have the notice wording reviewed.
----------------------------------------------------------------*/
const DATA_REGION_DEFAULT = 'the EU (Ireland, eu-west-1)';
/* The region is a setting you confirm against your Supabase project (Project Settings > General), not a fixed claim. */
const dataRegion = () => String((S.privacy && S.privacy.region) || '').trim() || DATA_REGION_DEFAULT;
S.privacy = { controller:'', contact:'', region:'' }; S.teamSize = 0;
S.retention = { archiveMonths:12, deleteMonths:36 };
async function loadPrivacySettings(){
  S.privacy = { controller:'', contact:'', region:'', ...((await Store.getMeta('privacy', null)) || {}) };
  S.teamSize = ((await Store.getMeta('teamSize', null)) || {}).n || 0;
  S.retention = { archiveMonths:12, deleteMonths:36, ...((await Store.getMeta('retention', null)) || {}) };
}
function consentState(c){
  const k = c && c.consent;
  if (k && k.withdrawnAt) return 'withdrawn';
  return k && k.given ? 'given' : 'none';
}
function consentPillHTML(c){
  const s = consentState(c);
  return s === 'given' ? '' : s === 'withdrawn' ? ' <span class="pill bad">Consent withdrawn</span>' : ' <span class="pill warn">No consent recorded</span>';
}
/* Consent is recorded on the Edit Client page and is required before changes there can be saved. */
function consentFieldsHTML(c, cid){
  const k = c.consent || {}, s = consentState(c), given = s === 'given';
  const intro = given ? `Consent recorded on <strong>${esc(k.date)}</strong>. Update the details below if they changed.`
    : s === 'withdrawn' ? `Consent was withdrawn on <strong>${esc(k.withdrawnAt)}</strong>. To keep recording data about this client, record their consent again.`
    : 'No consent has been recorded for this client yet. Record it once you have explained what is stored and why.';
  return `<div class="stack" id="consentPanel" style="border-top:1px solid var(--line);padding-top:.9rem">
    <h3>Consent and privacy <span class="pill ${given ? 'ok' : 'warn'}">${given ? 'Recorded' : 'Required to save'}</span></h3>
    <p class="small">${intro}</p>${syncNoteHTML(c)}
    <div class="inline-fields">
      <label class="field"><span>Date given</span><input type="date" id="cs_date" value="${esc(k.date || todayISO())}"></label>
      <label class="field"><span>How was it given?</span><select id="cs_method">${[['verbal','Verbal'],['written','Written'],['signed','Signed form'],['digital','Digital (message or email)']].map(([v, l]) => `<option value="${v}" ${k.method === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <label class="row tight small" style="gap:.4rem;align-items:flex-start"><input type="checkbox" id="cs_explained" style="width:auto;margin-top:.2rem" ${given && k.explained ? 'checked' : ''}><span style="flex:1;min-width:0"><strong>Required.</strong> I explained what is stored (contact details, goal, health notes, attendance, training records), why, how long it is kept, and their rights (see, correct, export, delete, withdraw), and they agreed.</span></label>
    <label class="row tight small" style="gap:.4rem;align-items:flex-start"><input type="checkbox" id="cs_outside" style="width:auto;margin-top:.2rem" ${given && k.outsideKenya ? 'checked' : ''}><span style="flex:1;min-width:0">They agree that copies kept in my online account may be stored outside Kenya, in ${esc(dataRegion())}. Leave this unticked to keep this client's data on this device only (it will not sync to your other devices).</span></label>
    <label class="field"><span>Note (optional)</span><input type="text" id="cs_note" value="${esc(k.note || '')}"></label>
    <div class="row tight"><button type="button" class="btn ghost sm" data-privacy-notice="1">View privacy notice</button>${given ? `<button type="button" class="btn ghost sm" data-consent="withdraw" data-cid="${esc(cid)}">Withdraw consent</button>` : ''}</div></div>`;
}
/* Reads the consent fields on the Edit Client page. Returns the consent record to save, or null (with a message) when
   consent has not been confirmed. Not shown to assistants, who keep what the coach recorded. */
function readConsentFields(c){
  const ex = document.getElementById('cs_explained');
  if (!ex) return c.consent;
  if (!ex.checked){ toast('Consent is required before you can save: tick that you explained what is stored and their rights'); try { ex.scrollIntoView({ block:'center' }); ex.focus(); } catch {} return null; }
  const old = c.consent || {}, was = consentState(c) === 'given';
  const next = { given:true, date:val('cs_date') || todayISO(), method:val('cs_method'), explained:true, outsideKenya:document.getElementById('cs_outside').checked, note:val('cs_note') };
  const same = was && old.date === next.date && old.method === next.method && !!old.outsideKenya === next.outsideKenya && (old.note || '') === next.note;
  return same ? old : { ...next, recordedAt:new Date().toISOString() };
}
function withdrawConsent(cid){
  const c = S.clients[cid]; if (!c) return;
  dialog('Withdraw consent?', `<p>${esc(c.name)} no longer agrees to their data being kept. Their data stays here until you archive or delete them, and it stops syncing to your account (the online copy is removed).</p><p class="small muted">Unsaved changes on this page are lost.</p>`, [{label:'Cancel'}, {label:'Withdraw consent', kind:'danger', onClick: async () => {
    const cur = S.clients[cid], next = { ...cur, consent:{ ...(cur.consent || {}), given:false, withdrawnAt:todayISO() } };
    try { await Store.put('clients', cid, next); } catch(e){ showSaveError(e); return false; }
    S.clients[cid] = next; toast('Consent withdrawn'); render({ keepScroll:true });
  }}]);
}
/* ---- right of access: everything held about one client, as a file they can keep ---- */
function clientDataBundle(cid){
  const c = S.clients[cid];
  const sched = Object.entries(S.schedule).filter(([, s]) => (s.clientIds || []).includes(cid)).map(([id, s]) => ({ ...s, id }));
  const own = coll => Object.entries(S[coll]).filter(([, d]) => d.clientId === cid).map(([id, d]) => ({ ...d, id }));
  return { app:'nyaega-client-data', exportedAt:new Date().toISOString(), note:'Everything this app holds about this person.',
    client:{ ...c, id:cid }, program:c.programId ? S.programs[c.programId] || null : null, pairing:c.groupId ? (S.groups[c.groupId] || {}).name || null : null,
    attendance:own('attendance'), sessions:own('logs'), scheduledSessions:sched };
}
function downloadClientData(cid){
  if (assistantBlocked()) return;
  const c = S.clients[cid]; if (!c) return;
  Audit.log('export', { kind:'client data' });
  download('nyaega-' + fname(c.name) + '-my-data-' + todayISO() + '.json', JSON.stringify(clientDataBundle(cid), null, 2), 'application/json');
  downloadClientSummaryPdf({ id:cid, ...c });
}

/* ---- right to erasure: remove the client from this device, every local copy, and (via sync) the account ---- */
async function scrubErasedClient(cid, erased){
  const mine = r => r && r.logClient === cid;
  S.sessions = S.sessions.filter(r => !mine(r));
  S.recoveryArchive = (S.recoveryArchive || []).filter(r => !mine(r));
  S.recoveryList = (S.recoveryList || []).filter(r => !mine(r));
  try { await Store.putMeta('workoutDraftArchive', S.recoveryArchive); await clearWorkoutAutosave(); } catch(e){ console.warn('Could not clear saved sessions', e); }
  // daily snapshots
  if (MODE === 'local' && LOCAL === 'idb'){
    try {
      const index = ((await Store.getMeta('snapshotIndex', null)) || { list:[] }).list;
      for (const k of await IDB.keys('snapshots')){
        const snap = await IDB.get('snapshots', k); if (!snap) continue;
        let changed = false;
        if (snap.clients && snap.clients[cid]){ delete snap.clients[cid]; changed = true; }
        for (const coll of ['logs', 'attendance']) for (const [id, d] of Object.entries(snap[coll] || {})) if (d && d.clientId === cid){ delete snap[coll][id]; changed = true; }
        for (const [id, s] of Object.entries(snap.schedule || {})) if (s && (s.clientIds || []).includes(cid)){ const rest = s.clientIds.filter(x => x !== cid); if (rest.length) s.clientIds = rest; else delete snap.schedule[id]; changed = true; }
        for (const [id, x] of Object.entries(snap.scheduleExceptions || {})) if (x && x.key === cid){ delete snap.scheduleExceptions[id]; changed = true; }
        if (changed){
          snap.counts = {}; COLLS.forEach(c2 => snap.counts[c2] = Object.keys(snap[c2] || {}).length);
          await IDB.put('snapshots', k, snap);
          const row = index.find(x => x.key === k); if (row) row.counts = snap.counts;
        }
      }
      await Store.putMeta('snapshotIndex', { list:index });
    } catch(e){ console.warn('Could not clean the daily snapshots', e); }
  }
  // the read-only localStorage copy kept for 30 days after the IndexedDB upgrade
  try {
    for (const coll of COLLS){
      const raw = localStorage.getItem('nyaega:' + coll); if (!raw) continue;
      const m = safeParse(raw); let changed = false;
      for (const [id, d] of Object.entries(m)){
        if (coll === 'clients' && id === cid || (d && d.clientId === cid) || (coll === 'scheduleExceptions' && d && d.key === cid)){ delete m[id]; changed = true; }
        else if (coll === 'schedule' && d && (d.clientIds || []).includes(cid)){ const rest = d.clientIds.filter(x => x !== cid); if (rest.length) d.clientIds = rest; else delete m[id]; changed = true; }
      }
      if (changed) localStorage.setItem('nyaega:' + coll, JSON.stringify(m));
    }
  } catch(e){ console.warn('Could not clean the old browser copy', e); }
  // account copy: when signed in the deletions are already queued; otherwise remember them for the next sign-in
  try {
    const linked = await Store.getMeta('syncUser', null);
    await Sync.markErased(cid);
    // queued even while signed out, so the online copy is erased at the next sign-in; the client row becomes a tombstone that always wins
    if (Sync.enabled() && (Sync.signedIn() || Sync.linkedId)) await IDB.put('outbox', 'clients/' + cid, { coll:'clients', id:cid, op:'erase', doc:null, queuedAt:Date.now() });
    const log = ((await Store.getMeta('deletionLog', null)) || { list:[] }).list;
    log.push({ at:new Date().toISOString(), records:erased.length, account:!!linked });   // no names or ids are kept
    await Store.putMeta('deletionLog', { list:log.slice(-200) });
    S.deletionCount = log.length;
  } catch(e){ console.warn('Could not record the deletion', e); }
  Audit.log('delete-client', { records:erased.length });
  if (Sync.signedIn()) Sync.schedule(300);
}

/* ---- retention ---- */
function lastActivityOf(cid){
  const c = S.clients[cid] || {};
  const dates = [...(attIndex().byClient[cid] || []).map(a => a.date), ...(logIndex().byClient[cid] || []).map(l => l.date), c.createdAt && String(c.createdAt).slice(0, 10)].filter(Boolean);
  return dates.sort().pop() || todayISO();
}
const monthsAgoISO = n => { const d = new Date(); d.setMonth(d.getMonth() - n); return isoOf(d); };
function retentionReport(){
  const archiveCut = monthsAgoISO(Number(S.retention.archiveMonths) || 12), deleteCut = monthsAgoISO(Number(S.retention.deleteMonths) || 36);
  const toArchive = [], toDelete = [];
  for (const [id, c] of Object.entries(S.clients)){
    const last = lastActivityOf(id);
    if (c.status === 'archived'){ if (last < deleteCut) toDelete.push({ id, name:c.name, last }); }
    else if (last < archiveCut) toArchive.push({ id, name:c.name, last });
  }
  return { toArchive, toDelete };
}
function retentionReminderHTML(){
  const r = retentionReport(); if (!r.toArchive.length && !r.toDelete.length) return '';
  const lines = [];
  if (r.toArchive.length) lines.push(`${r.toArchive.length} client${r.toArchive.length === 1 ? ' has' : 's have'} had no activity for ${esc(S.retention.archiveMonths)}+ months: ${r.toArchive.slice(0, 4).map(x => esc(x.name)).join(', ')}${r.toArchive.length > 4 ? '…' : ''}. Consider archiving.`);
  if (r.toDelete.length) lines.push(`${r.toDelete.length} archived client${r.toDelete.length === 1 ? ' is' : 's are'} past ${esc(S.retention.deleteMonths)} months: ${r.toDelete.slice(0, 4).map(x => esc(x.name)).join(', ')}${r.toDelete.length > 4 ? '…' : ''}. Consider deleting their data.`);
  return `<div class="panel" role="status" style="margin-top:.8rem;border-left:4px solid var(--warn)"><div class="spread"><div><strong>Data retention</strong><div class="small muted">${lines.join('<br>')}</div></div><button type="button" class="btn ghost sm" data-go="clients">Review clients</button></div></div>`;
}

/* ---- privacy notice (plain language, for clients) ---- */
function privacyNoticeText(){
  const who = (S.privacy.controller || 'your coach'), contact = S.privacy.contact ? ' You can contact them at ' + S.privacy.contact + '.' : '';
  return [
    ['Who is responsible', who + ' is responsible for the information kept about you.' + contact],
    ['What is kept', 'Your name and contact details, your goals, any injuries or health notes you share, which sessions you attended, and what you did in each session (exercises, weights, repetitions, notes). Health information is sensitive, so it is only kept with your consent.'],
    ['Why', 'To plan and run your training, track your progress, and manage your session pack.'],
    ['Where it is stored', 'On your coach\'s device. If your coach uses online backup, a copy is also stored with a cloud provider (Supabase, which processes it on your coach\'s behalf) in ' + dataRegion() + ', which is outside Kenya. This only happens if you agreed.'],
    ['How long', 'While you train with your coach. After ' + (S.retention.archiveMonths || 12) + ' months without activity your record is archived, and after ' + (S.retention.deleteMonths || 36) + ' months it is reviewed for deletion.'],
    ['Your rights', 'You can ask to see what is kept about you and get a copy, ask for corrections, withdraw your consent at any time, and ask for your information to be deleted. If you are unhappy, you can complain to the Office of the Data Protection Commissioner in Kenya.'],
    ['Who sees it', (S.teamSize > 0 ? 'Your coach and the assistant coaches your coach has given access to your record. ' : 'Only your coach. ') + 'If online backup is used, the cloud provider stores it on your coach\'s behalf but does not use it for its own purposes. It is not sold or shared for marketing.']
  ];
}
function privacyNoticeDialog(){
  const body = privacyNoticeText().map(([h, t]) => `<h3 style="margin-top:.8rem">${esc(h)}</h3><p class="small">${esc(t)}</p>`).join('');
  dialog('Privacy notice', body + '<p class="small muted" style="margin-top:.8rem">This is a plain-language template. Have it reviewed before relying on it.</p>', [{label:'Close'}, {label:'Download PDF', kind:'primary', onClick:() => { downloadPrivacyNoticePdf(); return false; }}]);
}
function downloadPrivacyNoticePdf(){
  if (!window.jspdf){ toast('The PDF library did not load — check your connection and try again'); return; }
  const doc = new window.jspdf.jsPDF({ unit:'pt', format:'a4' });
  let y = 56; doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Privacy notice', 40, y); y += 28;
  privacyNoticeText().forEach(([h, t]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(h, 40, y); y += 16;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); const lines = doc.splitTextToSize(t, 515); doc.text(lines, 40, y); y += lines.length * 13 + 12;
    if (y > 760){ doc.addPage(); y = 56; }
  });
  doc.save('privacy-notice.pdf');
}
function privacyPanelHTML(){
  return `<div class="panel stack owner-only"><h3>Privacy and data rights</h3>
    <p class="small muted">Used in the privacy notice you give clients, and for reminders about old records. Per client: consent, download their data, and delete their data are on their profile.</p>
    <div class="inline-fields">
      <label class="field"><span>Your name or business</span><input type="text" id="pv_controller" value="${esc(S.privacy.controller)}"></label>
      <label class="field"><span>Contact email or phone</span><input type="text" id="pv_contact" value="${esc(S.privacy.contact)}"></label>
    </div>
    <label class="field"><span>Where your online copy is stored (check Supabase: Project Settings, General)</span><input type="text" id="pv_region" value="${esc(S.privacy.region)}" placeholder="${esc(DATA_REGION_DEFAULT)}"></label>
    <div class="inline-fields">
      <label class="field"><span>Archive after (months without activity)</span><input type="number" id="pv_archive" min="1" max="120" value="${esc(S.retention.archiveMonths)}"></label>
      <label class="field"><span>Review for deletion after (months)</span><input type="number" id="pv_delete" min="1" max="240" value="${esc(S.retention.deleteMonths)}"></label>
    </div>
    <div class="row"><button type="button" class="btn primary sm" id="pvSave">Save</button><button type="button" class="btn ghost sm" data-privacy-notice="1">View privacy notice</button></div>
    <p class="small muted">${S.deletionCount ? esc(S.deletionCount) + ' client deletion' + (S.deletionCount === 1 ? '' : 's') + ' recorded (no names kept).' : 'No client deletions recorded.'}</p></div>`;
}
function wirePrivacy(m){
  m.querySelectorAll('[data-privacy-notice]').forEach(b => b.onclick = privacyNoticeDialog);
  m.querySelectorAll('[data-consent]').forEach(b => b.onclick = () => withdrawConsent(b.dataset.cid));
  m.querySelectorAll('[data-dlmydata]').forEach(b => b.onclick = () => downloadClientData(b.dataset.dlmydata));
  const save = document.getElementById('pvSave');
  if (save) save.onclick = async () => {
    const privacy = { controller:val('pv_controller'), contact:val('pv_contact'), region:val('pv_region') };
    const retention = { archiveMonths:Math.max(1, numVal('pv_archive') || 12), deleteMonths:Math.max(1, numVal('pv_delete') || 36) };
    try { await Store.putMeta('privacy', privacy); await Store.putMeta('retention', retention); } catch(e){ showSaveError(e); return; }
    S.privacy = privacy; S.retention = retention; toast('Saved');
  };
}

