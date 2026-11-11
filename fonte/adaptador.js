/* ds-wm — adaptador: faz o runtime rodar fora do Google Apps Script.
   Configure ANTES de carregar ds.js (tudo opcional):
     window.DS_CONFIG = {
       titulo: 'Meu projeto',            // aba do navegador: "<página> · <titulo>"
       servidor: function (fn, params) {  // como as páginas buscam dados; devolve valor ou Promise
         return fetch('/api/' + fn, { method: 'POST', body: JSON.stringify(params) }).then(function (r) { return r.json(); });
       }
     };
   No Apps Script, sem DS_CONFIG.servidor, DS.servidor usa google.script.run. */
(function () {
  var cfg = window.DS_CONFIG || {};
  if (!window.DS_URL_BASE) window.DS_URL_BASE = location.origin + location.pathname;
  if (!window.DS_URL_PARAMS) {
    var p = {};
    try { new URLSearchParams(location.search).forEach(function (v, k) { p[k] = v; }); } catch (e) { /* sem restaurar estado pela URL */ }
    window.DS_URL_PARAMS = p;
  }
  if (cfg.titulo) window.DS.TITULO = cfg.titulo;
})();
