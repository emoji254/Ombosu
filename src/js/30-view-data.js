/* ============================ DATA ============================ */
/* Browsers allow roughly 5 MB of localStorage per site (it varies), so this is an estimate. */
const LOCAL_STORAGE_BUDGET = 5 * 1000 * 1000;
// Counts everything stored for this address (not just Nyaega's keys) — that total is what the browser's limit applies to.
function localStorageUsage(){
  let used = 0;
  try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k) used += k.length + (localStorage.getItem(k) || '').length; } } catch {}
  return { used, pct: Math.min(100, Math.round(used / LOCAL_STORAGE_BUDGET * 100)) };
}
function storageUsageHTML(){
  if (LOCAL === 'idb'){
    const e = S.storageEst;
    if (!e || !e.quota) return '<div class="small muted" id="storageBox">Storage: measuring…</div>';
    const pct = Math.min(100, Math.round(e.usage / e.quota * 100)), mb = (e.usage / 1000000).toFixed(e.usage < 100000 ? 2 : 1);
    const level = pct >= 90 ? 'full' : pct >= 75 ? 'warn' : '';
    return `<div id="storageBox"><div class="small"><strong>Storage used by this app:</strong> about ${mb} MB (${pct}% of what this browser allows)</div>
      <div class="storage-meter ${level}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Storage used"><i style="width:${Math.max(pct,1)}%"></i></div>
      <div class="small ${level ? '' : 'muted'}">${level ? 'Storage is getting full — export a backup now.' : 'Plenty of room. Browsers allow far more than 5 MB for this kind of storage.'}</div></div>`;
  }
  const { used, pct } = localStorageUsage();
  const mb = (used / 1000000).toFixed(used < 100000 ? 2 : 1);
  const level = pct >= 90 ? 'full' : pct >= 75 ? 'warn' : '';
  const note = pct >= 90 ? 'Storage is nearly full — export a backup now. New sessions may fail to save.'
    : pct >= 75 ? 'Storage is filling up — export a backup soon.'
    : 'Approximate — browsers allow around 5 MB and it varies.';
  return `<div><div class="small"><strong>Storage used on this device:</strong> about ${mb} MB of ~5 MB (${pct}%)</div>
    <div class="storage-meter ${level}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Storage used"><i style="width:${Math.max(pct,1)}%"></i></div>
    <div class="small ${level ? '' : 'muted'}">${note}</div></div>`;
}
/* The Data tab is split into sections so each page holds one kind of thing. */
const DATA_SECTIONS = [['backup','Backup and files'],['online','Online account'],['team','Team and privacy'],['security','Security'],['general','Appearance and reset']];
const dataSectionsFor = () => Sync.role === 'assistant' ? DATA_SECTIONS.filter(([k]) => ['online','security','general'].includes(k)) : DATA_SECTIONS;
function dataSectionNow(){
  const list = dataSectionsFor(), want = S.dataSection;
  if (want === 'activity') return 'activity';   // its own page, opened from the Online account section (not one of the buttons)
  return list.some(([k]) => k === want) ? want : list[0][0];
}
/* A small mark on a section that needs attention, so nothing important is hidden by being on another page. */
function dataSectionFlag(k){
  if (k === 'backup') return Sync.role !== 'assistant' && exportReminderDue() ? 'A backup is due' : '';
  if (k === 'online') return Sync.signedIn() && (Sync.state === 'attention' || Sync.state === 'offline' || (Sync.deviceStatus && Sync.deviceStatus !== 'approved')) ? 'Needs attention' : '';
  return '';
}
function dataSectionNavHTML(cur){
  return `<nav class="settings-nav" aria-label="Data sections">${dataSectionsFor().map(([k, label]) => {
    const flag = dataSectionFlag(k);
    return `<button type="button" data-dsec="${k}" aria-current="${cur === k}">${esc(label)}${flag ? `<span class="sec-flag" role="img" aria-label="${esc(flag)}" title="${esc(flag)}"></span>` : ''}</button>`;
  }).join('')}</nav>`;
}
function dataBackupSection(){
  const counts = COLLS.map(c => `${Object.keys(S[c]).length} ${c}`).join(' · ');
  return `
  <div class="panel stack">
    <h2>Where your data lives</h2>
    <p class="small muted">${
      MODE === 'file' ? `Connected to <strong>${esc(FILE_HANDLE ? FILE_HANDLE.name : 'a file')}</strong> on this computer. Every change writes straight to that file — nothing is kept in this browser at all. After a refresh or your next visit, you'll be asked to reconnect with one click.`
      : `This copy currently saves to this browser's storage. Nothing is sent anywhere unless you sign in to the Online account, and it does sit on this device until you export or connect a file.`
    }</p>
  </div>

  <div class="panel stack">
    <h3>Store to a file you control</h3>
    <p class="small muted">Point the app at a single .json file on your computer — a USB drive or a synced folder works too. Every change saves there directly, the same way a spreadsheet does. Nothing touches browser storage or any server. Needs Chrome, Edge or Opera on desktop.</p>
    ${MODE === 'file'
      ? `<div class="row"><button class="btn danger sm" id="fileDisconnect">Disconnect this file</button></div>`
      : `<div class="row">
          <button class="btn primary sm" id="fileOpen">Open an existing data file…</button>
          <button class="btn ghost sm" id="fileNew">Start a new data file…</button>
        </div>
        ${!fsApiSupported() ? '<p class="small muted">This browser doesn\'t support direct file access. Use Export below before closing, and Import when you come back — nothing auto-saves in between, so nothing sits in the browser either.</p>' : ''}`}
  </div>

  ${backupsPanelHTML(S.snapshotList)}

  <div class="panel stack">
    <h3>Backup and transfer</h3>
    <p class="small num">${esc(counts)} · ${S.exercises.length} exercises</p>
    ${MODE === 'local' ? storageUsageHTML() : ''}
    <div class="row">
      <button class="btn ghost" id="exportJson">Export everything (JSON)</button>
      <button class="btn ghost" id="exportEnc">Export encrypted backup…</button>
      <button class="btn ghost" id="exportCsv">Export session log (CSV)</button>
      <button class="btn ghost" id="exportAtt">Export attendance (CSV)</button>
      <button class="btn ghost" id="exportRoster">Export roster (Excel)</button>
      <button class="btn ghost" id="importBtn">Import a backup</button>
      <input type="file" id="importFile" accept="application/json" hidden>
    </div>
  </div>`;
}
function dataGeneralSection(){
  return `
  <div class="panel stack">
    <h3>Theme</h3>
    <div class="row"><button class="btn ghost" data-theme="light">Light</button>
      <button class="btn ghost" data-theme="dark">Dark</button>
      <button class="btn ghost" data-theme="">Match system</button></div>
  </div>

  <div class="panel stack">
    <h3>Reset</h3>
    <p class="small muted">Removes every client, program and session from this device, and can remove your online copy too. Export a backup first if you might want any of it.</p>
    <div class="row"><button class="btn danger" id="wipe">Delete all data</button></div>
  </div>`;
}
/* Recent activity is long, so it lives on its own page; the Online account section only has a button for it. */
function activityLinkHTML(){
  return `<div class="panel spread"><div><h3>Recent activity</h3><p class="small muted">Sign-ins, exports, device changes and deletions.</p></div><button type="button" class="btn ghost sm" data-dsec="activity">View</button></div>`;
}
function viewData(){
  const cur = dataSectionNow();
  if (cur === 'activity') return `<div class="page-head spread"><button type="button" class="btn ghost sm" data-dsec="online">← Back to Online account</button></div>${activityPanelHTML()}`;
  const body = cur === 'backup' ? dataBackupSection()
    : cur === 'online' ? `${syncPanelHTML()}${devicesPanelHTML()}${activityLinkHTML()}`
    : cur === 'team' ? `${teamPanelHTML()}${privacyPanelHTML()}`
    : cur === 'security' ? lockPanelHTML()
    : dataGeneralSection();
  return `${conflictsPanelHTML()}${dataSectionNavHTML(cur)}<div id="dataSection" data-section="${cur}">${body}</div>`;
}

function download(name, text, type){
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fname = s => String(s).replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'_');

