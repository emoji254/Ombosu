/* ---------------------------------------------------------------
   Sign-in and app lock screen. What it is and is not:
   - The PIN and biometrics UNLOCK THE APP ON THIS DEVICE (a privacy screen for a phone left on a gym bench).
     They are not a server login: the account password (or a "keep me signed in" session) is what reaches your account.
   - The lock keeps casual onlookers out. It does not encrypt the data stored in this browser; anyone with the
     unlocked device and developer tools could still read it. Use a device passcode too.
   - Roles shown here are a hint for what to expect; the server decides what an account really is.
----------------------------------------------------------------*/
const LAST_ROLE_KEY = 'nyaega:lastRole', LOCK_FAILS_KEY = 'nyaega:lockfails';
async function pinDerive(text, saltB64, iter){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(text), 'PBKDF2', false, ['deriveBits']);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2', salt:unb64(saltB64), iterations:iter, hash:'SHA-256' }, key, 256)));
}
async function makeSecret(text){ const salt = b64(crypto.getRandomValues(new Uint8Array(16))), iter = 150000; return { salt, iter, hash:await pinDerive(text, salt, iter) }; }
function sameText(a, b){ if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function checkSecret(text, s){ if (!s || !s.salt) return false; return sameText(await pinDerive(text, s.salt, s.iter), s.hash); }
function newRecoveryCode(){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map(b => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map(i => chars.slice(i, i + 4).join('')).join('-');
}
const Bio = {
  async available(){ try { return !!(window.isSecureContext && window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; } },
  async register(){
    const cred = await navigator.credentials.create({ publicKey:{ challenge:crypto.getRandomValues(new Uint8Array(32)), rp:{ name:'Nyaega', id:location.hostname },
      user:{ id:crypto.getRandomValues(new Uint8Array(16)), name:'nyaega-this-device', displayName:'Nyaega on this device' },
      pubKeyCredParams:[{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
      authenticatorSelection:{ authenticatorAttachment:'platform', userVerification:'required', residentKey:'discouraged' }, timeout:60000, attestation:'none' } });
    return b64(new Uint8Array(cred.rawId));
  },
  async verify(id){
    const a = await navigator.credentials.get({ publicKey:{ challenge:crypto.getRandomValues(new Uint8Array(32)), rpId:location.hostname, allowCredentials:[{ type:'public-key', id:unb64(id) }], userVerification:'required', timeout:60000 } });
    return !!a;
  }
};
const Lock = {
  cfg:null, view:'pin', pin:'', role:'owner', closable:false, hiddenAt:0, bioReady:false, busy:false,
  enabled(){ return !!(this.cfg && this.cfg.pin); },
  async load(){ this.cfg = await Store.getMeta('appLock', null); const lu = await Store.getMeta('syncUser', null); Sync.linkedId = (lu && lu.id) || null; try { const r = localStorage.getItem(LAST_ROLE_KEY); if (['owner', 'assistant', 'client'].includes(r)) this.role = r; } catch {} this.bioReady = await Bio.available(); },
  async save(){ await Store.putMeta('appLock', this.cfg); },
  fails(){ try { return JSON.parse(localStorage.getItem(LOCK_FAILS_KEY)) || { count:0, until:0 }; } catch { return { count:0, until:0 }; } },
  setFails(f){ try { localStorage.setItem(LOCK_FAILS_KEY, JSON.stringify(f)); } catch {} },
  waitMs(){ const f = this.fails(); return Math.max(0, f.until - Date.now()); },
  show(opts = {}){
    this.view = opts.view || (this.enabled() ? 'pin' : 'credentials'); this.pin = ''; this.closable = !!opts.closable; this.msg = '';
    this.locked = this.enabled() && !opts.closable;   // a locked screen offers only the PIN, biometrics and the linked account
    let el = document.getElementById('lockScreen');
    if (!el){ el = document.createElement('div'); el.id = 'lockScreen'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Sign in to Nyaega'); document.body.appendChild(el); }
    document.querySelectorAll('.shell, #workoutDock, #timerBar, #bottomNav, #fab, #navMenu').forEach(n => { try { n.inert = true; } catch {} });
    this.draw();
  },
  hide(){
    this.locked = false;
    const el = document.getElementById('lockScreen'); if (el) el.remove();
    document.querySelectorAll('.shell, #workoutDock, #timerBar, #bottomNav, #fab, #navMenu').forEach(n => { try { n.inert = false; } catch {} });
  },
  pillState(){
    if (!navigator.onLine) return { cls:'warn', text:'Offline · local mode' };
    if (Sync.signedIn()) return Sync.state === 'syncing' ? { cls:'ok', text:'Syncing…' } : Sync.state === 'attention' ? { cls:'warn', text:'Needs attention' } : Sync.state === 'offline' ? { cls:'warn', text:'Offline · local mode' } : { cls:'ok', text:'Synced with Supabase' };
    return { cls:'idle', text:'Local mode · not signed in' };
  },
  updatePill(){ const p = document.getElementById('lockPill'); if (!p) return; const s = this.pillState(); p.className = 'lock-pill ' + s.cls; p.querySelector('span').textContent = s.text; },
  setRole(r){ this.role = r; try { localStorage.setItem(LAST_ROLE_KEY, r); } catch {} this.draw(); },
  draw(){
    const el = document.getElementById('lockScreen'); if (!el) return;
    if (this.locked && this.view === 'credentials' && !Sync.linkedId) this.view = 'pin';   // nothing to sign in to: PIN only
    const roles = [['owner', 'Head Coach'], ['assistant', 'Assistant'], ['client', 'Client']];
    const s = this.pillState();
    let body = '';
    if (this.role === 'client'){
      body = `<div class="lock-note"><strong>Clients don't need an account.</strong><p>Your coach shares your program and summary with you as a PDF. Ask them for the latest files.</p></div>
        <div class="lock-actions">${this.closable ? '<button type="button" class="lk-btn ghost" data-lk="close">Back to the app</button>' : '<button type="button" class="lk-btn ghost" data-lk="role-owner">I am a coach</button>'}</div>`;
    } else if (this.view === 'pin' && this.enabled()){
      const wait = Math.ceil(this.waitMs() / 1000);
      body = `${this.bioReady && this.cfg.bio ? '<button type="button" class="lk-btn primary" data-lk="bio">Use Biometrics (Face ID / Fingerprint)</button>' : ''}
        <div class="lk-dots" role="img" aria-label="${this.pin.length} of 4 digits entered">${[0, 1, 2, 3].map(i => `<i class="${i < this.pin.length ? 'on' : ''}"></i>`).join('')}</div>
        <p class="lk-msg" id="lkMsg" role="status" aria-live="polite">${esc(wait ? 'Too many attempts. Try again in ' + wait + ' s.' : (this.msg || 'Enter your 4-digit PIN'))}</p>
        <div class="lk-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-lk="digit" data-d="${n}" aria-label="${n}">${n}</button>`).join('')}<span></span><button type="button" data-lk="digit" data-d="0" aria-label="0">0</button><button type="button" data-lk="back" aria-label="Delete last digit">&#9003;</button></div>
        <div class="lock-actions">${!this.locked || Sync.linkedId ? '<button type="button" class="lk-link" data-lk="creds">Use email and password instead</button>' : ''}<button type="button" class="lk-link" data-lk="forgot">Forgot PIN?</button></div>`;
    } else if (this.view === 'forgot'){
      body = `<form id="lkForgot" class="lk-form"><p class="lk-msg" id="lkMsg" role="status" aria-live="polite">${esc(this.msg || 'Enter the recovery code you saved when you set the PIN. The lock will be turned off; your data is not touched.')}</p>
        <label class="lk-field"><span>Recovery code</span><input type="text" id="lkRecovery" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX"></label>
        <div class="lock-actions"><button type="submit" class="lk-btn primary">Turn off the lock</button><button type="button" class="lk-link" data-lk="pinview">Back to PIN</button></div></form>`;
    } else {
      const hint = this.role === 'assistant' ? 'Sign in with the account you used to accept your coach\'s invitation.' : '';
      const eye = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>';
      const alts = [];
      if (this.enabled()) alts.push('<button type="button" class="lk-btn" data-lk="pinview">Use PIN</button>');
      if (this.enabled() && this.bioReady && this.cfg.bio) alts.push('<button type="button" class="lk-btn" data-lk="bio">Biometrics</button>');
      if (!this.enabled() || this.closable) alts.push('<button type="button" class="lk-btn" data-lk="close">Local mode</button>');
      body = `<form id="lkForm" class="lk-form" novalidate>
        <div class="lk-field"><label for="lkEmail">Email address</label><input id="lkEmail" type="email" autocomplete="username" inputmode="email" placeholder="you@example.com" aria-describedby="lkEmailErr" required><span class="lk-err" id="lkEmailErr" aria-live="polite"></span></div>
        <div class="lk-field"><label for="lkPassword">Password</label><div class="lk-wrap"><input id="lkPassword" type="password" autocomplete="current-password" placeholder="Enter your password" aria-describedby="lkPwErr" required><button type="button" class="lk-eye" id="lkEye" aria-label="Show password" aria-pressed="false">${eye}</button></div><span class="lk-err" id="lkPwErr" aria-live="polite"></span></div>
        <div class="lk-opts"><label class="lk-check"><input type="checkbox" id="lkKeep" checked> Remember me</label><button type="button" class="lk-link2" data-lk="reset">Forgot password?</button></div>
        <button class="lk-btn primary" id="lkSubmit" type="submit"><span class="lk-label">Log In</span><span class="lk-spin" aria-hidden="true"></span></button>
        <p class="lk-msg" id="lkMsg" role="status" aria-live="polite">${esc(this.msg || hint)}</p>
        <div class="lk-divider">or continue with</div>
        <div class="lk-alt"><button type="button" class="lk-btn" data-lk="google" aria-label="Continue with Google"><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4 1.9-6.9 1.9-5.3 0-9.9-3.6-11.5-8.4H5.7v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.5 27.5a12 12 0 0 1 0-7.1v-5.3H5.7a20 20 0 0 0 0 17.7l6.8-5.3Z"/><path fill="#EA4335" d="M24 12c3 0 5.6 1 7.7 3.1l5.8-5.8C34 5.9 29.5 4 24 4A20 20 0 0 0 5.7 15.1l6.8 5.3C14.1 15.6 18.7 12 24 12Z"/></svg>Google</button><button type="button" class="lk-btn" data-lk="apple" aria-label="Continue with Apple"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M16.37 12.24c.02 2.15 1.89 2.87 1.91 2.88-.02.05-.3 1.03-.98 2.03-.59.87-1.2 1.74-2.16 1.76-.94.02-1.25-.57-2.34-.57-1.08 0-1.43.55-2.31.59-.92.03-1.62-.95-2.22-1.81-1.22-1.76-2.15-4.98-.9-7.15.62-1.08 1.72-1.77 2.91-1.79.91-.02 1.77.62 2.33.62.55 0 1.6-.77 2.7-.66.46.02 1.77.19 2.61 1.42-.07.04-1.56.91-1.55 2.68ZM14.6 6.95c.49-.6.82-1.43.73-2.26-.7.03-1.55.47-2.05 1.06-.45.52-.85 1.36-.74 2.16.78.06 1.57-.39 2.06-.96Z"/></svg>Apple</button></div>
        ${alts.length ? `<div class="lk-alt${alts.length === 1 ? ' one' : ''}">${alts.join('')}</div>` : ''}
        <p class="lk-signup">Don\u2019t have an account? <button type="button" class="lk-link2" data-lk="signup">Sign up</button></p></form>`;
    }
    el.innerHTML = `<div class="lock-top"><span class="lock-pill ${s.cls}" id="lockPill"><i></i><span>${esc(s.text)}</span></span></div>
      <div class="lock-card"><header class="lock-brand"><div class="logo" aria-hidden="true">N</div><h1>Nyaega</h1><p>Your coaching workspace</p></header>
        <div class="lock-roles" role="tablist" aria-label="I am a">${roles.map(([k, l]) => `<button type="button" role="tab" id="lkrole-${k}" aria-selected="${this.role === k}" data-lk="role" data-r="${k}">${l}</button>`).join('')}</div>
        <div class="lock-body">${body}</div></div>`;
    if (this.locked){   // no sign-up, no other providers, no local-mode shortcut while locked
      el.querySelectorAll('[data-lk="google"],[data-lk="apple"],[data-lk="signup"],[data-lk="close"]').forEach(b => b.remove());
      el.querySelectorAll('.lk-alt').forEach(a => { if (!a.children.length) a.remove(); });
      const dv = el.querySelector('.lk-divider'); if (dv) dv.textContent = 'or'; const su = el.querySelector('.lk-signup'); if (su) su.remove();
    }
    el.querySelectorAll('[data-lk]').forEach(b => b.onclick = () => this.act(b));
    const form = document.getElementById('lkForm'); if (form) form.onsubmit = e => { e.preventDefault(); this.signIn(); };
    const forgot = document.getElementById('lkForgot'); if (forgot) forgot.onsubmit = e => { e.preventDefault(); this.recover(); };
    const eyeBtn = document.getElementById('lkEye'); if (eyeBtn) eyeBtn.onclick = () => { const p = document.getElementById('lkPassword'), show = p.type === 'password'; p.type = show ? 'text' : 'password'; eyeBtn.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); eyeBtn.setAttribute('aria-pressed', String(show)); };
    ['lkEmail', 'lkPassword'].forEach(id => { const i = document.getElementById(id); if (i) i.oninput = () => this.fieldError(id, ''); });
    const first = el.querySelector('#lkEmail, #lkRecovery, .lk-pad button, .lock-roles [aria-selected="true"]'); if (first && !this.noFocus) { try { first.focus({ preventScroll:true }); } catch {} }
  },
  async act(b){
    const a = b.dataset.lk;
    if (a === 'role') return this.setRole(b.dataset.r);
    if (a === 'role-owner') return this.setRole('owner');
    if (a === 'close'){ if (!this.locked){ try { localStorage.setItem('nyaega:skipLogin', '1'); } catch {} } return this.hide(); }   // "Local mode": don't offer the sign-in page at every start
    if (a === 'creds'){ this.view = 'credentials'; this.msg = ''; return this.draw(); }
    if (a === 'pinview'){ this.view = 'pin'; this.msg = ''; this.pin = ''; return this.draw(); }
    if (a === 'forgot'){ this.view = 'forgot'; this.msg = ''; return this.draw(); }
    if (a === 'google' || a === 'apple'){ if (this.locked) return; try { await Sync.oauth(a); } catch(e){ this.say(e.message || 'Could not start the sign-in.'); } return; }
    if (a === 'reset') return this.resetPassword();
    if (a === 'signup') return this.signUp();
    if (a === 'digit') return this.digit(b.dataset.d);
    if (a === 'back'){ this.pin = this.pin.slice(0, -1); return this.redrawPin(); }
    if (a === 'bio') return this.bioUnlock();
  },
  redrawPin(){ this.noFocus = true; this.draw(); this.noFocus = false; const k = document.querySelector('.lk-pad button'); },
  async digit(d){
    if (this.busy || this.waitMs() > 0 || this.pin.length >= 4) return;
    this.pin += d; this.redrawPin();
    if (this.pin.length < 4) return;
    this.busy = true;
    const ok = await checkSecret(this.pin, this.cfg.pin);
    this.busy = false;
    if (ok){ this.setFails({ count:0, until:0 }); this.hide(); return this.afterUnlock(); }
    const f = this.fails(); f.count++;
    if (f.count >= 5) f.until = Date.now() + Math.min(15 * 60000, 30000 * Math.pow(2, f.count - 5));
    this.setFails(f); this.pin = ''; this.msg = f.until > Date.now() ? '' : 'Wrong PIN (' + (5 - f.count) + ' tries left)';
    this.noFocus = true; this.draw(); this.noFocus = false;
    if (f.until > Date.now()) this.tickWait();
  },
  tickWait(){ clearInterval(this.waitTimer); this.waitTimer = setInterval(() => { if (!document.getElementById('lockScreen') || this.waitMs() <= 0){ clearInterval(this.waitTimer); this.noFocus = true; this.draw(); this.noFocus = false; return; } const m = document.getElementById('lkMsg'); if (m) m.textContent = 'Too many attempts. Try again in ' + Math.ceil(this.waitMs() / 1000) + ' s.'; }, 1000); },
  async bioUnlock(){
    try { if (await Bio.verify(this.cfg.bio.id)){ this.hide(); return this.afterUnlock(); } }
    catch(e){ this.msg = 'Biometrics did not work. Use your PIN.'; this.noFocus = true; this.draw(); this.noFocus = false; }
  },
  async recover(){
    const code = (document.getElementById('lkRecovery').value || '').trim().toUpperCase();
    if (!(await checkSecret(code, this.cfg && this.cfg.recovery))){ this.msg = 'That recovery code is not right.'; this.draw(); return; }
    this.cfg = null; await Store.putMeta('appLock', null); this.setFails({ count:0, until:0 });
    this.hide(); toast('App lock turned off. Set a new PIN in the Data tab.'); this.afterUnlock();
  },
  fieldError(id, text){
    const err = document.getElementById(id === 'lkEmail' ? 'lkEmailErr' : 'lkPwErr'), inp = document.getElementById(id);
    if (err) err.textContent = text; if (inp) inp.setAttribute('aria-invalid', String(!!text));
  },
  /* Checks the form fields; returns the values or null (with the problem shown next to the field). */
  readCreds(needPassword = true){
    const email = val('lkEmail').trim(), pw = document.getElementById('lkPassword').value;
    this.fieldError('lkEmail', !email ? 'Enter your email address.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Enter a valid email address.' : '');
    if (needPassword) this.fieldError('lkPassword', pw ? '' : 'Enter your password.');
    const bad = !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (needPassword && !pw);
    if (bad){ (document.getElementById('lkEmailErr').textContent ? document.getElementById('lkEmail') : document.getElementById('lkPassword')).focus(); return null; }
    return { email, pw };
  },
  busyButton(on){
    const b = document.getElementById('lkSubmit'); if (!b) return;
    b.disabled = on; b.classList.toggle('loading', on); b.querySelector('.lk-label').textContent = on ? 'Signing in…' : 'Log In';
  },
  say(text){ const m = document.getElementById('lkMsg'); if (m) m.textContent = text; },
  async resetPassword(){
    const c = this.readCreds(false); if (!c) return;
    try { await Sync.resetPassword(c.email); this.say('If that account exists, a reset link is on its way.'); } catch(e){ this.say(e.message || 'Could not send the email.'); }
  },
  async signUp(){
    if (this.locked){ this.say('Sign up is not available while the app is locked.'); return; }
    const c = this.readCreds(true); if (!c) return;
    if (c.pw.length < 8){ this.fieldError('lkPassword', 'Use at least 8 characters.'); return; }
    this.say('Creating account…');
    Sync.keep = !!(document.getElementById('lkKeep') && document.getElementById('lkKeep').checked);
    try { const r = await Sync.signUp(c.email, c.pw); if (r === 'signed-in'){ await Sync.detectRole(); this.hide(); this.afterUnlock(true); } else this.say('Check your email and click the confirmation link, then log in here.'); }
    catch(e){ this.say(e.message || 'Could not create the account.'); }
  },
  async signIn(){
    const c = this.readCreds(true); if (!c) return;
    const { email, pw } = c;
    this.busyButton(true); this.say('');
    if (this.locked && !Sync.linkedId){ this.busyButton(false); this.say('Use your PIN.'); return; }
    try { await Sync.signIn(email, pw, document.getElementById('lkKeep').checked, { onlyUserId:this.locked ? Sync.linkedId : undefined }); await Sync.detectRole(); }
    catch(e){ this.busyButton(false); this.say(e.status === 400 ? 'Email or password is wrong, or the email is not confirmed yet.' : (e.message || 'Could not sign in')); return; }
    const actual = Sync.role === 'assistant' ? 'assistant' : 'owner';
    if (this.role !== 'client' && this.role !== actual){ toast(actual === 'assistant' ? 'This account is an assistant account. Signed in as Assistant.' : 'This account is a Head Coach account. Signed in as Head Coach.'); this.role = actual; try { localStorage.setItem(LAST_ROLE_KEY, actual); } catch {} }
    this.hide(); this.afterUnlock(true);
  },
  /* Success from any route lands on the Today screen (assistants see only their clients there). */
  afterUnlock(signedIn){
    if (S.bootState !== 'ready') return;   // a load failure or reconnect screen stays on top
    if (!sessionOpen()){ S.view = 'dashboard'; S.sub = 'today'; S.sel = {}; }
    if (typeof S.clients === 'object') render({ keepScroll:true });
    if (signedIn) toast(Sync.role === 'assistant' ? 'Welcome, assistant' : 'Signed in');
  },
  setupAutoLock(){
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden'){ this.hiddenAt = Date.now(); return; }
      const mins = this.cfg && Number(this.cfg.autoMinutes);
      if (this.enabled() && mins > 0 && this.hiddenAt && Date.now() - this.hiddenAt > mins * 60000 && !document.getElementById('lockScreen')) this.show({ view:'pin' });
    });
    window.addEventListener('online', () => this.updatePill()); window.addEventListener('offline', () => this.updatePill());
  }
};
/* ---- Data tab: App lock settings ---- */
function lockPanelHTML(){
  const on = Lock.enabled(), bio = Lock.cfg && Lock.cfg.bio;
  return `<div class="panel stack" id="lockPanel"><h3>App lock</h3>
    <p class="small muted">A PIN (and optional fingerprint or face unlock) hides the app when you leave it. It protects against someone glancing at an unlocked phone; it does not encrypt your data, so keep your device passcode on too.</p>
    <p class="small"><strong>${on ? 'PIN lock is on.' : 'PIN lock is off.'}</strong>${bio ? ' Biometric unlock is on.' : ''}</p>
    <div class="row"><button type="button" class="btn primary sm" id="lockSetPin">${on ? 'Change PIN' : 'Set a PIN'}</button>
      ${on ? '<button type="button" class="btn ghost sm" id="lockNow">Lock now</button><button type="button" class="btn ghost sm" id="lockOff">Turn off</button>' : ''}
      ${on && Lock.bioReady ? `<button type="button" class="btn ghost sm" id="lockBio">${bio ? 'Remove biometrics' : 'Set up biometrics'}</button>` : ''}</div>
    ${on ? `<label class="field" style="max-width:260px"><span>Lock automatically after leaving the app for</span><select id="lockAuto">${[[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [0, 'Never']].map(([v, l]) => `<option value="${v}" ${Number(Lock.cfg.autoMinutes ?? 5) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}</div>`;
}
function wireLockPanel(m){
  const set = document.getElementById('lockSetPin');
  if (set) set.onclick = () => {
    const ask = Lock.enabled() ? '<label class="field"><span>Current PIN</span><input type="password" id="lpOld" inputmode="numeric" maxlength="4" autocomplete="off"></label>' : '';
    dialog(Lock.enabled() ? 'Change PIN' : 'Set a PIN', `${ask}<label class="field"><span>New 4-digit PIN</span><input type="password" id="lpNew" inputmode="numeric" maxlength="4" autocomplete="new-password"></label><label class="field"><span>Repeat PIN</span><input type="password" id="lpNew2" inputmode="numeric" maxlength="4" autocomplete="new-password"></label><p class="small muted">Avoid obvious PINs such as 1234 or your birth year.</p>`, [{label:'Cancel'}, {label:'Save PIN', kind:'primary', onClick: async () => {
      if (Lock.enabled() && !(await checkSecret(val('lpOld'), Lock.cfg.pin))){ toast('Current PIN is not right'); return false; }
      const p = val('lpNew');
      if (!/^\d{4}$/.test(p)){ toast('Use exactly 4 digits'); return false; }
      if (p !== val('lpNew2')){ toast('The two PINs do not match'); return false; }
      if (['0000', '1111', '1234', '4321', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'].includes(p)){ toast('That PIN is too easy to guess'); return false; }
      const first = !Lock.enabled(); let code = '';
      const next = { ...(Lock.cfg || {}), pin:await makeSecret(p), autoMinutes:Lock.cfg && Lock.cfg.autoMinutes != null ? Lock.cfg.autoMinutes : 5 };
      if (first || !next.recovery){ code = newRecoveryCode(); next.recovery = await makeSecret(code); }
      Lock.cfg = next; try { await Lock.save(); } catch(e){ showSaveError(e); return false; }
      Lock.setFails({ count:0, until:0 }); Audit.log('lock-set');
      if (code) setTimeout(() => dialog('Save your recovery code', `<p>If you forget the PIN, this code turns the lock off without touching your data. <strong>It is shown only once.</strong> Write it down or store it in a password manager.</p><p class="lk-code" style="font-size:1.3rem;font-weight:700;letter-spacing:.08em;text-align:center">${esc(code)}</p>`, [{label:'I saved it', kind:'primary'}], { dismissible:false }), 80);
      render({ keepScroll:true });
    }}]);
  };
  const now = document.getElementById('lockNow'); if (now) now.onclick = () => Lock.show({ view:'pin' });
  const off = document.getElementById('lockOff');
  if (off) off.onclick = () => dialog('Turn off the lock?', '<label class="field"><span>Enter your PIN to confirm</span><input type="password" id="loPin" inputmode="numeric" maxlength="4" autocomplete="off"></label>', [{label:'Cancel'}, {label:'Turn off', kind:'danger', onClick: async () => {
    if (!(await checkSecret(val('loPin'), Lock.cfg.pin))){ toast('That PIN is not right'); return false; }
    Lock.cfg = null; await Store.putMeta('appLock', null); Audit.log('lock-off'); render({ keepScroll:true });
  }}]);
  const bio = document.getElementById('lockBio');
  if (bio) bio.onclick = async () => {
    try {
      if (Lock.cfg.bio){ delete Lock.cfg.bio; await Lock.save(); toast('Biometrics removed'); }
      else { Lock.cfg.bio = { id:await Bio.register() }; await Lock.save(); toast('Biometric unlock is on'); }
      render({ keepScroll:true });
    } catch(e){ toast('Could not set up biometrics' + (e && e.name === 'NotAllowedError' ? ' (cancelled)' : '')); }
  };
  const auto = document.getElementById('lockAuto'); if (auto) auto.onchange = async () => { Lock.cfg.autoMinutes = Number(auto.value); await Lock.save(); };
}

