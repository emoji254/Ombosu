/* PREVIEW ONLY: "kg" spaced out in Previous ("40 kg × 10"), after each render. */
(() => {
  const decorate = () => {
    if (!(S.sel && S.sel.draft)) return;
    document.querySelectorAll('.exblock .setrow .last').forEach(last => { last.textContent = last.textContent.replace(/(\d)kg ×/, '$1 kg ×'); });
  };
  const orig = window.render;
  window.render = function (...a) { const r = orig.apply(this, a); decorate(); return r; };
})();
