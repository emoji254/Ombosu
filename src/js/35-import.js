/* ---- import: validate a backup and plan the merge before anything is written ---- */
const IMPORT_LABELS = { clients:'clients', groups:'pairings', programs:'programs', logs:'logged sessions', attendance:'attendance marks', conditioning:'conditioning programs', schedule:'one-off sessions', scheduleExceptions:'skipped sessions' };
const SAFE_ID = /^[\w.:-]{1,100}$/;   // ids the app generates; also keeps crafted ids out of HTML attributes
const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isISODate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
// The minimum each record needs so the screens that read it can't break.
const IMPORT_CHECKS = {
  clients: d => typeof d.name === 'string' && d.name.trim() !== '',
  groups: d => typeof d.name === 'string' && (d.dow == null || Array.isArray(d.dow)),
  programs: d => typeof d.name === 'string' && Array.isArray(d.days) && d.days.every(day => isPlainObject(day) && Array.isArray(day.items)),
  logs: d => typeof d.clientId === 'string' && isISODate(d.date),
  attendance: d => typeof d.clientId === 'string' && isISODate(d.date) && typeof d.status === 'string',
  conditioning: d => typeof d.name === 'string' && (d.blocks == null || Array.isArray(d.blocks)),
  schedule: d => isISODate(d.date) && Array.isArray(d.clientIds),
  scheduleExceptions: d => isISODate(d.date) && typeof d.key === 'string'
};
function planImport(data){
  const plan = { records:[], counts:{}, exercisesToAdd:[], exercisesKept:0, exercisesMatched:0, skipped:0, reasons:[] };
  const skip = reason => { plan.skipped++; if (plan.reasons.length < 5) plan.reasons.push(reason); };
  for (const coll of COLLS){
    const counts = plan.counts[coll] = { added:0, replaced:0 };
    const section = data[coll];
    if (section == null) continue;
    if (!isPlainObject(section)){ skip(`"${coll}" isn't in the expected format`); continue; }
    for (const [id, doc] of Object.entries(section)){
      if (!SAFE_ID.test(id)){ skip(`a ${IMPORT_LABELS[coll].replace(/s$/,'')} with an invalid id`); continue; }
      if (!isPlainObject(doc) || !IMPORT_CHECKS[coll](doc)){ skip(`${IMPORT_LABELS[coll]} record "${id}" is incomplete`); continue; }
      const exists = Object.prototype.hasOwnProperty.call(S[coll], id);
      counts[exists ? 'replaced' : 'added']++;
      plan.records.push({ coll, id, doc: JSON.parse(JSON.stringify(doc)) });
    }
  }
  // Exercise library merge. Same id → keep ours. Same name, different id (e.g. the starter
  // exercises, which get new ids in every browser) → use ours and point imported records at it.
  const remap = {};
  if (data.exercises != null){
    if (!Array.isArray(data.exercises)) skip('the exercise library isn\'t in the expected format');
    else {
      const normName = n => String(n || '').trim().toLocaleLowerCase().replace(/\s+/g,' ');
      const have = new Set(S.exercises.map(e => String(e.id))), adding = new Set();
      const byName = new Map(activeExercises().map(e => [normName(e.name), String(e.id)]));
      for (const ex of data.exercises){
        if (!isPlainObject(ex) || typeof ex.id !== 'string' || !SAFE_ID.test(ex.id) || typeof ex.name !== 'string' || !ex.name.trim()){ skip('an exercise with a missing name or invalid id'); continue; }
        if (have.has(ex.id) || adding.has(ex.id)){ plan.exercisesKept++; continue; }
        const sameName = !ex.archived && byName.get(normName(ex.name));
        if (sameName){ remap[ex.id] = sameName; plan.exercisesMatched++; continue; }
        adding.add(ex.id);
        if (!ex.archived) byName.set(normName(ex.name), ex.id);
        plan.exercisesToAdd.push({ id: ex.id, name: ex.name.trim(), category: typeof ex.category === 'string' ? ex.category : 'Other', equipment: typeof ex.equipment === 'string' ? ex.equipment : '', ...(ex.archived === true ? { archived: true } : {}) });
      }
    }
  }
  if (Object.keys(remap).length){
    const fix = obj => { if (!isPlainObject(obj)) return; for (const k of ['exId','exerciseId']) if (typeof obj[k] === 'string' && remap[obj[k]]) obj[k] = remap[obj[k]]; };
    for (const { coll, doc } of plan.records){
      if (coll === 'programs') (doc.days||[]).forEach(day => (day.items||[]).forEach(fix));
      if (coll === 'logs') ['entries','exercises'].forEach(k => { if (Array.isArray(doc[k])) doc[k].forEach(fix); });
    }
  }
  return plan;
}
function importSummaryHTML(plan, fileName){
  const rows = COLLS.filter(c => plan.counts[c].added || plan.counts[c].replaced).map(c => {
    const { added, replaced } = plan.counts[c];
    return `<tr><td>${esc(IMPORT_LABELS[c])}</td><td class="num">${added}</td><td class="num">${replaced}</td></tr>`;
  }).join('');
  return `<p class="small muted">From <strong>${esc(fileName)}</strong>. Nothing has been changed yet.</p>
    ${rows ? `<div class="tablewrap"><table><thead><tr><th>What</th><th>New</th><th>Replaces yours</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">"Replaces yours" means a record with the same id already exists here; the backup's version will overwrite it.</p>` : '<p>No records to import.</p>'}
    <p class="small"><strong>Exercise library:</strong> ${plan.exercisesToAdd.length} new exercise${plan.exercisesToAdd.length===1?'':'s'} will be added${(plan.exercisesKept + plan.exercisesMatched) ? `; ${plan.exercisesKept + plan.exercisesMatched} you already have will be kept as ${(plan.exercisesKept + plan.exercisesMatched)===1?'it is':'they are'}` : ''}. Nothing in your library is removed.${plan.exercisesMatched ? ' Imported programs and sessions will use your existing exercises where the names match.' : ''}</p>
    ${plan.skipped ? `<p class="small"><strong>${plan.skipped} item${plan.skipped===1?'':'s'} will be skipped</strong> because ${plan.skipped===1?'it is':'they are'} damaged or incomplete, e.g. ${plan.reasons.map(esc).join('; ')}.</p>` : ''}`;
}
async function runImport(plan){
  let imported = 0;
  try {
    // In data-file mode this writes the file once at the end instead of once per record.
    await Store.batch(async () => {
      for (const { coll, id, doc } of plan.records){ await Store.put(coll, id, doc); S[coll][id] = doc; imported++; }
    });
  } catch(e){
    if (!isStorageError(e)) throw e;
    if (MODE === 'file') imported = 0;   // the batch was undone as a whole
    showSaveError(e); toast(imported ? `Import stopped after ${imported} of ${plan.records.length} records — the rest were not saved` : 'Import failed — nothing was saved'); render(); return;
  }
  if (plan.exercisesToAdd.length && !(await saveExerciseList([...S.exercises, ...plan.exercisesToAdd]))){
    toast(`Imported ${imported} records, but the new exercises were not saved`); render(); return;
  }
  await migratePackOffsets();
  invalidateLogIndex(); invalidateAttIndex();
  try { await migrate(0, { force:true }); } catch(e){ showSaveError(e); }
  Audit.log('import', { records:imported });
  const parts = [`Imported ${imported} record${imported===1?'':'s'}`];
  if (plan.exercisesToAdd.length) parts.push(`${plan.exercisesToAdd.length} new exercise${plan.exercisesToAdd.length===1?'':'s'}`);
  if (plan.skipped) parts.push(`${plan.skipped} skipped`);
  toast(parts.join(' · ')); render();
}
/* One CSV cell. Text starting with = + - @ (or a tab/return) is prefixed with ' so spreadsheet
   apps show it as text instead of running it as a formula. Real numbers are left alone. */
function csvCell(v){
  let s = v == null ? '' : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function attendanceCsv(){
  const rows = [['date','weekday','client','status','pairing']];
  Object.values(S.attendance).sort((a,b) => (a.date||'').localeCompare(b.date||'')).forEach(a => {
    rows.push([a.date, DOW[dowOf(a.date)], (S.clients[a.clientId]||{}).name || a.clientId, a.status, (S.groups[a.groupId]||{}).name || '']);
  });
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}
function logsCsv(){
  const rows = [['date','client','day','exercise','set','weight','reps','notes','actual_rpe','actual_rir','set_type','set_note','target_rpe','block_mode','block_rounds','block_extra_reps','block_time_seconds','block_calories','block_distance_m']];
  const noBlock = ['','','','','',''];
  Object.values(S.logs).sort((a,b) => (a.date||'').localeCompare(b.date||'')).forEach(l => {
    const cname = (S.clients[l.clientId] || {}).name || l.clientId;
    workoutLogEntries(l).forEach(e => loggedExerciseSets(e).forEach((s,i) => {
      if (setWeight(s)==null&&setReps(s)==null&&setRPE(s)==null&&s.actualRIR==null&&!s.note&&!s.done) return;
      rows.push([l.date, cname, l.dayLabel||'', loggedEntryName(e), s.setNumber||i+1, setWeight(s)??'', setReps(s)??'', (l.notes||'').replace(/\n/g,' '),setRPE(s)??'',s.actualRIR??'',s.setType||'working',(s.note||'').replace(/\n/g,' '),e.targetRPE||'', ...noBlock]);
    }));
    // Conditioning blocks: one row each (exercise = "Conditioning · template · block"), results in the block_* columns.
    const cs = l.conditioningSession;
    if (cs && Array.isArray(cs.blocks)){
      const done = new Set(cs.blocksCompleted || []);
      cs.blocks.forEach((b,i) => {
        const r = (cs.results || {})[i];
        if (!r && !done.has(i)) return;
        rows.push([l.date, cname, l.dayLabel||'', `Conditioning · ${cs.templateName||'Conditioning'} · ${b.name||'Block '+(i+1)}`, '', '', '', ((r&&r.note)||'').replace(/\n/g,' '), r?.rpe ?? '', '', 'conditioning', '', '',
          conditioningModeName(b.mode), r?.roundsCompleted ?? '', r?.extraReps ?? '', r?.timeSeconds ?? '', r?.calories ?? '', r?.distance ?? '']);
      });
    }
  });
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}

