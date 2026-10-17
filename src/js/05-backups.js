/* ---------------------------------------------------------------
   Persistence and backups (local IndexedDB mode): ask the browser not to evict the data, keep up to
   7 daily snapshots inside IndexedDB, and remind the coach to export a copy.
----------------------------------------------------------------*/
const SNAPSHOT_KEEP = 7;
async function requestPersistentStorage(){
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    S.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch(e){ console.warn('persist() failed', e); }
}
async function refreshStorageEstimate(){
  try { if (navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); S.storageEst = { usage:e.usage || 0, quota:e.quota || 0 }; } } catch {}
}
function snapshotPayload(date){
  const counts = {}; COLLS.forEach(c => counts[c] = Object.keys(S[c]).length);
  return { app:'nyaega', schema:SCHEMA_VERSION, date, at:new Date().toISOString(), counts, exercises:S.exercises,
    clients:S.clients, groups:S.groups, programs:S.programs, logs:S.logs, attendance:S.attendance, conditioning:S.conditioning, schedule:S.schedule, scheduleExceptions:S.scheduleExceptions };
}
async function saveSnapshot(key){
  const snap = snapshotPayload(key);
  await IDB.put('snapshots', key, snap);
  const index = ((await Store.getMeta('snapshotIndex', null)) || { list:[] }).list.filter(x => x.key !== key);
  index.push({ key, at:snap.at, counts:snap.counts });
  const dated = index.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.key)).sort((a, b) => b.key.localeCompare(a.key));
  const drop = new Set(dated.slice(SNAPSHOT_KEEP).map(x => x.key));
  for (const k of drop) await IDB.del('snapshots', k);
  await Store.putMeta('snapshotIndex', { list:index.filter(x => !drop.has(x.key)).sort((a, b) => b.key.localeCompare(a.key)) });
}
/* One snapshot per day, taken the first time the app is opened that day. */
async function takeDailySnapshot(){
  if (MODE !== 'local' || LOCAL !== 'idb' || S.restoring) return;
  try {
    const day = todayISO();
    if (await IDB.get('snapshots', day)) return;
    await saveSnapshot(day);
  } catch(e){ console.warn('Daily snapshot failed', e); }
}
async function listSnapshots(){ return ((await Store.getMeta('snapshotIndex', null)) || { list:[] }).list; }
/* Replace everything with a snapshot. What is there now is kept as the "pre-restore" snapshot first. */
async function restoreSnapshot(key){
  if (assistantBlocked()) return;
  const snap = await IDB.get('snapshots', key);
  if (!snap) throw new Error('That snapshot no longer exists');
  S.restoring = true; clearTimeout(activeWorkoutSaveTimer);
  await saveSnapshot('pre-restore');
  await IDB.run([...COLLS, 'meta'], 'readwrite', tx => {
    COLLS.forEach(c => { const s = tx.objectStore(c); s.clear(); Object.entries(snap[c] || {}).forEach(([id, doc]) => s.put(doc, id)); });
    const m = tx.objectStore('meta');
    m.put({ list: Array.isArray(snap.exercises) && snap.exercises.length ? snap.exercises : S.exercises }, 'exercises');
    m.delete('activeSessions'); m.delete('activeWorkoutDraft');
  });
  try { localStorage.removeItem('nyaega:pending:activeSessions'); } catch {}
  await Audit.log('restore', { kind:key === 'pre-restore' ? 'earlier copy' : 'daily snapshot' });
  location.reload();
}
async function markExported(){
  S.lastExportAt = Date.now();
  try { await Store.putMeta('lastExport', { at:S.lastExportAt }); } catch(e){ console.warn('Could not record the export time', e); }
}
const daysSince = ts => Math.floor((Date.now() - ts) / 86400000);
function exportStatusText(){
  if (!S.lastExportAt) return 'You have not exported a backup yet';
  const d = daysSince(S.lastExportAt);
  return 'Last exported ' + (d <= 0 ? 'today' : d === 1 ? '1 day ago' : d + ' days ago');
}
function exportReminderDue(){
  if (MODE === 'file' || !Object.keys(S.clients).length) return false;
  const since = S.lastExportAt || S.firstSeenAt || Date.now();
  return Date.now() - since > 7 * 86400000;
}
function exportReminderHTML(){
  if (!exportReminderDue()) return '';
  return `<div class="panel" role="status" style="margin-top:.8rem;border-left:4px solid var(--warn)"><div class="spread"><div><strong>${esc(exportStatusText())}</strong><div class="small muted">A fresh export keeps a copy of your clients and sessions outside this browser.</div></div><button type="button" class="btn primary sm" id="reminderExport">Export now</button></div></div>`;
}
function exportEverything(){
  if (assistantBlocked()) return;
  Audit.log('export', { kind:'json' });
  download('nyaega-backup-' + todayISO() + '.json', exportPayload(), 'application/json');
  markExported().then(() => { if (S.view === 'dashboard' && ['today', 'data'].includes(S.sub || 'today')) render(); });
}
function backupsPanelHTML(snaps){
  const idb = MODE === 'local' && LOCAL === 'idb';
  return `<div class="panel stack owner-only"><h3>Safety copies</h3>
    <p class="small"><strong>${esc(exportStatusText())}.</strong> ${exportReminderDue() ? 'It has been more than a week — export a copy soon.' : ''}</p>
    ${idb ? `<p class="small muted">${S.persisted ? 'Your browser has agreed to keep this data (persistent storage is on).' : 'Your browser may clear this data if the device runs low on space — export regularly.'}</p>
      <p class="small muted">The app keeps the last ${SNAPSHOT_KEEP} daily snapshots inside this browser. They protect against mistakes, not against losing the device.</p>
      <div class="stack" id="snapshotList">${(snaps || []).map(s => `<div class="spread"><span class="small">${esc(s.key === 'pre-restore' ? 'Before the last restore' : s.key)} <span class="muted num">· ${esc((s.counts && s.counts.clients) || 0)} clients · ${esc((s.counts && s.counts.logs) || 0)} sessions</span></span><button type="button" class="btn sm ghost" data-restore-snapshot="${esc(s.key)}">Restore</button></div>`).join('') || '<p class="small muted">The first snapshot is taken the next time the app opens.</p>'}</div>`
      : '<p class="small muted">Daily snapshots are kept when the app stores data in this browser\'s database.</p>'}
  </div>`;
}

async function clearBackupsAfterWipe(){
  try {
    if (LOCAL === 'idb'){ await IDB.run('snapshots', 'readwrite', tx => { tx.objectStore('snapshots').clear(); }); await Store.putMeta('snapshotIndex', null); }
    lsDataKeys().forEach(k => { try { localStorage.removeItem(k); } catch {} });   // the old localStorage copy too
    S.snapshotList = [];
  } catch(e){ console.warn('Could not clear the backups', e); }
}
