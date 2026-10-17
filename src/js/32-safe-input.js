/* ---------------------------------------------------------------
   Safe input: nothing from a file or from the server reaches the app unchecked.
----------------------------------------------------------------*/
const MAX_IMPORT_BYTES = 50 * 1000 * 1000;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/* JSON.parse that drops keys used for prototype pollution. */
function safeParse(text){ return JSON.parse(text, (k, v) => DANGEROUS_KEYS.has(k) ? undefined : v); }
function sanitizeDoc(doc){ return safeParse(JSON.stringify(doc)); }
/* A record that arrived from the server must be the right shape, with a safe id and a sane size. */
function validRemoteDoc(coll, id, doc){
  if (!SAFE_ID.test(String(id))) return false;
  if (coll === 'exercises'){
    if (String(id) === 'library') return isPlainObject(doc) && Array.isArray(doc.list) && doc.list.length < 5000 && doc.list.every(e => isPlainObject(e) && typeof e.name === 'string' && SAFE_ID.test(String(e.id)));
    return isPlainObject(doc) && typeof doc.name === 'string' && doc.name.length < 200 && JSON.stringify(doc).length < 5000;
  }
  if (!isPlainObject(doc)) return false;
  const check = IMPORT_CHECKS[coll]; if (check && !check(doc)) return false;
  try { if (JSON.stringify(doc).length > 1000000) return false; } catch { return false; }
  return true;
}

