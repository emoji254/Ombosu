/* ---------------------------------------------------------------
   Storage: IndexedDB in this browser (local mode), or one JSON file the
   coach connects (file mode). If IndexedDB can't be opened the app falls
   back to localStorage. The Store facade below is the same either way.
----------------------------------------------------------------*/
const COLLS = ['clients','groups','programs','logs','attendance','conditioning','schedule','scheduleExceptions'];
let MODE = 'local';   // 'local' (IndexedDB, or localStorage as a fallback) or 'file'
let FILE_HANDLE = null, FileData = null;

/* A read that fails must never look like "no data" — callers would then write
   over the real data. StorageLoadError stops boot and every write path. */
class StorageLoadError extends Error {
  constructor(what, cause){ super('Could not read ' + what + (cause && cause.message ? ' — ' + cause.message : '')); this.name = 'StorageLoadError'; this.what = what; this.cause = cause; }
}
const LS = {
  key: c => 'nyaega:' + c,
  all(c){
    const raw = localStorage.getItem(LS.key(c));
    if (raw == null) return {};
    let parsed;
    try { parsed = JSON.parse(raw); } catch(e){ throw new StorageLoadError('stored ' + c, e); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new StorageLoadError('stored ' + c, new Error('unexpected data shape'));
    return parsed;
  },
  // LS.all throws on damaged data, so these never overwrite a collection they couldn't read.
  put(c,id,data){ const m = LS.all(c); m[id] = data; LS.write(LS.key(c), JSON.stringify(m), c); },
  del(c,id){ const m = LS.all(c); delete m[id]; LS.write(LS.key(c), JSON.stringify(m), c); },
  write(key, text, what){ try { localStorage.setItem(key, text); } catch(e){ throw new StorageWriteError(what, e); } }
};
const isQuotaError = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 || /quota/i.test(String(e.message || '')));
/* Every failed write becomes a StorageWriteError, so the UI can tell the coach
   plainly that something was NOT saved (and whether storage is full). */
const STORAGE_LABELS = { logs:'the session', clients:'the client', attendance:'the attendance mark', programs:'the program', groups:'the pairing', conditioning:'the conditioning program', exercises:'the exercise library', activeWorkoutDraft:'the workout backup copy', activeSessions:'the workout backup copy', workoutDraftArchive:'the saved-workouts list' };
const storageLabel = what => STORAGE_LABELS[what] || what;
class StorageWriteError extends Error {
  constructor(what, cause){
    const full = isQuotaError(cause);
    what = String(what || 'your changes').replace(/^\w+/, w => storageLabel(w));
    super(full ? 'This device\'s storage is full, so ' + what + ' could not be saved' : 'Could not save ' + what + (cause && cause.message ? ' — ' + cause.message : ''));
    this.name = 'StorageWriteError'; this.what = what; this.cause = cause; this.quota = full;
  }
}



/* ---------------------------------------------------------------
   Local back end: IndexedDB — one object store per collection, plus "meta" and "snapshots".
   (logs are indexed by clientId and date; attendance by date and clientId.) It replaces the old
   localStorage copy, which is migrated once and kept as a read-only backup for 30 days.
   If IndexedDB can't be opened at all, the app keeps using localStorage as before.
----------------------------------------------------------------*/
let LOCAL = 'ls';   // 'idb' once IndexedDB is open and the one-time copy is verified
const IDB = {
  name:'nyaega-data', db:null, opening:null,
  open(){
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;
    return this.opening = new Promise((resolve, reject) => {
      const r = indexedDB.open(this.name, 3);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox');   // v2: changes waiting to sync
        if (!db.objectStoreNames.contains('versions')) db.createObjectStore('versions');   // v3: the server version last seen per document
        if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts');   // v3: edits that clashed with another device
        if (db.objectStoreNames.contains('logs')) return;   // upgrading from v1: the data stores already exist
        COLLS.forEach(c => {
          const s = db.createObjectStore(c);
          if (c === 'logs'){ s.createIndex('clientId', 'clientId'); s.createIndex('date', 'date'); }
          if (c === 'attendance'){ s.createIndex('date', 'date'); s.createIndex('clientId', 'clientId'); }
        });
        db.createObjectStore('meta'); db.createObjectStore('snapshots');
      };
      r.onsuccess = () => { this.db = r.result; this.db.onversionchange = () => { this.db.close(); this.db = null; this.opening = null; }; resolve(this.db); };
      r.onerror = () => { this.opening = null; reject(r.error); };
      r.onblocked = () => { this.opening = null; reject(new Error('IndexedDB is blocked by another open tab')); };
    });
  },
  async run(stores, mode, fn){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode); let out;
      try { out = fn(tx); } catch(e){ try { tx.abort(); } catch {} reject(e); return; }
      tx.oncomplete = () => resolve(out);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('transaction failed'));
    });
  },
  async all(store){
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const out = {}, tx = db.transaction(store, 'readonly'), cur = tx.objectStore(store).openCursor();
      cur.onsuccess = () => { const c = cur.result; if (c){ out[c.key] = c.value; c.continue(); } };
      tx.oncomplete = () => resolve(out);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('read failed'));
    });
  },
  async get(store, key){
    const db = await this.open();
    return new Promise((resolve, reject) => { const r = db.transaction(store, 'readonly').objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  },
  async keys(store){
    const db = await this.open();
    return new Promise((resolve, reject) => { const r = db.transaction(store, 'readonly').objectStore(store).getAllKeys(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  },
  async count(store){
    const db = await this.open();
    return new Promise((resolve, reject) => { const r = db.transaction(store, 'readonly').objectStore(store).count(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  },
  put(store, key, value){ return this.run(store, 'readwrite', tx => { tx.objectStore(store).put(value, key); }); },
  del(store, key){ return this.run(store, 'readwrite', tx => { tx.objectStore(store).delete(key); }); },
  /* pairs: [[id, doc], ...] — one transaction, all or nothing */
  putMany(store, pairs){ return this.run(store, 'readwrite', tx => { const s = tx.objectStore(store); pairs.forEach(([id, doc]) => s.put(doc, id)); }); }
};
const IDB_FLAG = 'nyaega:idbMigrated';   // once set, never fall back to the old localStorage copy
function lsDataKeys(){
  const keys = [];
  try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (!k || !k.startsWith('nyaega:')) continue; const rest = k.slice(7); if (COLLS.includes(rest) || rest.startsWith('meta:')) keys.push(k); } } catch {}
  return keys;
}
/* Copy the old localStorage data into IndexedDB in one transaction, verify the counts, and only then mark it done.
   The old keys are NOT touched; they stay as a read-only backup (see expireLocalStorageBackup). */
async function migrateFromLocalStorage(){
  if (await IDB.get('meta', 'migration')) return;
  const keys = lsDataKeys(), now = new Date();
  if (!keys.length){ await IDB.put('meta', 'migration', { at:now.toISOString(), source:'none', counts:{} }); return; }
  const data = {}, counts = {};
  for (const c of COLLS){ data[c] = LS.all(c); counts[c] = Object.keys(data[c]).length; }   // throws on damaged data, before anything is written
  const meta = {};
  for (const k of keys){
    if (!k.startsWith('nyaega:meta:')) continue;
    const raw = localStorage.getItem(k); if (raw == null) continue;
    let v; try { v = JSON.parse(raw); } catch(e){ throw new StorageLoadError('stored ' + k.slice(12), e); }
    if (v != null) meta[k.slice(12)] = v;
  }
  counts.meta = Object.keys(meta).length;
  await IDB.run([...COLLS, 'meta'], 'readwrite', tx => {
    COLLS.forEach(c => { const s = tx.objectStore(c); Object.entries(data[c]).forEach(([id, doc]) => s.put(doc, id)); });
    const m = tx.objectStore('meta'); Object.entries(meta).forEach(([id, v]) => m.put(v, id));
  });
  const bad = [];
  for (const c of COLLS){ const n = await IDB.count(c); if (n !== counts[c]) bad.push(c + ' ' + n + '/' + counts[c]); }
  const nm = await IDB.count('meta'); if (nm !== counts.meta) bad.push('meta ' + nm + '/' + counts.meta);
  if (bad.length){
    await IDB.run([...COLLS, 'meta'], 'readwrite', tx => { [...COLLS, 'meta'].forEach(s => tx.objectStore(s).clear()); });
    throw new Error('the copy to IndexedDB did not match (' + bad.join(', ') + ')');
  }
  await IDB.put('meta', 'migration', { at:now.toISOString(), source:'localStorage', counts, keys, backupUntil:new Date(now.getTime() + 30 * 86400000).toISOString() });
}
/* After 30 days the old localStorage copy is removed (the verified IndexedDB copy is the only one from then on). */
async function expireLocalStorageBackup(){
  const m = await IDB.get('meta', 'migration');
  if (!m || !m.backupUntil || m.cleaned || Date.now() < Date.parse(m.backupUntil)) return;
  (m.keys || []).forEach(k => { try { localStorage.removeItem(k); } catch {} });
  await IDB.put('meta', 'migration', { ...m, cleaned:new Date().toISOString() });
}
async function initLocalBackend(){
  LOCAL = 'ls';
  const migratedBefore = (() => { try { return localStorage.getItem(IDB_FLAG) === '1'; } catch { return false; } })();
  if (!window.indexedDB){ if (migratedBefore) throw new StorageLoadError('browser storage', new Error('IndexedDB is not available')); return; }
  try {
    await IDB.open(); await migrateFromLocalStorage(); LOCAL = 'idb';
    try { localStorage.setItem(IDB_FLAG, '1'); } catch {}
    expireLocalStorageBackup().catch(e => console.warn('Old-backup cleanup failed', e));
  } catch(e){
    if (e instanceof StorageLoadError) throw e;
    // Never slip back to a stale localStorage copy once IndexedDB has been the real store.
    if (migratedBefore) throw new StorageLoadError('browser storage', e);
    console.warn('IndexedDB unavailable — staying on localStorage', e); LOCAL = 'ls';
  }
}
/* Every stored document carries its own id and timestamps. */
function stampDoc(coll, id, data){
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  data.id = id;
  const now = new Date().toISOString();
  if (!data.createdAt) data.createdAt = coll === 'clients' ? todayISO() : now;
  data.updatedAt = now;
}

const Store = {
  async init(){
    Store.initError = null;
    if (MODE === 'local'){ try { await initLocalBackend(); } catch(e){ Store.initError = e; } }
    return MODE;
  },
  async loadAll(coll){
    if (MODE === 'file') return FileData[coll] || {};
    if (LOCAL === 'idb'){
      try { return await IDB.all(coll); } catch(e){ throw new StorageLoadError(coll, e); }
    }
    return LS.all(coll);
  },
  /* put/del/putMeta resolve only once the data is really stored, and reject
     with StorageWriteError otherwise — in every mode. */
  async put(coll, id, data){
    stampDoc(coll, id, data);
    if (MODE === 'file'){
      const had = Object.prototype.hasOwnProperty.call(FileData[coll], id), prev = FileData[coll][id];
      FileData[coll][id] = data;
      if (fileBatchDepth) return;   // Store.batch writes once at the end
      try { await queueFileWrite(coll); }
      catch(e){ if (had) FileData[coll][id] = prev; else delete FileData[coll][id]; throw e; }
      return;
    }
    if (LOCAL === 'idb'){
      try { await IDB.put(coll, id, data); } catch(e){ throw new StorageWriteError(coll, e); }
      await Sync.enqueue('put', coll, id, data);
    } else LS.put(coll, id, data);
  },
  async del(coll, id){
    if (MODE === 'file'){
      const had = Object.prototype.hasOwnProperty.call(FileData[coll], id), prev = FileData[coll][id];
      delete FileData[coll][id];
      if (fileBatchDepth) return;   // Store.batch writes once at the end
      try { await queueFileWrite(coll); }
      catch(e){ if (had) FileData[coll][id] = prev; throw e; }
      return;
    }
    if (LOCAL === 'idb'){
      try { await IDB.del(coll, id); } catch(e){ throw new StorageWriteError('the deletion of ' + storageLabel(coll), e); }
      await Sync.enqueue('del', coll, id, null);
    }
    else LS.del(coll, id);
  },
  /* Returns `fallback` only when the document genuinely doesn't exist.
     A failed or damaged read throws StorageLoadError instead. */
  async getMeta(id, fallback){
    if (MODE === 'file') return FileData?.meta?.[id] ?? fallback;
    if (LOCAL === 'idb'){
      let v; try { v = await IDB.get('meta', id); } catch(e){ throw new StorageLoadError('stored ' + id, e); }
      return v == null ? fallback : v;
    }
    const raw = localStorage.getItem('nyaega:meta:' + id);
    if (raw == null) return fallback;
    try { return JSON.parse(raw) ?? fallback; } catch(e){ throw new StorageLoadError('stored ' + id, e); }
  },
  async putMeta(id, data){
    if (MODE === 'file'){
      FileData.meta = FileData.meta || {};
      const had = Object.prototype.hasOwnProperty.call(FileData.meta, id), prev = FileData.meta[id];
      FileData.meta[id] = data;
      if (fileBatchDepth) return;   // Store.batch writes once at the end
      try { await queueFileWrite(id); }
      catch(e){ if (had) FileData.meta[id] = prev; else delete FileData.meta[id]; throw e; }
      return;
    }
    if (LOCAL === 'idb'){
      try { if (data == null) await IDB.del('meta', id); else await IDB.put('meta', id, data); }
      catch(e){ throw new StorageWriteError(id, e); }
      if (id === 'exercises' && data) await Sync.enqueueExercises(data.list);
    }
    else LS.write('nyaega:meta:' + id, JSON.stringify(data), id);
  },
  /* Many documents of one collection in a single transaction (IndexedDB) — used by migrations. `live` is updated too. */
  async bulkPut(coll, pairs, live){
    pairs.forEach(([id, doc]) => stampDoc(coll, id, doc));
    if (MODE === 'local' && LOCAL === 'idb'){
      try { await IDB.putMany(coll, pairs); } catch(e){ throw new StorageWriteError(coll, e); }
      for (const [id, doc] of pairs) await Sync.enqueue('put', coll, id, doc);
    } else { for (const [id, doc] of pairs) await this.put(coll, id, doc); }
    if (live) pairs.forEach(([id, doc]) => { live[id] = doc; });
  },
  /* Many changes, one save. In file mode the file is written once when fn finishes;
     if that write fails, every change made inside fn is undone in memory and the error is
     rethrown. Other modes just run fn (their writes are per-record already). */
  async batch(fn){
    if (MODE !== 'file') return fn();
    const snapshot = JSON.stringify(FileData);
    fileBatchDepth++;
    let result;
    try { result = await fn(); }
    finally { fileBatchDepth--; }
    if (fileBatchDepth) return result;
    try { await queueFileWrite('your changes'); }
    catch(e){
      // Restore in place: S's collections are the same objects as FileData's.
      const before = JSON.parse(snapshot);
      for (const key of [...COLLS, 'meta']){ const live = FileData[key] || (FileData[key] = {}); for (const k of Object.keys(live)) delete live[k]; Object.assign(live, before[key] || {}); }
      throw e;
    }
    return result;
  }
};

/* ---------------------------------------------------------------
   File mode: everything lives in one JSON file the person picks
   with the browser's native file dialog (File System Access API,
   Chrome/Edge/Opera). The file handle is remembered in IndexedDB,
   so after a refresh the app asks to reconnect instead of quietly
   switching to browser storage.
----------------------------------------------------------------*/
/* Writes never overlap. Every change made while a write is running shares ONE
   follow-up write, so a burst of saves becomes one or two writes, not one each.
   Each caller's promise rejects if the write carrying its change fails. */
let fileWriteRunning = null, fileWritePending = null, fileBatchDepth = 0;
function queueFileWrite(what){
  if (!fileWritePending){
    const pending = (fileWriteRunning || Promise.resolve()).catch(() => {}).then(() => {
      fileWritePending = null; fileWriteRunning = pending;   // later changes queue behind this write
      return writeFileNow();
    });
    pending.finally(() => { if (fileWriteRunning === pending) fileWriteRunning = null; }).catch(() => {});
    fileWritePending = pending;
  }
  return fileWritePending.catch(e => { console.warn('file write failed', e); throw new StorageWriteError((what || 'your changes') + ' to ' + (FILE_HANDLE ? FILE_HANDLE.name : 'the data file'), e); });
}
/* Remembers the connected data file across visits (the handle itself can't go in localStorage). */
const HandleStore = {
  open(){ return new Promise((resolve, reject) => { const r = indexedDB.open('nyaega-handles', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); },
  async run(mode, fn){ const db = await this.open(); return new Promise((resolve, reject) => { const tx = db.transaction('kv', mode), req = fn(tx.objectStore('kv')); tx.oncomplete = () => { db.close(); resolve(req && req.result); }; tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); }; }); },
  get(key){ return this.run('readonly', s => s.get(key)); },
  set(key, value){ return this.run('readwrite', s => s.put(value, key)); },
  del(key){ return this.run('readwrite', s => s.delete(key)); }
};
const LAST_MODE_KEY = 'nyaega:lastMode';
function rememberFileMode(handle){
  try { localStorage.setItem(LAST_MODE_KEY, 'file'); } catch {}
  HandleStore.set('dataFile', handle).catch(e => console.warn('Could not remember the data file', e));
}
async function forgetFileMode(){
  try { localStorage.removeItem(LAST_MODE_KEY); } catch {}
  try { await HandleStore.del('dataFile'); } catch(e){ console.warn('Could not forget the data file', e); }
}
async function writeFileNow(){
  if (!FILE_HANDLE) return;
  // The library is committed to meta first, so prefer it over S.exercises (which updates only after a successful write).
  const exercises = FileData.meta?.exercises?.list || S.exercises;
  const payload = { app:'nyaega', version:2, savedAt: new Date().toISOString(),meta:FileData.meta||{},
    clients:FileData.clients, groups:FileData.groups, programs:FileData.programs,
    logs:FileData.logs, attendance:FileData.attendance, conditioning:FileData.conditioning,
    schedule:FileData.schedule, scheduleExceptions:FileData.scheduleExceptions, exercises };
  const writable = await FILE_HANDLE.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}
function fsApiSupported(){ return !!(window.showOpenFilePicker && window.showSaveFilePicker); }
async function openDataFile(){
  if (!fsApiSupported()){ toast('Your browser can\'t do this — try Chrome or Edge, or use Export/Import instead'); return; }
  try {
    const [handle] = await window.showOpenFilePicker({ types:[{ description:'Nyaega data', accept:{'application/json':['.json']} }] });
    if ((await handle.requestPermission({ mode:'readwrite' })) !== 'granted'){ toast('Permission needed to use that file'); return; }
    const data = safeParse(await (await handle.getFile()).text());
    if (data.app !== 'nyaega') throw new Error('not a Nyaega file');
    enterFileMode(handle, data);
    toast('Connected to ' + handle.name);
  } catch(e){ if (e.name !== 'AbortError') toast('Could not open that file — ' + e.message); }
}
async function newDataFile(){
  if (!fsApiSupported()){ toast('Your browser can\'t do this — try Chrome or Edge, or use Export/Import instead'); return; }
  try {
    const handle = await window.showSaveFilePicker({ suggestedName:'nyaega-data.json', types:[{ description:'Nyaega data', accept:{'application/json':['.json']} }] });
    enterFileMode(handle, { clients:{}, groups:{}, programs:{}, logs:{}, attendance:{}, conditioning:{}, schedule:{}, scheduleExceptions:{}, exercises: SEED_EXERCISES });
    await writeFileNow();
    toast('Created ' + handle.name);
  } catch(e){ if (e.name !== 'AbortError') toast('Could not create that file — ' + e.message); }
}
function enterFileMode(handle, data){
  FILE_HANDLE = handle; MODE = 'file';
  rememberFileMode(handle);
  if (!document.querySelector('#tabs button')) buildTabs();   // e.g. coming from the reconnect screen
  FileData = { clients:data.clients||{}, groups:data.groups||{}, programs:data.programs||{}, logs:data.logs||{}, attendance:data.attendance||{}, conditioning:data.conditioning||{}, schedule:data.schedule||{}, scheduleExceptions:data.scheduleExceptions||{}, meta:data.meta||{} };
  S.clients = FileData.clients; S.groups = FileData.groups; S.programs = FileData.programs;
  S.logs = FileData.logs; S.attendance = FileData.attendance; S.conditioning = FileData.conditioning; invalidateLogIndex(); invalidateAttIndex();
  S.schedule = FileData.schedule; S.scheduleExceptions = FileData.scheduleExceptions;
  S.exercises = (data.exercises && data.exercises.length) ? data.exercises : SEED_EXERCISES;
  { const fm = FileData.meta || {}; S.recoveryList = (fm.activeSessions && Array.isArray(fm.activeSessions.sessions) && fm.activeSessions.sessions.length) ? fm.activeSessions.sessions : (fm.activeWorkoutDraft ? [fm.activeWorkoutDraft] : []); }
  S.sessions = [];
  S.recoveryArchive=FileData.meta.workoutDraftArchive||[];
  S.bootState = 'ready';
  S.sel = {}; setStatus(); render();if(S.recoveryList.length)showWorkoutRecovery();
  (async () => { try { const sv = Number((FileData.meta.schemaVersion || {}).version) || 0; if (sv < SCHEMA_VERSION){ await migrate(sv); render({ keepScroll:true }); } } catch(e){ showSaveError(e); } })();
}
async function disconnectFile(){ toast('Disconnecting…'); await forgetFileMode(); setTimeout(() => location.reload(), 400); }

/* Shown at startup when the app was last used with a data file. Nothing from browser
   storage is loaded or saved until the person chooses, so the two copies can't drift apart
   by accident. */
async function showFileReconnect(){
  S.bootState = 'reconnect';
  let handle = null;
  try { handle = await HandleStore.get('dataFile'); } catch(e){ console.warn('Could not read the remembered data file', e); }
  const name = handle?.name || 'your data file';
  const supported = fsApiSupported();
  const status = document.getElementById('status'); if (status) status.textContent = 'Data file not connected — nothing is being saved';
  document.getElementById('tabs').innerHTML = '';
  document.getElementById('main').innerHTML = `<div class="panel stack" role="alert" style="max-width:640px;margin:2rem auto">
    <h2>Reconnect your data file</h2>
    <p>Last time, Nyaega was saving to <strong>${esc(name)}</strong>. Reconnect to keep working in that file.</p>
    ${supported ? '' : '<p class="small">This browser can\'t open data files directly. Use Chrome, Edge or Opera on a computer to reconnect.</p>'}
    <p class="small muted" id="reconnectError" role="status"></p>
    <div class="row">
      ${supported && handle ? `<button type="button" class="btn primary" id="reconnectFile">Reconnect to ${esc(name)}</button>` : ''}
      ${supported ? `<button type="button" class="btn ${handle ? 'ghost' : 'primary'}" id="reconnectOther">Open a data file…</button>` : ''}
      <button type="button" class="btn ghost" id="reconnectUseBrowser">Use browser storage instead</button>
    </div>
  </div>`;
  const errorEl = document.getElementById('reconnectError');
  const reconnect = document.getElementById('reconnectFile');
  if (reconnect) reconnect.onclick = async () => {
    try {
      let permission = await handle.queryPermission({ mode:'readwrite' });
      if (permission !== 'granted') permission = await handle.requestPermission({ mode:'readwrite' });
      if (permission !== 'granted'){ errorEl.textContent = 'Permission to use the file was not given. Try again, or open the file yourself.'; return; }
      const data = JSON.parse(await (await handle.getFile()).text());
      if (!data || data.app !== 'nyaega') throw new Error('it isn\'t a Nyaega data file');
      enterFileMode(handle, data);
      toast('Reconnected to ' + handle.name);
    } catch(e){
      console.warn('Reconnect failed', e);
      errorEl.textContent = 'Couldn\'t open ' + name + (e && e.name === 'NotFoundError' ? ' — it may have been moved, renamed or deleted.' : ' — ' + (e && e.message || 'unknown error') + '.') + ' Use "Open a data file…" to find it.';
    }
  };
  const other = document.getElementById('reconnectOther');
  if (other) other.onclick = () => openDataFile();
  document.getElementById('reconnectUseBrowser').onclick = () => dialog('Use browser storage instead?',
    `<p>From now on, changes are saved in this browser — <strong>not</strong> in ${esc(name)}.</p><p class="small muted">The file stays exactly as it is, but the two copies will then differ. You can connect a data file again later from the Data tab.</p>`,
    [{label:'Cancel'},{label:'Use browser storage', kind:'danger', onClick: async () => { await forgetFileMode(); location.reload(); }}]);
}
function setStatus(){
  const el = document.getElementById('status'); if (!el) return;
  el.textContent = MODE === 'file' ? 'Saving directly to ' + (FILE_HANDLE ? FILE_HANDLE.name : 'a file') + ' — nothing in this browser'
    : 'Saving to this browser — back up from the Data tab';
  if (MODE === 'local' && typeof Sync !== 'undefined' && Sync.enabled() && Sync.signedIn()) el.textContent += ' · ' + Sync.label();
}

