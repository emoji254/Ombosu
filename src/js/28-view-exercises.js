/* ============================ EXERCISES ============================ */
function viewExercises(){
  const active = activeExercises(), archived = S.exercises.filter(e => e.archived).sort(byName);
  const cats = [...new Set(active.map(e => e.category || 'Other'))].sort();
  const showArchived = !!S.sel.showArchivedExercises;
  return `
  <div class="panel spread"><div><h2>Exercise library</h2><span class="muted small num">${active.length} movements${archived.length ? ' · ' + archived.length + ' archived' : ''}</span></div>
    <button class="btn primary" id="newEx">Add exercise</button></div>
  ${cats.map(cat => `<div class="panel">
    <h3>${esc(cat)}</h3>
    <div class="tablewrap"><table class="exercise-library-table"><tbody>
    ${active.filter(e => (e.category||'Other') === cat).sort(byName).map(e => `<tr>
      <td>${esc(e.name)}</td><td class="muted small">${esc(e.equipment||'')}</td>
      <td><button class="btn sm ghost" data-archiveex="${esc(e.id)}">Archive</button></td></tr>`).join('')}
    </tbody></table></div></div>`).join('')}
  ${archived.length ? `<div class="panel">
    <div class="spread"><h3 class="muted">Archived exercises</h3>
      <button type="button" class="btn sm ghost" id="toggleArchivedExercises">${showArchived ? 'Hide archived' : 'Show archived (' + archived.length + ')'}</button></div>
    ${showArchived ? `<p class="small muted">Hidden from pickers. Programs and history that already use them are unaffected.</p>
    <div class="tablewrap"><table class="exercise-library-table"><tbody>
    ${archived.map(e => `<tr><td>${esc(e.name)}</td><td class="muted small">${esc([e.category, e.equipment].filter(Boolean).join(' · '))}</td>
      <td><button class="btn sm ghost" data-restoreex="${esc(e.id)}">Restore</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}
  </div>` : ''}`;
}

