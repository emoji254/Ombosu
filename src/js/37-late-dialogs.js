function groupDialog(gid){
  const g = gid ? S.groups[gid] : { name:'', time:'' };
  const clients = Object.entries(S.clients).map(([id,c]) => ({id,...c})).sort(byName);
  const dlg = dialog(gid ? 'Edit pairing' : 'Add pairing',
    `<label class="field"><span>Name</span><input type="text" id="g_name" value="${esc(g.name)}" placeholder="e.g. Amina &amp; Beatrice, or just Amina"></label>
     ${timeFieldHTML('g_time', g.time, 'Time')}
     <label class="field"><span>Repeats on</span></label>
     <div class="row tight" style="margin-bottom:.6rem">${DOW.map((d,i) => `<label class="row tight small" style="gap:.2rem">
        <input type="checkbox" class="gdow" value="${i}" ${(g.dow||[]).includes(i)?'checked':''} style="width:auto"> ${d}</label>`).join('')}</div>
     <label class="field"><span>Who's in it — one client for 1:1, two for a pairing, never more</span></label>
     <div class="stack small">${clients.map(c => `<label class="row tight" style="gap:.4rem">
        <input type="checkbox" class="gmem" value="${esc(c.id)}" ${c.groupId===gid?'checked':''} style="width:auto"> ${esc(c.name)}</label>`).join('') || '<span class="muted">No clients yet.</span>'}</div>`,
    [ ...(gid ? [{label:'Delete', kind:'danger', onClick: async () => {
        try {
          await Store.del('groups', gid); delete S.groups[gid];
          for (const [id,c] of Object.entries(S.clients)) if (c.groupId === gid){ const next = { ...c, groupId: '' }; await Store.put('clients', id, next); S.clients[id] = next; }
        } catch(e){ showSaveError(e); }
        render();
      }}] : []),
      {label:'Cancel'},
      {label:'Save', kind:'primary', onClick: async () => {
        const name = val('g_name'); if (!name){ toast('Name is required'); return false; }
        const checked = [...document.querySelectorAll('.gmem:checked')].map(i => i.value);
        if (checked.length > 2){ toast('A pairing can have at most 2 clients — uncheck one'); return false; }
        const id = gid || uid();
        const dow = [...document.querySelectorAll('.gdow:checked')].map(i => Number(i.value));
        const data = { name, dow, time: timeFieldVal('g_time') };
        if (gid){
          if (g.dowFrom) data.dowFrom = g.dowFrom;
          const dk = a => JSON.stringify([...(a || [])].sort());
          if (dk(dow) !== dk(g.dow)) data.dowFrom = todayISO();   // missed-session counting restarts from today
        }
        try { await Store.put('groups', id, data); } catch(e){ showSaveError(e); return false; }
        S.groups[id] = data;
        const checkedSet = new Set(checked);
        try {
          for (const [cid,c] of Object.entries(S.clients)){
            const should = checkedSet.has(cid);
            if (should && c.groupId !== id){ const next = { ...c, groupId: id, groupFrom: todayISO() }; await Store.put('clients', cid, next); S.clients[cid] = next; }
            else if (!should && c.groupId === id){ const next = { ...c, groupId: '' }; await Store.put('clients', cid, next); S.clients[cid] = next; }
          }
        } catch(e){ showSaveError(e); toast('Pairing saved, but some members were not updated'); }
        render();
      }} ]);
  dlg.querySelectorAll('.gmem').forEach(box => box.onchange = () => {
    const checked = dlg.querySelectorAll('.gmem:checked');
    if (checked.length > 2){ box.checked = false; toast('A pairing can have at most 2 clients'); }
  });
}

try { const t = localStorage.getItem('nyaega:theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch {}
