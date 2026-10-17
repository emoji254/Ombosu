/* ---------------------------------------------------------------
   Encrypted backup: AES-256-GCM, key derived from a passphrase with PBKDF2-SHA256 (Web Crypto).
   The passphrase is never stored; without it the file cannot be opened.
----------------------------------------------------------------*/
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
async function deriveBackupKey(pass, salt, iter){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:iter, hash:'SHA-256' }, base, { name:'AES-GCM', length:256 }, false, ['encrypt', 'decrypt']);
}
async function encryptBackup(text, pass){
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 310000;
  const key = await deriveBackupKey(pass, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  return JSON.stringify({ app:'nyaega-encrypted', v:1, kdf:'PBKDF2-SHA256', iter, salt:b64(salt), iv:b64(iv), data:b64(ct) });
}
async function decryptBackup(obj, pass){
  if (!isPlainObject(obj) || obj.v !== 1 || typeof obj.salt !== 'string' || typeof obj.iv !== 'string' || typeof obj.data !== 'string' || !Number.isInteger(obj.iter) || obj.iter < 100000 || obj.iter > 2000000)
    throw new Error('That is not a valid encrypted backup.');
  try {
    const key = await deriveBackupKey(pass, unb64(obj.salt), obj.iter);
    const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv:unb64(obj.iv) }, key, unb64(obj.data));
    return new TextDecoder().decode(pt);
  } catch { throw new Error('Wrong passphrase, or the file was changed.'); }
}
function exportEncryptedDialog(){
  if (assistantBlocked()) return;
  dialog('Export an encrypted backup',
    `<p class="small muted">The file is locked with a passphrase you choose. <strong>If you forget it, the backup cannot be opened by anyone, including me.</strong> Store the passphrase separately from the file.</p>
     <label class="field"><span>Passphrase (at least 10 characters)</span><input type="password" id="encPass" autocomplete="new-password"></label>
     <label class="field"><span>Repeat passphrase</span><input type="password" id="encPass2" autocomplete="new-password"></label>`,
    [{label:'Cancel'},{label:'Export', kind:'primary', onClick: async () => {
      const p1 = document.getElementById('encPass').value, p2 = document.getElementById('encPass2').value;
      if (p1.length < 10){ toast('Use at least 10 characters'); return false; }
      if (p1 !== p2){ toast('The two passphrases do not match'); return false; }
      try { download('nyaega-backup-' + todayISO() + '.nyaega-enc.json', await encryptBackup(exportPayload(), p1), 'application/json'); }
      catch(e){ toast('Could not encrypt — ' + e.message); return false; }
      Audit.log('export', { kind:'encrypted' }); markExported(); toast('Encrypted backup downloaded');
    }}]);
}
function startImport(data, fileName){
  if (assistantBlocked()) return;
  if (!isPlainObject(data) || data.app !== 'nyaega'){ toast('That file did not import — it isn\'t a Nyaega backup'); return; }
  const plan = planImport(data);
  if (!plan.records.length && !plan.exercisesToAdd.length){
    toast(plan.skipped ? `Nothing to import — ${plan.skipped} damaged item${plan.skipped===1?'':'s'} skipped` : 'Nothing new to import in that file');
    return;
  }
  dialog('Import this backup?', importSummaryHTML(plan, fileName), [
    {label:'Cancel'},
    {label:'Import', kind:'primary', onClick: async () => { await runImport(plan); }}
  ]);
}

