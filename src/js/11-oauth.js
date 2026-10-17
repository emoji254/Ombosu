/* ---------------------------------------------------------------
   "Continue with Google" (Supabase OAuth, PKCE flow). Needs Google enabled as a provider in Supabase
   (Authentication > Providers > Google) and this page's address in the redirect URL list. The browser leaves for
   Google and comes back with a one-time code that is exchanged for a session; no password is involved.
----------------------------------------------------------------*/
Object.assign(Sync, {
  async oauth(provider){
    const back = this.redirect();
    if (!back) throw new Error('Google sign-in needs the app to be opened from a web address (not a file).');
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    sessionStorage.setItem('nyaega:pkce', verifier);
    location.href = SUPABASE_URL + '/auth/v1/authorize?provider=' + encodeURIComponent(provider) + '&redirect_to=' + encodeURIComponent(back) + '&code_challenge=' + challenge + '&code_challenge_method=s256';
  },
  async finishOAuth(code, opts = {}){
    const verifier = sessionStorage.getItem('nyaega:pkce'); sessionStorage.removeItem('nyaega:pkce');
    if (!verifier) throw new Error('The sign-in was started in a different window. Please try again.');
    this.keep = true;   // OAuth users expect to stay signed in
    const d = await this.raw('/auth/v1/token?grant_type=pkce', { method:'POST', body:{ auth_code:code, code_verifier:verifier } });
    if (opts.onlyUserId && !(d.user && d.user.id === opts.onlyUserId)){
      try { await this.raw('/auth/v1/logout', { method:'POST', token:d.access_token }); } catch {}
      throw new Error('This device is locked to another account. Use your PIN.');
    }
    await this.afterSignIn(d);
    await this.detectRole();
  }
});
/* Reads (and removes from the address bar) the result of a Google sign-in redirect. */
function takeOAuthResult(){
  try {
    const u = new URL(location.href), code = u.searchParams.get('code');
    const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
    const error = u.searchParams.get('error_description') || u.searchParams.get('error') || hash.get('error_description') || hash.get('error');
    if (!code && !error) return null;
    ['code', 'error', 'error_code', 'error_description'].forEach(k => u.searchParams.delete(k));
    history.replaceState(null, '', u.pathname + (u.search || ''));
    return { code, error };
  } catch { return null; }
}
async function completeOAuth(res){
  if (!res) return;
  if (res.error || !res.code){ toast('Sign-in did not finish: ' + (res.error || 'no code returned')); return; }
  if (Lock.locked && !Sync.linkedId){ toast('This device is locked. Use your PIN.'); return; }
  try { await Sync.finishOAuth(res.code, { onlyUserId:Lock.locked ? Sync.linkedId : undefined }); if (Lock.locked) Lock.hide(); toast(Sync.role === 'assistant' ? 'Welcome, assistant' : 'Signed in'); S.view = 'dashboard'; S.sub = 'today'; S.sel = {}; render(); }
  catch(e){ toast('Sign-in failed: ' + (e.message || 'unknown error')); }
}

