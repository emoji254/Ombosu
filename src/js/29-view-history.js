/* ============================ HISTORY ============================ */
function viewProgress(){
  if (S.sel.historyClient) return historyDetail(S.sel.historyClient);
  const everyone = Object.entries(S.clients).map(([id,c]) => ({id,...c})).sort(byName);
  if (!everyone.length) return '<div class="empty"><p>Add clients and log a few sessions — their history shows up here.</p></div>';
  const hasArchived = everyone.some(c => c.status === 'archived');
  const clients = everyone.filter(c => (S.search.historyArchived || c.status !== 'archived') && clientMatches(c, S.search.history));
  return `
  <div class="panel"><h2>History</h2>
    <span class="muted small">Pick a client to see every workout they've logged, most recent first.</span>
    <div class="row" style="margin-top:.6rem">${searchBoxHTML('history', 'Search history')}
      ${hasArchived ? `<label class="row tight small" style="gap:.3rem"><input type="checkbox" id="showArchivedHistory" ${S.search.historyArchived?'checked':''} style="width:auto"> Show archived</label>` : ''}</div></div>
  ${!clients.length ? `<div class="empty"><p>No clients match.</p></div>` : ''}
  <div class="stack">${clients.map(c => {
    const logs = clientLogs(c.id);
    return `<div class="card" data-historyclient="${esc(c.id)}">
      <span class="name" style="display:flex;align-items:center;gap:.5rem">${avatarHTML(c.name)}${esc(c.name)}${c.status==='archived' ? ' <span class="pill warn">Archived</span>' : ''}</span>
      <div class="small muted num">${logs.length} session${logs.length===1?'':'s'} logged</div>
      <div class="small muted">${logs.length ? 'Last trained ' + esc(logs[0].date) : 'No sessions yet'}</div>
    </div>`;
  }).join('')}</div>`;
}

/* Per-session stats: total sets recorded, and every movement performed
   that day with its best (heaviest) set — no session-wide "top set"
   singled out, since the point is to show the whole session at a glance. */
function sessionSummary(l){
  let totalSets = 0;
  const movements = [];
  workoutLogEntries(l).forEach(e => {
    const sets = loggedExerciseSets(e).filter(s => s.weight != null || s.kg!=null || s.load!=null || s.reps != null || s.rep!=null || s.actualRPE!=null || s.actualRIR!=null || s.note || s.done);
    if (!sets.length) return;
    totalSets += sets.length;
    const best = sets.slice().sort((a,b) => Number(b.weight??b.kg??b.load??0) - Number(a.weight??a.kg??a.load??0))[0];
    movements.push({ name: e.name||e.exerciseName||exName(e.exId??e.exerciseId), weight: best.weight??best.kg??best.load, reps: best.reps??best.rep });
  });
  return { totalSets, movements };
}

/* Weight PRs for every logged session of a client, from one oldest-to-newest pass with running bests
   per exercise (by id and by name). Sessions that tie on date and time don't count against each other. */
function prIndex(cid){
  logIndex();
  if (!Idx.prs) Idx.prs = new Map();
  if (Idx.prs.has(cid)) return Idx.prs.get(cid);
  const logs = (logIndex().byClient[cid] || []).slice().reverse();
  const norm = v => String(v||'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const map = {}, byId = new Map(), byName = new Map();
  let i = 0;
  while (i < logs.length){
    let j = i + 1; while (j < logs.length && compareLogsNewestFirst(logs[i], logs[j]) === 0) j++;
    const pending = [];
    for (let k = i; k < j; k++){
      const l = logs[k], prs = [];
      workoutLogEntries(l).forEach(e => {
        const current = loggedExerciseSets(e).map(setWeight).filter(v => v !== null && v !== undefined && v !== '').map(Number).filter(n => Number.isFinite(n) && n >= 0);
        if (!current.length) return;
        const max = Math.max(...current), key = String(loggedExerciseId(e) ?? ''), name = norm(loggedExerciseName(e));
        const before = [key ? byId.get(key) : undefined, name ? byName.get(name) : undefined].filter(v => v !== undefined);
        if (before.length && max > Math.max(...before)) prs.push({ name: loggedExerciseName(e) || 'Exercise', weight: max });
        pending.push({ key, name, max });
      });
      map[l.id] = prs;
    }
    pending.forEach(p => {
      if (p.key) byId.set(p.key, Math.max(byId.has(p.key) ? byId.get(p.key) : -Infinity, p.max));
      if (p.name) byName.set(p.name, Math.max(byName.has(p.name) ? byName.get(p.name) : -Infinity, p.max));
    });
    i = j;
  }
  Idx.prs.set(cid, map);
  return map;
}
function sessionMetrics(l,cid){
  let totalVolume=0,hasVolume=false;
  const weightValue=setWeight;
  const entries=workoutLogEntries(l);
  entries.forEach(e=>loggedExerciseSets(e).forEach(s=>{
    const rawWeight=weightValue(s),rawReps=setReps(s),weight=Number(rawWeight),reps=Number(rawReps);
    if(rawWeight!==null&&rawWeight!==undefined&&rawWeight!==''&&rawReps!==null&&rawReps!==undefined&&rawReps!==''&&Number.isFinite(weight)&&weight>=0&&Number.isFinite(reps)&&reps>0){totalVolume+=weight*reps;hasVolume=true;}
  }));
  const completed=Number(l.completedAt||l.loggedAt||l.conditioningSession?.completedAt)||0;
  const started=Number(l.startedAt||l.conditioningSession?.startedAt)||0;
  const duration=Number(l.durationSeconds);
  const durationSeconds=Number.isFinite(duration)&&duration>=0?duration:(started&&completed>=started?Math.floor((completed-started)/1000):null);
  const indexedPrs=prIndex(cid)[l.id];
  const prior=indexedPrs?[]:clientLogs(cid).filter(other=>other.id!==l.id&&isLogBefore(other,l));
  const normalize=value=>String(value||'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const prs=indexedPrs?indexedPrs.slice():[];
  if(!indexedPrs)entries.forEach(e=>{
    const current=loggedExerciseSets(e).map(weightValue).filter(value=>value!==null&&value!==undefined&&value!=='').map(Number).filter(n=>Number.isFinite(n)&&n>=0);
    if(!current.length)return;
    const max=Math.max(...current),key=String(loggedExerciseId(e)??''),name=normalize(loggedExerciseName(e));
    const earlier=prior.flatMap(old=>workoutLogEntries(old)).filter(x=>(key&&String(loggedExerciseId(x)??'')===key)||(name&&normalize(loggedExerciseName(x))===name));
    const bestBefore=earlier.flatMap(x=>loggedExerciseSets(x)).map(weightValue).filter(value=>value!==null&&value!==undefined&&value!=='').map(Number).filter(n=>Number.isFinite(n)&&n>=0);
    // A PR needs something to beat: the first time a lift is logged is a baseline, not a PR.
    if(bestBefore.length&&max>Math.max(...bestBefore))prs.push({name:loggedExerciseName(e)||'Exercise',weight:max});
  });
  const extra=prExtras(cid)[l.id]||{rep:[],e1rm:[]};
  return {durationSeconds,totalVolume:hasVolume?totalVolume:null,prs,repPrs:extra.rep,e1rmPrs:extra.e1rm};
}
function formatSessionDuration(seconds){
  if(seconds==null)return 'Not recorded';
  const value=Math.max(0,Math.floor(seconds)),h=Math.floor(value/3600),m=Math.floor(value%3600/60),s=value%60;
  return h?`${h}h ${m}m`:`${m}m ${s}s`;
}

function historyConditioningHTML(session){
  const blocks=Array.isArray(session.blocks)?session.blocks:[],done=new Set(session.blocksCompleted||[]);
  const blockSummary=b=>{
    const mode=b.mode||'custom',rounds=Number(b.rounds)||0,work=Number(b.workSeconds)||0,rest=Number(b.restSeconds)||0,duration=Number(b.durationMinutes)||0;
    // (the mode name is shown just before this text, so it isn't repeated here)
    if(mode==='emom'){const every=Number(b.intervalSeconds)||60;return every===60?`${duration||'—'} min`:`${duration||'—'} min · every ${every>=60&&every%60===0?(every/60)+' min':every+' s'}`;}
    if(mode==='amrap')return `${duration||'—'} min`;
    if(mode==='forTime')return `${Number(b.targetRounds)?b.targetRounds+' rounds':'no round target'}${Number(b.capMinutes)?' · cap '+b.capMinutes+' min':''}`;
    if(isSteppedBlock(b)){
      const list=b.steps.map(s=>`${s.name||'Station'} ${s.workSeconds||'—'}s/${s.restSeconds||0}s`).join(' · ');
      return `${rounds||'—'} round${rounds===1?'':'s'} × ${b.steps.length} station${b.steps.length===1?'':'s'}${Number(b.restBetweenRounds)?` · ${b.restBetweenRounds}s between rounds`:''} — ${list}`;
    }
    if(mode==='tabata')return `${rounds||8} rounds · ${work||20}s work / ${rest||10}s rest`;
    return `${rounds||'—'} rounds · ${work||'—'}s work / ${rest}s rest`;
  };
  return `<section class="panel conditioning-history"><div class="spread"><div><span class="eyebrow">CONDITIONING PROGRAM</span><h3>${esc(session.templateName||'Conditioning session')}</h3></div><span class="pill">${done.size} / ${blocks.length||'—'} blocks</span></div>
    ${session.warmup?`<p class="small"><strong>Warm-up:</strong> ${esc(session.warmup).replace(/\n/g,'<br>')}</p>`:''}
    ${blocks.length?`<div class="conditioning-history-blocks">${blocks.map((b,i)=>`<div class="conditioning-history-block"><div class="spread"><strong>${esc(b.name||'Block '+(i+1))}</strong><span class="pill ${done.has(i)?'ok':''}">${done.has(i)?'Completed':'Included'}</span></div><div class="small muted">${esc(conditioningModeName(b.mode))} · ${esc(blockSummary(b))}</div>${conditioningResultText(session.results?.[i],b.mode)?`<div class="small conditioning-result"><strong>Result:</strong> ${esc(conditioningResultText(session.results[i],b.mode))}</div>`:''}${(b.exercises||[]).length?`<div class="small">${b.exercises.map(e=>`${esc(e.name||'Exercise')}${e.reps?' · '+esc(e.reps):''}`).join(' · ')}</div>`:''}</div>`).join('')}</div>`:`<p class="small muted">Detailed block data was not recorded for this older session.</p>`}
    ${session.finisher?`<p class="small"><strong>Finisher:</strong> ${esc(session.finisher).replace(/\n/g,'<br>')}</p>`:''}</section>`;
}

/* ---- Progress: rep and e1RM PRs, charts ----
   Rep PR  = more reps than ever before at the same or a heavier load.
   e1RM PR = a higher estimated 1RM (Epley, sets of 1–12 reps) than ever before.
   Both need something earlier to beat, so a first-ever lift is a baseline, not a PR. */
function prExtras(cid){
  logIndex();
  if (!Idx.prx) Idx.prx = new Map();
  if (Idx.prx.has(cid)) return Idx.prx.get(cid);
  const logs = (logIndex().byClient[cid] || []).slice().reverse();
  const norm = v => String(v||'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const exKey = e => { const id = String(loggedExerciseId(e) ?? ''); return id ? 'id:' + id : 'n:' + norm(loggedExerciseName(e)); };
  const repBest = new Map(), e1Best = new Map(), map = {};
  let i = 0;
  while (i < logs.length){
    let j = i + 1; while (j < logs.length && compareLogsNewestFirst(logs[i], logs[j]) === 0) j++;
    const pending = [];
    for (let k = i; k < j; k++){
      const l = logs[k], rep = [], e1 = [];
      workoutLogEntries(l).forEach(e => {
        const key = exKey(e); if (key === 'n:') return;
        const sets = loggedExerciseSets(e).map(s => ({ w:Number(setWeight(s)), r:Number(setReps(s)) }))
          .filter(s => Number.isFinite(s.w) && s.w > 0 && Number.isFinite(s.r) && s.r > 0);
        if (!sets.length) return;
        const priorReps = repBest.get(key), priorE1 = e1Best.get(key);
        let bestRep = null, bestE1 = null;
        sets.forEach(s => {
          if (priorReps){
            let m = 0; priorReps.forEach((r, w) => { if (w >= s.w && r > m) m = r; });
            if (m > 0 && s.r > m && (!bestRep || s.r > bestRep.reps || (s.r === bestRep.reps && s.w > bestRep.weight))) bestRep = { weight:s.w, reps:s.r };
          }
          if (priorE1 != null && s.r <= 12){ const v = s.w * (1 + s.r / 30); if (v > priorE1 && (bestE1 == null || v > bestE1)) bestE1 = v; }
        });
        const name = loggedExerciseName(e) || 'Exercise';
        if (bestRep) rep.push({ name, ...bestRep });
        if (bestE1 != null) e1.push({ name, e1rm:Math.round(bestE1) });
        pending.push({ key, sets });
      });
      map[l.id] = { rep, e1rm:e1 };
    }
    pending.forEach(p => {
      const rb = repBest.get(p.key) || new Map();
      let eb = e1Best.get(p.key);
      p.sets.forEach(s => {
        if ((rb.get(s.w) || 0) < s.r) rb.set(s.w, s.r);
        if (s.r <= 12){ const v = s.w * (1 + s.r / 30); if (eb == null || v > eb) eb = v; }
      });
      repBest.set(p.key, rb); if (eb != null) e1Best.set(p.key, eb);
    });
    i = j;
  }
  Idx.prx.set(cid, map);
  return map;
}
/* "Squat · 100 kg", "Squat · 8 reps at 80 kg", "Squat · est. 1RM 112 kg" */
function prLinesOf(metrics){
  return [
    ...metrics.prs.map(p => `${p.name} · ${p.weight} kg`),
    ...(metrics.repPrs||[]).map(p => `${p.name} · ${p.reps} reps at ${p.weight} kg`),
    ...(metrics.e1rmPrs||[]).map(p => `${p.name} · est. 1RM ${p.e1rm} kg`)
  ];
}
/* Shown after a new session is saved, when it set any record. */
function showPrSummary(logId){
  const l = S.logs[logId]; if (!l) return;
  const lines = prLinesOf(sessionMetrics({ ...l, id:logId }, l.clientId)); if (!lines.length) return;
  dialog('New personal records 🎉', `<ul class="pr-summary">${lines.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`, [{label:'Nice', kind:'primary'}]);
}

const chartNum = v => Number.isInteger(v) ? String(v) : v.toFixed(1);
/* Inline SVG line chart, no library. series: [{name, color, points:[{i, y, label}]}]; i is the session index. */
function lineChartSVG(series, o){
  const W = 320, H = 180, pl = 40, pr = 12, pt = 12, pb = 26, fmt = o.fmt || chartNum;
  const vals = series.flatMap(s => s.points.map(p => p.y));
  if (!vals.length) return '';
  let lo = Math.min(...vals), hi = Math.max(...vals); if (lo === hi){ lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.1; lo -= padY; hi += padY;
  const n = o.count, xAt = i => pl + (n <= 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (n - 1)), yAt = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const grid = [0, 1, 2, 3].map(k => { const v = lo + (hi - lo) * k / 3, y = yAt(v); return `<line class="grid" x1="${pl}" x2="${W-pr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text x="${pl-4}" y="${(y+3).toFixed(1)}" text-anchor="end">${esc(fmt(v))}</text>`; }).join('');
  const lines = series.map(s => `<polyline fill="none" style="stroke:${s.color}" stroke-width="2" points="${s.points.map(p => xAt(p.i).toFixed(1) + ',' + yAt(p.y).toFixed(1)).join(' ')}"/>` +
    s.points.map(p => `<circle class="pt" r="3.5" cx="${xAt(p.i).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" style="fill:${s.color}"><title>${esc(s.name)} ${esc(fmt(p.y))} · ${esc(p.label)}</title></circle>`).join('')).join('');
  const first = o.labels[0], last = o.labels[o.labels.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}">${grid}${lines}
    <text x="${pl}" y="${H-8}" text-anchor="start">${esc(first)}</text>${n > 1 ? `<text x="${W-pr}" y="${H-8}" text-anchor="end">${esc(last)}</text>` : ''}</svg>`;
}
function barChartSVG(values, labels, o){
  const W = 320, H = 130, pl = 24, pr = 8, pt = 10, pb = 22, max = Math.max(1, ...values), slot = (W - pl - pr) / values.length;
  const bars = values.map((v, i) => { const h = (H - pt - pb) * v / max, x = pl + i * slot + slot * 0.15; return `<rect class="bar" x="${x.toFixed(1)}" y="${(H-pb-h).toFixed(1)}" width="${(slot*0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${esc(labels[i])}: ${v}</title></rect>${v ? `<text x="${(x+slot*0.35).toFixed(1)}" y="${(H-pb-h-3).toFixed(1)}" text-anchor="middle">${v}</text>` : ''}`; }).join('');
  const ticks = values.map((v, i) => (i % 4 === 0 || i === values.length - 1) ? `<text x="${(pl+i*slot+slot/2).toFixed(1)}" y="${H-6}" text-anchor="middle">${esc(labels[i])}</text>` : '').join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}"><line class="grid" x1="${pl}" x2="${W-pr}" y1="${H-pb}" y2="${H-pb}"/>${bars}${ticks}</svg>`;
}
/* Exercises this client has logged, most-logged first; one option per exercise whether it was recorded by id or by name. */
function progressExercises(cid){
  const norm = v => String(v||'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const opts = [];
  clientLogs(cid).forEach(l => {
    const seen = new Set();
    workoutLogEntries(l).forEach(e => {
      const id = String(loggedExerciseId(e) ?? ''), name = norm(loggedExerciseName(e) || (id ? exName(id) : ''));
      if (!id && !name) return;
      let o = opts.find(x => (id && x.id === id) || (name && x.name === name));
      if (!o){ o = { id, name, label:loggedEntryName(e), sessions:0 }; opts.push(o); }
      if (!o.id && id) o.id = id;
      if (!seen.has(o)){ seen.add(o); o.sessions++; }
    });
  });
  return opts.filter(o => o.sessions > 0).sort((a,b) => b.sessions - a.sessions || a.label.localeCompare(b.label));
}
function exerciseSeries(cid, opt){
  const norm = v => String(v||'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const out = [];
  clientLogs(cid).slice().reverse().forEach(l => {
    let top = null, e1 = null;
    workoutLogEntries(l).filter(e => (opt.id && String(loggedExerciseId(e) ?? '') === opt.id) || (opt.name && norm(loggedExerciseName(e)) === opt.name)).forEach(e => {
      loggedExerciseSets(e).forEach(s => {
        const w = Number(setWeight(s)), r = Number(setReps(s));
        if (!Number.isFinite(w) || w <= 0) return;
        if (!top || w > top.w || (w === top.w && r > top.r)) top = { w, r: Number.isFinite(r) ? r : 0 };
        if (Number.isFinite(r) && r > 0 && r <= 12){ const v = Math.round(w * (1 + r / 30)); if (e1 == null || v > e1) e1 = v; }
      });
    });
    if (top) out.push({ date:l.date, top:top.w, reps:top.r, e1rm:e1 });
  });
  return out;
}
/* One number per conditioning block result, so a template's sessions can be compared over time. */
function conditioningScore(r, mode){
  if (!r) return null;
  const m = mode || r.mode;
  if (m === 'forTime') return r.timeSeconds != null ? { v:Number(r.timeSeconds), kind:'time' } : null;
  if (m === 'amrap') return r.roundsCompleted != null ? { v:Number(r.roundsCompleted) + (Number(r.extraReps) || 0) / 100, kind:'rounds' } : null;
  if (r.calories != null) return { v:Number(r.calories), kind:'cal' };
  if (r.roundsCompleted) return { v:Number(r.roundsCompleted), kind:'rounds' };
  return null;
}
function conditioningTrends(cid){
  const groups = new Map();
  clientLogs(cid).slice().reverse().forEach(l => {
    const cs = l.conditioningSession; if (!cs || !Array.isArray(cs.blocks) || !cs.results) return;
    cs.blocks.forEach((b, i) => {
      const sc = conditioningScore(cs.results[i], b.mode); if (!sc || !Number.isFinite(sc.v)) return;
      const key = (cs.templateName || 'Conditioning') + ' · ' + (b.name || 'Block ' + (i + 1));
      if (!groups.has(key)) groups.set(key, { key, kind:sc.kind, mode:b.mode, points:[] });
      groups.get(key).points.push({ date:l.date, v:sc.v });
    });
  });
  return [...groups.values()].sort((a,b) => b.points.length - a.points.length).slice(0, 4);
}
function progressHTML(cid){
  const opts = progressExercises(cid);
  const week = [], d = new Date(), dow = (d.getDay() + 6) % 7;   // Monday-based weeks
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  for (let w = 11; w >= 0; w--){ const s = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - w * 7), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7); week.push({ from:isoOf(s), to:isoOf(e), label:s.toLocaleDateString(undefined, { day:'numeric', month:'short' }) }); }
  const att = attList(cid).filter(a => a.status === 'attended');
  const counts = week.map(w => att.filter(a => a.date >= w.from && a.date < w.to).length);
  const selId = S.sel.progressEx && opts.some(o => (o.id || o.name) === S.sel.progressEx) ? S.sel.progressEx : (opts[0] && (opts[0].id || opts[0].name));
  const opt = opts.find(o => (o.id || o.name) === selId);
  let lift = '<p class="small muted">Log a few sessions to see lift progress here.</p>';
  if (opt){
    const pts = exerciseSeries(cid, opt), labels = pts.map(p => p.date);
    if (!pts.length) lift = '<p class="small muted">No weighted sets logged for this exercise yet.</p>';
    else {
      const top = { name:'Top set (kg)', color:'var(--plate-blue)', points:pts.map((p, i) => ({ i, y:p.top, label:p.date })) };
      const e1 = { name:'Est. 1RM (kg)', color:'var(--plate-green)', points:pts.map((p, i) => p.e1rm != null ? { i, y:p.e1rm, label:p.date } : null).filter(Boolean) };
      lift = `${lineChartSVG([top, ...(e1.points.length ? [e1] : [])], { count:pts.length, labels, aria:`${opt.label}: top set went from ${pts[0].top} kg to ${pts[pts.length-1].top} kg over ${pts.length} session${pts.length===1?'':'s'}` })}
        <div class="row tight small muted"><span class="key"><i class="k-slot" style="background:var(--plate-blue)"></i> Top set</span><span class="key"><i class="k-slot" style="background:var(--plate-green)"></i> Est. 1RM</span><span class="num">${pts.length} session${pts.length===1?'':'s'}</span></div>`;
    }
  }
  const trends = conditioningTrends(cid);
  const fmtFor = k => k === 'time' ? (v => formatClock(Math.round(v))) : chartNum;
  const cond = trends.map(g => g.points.length < 2
    ? `<div class="small"><strong>${esc(g.key)}</strong> <span class="muted">· ${esc(fmtFor(g.kind)(g.points[0].v))} on ${esc(g.points[0].date)} — one more session to draw a trend</span></div>`
    : `<div><div class="small"><strong>${esc(g.key)}</strong> <span class="muted">${g.kind === 'time' ? '(lower is better)' : g.kind === 'cal' ? '(calories)' : '(rounds)'}</span></div>${lineChartSVG([{ name:g.key, color:'var(--plate-red)', points:g.points.map((p, i) => ({ i, y:p.v, label:p.date })) }], { count:g.points.length, labels:g.points.map(p => p.date), fmt:fmtFor(g.kind), aria:`${g.key}: ${g.points.length} sessions` })}</div>`).join('');
  return `<details class="panel progress-panel" id="progressPanel" open><summary><h3 style="display:inline">Progress</h3></summary>
    <div class="stack" style="margin-top:.6rem">
      <div><label class="field" style="max-width:320px"><span>Lift</span><select id="progressEx">${opts.map(o => `<option value="${esc(o.id || o.name)}" ${(o.id||o.name)===selId?'selected':''}>${esc(o.label)} (${o.sessions})</option>`).join('') || '<option value="">No lifts logged</option>'}</select></label>
        ${lift}</div>
      <div><div class="small"><strong>Sessions attended per week</strong> <span class="muted">· last 12 weeks</span></div>
        ${barChartSVG(counts, week.map(w => w.label), { aria:`Sessions attended per week over the last 12 weeks: ${counts.join(', ')}` })}</div>
      ${cond ? `<div class="stack"><div class="small"><strong>Conditioning scores</strong></div>${cond}</div>` : ''}
    </div></details>`;
}

function historyDetail(cid){
  if (S.sel.historyDay) return historyDayDetail(cid, S.sel.historyDay);
  const c = S.clients[cid]; if (!c) return '<p>Client not found.</p>';
  const logs = clientLogs(cid);

  return `
  <div class="panel spread">
    <h2 style="display:flex;align-items:center;gap:.6rem">${avatarHTML(c.name)}${esc(c.name)}</h2>
    <button class="btn ghost" data-back="1">Back</button>
  </div>
  ${logs.length ? progressHTML(cid) : ''}
  ${!logs.length ? '<div class="empty"><p>No sessions logged yet.</p></div>' :
    `<div class="stack">${(S.sel.historyAll ? logs : logs.slice(0, 60)).map(l => {
      const { totalSets, movements } = sessionSummary(l);
      const metrics=sessionMetrics(l,cid);
      const dateNice = new Date(l.date + 'T12:00:00').toLocaleDateString(undefined,{ weekday:'short', day:'numeric', month:'short' });
      return `<div class="card historycard" data-historyday="${esc(l.id)}">
        <div class="spread"><span class="name">${esc(l.dayLabel || 'Session')}</span><span class="pill">${esc(dateNice)}</span></div>
        <div class="small muted num" style="margin-bottom:.3rem">${totalSets} set${totalSets===1?'':'s'} logged${l.conditioningSession?` · ${esc(l.conditioningSession.templateName||'Conditioning')} · ${l.conditioningSession.blocksCompleted?.length||0}/${l.conditioningSession.blocks?.length||'—'} blocks`:''}</div>
        ${movements.length
          ? movements.map(m => `<div class="small">${esc(m.name)} <span class="num muted">${esc(m.weight??'—')}×${esc(m.reps??'—')}</span></div>`).join('')
          : '<div class="small muted">No sets recorded</div>'}
        <div class="history-session-metrics">
          <div class="history-session-metric"><span>Session time</span><strong class="num">${formatSessionDuration(metrics.durationSeconds)}</strong></div>
          <div class="history-session-metric"><span>Total lifted</span><strong class="num">${metrics.totalVolume==null?'—':`${metrics.totalVolume.toLocaleString(undefined,{maximumFractionDigits:1})} kg`}</strong></div>
          <div class="history-session-metric"><span>PRs</span><strong>${prLinesOf(metrics).length?`${prLinesOf(metrics).length} achieved`:'—'}</strong>${prLinesOf(metrics).length?`<div class="history-pr-list">${prLinesOf(metrics).map(x=>esc(x)).join('<br>')}</div>`:''}</div>
        </div>
      </div>`;
    }).join('')}</div>
    ${!S.sel.historyAll && logs.length > 60 ? `<div class="row" style="margin-top:.8rem;justify-content:center"><button type="button" class="btn ghost" id="historyShowAll">Show all ${logs.length} sessions</button></div>` : ''}`}`;
}

function historyDayDetail(cid, logId){
  const c = S.clients[cid], l = S.logs[logId];
  if (!c || !l) return '<p>Session not found.</p>';
  const groups = workoutLogEntries(l).map(e => ({
    name: e.name||e.exerciseName||exName(e.exId??e.exerciseId),
    targetRPE:e.targetRPE||'',
    sets: loggedExerciseSets(e).filter(s => s.weight != null || s.kg!=null || s.load!=null || s.reps != null || s.rep!=null || s.actualRPE!=null || s.actualRIR!=null || s.note || s.done)
  })).filter(g => g.sets.length);
  const { totalSets } = sessionSummary(l);
  const conditioningHTML=l.conditioningSession?historyConditioningHTML(l.conditioningSession):'';
  const strengthHTML=l.type==='conditioning'?'':`<div class="panel">
    <p class="small muted num">${totalSets} set${totalSets===1?'':'s'} logged</p>
    ${groups.length ? groups.map(g => `
      <div class="exgroup">
        <h3>${esc(g.name)}${g.targetRPE?` <span class="small muted">· Target RPE ${esc(g.targetRPE)}</span>`:''}</h3>
        <div class="tablewrap"><table>
          <thead><tr><th style="width:50px">Set</th><th style="width:76px">Weight</th><th style="width:60px">Reps</th><th>RPE</th><th>RIR</th><th>Type / note</th></tr></thead>
          <tbody>${g.sets.map((s,i) => `<tr><td class="num">${esc(s.setNumber||i+1)}</td><td class="num">${esc(s.weight??s.kg??s.load??s.actualWeight??'—')}</td><td class="num">${esc(s.reps??s.rep??s.actualReps??'—')}</td><td class="num">${esc(s.actualRPE??s.rpe??'—')}</td><td class="num">${esc(s.actualRIR??'—')}</td><td>${esc(String(s.setType||'working').replace(/^./,c=>c.toUpperCase()))}${s.note?` · ${esc(s.note)}`:''}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>`).join('') : '<p class="muted small">No sets recorded for this session.</p>'}
    ${l.notes ? `<p class="small muted" style="margin-top:.7rem">Notes: ${esc(l.notes)}</p>` : ''}
  </div>`;
  const hasRepeatEntries=hasRepeatWorkoutSource(cid,l);
  const deleteHTML=`<div class="row panel" style="margin-top:.8rem">${l.type==='conditioning'?'':`<button type="button" class="btn primary sm" data-edit-session="${esc(logId)}">Edit session</button>`}${hasRepeatEntries?`<button type="button" class="btn ghost sm" data-repeat-program="${esc(logId)}">Repeat program</button>`:''}<button class="btn danger sm" data-dellogday="${esc(logId)}">Delete this session</button></div>`;
  let activityHTML=strengthHTML;
  if(conditioningHTML&&strengthHTML){
    const strengthAt=Number(l.strengthCompletedAt||l.completedAt)||0,conditioningAt=Number(l.conditioningSession.completedAt)||0;
    activityHTML=conditioningAt>strengthAt?strengthHTML+conditioningHTML:conditioningHTML+strengthHTML;
  }else if(conditioningHTML)activityHTML=conditioningHTML;

  return `
  <div class="panel spread">
    <div><h2>${esc(l.dayLabel || 'Session')}</h2>
      <span class="muted small">${esc(c.name)} · ${esc(l.date)}</span></div>
    <button class="btn ghost" data-back="day">Back</button>
  </div>
  ${activityHTML}
  ${deleteHTML}`;
}

