/* ============================ CLIENTS ============================ */
/* Search text per screen; survives re-renders. Matches name, goal, phone or email. */
S.search = { clients:'', history:'', adhoc:'', historyArchived:false };
const clientMatches = (c, q) => { q = String(q||'').trim().toLowerCase(); return !q || [c.name, c.goal, c.phone, c.email].some(v => String(v||'').toLowerCase().includes(q)); };
const searchBoxHTML = (key, label, placeholder) => `<input type="search" id="search_${key}" data-search="${key}" value="${esc(S.search[key])}" placeholder="${esc(placeholder||'Search by name, goal or phone')}" aria-label="${esc(label)}" autocomplete="off">`;
function viewClients(){
  if (S.sel.client) return clientDetail(S.sel.client);
  const all = Object.entries(S.clients).map(([id,c]) => ({id,...c})).sort(byName);
  const list = all.filter(c => clientMatches(c, S.search.clients));
  const active = list.filter(c => c.status !== 'archived');
  const archived = list.filter(c => c.status === 'archived');
  return `
  <div class="panel spread"><h2>Roster</h2><button class="btn primary" id="newClient">Add client</button></div>
  ${all.length > 1 ? `<div class="panel">${searchBoxHTML('clients', 'Search clients')}</div>` : ''}
  ${!all.length ? `<div class="empty"><p>Your roster is empty. Add the people you train and assign each one a program.</p></div>` : !list.length ? `<div class="empty"><p>No clients match “${esc(S.search.clients)}”.</p></div>` : ''}
  <div class="grid">${active.map(cardForClient).join('')}</div>
  ${archived.length ? `<hr><h3 class="muted">Archived</h3><div class="grid">${archived.map(cardForClient).join('')}</div>` : ''}`;
}
function clientDetail(cid){
  const c = S.clients[cid]; if (!c) return '<p>Not found.</p>';
  const mode = S.sel.clientPanel || 'dashboard';
  if (mode === 'edit') return clientEditPanel(cid);
  if (mode === 'attendance') return clientAttendancePanel(cid);
  return clientDashboard(cid);
}

function clientDashboard(cid){
  const c = S.clients[cid];
  const p = S.programs[c.programId];
  const logs = clientLogs(cid);
  const records = attList(cid);
  const attendedN = records.filter(a => a.status === 'attended').length;
  const missedUnmarked = missedUnmarkedCount(cid);
  const pct = records.length + missedUnmarked ? Math.round((attendedN / (records.length + missedUnmarked)) * 100) : null;
  const lastSession = logs[0];

  return `
  <div class="panel spread">
    <h2 style="display:flex;align-items:center;gap:.7rem">${avatarHTML(c.name)}${esc(c.name)}</h2>
    <button class="btn ghost" data-back="1">Back</button>
  </div>

  <div class="panel">
    <div class="dash-row"><span class="dash-label">Goal</span><span class="dash-value">${c.goal ? esc(c.goal) : '—'}</span></div>
    <div class="dash-row"><span class="dash-label">Program</span><span class="dash-value">${p ? esc(p.name) : 'No program assigned'}</span></div>
    ${p ? `<div class="dash-row"><span class="dash-label">Week</span><span class="dash-value num">${esc(c.currentWeek||1)} / ${esc(p.weeks||'?')}${weekLabelOf(p, c.currentWeek||1) ? ' · ' + esc(weekLabelOf(p, c.currentWeek||1)) : ''}</span></div>` : ''}
    ${c.packTotal ? `<div class="dash-row"><span class="dash-label">Sessions</span><span class="dash-value num">${esc(packUsedOf(c, cid))} / ${esc(c.packTotal)}</span></div>` : ''}
    <div class="dash-row"><span class="dash-label">Attendance</span><span class="dash-value num">${pct == null ? '—' : pct + '%'}${missedUnmarked ? `<span class="small muted"> · ${missedUnmarked} unmarked counted as missed</span>` : ''}</span></div>
    <div class="dash-row"><span class="dash-label">Last session</span><span class="dash-value">${lastSession ? esc(lastSession.date) : 'No sessions yet'}</span></div>
  </div>
  ${String(c.notes||'').trim() ? `<div class="panel client-notes-panel"><h3>Notes — injuries, preferences</h3><p>${esc(c.notes).replace(/\n/g,'<br>')}</p></div>` : ''}

  <div class="panel">
    <h3>Quick actions</h3>
    <div class="quick-actions">
      <button class="btn primary" data-start-workout="${esc(cid)}">Log session</button>
      <button class="btn ghost" data-clientmode="attendance">Attendance</button>
      <button class="btn ghost" data-viewprogress="${esc(cid)}">View Progress</button>
      <button class="btn ghost" data-clientmode="edit">Edit Client</button>
    </div>
  </div>

  <div class="panel">
    <h3>Share with ${esc(c.name)}</h3>
    <p class="small muted">Downloads a file you can hand over, email, or print — nothing is sent anywhere automatically.</p>
    <div class="row tight">
      ${c.programId && p ? `<button class="btn ghost sm" data-dlprogram="${esc(cid)}">Program (PDF)</button>` : `<span class="small muted">Assign a program to share it as a PDF.</span>`}
      <button class="btn ghost sm" data-dlsummary="${esc(cid)}">Summary (PDF)</button>
      <button class="btn ghost sm" data-dlhistory="${esc(cid)}">Full history (Excel)</button>
      <button class="btn ghost sm" data-dlmydata="${esc(cid)}">All my data (JSON + PDF)</button>
    </div>
  </div>`;
}

function clientAttendancePanel(cid){
  const c = S.clients[cid];
  const rows = attList(cid).slice(0, 30);
  return `
  <div class="panel spread">
    <h2 style="display:flex;align-items:center;gap:.7rem">${avatarHTML(c.name)}${esc(c.name)}</h2>
    <button class="btn ghost" data-back="panel">Back to profile</button>
  </div>
  <div class="panel">
    <h3>Attendance <span class="muted small num">(last 30)</span></h3>
    ${!rows.length ? '<p class="muted small">Nothing marked yet. Use the Calendar tab.</p>' :
      `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Day</th><th>Status</th><th>Pairing</th></tr></thead><tbody>
      ${rows.map(a => `<tr><td class="num">${esc(a.date)}</td><td>${DOW[dowOf(a.date)]}</td>
        <td><span class="pill ${a.status==='attended'?'ok':'bad'}">${esc(a.status)}</span></td>
        <td class="muted small">${esc((S.groups[a.groupId]||{}).name || '—')}</td></tr>`).join('')}
      </tbody></table></div>`}
  </div>`;
}

function clientEditPanel(cid){
  const c = S.clients[cid];
  const progOpts = ['<option value="">No program</option>'].concat(Object.entries(S.programs)
    .map(([id,p]) => `<option value="${esc(id)}" ${id===c.programId?'selected':''}>${esc(p.name)}</option>`)).join('');
  const grpOpts = ['<option value="">No pairing</option>'].concat(Object.entries(S.groups)
    .map(([id,g]) => `<option value="${esc(id)}" ${id===c.groupId?'selected':''}>${esc(g.name)}</option>`)).join('');
  return `
  <div class="panel spread">
    <h2>Edit ${esc(c.name)}</h2>
    <button class="btn ghost" data-back="panel">Back to profile</button>
  </div>

  <div class="panel stack">
    <div class="inline-fields">
      <label class="field"><span>Name</span><input type="text" id="c_name" value="${esc(c.name)}"></label>
      <label class="field"><span>Phone</span><input type="tel" id="c_phone" value="${esc(c.phone||'')}"></label>
      <label class="field"><span>Email</span><input type="email" id="c_email" value="${esc(c.email||'')}"></label>
    </div>
    <label class="field"><span>Goal</span><input type="text" id="c_goal" value="${esc(c.goal||'')}"></label>
    <div class="inline-fields">
      <label class="field"><span>Pairing</span><select id="c_group">${grpOpts}</select></label>
      <label class="field"><span>Program</span><select id="c_program">${progOpts}</select></label>
      <label class="field"><span>Week</span><input type="number" id="c_week" min="1" value="${esc(c.currentWeek||1)}"></label>
    </div>
    <label class="row tight small" style="gap:.4rem"><input type="checkbox" id="c_autoweek" ${autoWeekOn(c, S.programs[c.programId]) ? 'checked' : ''} style="width:auto"> Move to the next week automatically once every day of the week has been logged</label>
    <div>
      <label class="field"><span>Recurring solo sessions — for sessions with just this client, no pairing needed</span></label>
      <div class="row tight" style="margin-bottom:.5rem">${DOW.map((d,i) => `<label class="row tight small" style="gap:.2rem">
        <input type="checkbox" class="c_recurdow" value="${i}" ${(c.recurDow||[]).includes(i)?'checked':''} style="width:auto"> ${d}</label>`).join('')}</div>
      ${timeFieldHTML('c_recurtime', c.recurTime, 'Time')}
    </div>
    <div class="inline-fields">
      <label class="field"><span>Sessions in pack</span><input type="number" id="c_packTotal" min="0" value="${esc(c.packTotal||0)}"></label>
      <label class="field"><span>Adjust used by ± (${attendedCount(cid, c.packStart || '')} attended · ${esc(packUsedOf(c, cid))} used)</span><input type="number" id="c_packOffset" value="${esc(c.packOffset||0)}"></label>
      <label class="field"><span>Status</span><select id="c_status">
        <option value="active" ${c.status!=='archived'?'selected':''}>Active</option>
        <option value="archived" ${c.status==='archived'?'selected':''}>Archived</option></select></label>
    </div>
    <div class="row small">
      <span class="muted">Attended: <strong class="num">${attendedCount(cid)}</strong> all time ·
      <strong class="num">${attendedCount(cid, todayISO().slice(0,7) + '-01')}</strong> this month ·
      <strong class="num">${attendedCount(cid, c.packStart || '')}</strong> since this pack started${c.packStart ? ' (' + esc(c.packStart) + ')' : ''}</span>
      <button class="btn sm ghost" data-renew="${esc(cid)}">Renew pack</button>
    </div>
    <label class="field"><span>Notes — injuries, preferences, anything you need on the floor</span><textarea id="c_notes">${esc(c.notes||'')}</textarea></label>
    ${Sync.role === 'assistant' ? '' : consentFieldsHTML(c, cid)}
    <div class="row"><button class="btn primary" id="saveClient">Save changes</button>
      ${c.status === 'archived' ? `<button class="btn ghost" data-restoreclient="${esc(cid)}">Restore to active</button>` : `<button class="btn ghost" data-archiveclient="${esc(cid)}">Archive client</button>`}
      <button class="btn danger" data-delclient="${esc(cid)}">Delete permanently…</button></div>
  </div>`;
}

function cardForClient(c){
  const p = S.programs[c.programId], g = S.groups[c.groupId];
  return `<div class="card" data-client="${esc(c.id)}">
    <div class="spread"><span class="name">${esc(c.name)}</span>${consentPillHTML(c)}${syncPillHTML(c)}</div>
    <div class="small muted">${g ? esc(g.name) : 'No pairing'} · ${p ? esc(p.name) : 'No program'}</div>
    <div class="small muted num">${attendedCount(c.id)} sessions attended</div>
    <div class="small muted">${esc(c.goal || '')}</div>
  </div>`;
}

