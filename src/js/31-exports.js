/* ---- PDF: printable program card, optionally for one named client ---- */
function downloadProgramPdf(p, clientName, week){
  if (assistantBlocked()) return;
  if (!window.jspdf){ toast('The PDF library did not load — check your connection and try again'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const left = 40;
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text(p.name, left, 50);
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(110);
  doc.text((clientName ? clientName + ' · ' : '') + p.weeks + '-week block' + (week ? ' · ' + weekTextFor(p, week) : '') + ' · printed ' + todayISO(), left, 68);
  doc.setTextColor(0);
  let y = 92;
  p.days.forEach(day => {
    if (y > 700){ doc.addPage(); y = 50; }
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.text(day.name, left, y);
    let tableTop = y + 10;
    const condName = day.conditioningId && S.conditioning[day.conditioningId] ? S.conditioning[day.conditioningId].name : '';
    const noteText = [day.notes, condName ? 'Conditioning: ' + condName : ''].filter(Boolean).join('\n');
    if (noteText){ doc.setFont('helvetica','italic'); doc.setFontSize(9); doc.setTextColor(90); const lines = doc.splitTextToSize(noteText, 515); doc.text(lines, left, y + 14); doc.setTextColor(0); tableTop = y + 14 + lines.length * 11; }
    const rows = day.items.map(base => { const it = week ? weekItem(base, week) : base; return [exName(it.exId) + (it.groupType ? ' (' + it.groupType + ')' : ''), it.sets||'', it.reps||'', it.load||'', it.rpe||'', it.rir||'', it.tempo||'', it.rest||'', it.notes||'']; });
    doc.autoTable({
      startY: tableTop, margin:{ left, right:40 },
      head: [['Exercise','Sets','Reps','Load','RPE','RIR','Tempo','Rest','Notes']],
      body: rows.length ? rows : [['Nothing added to this day yet','','','','','','','','']],
      styles: { font:'helvetica', fontSize:8.5, cellPadding:4, lineColor:[207,206,199], lineWidth:0.5, overflow:'linebreak' },
      columnStyles: { 0:{ cellWidth:105 }, 1:{ cellWidth:28 }, 2:{ cellWidth:38 }, 3:{ cellWidth:38 }, 4:{ cellWidth:28 }, 5:{ cellWidth:28 }, 6:{ cellWidth:44 }, 7:{ cellWidth:38 } },
      headStyles: { fillColor:[27,79,216], textColor:255, fontStyle:'bold' },
      alternateRowStyles: { fillColor:[247,247,244] }
    });
    y = doc.lastAutoTable.finalY + 22;
  });
  doc.save(fname((clientName ? clientName + '-' : '') + p.name) + '.pdf');
}

/* ---- PDF: one-page client summary — pack balance + recent sessions ---- */
function downloadClientSummaryPdf(c){
  if (assistantBlocked()) return;
  if (!window.jspdf){ toast('The PDF library did not load — check your connection and try again'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const left = 40;
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text(c.name, left, 50);
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(110);
  doc.text('Training summary · ' + todayISO(), left, 68);
  doc.setTextColor(0);
  let y = 96;
  if (c.packTotal){
    doc.setFontSize(11);
    doc.text('Sessions remaining: ' + sessionsLeft(c) + ' of ' + c.packTotal, left, y);
    y += 16;
    if (c.packStart) { doc.setFontSize(9); doc.setTextColor(110); doc.text('Pack started ' + c.packStart, left, y); doc.setTextColor(0); y += 16; }
  }
  if (c.goal){ doc.setFontSize(10); doc.text('Goal: ' + c.goal, left, y); y += 20; }
  const logs = clientLogs(c.id).slice(0, 20);
  const rows = logs.map(l => {
    const entries = workoutLogEntries(l);
    const sets = entries.flatMap(e => loggedExerciseSets(e).filter(s => Number(setWeight(s)) > 0).map(s => ({ weight:Number(setWeight(s)), reps:setReps(s), n:loggedEntryName(e) })));
    const top = sets.sort((a,b) => est1RM(b.weight,Number(b.reps)) - est1RM(a.weight,Number(a.reps)))[0];
    return [l.date, l.dayLabel || '', String(entries.length), top ? top.n + ' ' + top.weight + '×' + (top.reps ?? '—') : '—'];
  });
  doc.autoTable({
    startY: y, margin:{ left, right:40 },
    head: [['Date','Session','Lifts','Top set']],
    body: rows.length ? rows : [['—','No sessions logged yet','','']],
    styles: { font:'helvetica', fontSize:9, cellPadding:5 },
    headStyles: { fillColor:[27,79,216], textColor:255, fontStyle:'bold' },
    alternateRowStyles: { fillColor:[247,247,244] }
  });
  doc.save(fname(c.name) + '-summary.pdf');
}

/* ---- Excel: full logged-set history plus attendance, two sheets ---- */
function downloadClientHistoryXlsx(c){
  if (assistantBlocked()) return;
  if (!window.XLSX){ toast('The spreadsheet library did not load — check your connection and try again'); return; }
  const rows = [['Date','Day','Exercise','Set','Weight','Reps','RPE','Session notes']];
  const logs = clientLogs(c.id).slice().reverse();
  logs.forEach(l => {
    workoutLogEntries(l).forEach(e => loggedExerciseSets(e).forEach((s,i) => {
      if (setWeight(s) == null && setReps(s) == null) return;
      rows.push([l.date, l.dayLabel||'', loggedEntryName(e), s.setNumber||i+1, setWeight(s) ?? '', setReps(s) ?? '', setRPE(s) ?? '', l.notes || '']);
    }));
  });
  const arows = [['Date','Weekday','Status','Slot']];
  attList(c.id).slice().reverse().forEach(a => arows.push([a.date, DOW[dowOf(a.date)], a.status, (S.groups[a.groupId]||{}).name || '']));
  // One row per block, with its result when one was recorded.
  const crows = [['Date','Template','Block','Mode','Completed','Rounds','Extra reps','Time (s)','Calories','Distance (m)','RPE','Note']];
  logs.filter(l => l.conditioningSession).forEach(l => {
    const cs = l.conditioningSession, blocks = Array.isArray(cs.blocks) ? cs.blocks : [], done = new Set(cs.blocksCompleted || []);
    if (!blocks.length){ crows.push([l.date, cs.templateName || 'Conditioning', '', '', '', '', '', '', '', '', '', '']); return; }
    blocks.forEach((b,i) => {
      const r = (cs.results || {})[i] || {};
      crows.push([l.date, cs.templateName || 'Conditioning', b.name || 'Block ' + (i+1), conditioningModeName(b.mode), done.has(i) ? 'yes' : 'no', r.roundsCompleted ?? '', r.extraReps ?? '', r.timeSeconds ?? '', r.calories ?? '', r.distance ?? '', r.rpe ?? '', r.note || '']);
    });
  });

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(rows); ws1['!cols'] = [{wch:11},{wch:14},{wch:20},{wch:5},{wch:8},{wch:6},{wch:6},{wch:26}];
  XLSX.utils.book_append_sheet(wb, ws1, 'Sessions');
  const ws2 = XLSX.utils.aoa_to_sheet(arows); ws2['!cols'] = [{wch:11},{wch:9},{wch:10},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Attendance');
  const ws3 = XLSX.utils.aoa_to_sheet(crows); ws3['!cols'] = [{wch:11},{wch:22},{wch:16},{wch:8},{wch:48}];
  XLSX.utils.book_append_sheet(wb, ws3, 'Conditioning');
  XLSX.writeFile(wb, fname(c.name) + '-history.xlsx');
}

/* ---- Excel: whole roster, one row per client — for your own records ---- */
function downloadRosterXlsx(){
  if (assistantBlocked()) return;
  if (!window.XLSX){ toast('The spreadsheet library did not load — check your connection and try again'); return; }
  const rows = [['Name','Phone','Email','Goal','Pairing','Program','Pack total','Pack used','Sessions left','Lifetime attended','Status']];
  Object.entries(S.clients).map(([id,c]) => ({id,...c})).sort(byName).forEach(c => rows.push([
    c.name, c.phone||'', c.email||'', c.goal||'', (S.groups[c.groupId]||{}).name||'', (S.programs[c.programId]||{}).name||'',
    c.packTotal||0, packUsedOf(c), sessionsLeft(c), attendedCount(c.id), c.status||'active'
  ]));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:18},{wch:14},{wch:22},{wch:22},{wch:14},{wch:18},{wch:10},{wch:10},{wch:12},{wch:16},{wch:9}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Roster');
  XLSX.writeFile(wb, 'nyaega-roster-' + todayISO() + '.xlsx');
}
function exportPayload(){
  return JSON.stringify({ app:'nyaega', version:2, exported: new Date().toISOString(),
    clients:S.clients, groups:S.groups, programs:S.programs, logs:S.logs, attendance:S.attendance, conditioning:S.conditioning, schedule:S.schedule, scheduleExceptions:S.scheduleExceptions, exercises:S.exercises }, null, 2);
}

