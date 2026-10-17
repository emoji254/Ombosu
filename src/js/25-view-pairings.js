/* ============================ PAIRINGS ============================ */
function viewGroups(){
  const groups = Object.entries(S.groups).map(([id,g]) => ({id,...g})).sort(byName);
  return `
  <div class="panel spread"><div><h2>Pairings</h2>
    <span class="muted small">A recurring session time — Tue 6am, Sat 9am — with one client (1:1) or two (semi-private). Never more than two.</span></div>
    <button class="btn primary" id="newGroup">Add pairing</button></div>
  <div class="grid">
  ${groups.map(g => {
    const members = Object.entries(S.clients).filter(([,c]) => c.groupId === g.id);
    const over = members.length > 2;
    const label = over ? members.length + ' assigned — over the limit' : members.length === 2 ? 'Paired' : members.length === 1 ? '1:1' : 'Empty';
    return `<div class="card" data-group="${esc(g.id)}">
      <div class="spread"><span class="name">${esc(g.name)}</span>
        <span class="pill ${over?'bad':'ok'}">${label}</span></div>
      <div class="small muted">${(g.dow||[]).length ? g.dow.slice().sort().map(i => DOW[i]).join(' · ') : 'No days set'} ${esc(fmtTime(g.time))}</div>
      <div class="small muted">${members.map(([,c]) => esc(c.name)).join(' & ') || 'Nobody assigned'}</div>
    </div>`;
  }).join('') || '<div class="empty"><p>No pairings yet. Add one for each recurring time you train someone — solo or with a partner.</p></div>'}
  </div>`;
}

