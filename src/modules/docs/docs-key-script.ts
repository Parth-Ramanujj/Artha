/** Served at /api/docs-key.js: adds a key box to Swagger UI that loads only that key's APIs. */
export const DOCS_KEY_SCRIPT = `
(function () {
  function start() {
    var ui = window.ui;
    if (!ui) return setTimeout(start, 200);
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:12px 20px;background:#1b1b1b;font-family:sans-serif';
    var input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Paste your API key to see your APIs';
    input.style.cssText = 'flex:1;padding:8px';
    var btn = document.createElement('button');
    btn.textContent = 'Show my APIs';
    btn.style.cssText = 'padding:8px 14px;cursor:pointer';
    var msg = document.createElement('span');
    msg.style.cssText = 'color:#fff;font-size:13px';
    bar.append(input, btn, msg);
    document.body.insertBefore(bar, document.body.firstChild);
    function load() {
      var key = input.value.trim();
      if (!key) return;
      msg.textContent = 'Loading...';
      fetch('/api/docs-spec', { headers: { 'x-api-key': key } })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Invalid or expired key' : 'Error ' + r.status);
          return r.json();
        })
        .then(function (spec) {
          ui.specActions.updateJsonSpec(spec);
          ui.preauthorizeApiKey('X-API-Key', key);
          msg.textContent = Object.keys(spec.paths).length + ' endpoints for this key';
        })
        .catch(function (e) { msg.textContent = e.message; });
    }
    btn.onclick = load;
    input.onkeydown = function (e) { if (e.key === 'Enter') load(); };
  }
  start();
})();
`;
