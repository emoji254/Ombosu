/* ============================ CALENDAR ============================ */
function viewCalendar(){
  const cur = S.sel.month || todayISO().slice(0,7);
  const [Y,M] = cur.split('-').map(Number);
  const first = new Date(Y, M-1, 1);
  const startPad = first.getDay();
  const daysIn = new Date(Y, M, 0).getDate();
  const day = S.sel.day || (cur === todayISO().slice(0,7) ? todayISO() : cur + '-01');

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push('<div class="cal-cell pad"></div>');
  for (let d = 1; d <= daysIn; d++){
    const iso = `${Y}-${String(M).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const slots = scheduledOn(iso);
    const solos = individualsOn(iso).filter(c => !(c.groupId && slots.some(s => s.id === c.groupId)));
    const oneOffs = oneOffsOn(iso);
    const att = attendedOn(iso);
    const missed = attendanceOn(iso).filter(a => a.status === 'no-show').length;
    const niceDay = new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long' });
    const nPlanned = slots.length + solos.length + oneOffs.length;
    const dayLabel = niceDay + (nPlanned ? ', ' + nPlanned + ' scheduled' : '') + (att ? ', ' + att + ' attended' : '') + (missed ? ', ' + missed + ' no-show' : '');
    cells.push(`<button class="cal-cell${iso===day?' on':''}${iso===todayISO()?' today':''}" data-day="${esc(iso)}" aria-label="${esc(dayLabel)}" aria-pressed="${iso===day}">
      <span class="d num">${d}</span>
      ${slots.length || solos.length || oneOffs.length ? `<span class="slots">${[
        ...slots.map(s => `<i title="${esc(s.name)}"></i>`),
        ...solos.map(c => `<i class="solo" title="${esc(c.name)}"></i>`),
        ...oneOffs.map(s => `<i class="oneoff" title="${esc(s.label || 'One-off')}"></i>`)].slice(0,6).join('')}</span>` : ''}
      ${att ? `<span class="att num">${att}</span>` : ''}
      ${missed ? `<span class="miss num">${missed}</span>` : ''}
    </button>`);
  }

  const monthAtt = Object.values(S.attendance).filter(a => a.date.startsWith(cur) && a.status === 'attended').length;

  return `
  <div class="panel spread">
    <div class="row tight">
      <button class="btn ghost sm" data-mon="-1" aria-label="Previous month">‹</button>
      <h2 style="min-width:9rem;text-align:center">${MONTHS[M-1]} ${Y}</h2>
      <button class="btn ghost sm" data-mon="1" aria-label="Next month">›</button>
    </div>
    <div class="row tight small muted">
      <span class="num"><strong>${monthAtt}</strong> sessions delivered this month</span>
      <button class="btn ghost sm" data-mon="0">Today</button>
    </div>
  </div>

  <div class="panel">
    <div class="cal-head">${DOW.map(d => `<span>${d}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    <div class="row tight small muted" style="margin-top:.6rem">
      <span class="key"><i class="k-slot"></i> scheduled pairing</span>
      <span class="key"><i class="k-slot" style="background:var(--plate-green)"></i> solo client</span>
      <span class="key"><i class="k-slot" style="background:var(--ink-2)"></i> one-off / moved</span>
      <span class="key"><i class="k-att"></i> attended</span>
      <span class="key"><i class="k-miss"></i> no-show</span>
    </div>
  </div>

  ${dayPanel(day)}`;
}

function dayPanel(iso){
  const slots = scheduledOn(iso);
  const nice = new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long' });
  const marked = new Set(attendanceOn(iso).map(a => a.clientId));
  const pairingIds = new Set(slots.flatMap(s => groupMembers(s.id).map(c => c.id)));
  const individuals = individualsOn(iso).filter(c => !pairingIds.has(c.id));
  const oneOffs = oneOffsOn(iso);
  const skipped = skippedOn(iso);
  const scheduledIds = new Set([...pairingIds, ...individuals.map(c => c.id), ...oneOffs.flatMap(s => s.clientIds||[])]);
  const extras = Object.entries(S.clients).map(([id,c]) => ({id,...c}))
    .filter(c => c.status !== 'archived' && marked.has(c.id) && !scheduledIds.has(c.id)).sort(byName);
  const unlisted = Object.entries(S.clients).map(([id,c]) => ({id,...c}))
    .filter(c => c.status !== 'archived' && !marked.has(c.id) && !scheduledIds.has(c.id) && clientMatches(c, S.search.adhoc)).sort(byName);

  const roster = (c, gid) => {
    const a = attFor(iso, c.id), st = a ? a.status : '';
    const logged = logsOnDate(c.id, iso);
    return `<div class="att-row">
      <div><strong>${esc(c.name)}</strong>
        ${logged ? '<span class="pill ok">workout logged</span>' : ''}</div>
      <div class="row tight">
        <button class="btn sm ${st==='attended'?'primary':'ghost'}" data-att="${esc(c.id)}|attended|${esc(gid)}|${esc(iso)}">Attended</button>
        <button class="btn sm ${st==='no-show'?'danger':'ghost'}" data-att="${esc(c.id)}|no-show|${esc(gid)}|${esc(iso)}">No-show</button>
        <button class="btn sm ${st==='cancelled'?'danger':'ghost'}" data-att="${esc(c.id)}|cancelled|${esc(gid)}|${esc(iso)}">Cancelled</button>
        ${st ? `<button class="btn sm ghost" data-att="${esc(c.id)}||${esc(gid)}|${esc(iso)}" title="Clear">×</button>` : ''}
        <button class="btn sm ghost" data-logdate="${esc(c.id)}|${esc(iso)}">Log session</button>
      </div>
    </div>`;
  };

  return `<div class="panel">
    <div class="spread"><h3>${esc(nice)}</h3>
      <span class="muted small num">${attendedOn(iso)} attended</span></div>

    ${slots.length ? slots.map(s => {
      const mem = groupMembers(s.id);
      return `<div class="slot">
        <div class="slot-head"><strong class="cond" style="font-size:1.15rem">${esc(s.name)}</strong>
          <span class="muted small">${esc(fmtTime(s.time))} · ${mem.length===1?'1:1':mem.length===2?'Paired':mem.length+' — check pairing'}</span></div>
        ${mem.map(c => roster(c, s.id)).join('') || '<p class="muted small" style="padding:.5rem .7rem">Nobody assigned to this pairing yet.</p>'}
        <div class="sched-actions"><button class="btn sm ghost" data-skip="group|${esc(s.id)}|${esc(iso)}">Skip this date</button><button class="btn sm ghost" data-move="group|${esc(s.id)}|${esc(iso)}">Move to…</button></div>
      </div>`;
    }).join('') : ''}

    ${individuals.length ? `<div class="slot"><div class="slot-head"><strong class="cond" style="font-size:1.15rem">Individual sessions</strong>
        <span class="muted small">Recurring, not part of a pairing</span></div>
      ${individuals.map(c => roster(c, '') + `<div class="sched-actions"><span class="small muted">${esc(fmtTime(c.recurTime))}</span><button class="btn sm ghost" data-skip="client|${esc(c.id)}|${esc(iso)}">Skip this date</button><button class="btn sm ghost" data-move="client|${esc(c.id)}|${esc(iso)}">Move to…</button></div>`).join('')}</div>` : ''}

    ${oneOffs.map(s => `<div class="slot"><div class="slot-head"><strong class="cond" style="font-size:1.15rem">${esc(s.label || 'One-off session')}</strong>
        <span class="muted small">${esc(fmtTime(s.time))}${s.note ? ' · ' + esc(s.note) : ''}</span></div>
      ${(s.clientIds||[]).filter(i => S.clients[i]).map(i => roster({id:i, ...S.clients[i]}, '')).join('')}
      <div class="sched-actions"><button class="btn sm ghost" data-remove-oneoff="${esc(s.id)}">Remove session</button></div></div>`).join('')}

    ${skipped.length ? `<div class="small muted" style="margin:.5rem 0">Skipped this date: ${skipped.map(e => {
      const n = e.kind === 'group' ? (S.groups[e.key]||{}).name : (S.clients[e.key]||{}).name;
      return `${esc(n || '(deleted)')} <button class="btn sm ghost" data-restore-skip="${esc(e.date)}|${esc(e.key)}">Restore</button>`;
    }).join(' ')}</div>` : ''}

    ${!slots.length && !individuals.length && !oneOffs.length ? '<p class="muted small">Nothing recurring scheduled on this day. Set weekdays on a pairing, or on a client\'s own recurring sessions, or mark someone below for a one-off.</p>' : ''}

    ${extras.length ? `<div class="slot"><div class="slot-head"><strong class="cond" style="font-size:1.15rem">One-off</strong></div>
      ${extras.map(c => roster(c, '')).join('')}</div>` : ''}

    <div class="row" style="margin-top:.7rem">
      <button class="btn ghost" id="addSessionBtn" data-date="${esc(iso)}">Add session</button>
    </div>
    <div class="row" style="margin-top:.7rem">
      ${Object.keys(S.clients).length > 6 ? searchBoxHTML('adhoc', 'Filter clients', 'Filter by name…') : ''}
      <select id="adhoc" style="max-width:260px">
        <option value="">Mark someone else in…</option>
        ${unlisted.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
      </select>
      <button class="btn ghost" id="adhocBtn" data-date="${esc(iso)}">Mark attended</button>
    </div>
  </div>`;
}

