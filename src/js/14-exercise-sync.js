/* ---------------------------------------------------------------
   N6: the exercise library syncs one record at a time (table exercise_library, one row per exercise), starter
   exercises have the same id on every device, and an older all-in-one library row is merged by name.
   N16: when both sides edited, "newer" is judged on the server's clock (this device's clock is corrected by the
   difference seen on the last push), not on each device's own clock.
----------------------------------------------------------------*/
const normExName = v => String(v || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
Object.assign(Sync, {
  exSnap:null, skewMs:0,
  snapOf(list){ return new Map((list || []).map(e => [e.id, stable(e)])); },
  noteServerTime(iso){ const t = Date.parse(iso); if (t) this.skewMs = t - Date.now(); },
  async enqueueExercises(list){
    const next = this.snapOf(list), prev = this.exSnap || new Map();
    if (!this.enabled() || !(this.signedIn() || this.linkedId)){ this.exSnap = next; return; }
    try {
      const now = new Date().toISOString();
      for (const e of list) if (prev.get(e.id) !== next.get(e.id)){ e.updatedAt = now; await this.put2outbox('put', 'exercises', e.id, e); }
      for (const id of prev.keys()) if (!next.has(id)) await this.put2outbox('del', 'exercises', id, null);
      this.exSnap = this.snapOf(list);   // taken after the edit times were stamped, so the next save compares like with like
      this.pending = await IDB.count('outbox'); refreshSyncUI(); if (this.signedIn()) this.schedule(1500);
    } catch(e){
      console.warn('Could not queue exercises for sync', e);
      if (this.signedIn()) this.setState('attention', 'some changes could not be queued for sync');
      showSaveError(new StorageWriteError('the sync queue', e), { background:true });
    }
  },
  /* An older build stored the whole library as one row (id "library"): add what is missing here by name, then retire it. */
  async mergeLegacyLibrary(row){
    if (!row.deleted_at && row.data && Array.isArray(row.data.list)){
      const names = new Set(S.exercises.map(e => normExName(e.name))), add = [];
      for (const e of row.data.list){
        if (!e || typeof e.name !== 'string' || !SAFE_ID.test(String(e.id)) || names.has(normExName(e.name)) || S.exercises.some(x => x.id === e.id)) continue;
        add.push(e); names.add(normExName(e.name));
      }
      if (add.length) await saveExerciseList([...S.exercises, ...add]);
    }
    await IDB.put('outbox', 'exercises/library', { coll:'exercises', id:'library', op:'del', doc:null, queuedAt:Date.now() });
    await IDB.put('versions', 'exercises/library', row.version);
  },
  async uploadExercisesOnce(){
    if (this.role === 'assistant') return;
    const f = await Store.getMeta('exerciseSyncV2', null);
    if (f && f.userId === this.session.user.id) return;
    for (const e of S.exercises){ if ((await this.baseVersion('exercises', e.id)) == null) await this.put2outbox('put', 'exercises', e.id, e); }
    await Store.putMeta('exerciseSyncV2', { userId:this.session.user.id });
  }
});
/* Schema v2: starter exercises get the same id on every device. Old random starter ids are remapped by name in the
   library, programs, logs and any open sessions. */
async function migrateSeedIds(){
  const seeds = new Map(SEED_EXERCISES.map(e => [normExName(e.name), e]));
  const have = new Set(S.exercises.map(e => e.id)), map = {}, claimed = new Set();
  const next = S.exercises.map(e => {
    const s = seeds.get(normExName(e.name));
    if (!s || e.id === s.id || have.has(s.id) || claimed.has(s.id)) return e;
    claimed.add(s.id); map[e.id] = s.id; return { ...e, id:s.id };
  });
  if (!Object.keys(map).length) return 0;
  if (!(await saveExerciseList(next))) throw new Error('Could not save the exercise library');
  const progPairs = [], logPairs = [];
  for (const [id, p] of Object.entries(S.programs)){
    let ch = false; (p.days || []).forEach(d => (d.items || []).forEach(it => { if (map[it.exId]){ it.exId = map[it.exId]; ch = true; } }));
    if (ch) progPairs.push([id, p]);
  }
  for (const [id, l] of Object.entries(S.logs)){
    let ch = false; workoutLogEntries(l).forEach(e => { for (const k of ['exId', 'exerciseId', 'movementId']) if (map[e[k]]){ e[k] = map[e[k]]; ch = true; } });
    if (ch) logPairs.push([id, l]);
  }
  await Store.batch(async () => {
    if (progPairs.length) await Store.bulkPut('programs', progPairs, S.programs);
    if (logPairs.length) await Store.bulkPut('logs', logPairs, S.logs);
  });
  const fix = dr => ((dr && dr.entries) || []).forEach(e => { if (map[e.exId]) e.exId = map[e.exId]; });
  fix(S.sel && S.sel.draft); fix(S.parkedWorkout && S.parkedWorkout.draft); S.sessions.forEach(r => fix(r.draft)); (S.recoveryArchive || []).forEach(r => fix(r.draft));
  invalidateLogIndex();
  return Object.keys(map).length;
}

