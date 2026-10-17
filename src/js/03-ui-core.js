/* ---- save-failure banner: persistent until dismissed, survives re-renders ---- */
let saveErrorDismissedAt = 0;
function showSaveError(err, opts = {}){
  console.error('Save failed', err);
  // Background autosave retries often; after a dismissal, give the coach two quiet minutes.
  if (opts.background && Date.now() - saveErrorDismissedAt < 120000) return;
  let bar = document.getElementById('saveErrorBanner');
  if (!bar){
    bar = document.createElement('div'); bar.id = 'saveErrorBanner'; bar.className = 'save-error-banner'; bar.setAttribute('role','alert');
    document.body.appendChild(bar);
  }
  const reason = err && err.message ? err.message : 'An unknown storage error occurred';
  bar.innerHTML = `<div class="save-error-text"><strong>Not saved — storage problem.</strong> <span>${esc(reason)}.</span> <span>Export a backup now so nothing is lost.</span></div>
    <div class="save-error-actions"><button type="button" class="btn sm" id="saveErrorExport">Export backup</button><button type="button" class="btn sm ghost" id="saveErrorDismiss">Dismiss</button></div>`;
  bar.querySelector('#saveErrorExport').onclick = () => exportEverything();
  bar.querySelector('#saveErrorDismiss').onclick = () => { saveErrorDismissedAt = Date.now(); bar.remove(); };
}
const isStorageError = e => !!e && (e.name === 'StorageWriteError' || e.name === 'StorageLoadError');
/* Wraps a save button's handler so extra taps while it's working are ignored.
   The button is disabled (and relabelled) until the save finishes or fails. */
function guardedClick(button, handler, busyLabel){
  let busy = false;
  return async (...args) => {
    if (busy) return;
    busy = true;
    const label = button.textContent;
    button.disabled = true; button.setAttribute('aria-busy', 'true'); if (busyLabel) button.textContent = busyLabel;
    try { return await handler(...args); }
    finally {
      busy = false;
      if (button.isConnected){ button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = label; }
    }
  };
}
/* Program edits happen in the open editor, so on failure the typed changes are
   kept on screen (press Save again) rather than thrown away. Returns true if stored. */
async function persistProgram(pid){
  try { await Store.put('programs', pid, S.programs[pid]); return true; }
  catch(e){ showSaveError(e); return false; }
}
/* Program editor autosave: typing is saved ~0.6 s after it stops, and flushed
   immediately whenever the editor is about to be left or re-rendered. */
let programAutosaveTimer = null;
function programEditorOpen(){ return S.view === 'programs' && !!S.sel?.program && !!S.programs[S.sel.program] && !!document.getElementById('p_name'); }
function setProgramSaveStatus(text){ const el = document.getElementById('programSaveStatus'); if (el) el.textContent = text; }
function scheduleProgramAutosave(){
  clearTimeout(programAutosaveTimer);
  setProgramSaveStatus('Saving…');
  programAutosaveTimer = setTimeout(flushProgramEditor, 600);
}
async function flushProgramEditor(){
  clearTimeout(programAutosaveTimer); programAutosaveTimer = null;
  if (!programEditorOpen()) return true;
  const pid = S.sel.program;
  readProgramEditor(pid, document.getElementById('main'));
  const ok = await persistProgram(pid);
  setProgramSaveStatus(ok ? 'All changes saved · ' + new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : 'Not saved');
  return ok;
}
// Closing or hiding the page mid-edit still saves (local storage writes synchronously).
window.addEventListener('pagehide', () => { if (programAutosaveTimer) flushProgramEditor(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && programAutosaveTimer) flushProgramEditor(); });
/* The exercise library is written first and only then replaces S.exercises. */
async function saveExerciseList(list){
  try { await Store.putMeta('exercises', { list }); } catch(e){ showSaveError(e); return false; }
  S.exercises = list; return true;
}
// Safety net: any storage failure that a handler doesn't catch itself still reaches the coach.
window.addEventListener('unhandledrejection', event => { if (isStorageError(event.reason)){ event.preventDefault(); showSaveError(event.reason); } });

/* opts.dismissible === false: Esc (and the Android back gesture) can't close this dialog.
   Enter runs the action marked kind:'primary' — never a danger action. */
function dialog(title, bodyHTML, actions, opts = {}){
  const dlg = document.getElementById('dlg');
  document.getElementById('dlgBody').innerHTML = '<h2>' + esc(title) + '</h2>' + bodyHTML;
  const foot = document.getElementById('dlgFoot'); foot.innerHTML = '';
  let primaryButton = null;
  (actions || [{label:'Close'}]).forEach(a => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ' + (a.kind || 'ghost'); b.textContent = a.label;
    let busy = false;   // ignore repeat presses (or repeated Enter) while the action runs
    b.onclick = async () => {
      if (busy) return; busy = true;
      try { if (a.onClick) { const keep = await a.onClick(dlg); if (keep === false) return; } if (dlg.open){ dlg._closedByAction = true; dlg.close(); } }
      finally { busy = false; }
    };
    if (a.kind === 'primary' && !primaryButton) primaryButton = b;
    foot.appendChild(b);
  });
  // Set per dialog (properties, not listeners), so one dialog's rule never sticks to the next.
  const locked = opts.dismissible === false;
  dlg._closedByAction = false;
  dlg.oncancel = locked ? event => event.preventDefault() : null;
  // Chrome ignores preventDefault on Esc when the page hasn't been tapped yet, so a locked
  // dialog that closes without one of its buttons simply reopens.
  dlg.onclose = locked ? () => { if (!dlg._closedByAction && !dlg.open) dlg.showModal(); } : null;
  dlg.querySelector('form').onsubmit = event => {
    event.preventDefault();
    if (primaryButton && !primaryButton.disabled) primaryButton.click();
  };
  if (!dlg.open) dlg.showModal();
  return dlg;
}
function exercisePicker(title,onChoose){
  const uniq=key=>[...new Set(S.exercises.map(e=>String(e[key]||'').trim()).filter(Boolean))].sort();
  const cats=[...new Set([...uniq('category'),'Other'])];
  const dlg=dialog(title,`<div id="exercisePickerMain"><label class="field"><span>Search exercises</span><input type="search" id="exercisePickerSearch" placeholder="Type an exercise name"></label><div class="exercise-picker-list" id="exercisePickerList"></div></div>
    <div id="exercisePickerCreate" hidden>
      <label class="field"><span>Name</span><input type="text" id="newExName" autocomplete="off"></label>
      <div class="inline-fields">
        <label class="field"><span>Category</span><select id="newExCategory">${cats.map(c=>`<option ${c==='Other'?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="field"><span>Equipment</span><input type="text" id="newExEquipment" list="newExEquipmentList" placeholder="Barbell, dumbbell" autocomplete="off"><datalist id="newExEquipmentList">${uniq('equipment').map(e=>`<option value="${esc(e)}">`).join('')}</datalist></label>
      </div>
      <div class="row"><button type="button" class="btn ghost" id="newExBack">Back</button><button type="button" class="btn primary" id="newExSave">Add exercise</button></div>
    </div>`,[{label:'Cancel'}]);
  const search=dlg.querySelector('#exercisePickerSearch'),list=dlg.querySelector('#exercisePickerList');
  const mainBox=dlg.querySelector('#exercisePickerMain'),createBox=dlg.querySelector('#exercisePickerCreate'),nameInput=dlg.querySelector('#newExName');
  const showCreate=()=>{nameInput.value=(search.value||'').trim();mainBox.hidden=true;createBox.hidden=false;nameInput.focus();};
  dlg.querySelector('#newExBack').onclick=()=>{createBox.hidden=true;mainBox.hidden=false;search.focus();};
  const saveNew=async()=>{
    const name=nameInput.value.trim();if(!name){toast('Give the exercise a name');nameInput.focus();return;}
    if(activeExercises().some(e=>String(e.name).trim().toLocaleLowerCase()===name.toLocaleLowerCase())){toast('That exercise is already in the library');return;}
    const ex={id:uid(),name,category:dlg.querySelector('#newExCategory').value||'Other',equipment:dlg.querySelector('#newExEquipment').value.trim()};
    if(!(await saveExerciseList([...S.exercises,ex])))return;
    const result=await onChoose(ex.id);if(result===false)return;if(dlg.open)dlg.close();
  };
  dlg.querySelector('#newExSave').onclick=saveNew;
  nameInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveNew();}};
  const draw=()=>{
    const query=(search.value||'').trim().toLocaleLowerCase();
    const matches=activeExercises().slice().sort(byName).filter(ex=>`${ex.name} ${ex.category||''} ${ex.equipment||''}`.toLocaleLowerCase().includes(query));
    list.innerHTML=`<button type="button" class="exercise-picker-option exercise-picker-create" data-exercise-pick="__new__"><span>＋ Create new exercise</span><small>Add to library</small></button>`+
      (matches.map(ex=>`<button type="button" class="exercise-picker-option" data-exercise-pick="${esc(ex.id)}"><span>${esc(ex.name)}</span><small>${esc([ex.category,ex.equipment].filter(Boolean).join(' · '))}</small></button>`).join('')||'<p class="small muted">No matching exercises.</p>');
    list.querySelectorAll('[data-exercise-pick]').forEach(button=>button.onclick=async()=>{if(button.dataset.exercisePick==='__new__'){showCreate();return;}const result=await onChoose(button.dataset.exercisePick);if(result===false)return;if(dlg.open)dlg.close();});
  };
  search.oninput=draw;draw();search.focus();return dlg;
}
function groupExercisesDialog(title,items,currentIndex,size,labelOf,onCreate){
  const choices=items.map((item,index)=>({item,index})).filter(x=>x.index!==currentIndex);
  const required=size-1;
  if(choices.length<required){toast(`Add at least ${size} exercises before creating a ${labelOf}.`);return;}
  const options=choices.map(({item,index})=>`<label class="group-choice"><input type="checkbox" data-group-choice value="${index}"><span>${esc(item.name||exName(item.exId))}</span></label>`).join('');
  dialog(`Create ${labelOf}`,`<p class="small muted">Choose ${required} more exercise${required===1?'':'s'} to group with ${esc(items[currentIndex].name||exName(items[currentIndex].exId))}.</p><div class="group-choice-list">${options}</div>`,[
    {label:'Cancel'},
    {label:`Create ${labelOf}`,kind:'primary',onClick:async dlg=>{
      const selected=[...dlg.querySelectorAll('[data-group-choice]:checked')].map(input=>Number(input.value));
      if(selected.length!==required){toast(`Choose exactly ${required} more exercise${required===1?'':'s'}.`);return false;}
      await onCreate([currentIndex,...selected]);
    }}
  ]);
}
function assignExerciseGroup(items,indexes,type){
  const oldGroups=new Set(indexes.map(index=>items[index]?.groupId).filter(Boolean));
  items.forEach(item=>{if(oldGroups.has(item.groupId)){delete item.groupId;delete item.groupType;}});
  const groupId=uid();indexes.forEach(index=>{items[index].groupId=groupId;items[index].groupType=type;});
  // Members of a superset sit side by side: pull them next to the first one (in place, keeping their order).
  const sorted=indexes.slice().sort((a,b)=>a-b),members=sorted.map(i=>items[i]),rest=items.filter(x=>!members.includes(x));
  rest.splice(sorted[0],0,...members);items.splice(0,items.length,...rest);
}
/* Places an open ⋯ menu next to its button, inside the visible screen (flips up near the bottom). */
function positionActionsPop(details){
  const pop = details.querySelector('.exercise-actions-pop'), btn = details.querySelector('summary'); if (!pop || !btn) return;
  const b = btn.getBoundingClientRect(), width = Math.min(240, window.innerWidth - 16);
  pop.style.width = width + 'px';
  pop.style.left = Math.max(8, Math.min(b.right - width, window.innerWidth - width - 8)) + 'px';
  const h = pop.offsetHeight, below = window.innerHeight - b.bottom - 8, above = b.top - 8;
  pop.style.top = (h <= below || below >= above ? Math.min(b.bottom + 4, Math.max(8, window.innerHeight - h - 8)) : Math.max(8, b.top - h - 4)) + 'px';
  const close = () => { details.open = false; };
  window.addEventListener('scroll', close, { once:true, passive:true });
  window.addEventListener('resize', close, { once:true });
}
// Tapping anywhere else closes an open ⋯ menu.
document.addEventListener('click', e => document.querySelectorAll('details.exercise-actions-menu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
/* Moves one exercise — or a whole superset, if it's in one — a step up (-1) or down (1). Works in place. */
function moveExerciseUnit(items,index,dir){
  const units=[];
  items.forEach(item=>{const last=units[units.length-1];if(item.groupId&&last&&last[0].groupId===item.groupId)last.push(item);else units.push([item]);});
  const u=units.findIndex(unit=>unit.includes(items[index])),to=u+dir;
  if(u<0||to<0||to>=units.length)return false;
  [units[u],units[to]]=[units[to],units[u]];
  items.splice(0,items.length,...units.flat());return true;
}
/* Next unused "Day X" name for a program (Day A, Day B … skipping any already taken). */
function nextDayName(p){
  const used=new Set((p.days||[]).map(d=>String(d.name||'').trim().toLowerCase()));
  for(let i=0;i<26;i++){const n='Day '+String.fromCharCode(65+i);if(!used.has(n.toLowerCase()))return n;}
  let n=27;while(used.has(('day '+n).toLowerCase()))n++;return 'Day '+n;
}
/* Deep copy of a program day (or whole program) with fresh superset ids, so copies never share groups. */
function cloneWithFreshGroups(days){
  const copy=JSON.parse(JSON.stringify(days)),map={};
  copy.forEach(day=>(day.items||[]).forEach(it=>{if(it.groupId){map[it.groupId]=map[it.groupId]||uid();it.groupId=map[it.groupId];}}));
  return copy;
}
function clearExerciseGroup(items,item){
  if(!item?.groupId)return;const groupId=item.groupId;
  items.forEach(member=>{if(member.groupId===groupId){delete member.groupId;delete member.groupType;}});
}
/* <option>s for a program day's conditioning template. A deleted template stays visible (labelled) rather than silently vanishing. */
function dayConditioningOptions(selectedId){
  const opts=Object.entries(S.conditioning).map(([id,w])=>[id,w.name||'Conditioning program']).sort((a,b)=>a[1].localeCompare(b[1]));
  const list=[`<option value="" ${selectedId?'':'selected'}>None</option>`];
  if(selectedId&&!S.conditioning[selectedId])list.push(`<option value="${esc(selectedId)}" selected>(deleted conditioning program)</option>`);
  opts.forEach(([id,name])=>list.push(`<option value="${esc(id)}" ${id===selectedId?'selected':''}>${esc(name)}</option>`));
  return list.join('');
}
function readProgramEditor(pid,root){
  const p=S.programs[pid];if(!p)return;
  p.name=root.querySelector('#p_name')?.value.trim()||p.name;
  p.weeks=numVal('p_weeks')||p.weeks||4;
  root.querySelectorAll('.dayname').forEach(input=>{const day=p.days[Number(input.dataset.di)];if(day)day.name=input.value.trim()||'Day';});
  root.querySelectorAll('.daynotes').forEach(input=>{const day=p.days[Number(input.dataset.di)];if(day){const v=input.value.trim();if(v)day.notes=v;else delete day.notes;}});
  root.querySelectorAll('.daycond').forEach(sel=>{const day=p.days[Number(sel.dataset.di)];if(day){if(sel.value)day.conditioningId=sel.value;else delete day.conditioningId;}});
  const wk=Number(S.sel&&S.sel.progWeek)||0;
  if(wk>0&&root.querySelector('#wk_label')){
    const label=root.querySelector('#wk_label').value.trim(),deload=!!root.querySelector('#wk_deload')?.checked;
    p.weekPlan=p.weekPlan||{};
    if(label||deload)p.weekPlan[wk]={...(label?{label}:{}),...(deload?{deload:true}:{})};else delete p.weekPlan[wk];
    if(!Object.keys(p.weekPlan).length)delete p.weekPlan;
  }
  root.querySelectorAll('tr[data-ii]').forEach(row=>{
    const item=p.days[Number(row.dataset.di)]?.items[Number(row.dataset.ii)];if(!item)return;
    row.querySelectorAll('[data-f]').forEach(field=>{
      const f=field.dataset.f,v=field.value.trim();
      if(wk>0&&WEEK_FIELDS.includes(f)){
        // In a week view only what differs from the base is stored for that week.
        const over=item.weeks&&item.weeks[wk];
        if(v===String(item[f]??'')){if(over&&f in over){delete over[f];if(!Object.keys(over).length)delete item.weeks[wk];if(!Object.keys(item.weeks).length)delete item.weeks;}}
        else{item.weeks=item.weeks||{};(item.weeks[wk]=item.weeks[wk]||{})[f]=v;}
      }else item[f]=v;
    });
  });
}
const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
const numVal = id => { const v = val(id); return v === '' ? null : Number(v); };

