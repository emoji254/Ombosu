/* ---------------------------------------------------------------
   Schema versions. meta/schemaVersion = { version, at }. migrate() runs on boot, import and file-open.
   v1: ids and createdAt/updatedAt inside every document; logs in one shape (entries[].sets[] with
   weight / reps / actualRPE); hint fields (lastWeight / lastReps) stripped from saved sets.
----------------------------------------------------------------*/
const SCHEMA_VERSION = 2;
const LEGACY_LOG_LISTS = ['exercises', 'workoutEntries', 'movements', 'lifts'];
const SET_ALIASES = ['kg', 'load', 'rep', 'actualWeight', 'actualReps', 'rpe'];
function normalizeSetV1(s, i){
  let n = s, changed = false;
  const edit = () => { if (!changed){ n = { ...s }; changed = true; } };
  const w = setWeight(s), r = setReps(s), rp = setRPE(s);
  if (w != null && n.weight !== w){ edit(); n.weight = w; }
  if (r != null && n.reps !== r){ edit(); n.reps = r; }
  if (rp != null && n.actualRPE !== rp){ edit(); n.actualRPE = rp; }
  SET_ALIASES.forEach(k => { if (k in n){ edit(); delete n[k]; } });
  if (!n.setNumber){ edit(); n.setNumber = i + 1; }
  ['lastWeight', 'lastReps'].forEach(k => { if (k in n){ edit(); delete n[k]; } });
  return changed ? n : s;
}
function normalizeEntryV1(e){
  const sets = loggedExerciseSets(e), nsets = sets.map(normalizeSetV1);
  let changed = !Array.isArray(e.sets) || nsets.some((s, i) => s !== sets[i]);
  const ne = { ...e };
  const id = loggedExerciseId(e); if (id != null && ne.exId !== id){ ne.exId = id; changed = true; }
  const nm = loggedExerciseName(e); if (nm && ne.name !== nm){ ne.name = nm; changed = true; }
  if (Array.isArray(e.sets) && !changed) return e;
  ne.sets = nsets;
  return ne;
}
/* Older logs stored flat set rows or other field names; give them the entries[].sets[] shape (keeping the original under `legacy`). */
function normalizeLogV1(log){
  const src = workoutLogEntries(log);
  const isCanonicalList = Array.isArray(log.entries) && src === log.entries;
  let entries;
  if (src.length && src.every(e => Array.isArray(e && e.sets))) entries = src.map(normalizeEntryV1);
  else if (src.length){
    // flat rows (one per set): group consecutive rows of the same exercise
    const groups = [], keyOf = e => String(loggedExerciseId(e) ?? '') + '|' + loggedExerciseName(e).toLowerCase();
    src.forEach(row => { const k = keyOf(row), last = groups[groups.length - 1]; if (last && last.k === k && !Array.isArray(row.sets)) last.rows.push(row); else groups.push({ k, rows:[row], entry:row }); });
    entries = groups.map(g => Array.isArray(g.entry.sets) ? normalizeEntryV1(g.entry) : normalizeEntryV1({ exId:loggedExerciseId(g.entry), name:loggedExerciseName(g.entry) || undefined, sets:g.rows.map(r => ({ ...r })) }));
  } else entries = Array.isArray(log.entries) ? log.entries : [];
  const same = isCanonicalList && entries.length === log.entries.length && entries.every((e, i) => e === log.entries[i]);
  if (same) return log;
  const next = { ...log, entries };
  if (!isCanonicalList && src.length){
    const used = LEGACY_LOG_LISTS.find(k => log[k] === src) || null;
    if (used){ next.legacy = { ...(log.legacy || {}), [used]: log[used] }; delete next[used]; }
  }
  return next;
}
function migrationContext(){
  const first = {};
  const see = (cid, date) => { if (cid && date && (!first[cid] || date < first[cid])) first[cid] = date; };
  Object.values(S.attendance).forEach(a => see(a.clientId, a.date));
  Object.values(S.logs).forEach(l => see(l.clientId, l.date));
  return { first };
}
function migrateDocV1(coll, id, doc, ctx){
  let d = doc, changed = false;
  const edit = () => { if (!changed){ d = { ...doc }; changed = true; } };
  if (d.id !== id){ edit(); d.id = id; }
  if (!d.createdAt){
    edit();
    d.createdAt = coll === 'clients' ? (ctx.first[id] || todayISO())
      : coll === 'logs' ? (d.completedAt ? new Date(Number(d.completedAt)).toISOString() : (d.date ? d.date + 'T12:00:00.000Z' : new Date().toISOString()))
      : coll === 'attendance' ? (d.date ? d.date + 'T12:00:00.000Z' : new Date().toISOString())
      : new Date().toISOString();
  }
  if (!d.updatedAt){ edit(); d.updatedAt = d.createdAt.length === 10 ? d.createdAt + 'T12:00:00.000Z' : d.createdAt; }
  if (coll === 'logs'){ const n = normalizeLogV1(d); if (n !== d){ if (!changed){ changed = true; } d = n; } }
  return changed ? d : doc;
}
/* Runs every migration newer than fromVersion. Idempotent: documents already in the new shape are left alone.
   opts.force re-checks everything regardless of the stored version (used after an import). */
async function migrate(fromVersion, opts = {}){
  if (fromVersion >= SCHEMA_VERSION && !opts.force) return 0;
  const ctx = migrationContext(), edits = {};
  let n = 0;
  for (const c of COLLS){
    for (const [id, doc] of Object.entries(S[c])){
      if (!doc || typeof doc !== 'object') continue;
      const next = migrateDocV1(c, id, doc, ctx);
      if (next !== doc){ (edits[c] || (edits[c] = [])).push([id, next]); n++; }
    }
  }
  if (n){
    await Store.batch(async () => { for (const [c, pairs] of Object.entries(edits)) await Store.bulkPut(c, pairs, S[c]); });
    invalidateLogIndex(); invalidateAttIndex();
  }
  if (fromVersion < 2){ try { n += await migrateSeedIds(); } catch(e){ console.warn('Starter-exercise ids were not unified', e); } }
  await Store.putMeta('schemaVersion', { version:SCHEMA_VERSION, at:new Date().toISOString() });
  return n;
}
async function schemaVersionNow(){ const m = await Store.getMeta('schemaVersion', null); return (m && Number(m.version)) || 0; }
