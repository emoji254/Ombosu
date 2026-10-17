/* ---------------------------------------------------------------
   Periodisation. A program has a base prescription (sets, reps, load, RPE, RIR, tempo, rest, notes per exercise) and
   optional per-week changes: item.weeks[week] holds only the fields that differ in that week. program.weekPlan[week]
   gives a week a name and can mark it as a deload. A client's currentWeek picks which week a new session starts from,
   and can advance by itself once every day of the week has been logged.
----------------------------------------------------------------*/
const WEEK_FIELDS = ['sets', 'reps', 'load', 'rpe', 'rir', 'tempo', 'rest', 'notes'];
const weekPlanOf = (p, w) => (p && p.weekPlan && p.weekPlan[w]) || {};
const isDeloadWeek = (p, w) => !!weekPlanOf(p, w).deload;
const weekLabelOf = (p, w) => weekPlanOf(p, w).label || (weekPlanOf(p, w).deload ? 'Deload' : '');
const weekTextFor = (p, w) => 'week ' + w + (weekLabelOf(p, w) ? ' · ' + weekLabelOf(p, w) : '');
/* The program row as it applies in a given week: the base with that week's changes on top. */
function weekItem(item, week){
  const over = item && item.weeks && item.weeks[week];
  return over ? { ...item, ...over } : item;
}
function weekHasChanges(p, w){
  if (p && p.weekPlan && p.weekPlan[w]) return true;
  return ((p && p.days) || []).some(d => (d.items || []).some(it => it.weeks && it.weeks[w] && Object.keys(it.weeks[w]).length));
}
const isPeriodised = p => !!p && Array.from({ length:Number(p.weeks) || 0 }, (_, i) => i + 1).some(w => weekHasChanges(p, w));
/* Auto-advance is on for a client when they chose it, or (if they never chose) when their program is periodised. */
const autoWeekOn = (c, p) => c && c.autoWeek !== undefined ? !!c.autoWeek : isPeriodised(p);
/* "75%" means 75% of the client's estimated one-rep max for that exercise. */
function percentLoad(load){ const m = String(load == null ? '' : load).trim().match(/^(\d+(?:\.\d+)?)\s*%$/); return m ? Number(m[1]) : null; }
function bestE1RMOf(cid, exId){
  let best = 0;
  for (const l of clientLogs(cid)){
    for (const e of workoutLogEntries(l)){
      if (String(loggedExerciseId(e) ?? '') !== String(exId)) continue;
      for (const s of loggedExerciseSets(e)){
        const w = Number(setWeight(s)), r = Number(setReps(s));
        if (w > 0 && r > 0 && r <= 12) best = Math.max(best, w * (1 + r / 30));
      }
    }
  }
  return best || null;
}
const roundLoad = (kg, step = 2.5) => Math.round(kg / step) * step;
const programWeekNow = p => Math.min(Math.max(0, Number(S.sel && S.sel.progWeek) || 0), Number(p.weeks) || 4);

function programWeekBarHTML(p, wk){
  const total = Number(p.weeks) || 4, plan = weekPlanOf(p, wk);
  const tabs = Array.from({ length:total }, (_, i) => i + 1).map(w => {
    const tag = isDeloadWeek(p, w) ? ' · deload' : weekLabelOf(p, w) ? ' · ' + weekLabelOf(p, w) : '';
    return `<button type="button" data-pweek="${w}" aria-current="${wk === w}" class="${weekHasChanges(p, w) ? 'has-over' : ''}">Wk ${w}${esc(tag)}</button>`;
  }).join('');
  const others = Array.from({ length:total }, (_, i) => i + 1).filter(w => w !== wk && weekHasChanges(p, w)).map(w => `<option value="${w}">Week ${w}</option>`).join('');
  return `<div class="panel stack" id="weekBar">
    <div class="spread"><strong>Weekly plan</strong><span class="small muted">${wk ? 'Editing week ' + wk + ' — only what you change here differs from the base.' : 'The base applies to every week unless a week changes it. Pick a week to vary sets, reps, load or effort.'}</span></div>
    <nav class="week-tabs" aria-label="Program weeks"><button type="button" data-pweek="0" aria-current="${wk === 0}">Base</button>${tabs}</nav>
    ${wk ? `<div class="inline-fields">
      <label class="field"><span>Week name (optional)</span><input type="text" id="wk_label" maxlength="30" value="${esc(plan.label || '')}" placeholder="e.g. Heavy, Peak, Deload"></label>
      <label class="row tight small" style="gap:.4rem;align-self:end"><input type="checkbox" id="wk_deload" ${plan.deload ? 'checked' : ''} style="width:auto"> Deload week (no automatic load increases)</label></div>
      <div class="row tight"><button type="button" class="btn ghost sm" id="wkReset">Reset this week to the base</button>${others ? `<select id="wkCopyFrom" aria-label="Copy changes from another week"><option value="">Copy changes from…</option>${others}</select><button type="button" class="btn ghost sm" id="wkCopy">Copy</button>` : ''}</div>` : ''}
  </div>`;
}

/* After a session is saved: if every day of the client's current week is now logged, move them to the next week. */
async function maybeAdvanceWeek(cid){
  const c = S.clients[cid], p = c && S.programs[c.programId];
  if (!c || !p || !(p.days || []).length || !autoWeekOn(c, p)) return;
  const week = c.currentWeek || 1, total = Number(p.weeks) || 0;
  if (total < 2 || week >= total) return;   // the last week of the block: what comes next is the coach's decision
  const norm = v => String(v || '').trim().toLocaleLowerCase();
  const since = c.weekFrom || isoOf(new Date(Date.now() - 14 * 86400000)), done = new Set();
  for (const l of clientLogs(cid)){
    if (l.type === 'conditioning' || l.programId !== c.programId || (l.week || 1) !== week || String(l.date) < since) continue;
    done.add(norm(l.dayLabel));
  }
  if (!p.days.every(d => done.has(norm(d.name)))) return;
  const before = { ...c }, next = { ...c, currentWeek:week + 1, weekFrom:todayISO() };
  try { await Store.put('clients', cid, next); } catch(e){ showSaveError(e); return; }
  S.clients[cid] = next;
  undoToast(c.name + ' moves to ' + weekTextFor(p, week + 1), async () => {
    const back = { ...before }; await Store.put('clients', cid, back); S.clients[cid] = back; render({ keepScroll:true });
  });
}

