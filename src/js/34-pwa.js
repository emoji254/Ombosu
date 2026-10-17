/* ---------------------------------------------------------------
   Installable app. Only active on the built site (served over http/https with a manifest and sw.js).
   A new version waits until the coach taps "Reload to update"; nothing reloads by itself mid-session.
----------------------------------------------------------------*/
function registerServiceWorker(){
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http') || !document.querySelector('link[rel="manifest"]')) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const check = () => { if (reg.waiting && navigator.serviceWorker.controller) showUpdateReady(reg); };
    check();
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') check(); }); });
    setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
  }).catch(e => console.warn('Offline mode is not available', e));
}
function showUpdateReady(reg){
  if (document.getElementById('updateBar')) return;
  const bar = document.createElement('div'); bar.id = 'updateBar'; bar.className = 'update-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>Update ready.</span><button type="button" class="btn sm primary" id="updateNow">Reload to update</button><button type="button" class="btn sm ghost" id="updateLater">Later</button>';
  document.body.appendChild(bar);
  bar.querySelector('#updateLater').onclick = () => bar.remove();
  bar.querySelector('#updateNow').onclick = () => { try { flushWorkoutAutosave(); } catch {} reg.waiting && reg.waiting.postMessage('skipWaiting'); };
}

