/* --------------------------- boot --------------------------- */
(async function boot(){
  await Store.init();
  setStatus();
  if (Store.initError){ console.error('Storage failed to start', Store.initError); showLoadFailure(Store.initError); return; }
  try { await Lock.load(); } catch(e){ console.warn('Could not read the app lock', e); }
  Lock.setupAutoLock();
  if (Lock.enabled()) Lock.show({ view:'pin' });
  { const st = document.getElementById('status'); if (st){ st.style.cursor = 'pointer'; st.setAttribute('role', 'button'); st.tabIndex = 0; st.title = 'Sign in'; st.onclick = () => { if (!Sync.signedIn() && !document.getElementById('lockScreen')) Lock.show({ view:'credentials', closable:true }); }; st.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); st.click(); } }; } }
  // Last used with a data file: ask to reconnect before touching browser storage.
  let lastMode = null; try { lastMode = localStorage.getItem(LAST_MODE_KEY); } catch {}
  if (lastMode === 'file'){ await showFileReconnect(); return; }
  try {
    for (const c of COLLS) S[c] = await Store.loadAll(c);
    invalidateLogIndex(); invalidateAttIndex();
    const exMeta = await Store.getMeta('exercises', null);
    S.recoveryList=await loadRecoveryList();
    S.recoveryArchive=await Store.getMeta('workoutDraftArchive',[]);
    if (!Array.isArray(S.recoveryArchive)) S.recoveryArchive = [];
    if (exMeta == null){
      // First run only: the library document definitely doesn't exist yet.
      S.exercises = SEED_EXERCISES; await Store.putMeta('exercises', { list: S.exercises });
    } else if (Array.isArray(exMeta.list)){
      S.exercises = exMeta.list;
    } else {
      throw new StorageLoadError('the exercise library', new Error('unexpected data shape'));
    }
  } catch(e){
    console.error('Boot load failed', e);
    showLoadFailure(e);
    return;
  }
  try { await migrate(await schemaVersionNow()); } catch(e){ console.error('Data migration failed', e); showSaveError(e); }
  try {
    S.lastExportAt = ((await Store.getMeta('lastExport', null)) || {}).at || 0;
    let fs = await Store.getMeta('firstSeen', null);
    if (!fs){ fs = { at:Date.now() }; await Store.putMeta('firstSeen', fs); }
    S.firstSeenAt = fs.at;
  } catch(e){ console.warn('Could not read backup status', e); }
  try { await loadPrivacySettings(); S.deletionCount = (((await Store.getMeta('deletionLog', null)) || { list:[] }).list).length; } catch(e){ console.warn('Could not read privacy settings', e); }
  await migratePackOffsets();
  buildTabs(); S.bootState = 'ready'; render();
  try { await loadConflicts(); await ensureDeviceId(); await Sync.loadErased(); Sync.exSnap = Sync.snapOf(S.exercises); } catch {}
  try { Sync.auto = ((await Store.getMeta('syncAuto', null)) || {}).on !== false; } catch {}   // automatic sync unless it was turned off
  try { const ao = await Store.getMeta('assistantOf', null); if (ao && ao.coachId){ Sync.role = 'assistant'; Sync.coachId = ao.coachId; document.body.classList.add('assistant'); } } catch {}
  captureInviteFromUrl();
  const oauthResult = takeOAuthResult();
  Sync.restore().then(async () => {
    if (oauthResult) await completeOAuth(oauthResult);
    maybeOfferInvite();
    // First visit on a device that has never signed in: offer the sign-in page once ("Local mode" there stops it coming back).
    try { if (!oauthResult && Sync.enabled() && !Sync.signedIn() && !Sync.linkedId && !Lock.enabled() && !document.getElementById('lockScreen') && S.bootState === 'ready' && !sessionOpen() && localStorage.getItem('nyaega:skipLogin') !== '1') Lock.show({ view:'credentials', closable:true }); } catch {}
  });
  registerServiceWorker();
  requestPersistentStorage().then(() => { if (S.view === 'dashboard' && S.sub === 'data') render({ keepScroll:true }); });
  refreshStorageEstimate();
  takeDailySnapshot();
  if(S.recoveryList.length)showWorkoutRecovery();
})();

/* Blocking screen shown when stored data can't be read. The app is never
   rendered and nothing is written, so the stored data stays exactly as it is. */
function showLoadFailure(err){
  S.bootState = 'failed';
  const local = MODE === 'local';
  const status = document.getElementById('status'); if (status) status.textContent = 'Data not loaded — nothing is being saved';
  document.getElementById('tabs').innerHTML = '';
  document.getElementById('main').innerHTML = `<div class="panel stack" role="alert" style="max-width:640px;margin:2rem auto">
    <h2>Couldn't load your data</h2>
    <p>${esc(err && err.message ? err.message : 'An unknown error occurred')}.</p>
    <p class="small muted">To protect your records, the app has stopped before showing or saving anything. Nothing has been changed or deleted.</p>
    ${local ? `<p class="small muted">If this keeps happening, stored data on this device may be damaged. Download a raw copy of everything stored first, so nothing is lost, then ask for help restoring it.</p>` : `<p class="small muted">This is usually a connection problem. Check your connection and try again.</p>`}
    <div class="row">
      <button type="button" class="btn primary" id="retryLoad">Retry</button>
      ${local ? `<button type="button" class="btn ghost" id="downloadRawData">Download raw stored data</button>` : ''}
    </div>
  </div>`;
  document.getElementById('retryLoad').onclick = () => location.reload();
  const raw = document.getElementById('downloadRawData');
  if (raw) raw.onclick = async () => {
    const dump = {};
    try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k && k.startsWith('nyaega:')) dump[k] = localStorage.getItem(k); } } catch {}
    let idb = null;
    try { if (window.indexedDB){ idb = {}; for (const s of [...COLLS, 'meta']) idb[s] = await IDB.all(s); } } catch(e){ idb = { error:String(e) }; }
    download('nyaega-raw-storage-' + todayISO() + '.json', JSON.stringify({ app:'nyaega', rawLocalStorage:true, savedAt:new Date().toISOString(), keys:dump, indexedDb:idb }, null, 2), 'application/json');
  };
}

