/**
 * The setup page.
 *
 * Stremio addons are configured by handing the user a URL with their settings
 * encoded into it. This page builds that URL in the browser: nothing is stored
 * server-side, so one deployment serves everyone and no settings of any user
 * touch the disk.
 *
 * The page deliberately warns about the URL being sensitive. Upstream addon
 * URLs routinely embed API keys, so the generated link is a credential.
 */
import type { Config } from './config.js';

export function configurePage(base: Config): string {
  const defaults = {
    maxResults: base.maxResults,
    autoShift: base.autoShift,
    removeHearingImpaired: base.removeHearingImpaired,
    fixUppercase: base.fixUppercase,
    fixOcr: base.fixOcr,
    fixOverlaps: base.fixOverlaps,
    demoteForced: base.demoteForced,
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SubRanker — setup</title>
<style>
  :root { color-scheme: dark; --bg:#0f1115; --card:#171a21; --line:#272c36; --fg:#e8eaed; --dim:#9aa3b2; --accent:#6c5cff; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  p.sub { color: var(--dim); margin: 0 0 28px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:18px; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); margin:0 0 14px; }
  label { display:block; margin-bottom:6px; font-weight:600; }
  input[type=text], input[type=number], textarea {
    width:100%; background:#0e1016; border:1px solid var(--line); color:var(--fg);
    border-radius:8px; padding:10px 12px; font:inherit; font-family:ui-monospace,monospace; font-size:13px;
  }
  textarea { min-height:78px; resize:vertical; }
  .hint { color:var(--dim); font-size:13px; margin-top:6px; }
  .row { display:flex; align-items:flex-start; gap:10px; padding:9px 0; border-top:1px solid var(--line); }
  .row:first-of-type { border-top:none; }
  .row input { margin-top:3px; }
  .row .t { font-weight:600; }
  .row .d { color:var(--dim); font-size:13px; }
  button { background:var(--accent); color:#fff; border:0; border-radius:9px; padding:11px 18px; font:inherit; font-weight:600; cursor:pointer; }
  button.ghost { background:#222735; }
  #out { display:none; }
  code { background:#0e1016; border:1px solid var(--line); border-radius:6px; padding:2px 6px; font-size:12.5px; word-break:break-all; }
  .warn { border-left:3px solid #d08a2a; padding-left:12px; color:#e5c07b; font-size:13.5px; }
  ol { padding-left:20px; } li { margin:6px 0; }
</style>
</head>
<body><div class="wrap">
<h1>SubRanker</h1>
<p class="sub">Ranks, verifies and repairs subtitles so the best match for what you are playing is first.</p>

<div class="card">
  <h2>Upstream subtitle addons</h2>
  <label for="ups">One URL per line, without <code>/manifest.json</code></label>
  <textarea id="ups" spellcheck="false" placeholder="https://subsense.example/en&#10;https://opensubtitles.example/en/..."></textarea>
  <p class="hint">Several are queried in parallel and merged. Worth doing: providers expose different metadata, and some report an exact file hash while aggregators cover more sources.</p>
</div>

<div class="card">
  <h2>Options</h2>
  <div class="row"><input type="checkbox" id="autoShift" ${defaults.autoShift ? 'checked' : ''}><div><div class="t">Fix timing</div><div class="d">Serve a corrected file when a subtitle is late or drifting.</div></div></div>
  <div class="row"><input type="checkbox" id="fixOverlaps" ${defaults.fixOverlaps ? 'checked' : ''}><div><div class="t">Merge overlapping cues</div><div class="d">Stops two lines being drawn on top of each other.</div></div></div>
  <div class="row"><input type="checkbox" id="removeHearingImpaired" ${defaults.removeHearingImpaired ? 'checked' : ''}><div><div class="t">Remove hearing-impaired tags</div><div class="d">Strips <code>[DOOR CREAKS]</code> and speaker labels, turning an SDH track into an ordinary subtitle. Rewrites dialogue, so opt in deliberately.</div></div></div>
  <div class="row"><input type="checkbox" id="fixOcr" ${defaults.fixOcr ? 'checked' : ''}><div><div class="t">Repair OCR damage</div><div class="d">Fixes the characters scanners confuse, such as <code>l</code> for <code>I</code>.</div></div></div>
  <div class="row"><input type="checkbox" id="fixUppercase" ${defaults.fixUppercase ? 'checked' : ''}><div><div class="t">Fix shouting</div><div class="d">Converts files written entirely in capitals to sentence case.</div></div></div>
  <div class="row"><input type="checkbox" id="demoteForced" ${defaults.demoteForced ? 'checked' : ''}><div><div class="t">Demote forced tracks</div><div class="d">Signs-only tracks rank below full subtitles.</div></div></div>
  <div class="row"><div style="flex:1"><label for="maxResults">Maximum results</label><input type="number" id="maxResults" min="0" max="50" value="${defaults.maxResults}"><div class="hint">0 means no limit. A short list helps on clients that show every row with the same name.</div></div></div>
</div>

<div class="card">
  <h2>Separate row per position</h2>
  <div class="row"><input type="checkbox" id="splitRanks"><div><div class="t">Generate one install link per position</div><div class="d">Some clients label every row with the addon's name and ignore the per-subtitle label, so all rows look identical. Installing several instances gives each row its own name.</div></div></div>
</div>

<p><button id="go">Generate install link</button></p>

<div class="card" id="out">
  <h2>Install</h2>
  <div id="links"></div>
  <p class="warn">Treat these links as secret. Upstream addon URLs often contain an API key, and it is encoded into the link.</p>
</div>

<script>
(function () {
  var origin = location.origin;
  function b64url(s) {
    return btoa(unescape(encodeURIComponent(s))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
  }
  document.getElementById('go').addEventListener('click', function () {
    var ups = document.getElementById('ups').value.split(/\\n+/)
      .map(function (s) { return s.trim().replace(/\\/manifest\\.json$/, '').replace(/\\/+$/, ''); })
      .filter(function (s) { return /^https?:\\/\\//.test(s); });
    var out = document.getElementById('out');
    var links = document.getElementById('links');
    if (!ups.length) {
      links.textContent = '';
      var warn = document.createElement('p');
      warn.className = 'warn';
      warn.textContent = 'Add at least one upstream URL.';
      links.appendChild(warn);
      out.style.display = 'block';
      return;
    }

    var cfg = {
      upstreams: ups,
      maxResults: parseInt(document.getElementById('maxResults').value, 10) || 0,
      autoShift: document.getElementById('autoShift').checked,
      fixOverlaps: document.getElementById('fixOverlaps').checked,
      removeHearingImpaired: document.getElementById('removeHearingImpaired').checked,
      fixOcr: document.getElementById('fixOcr').checked,
      fixUppercase: document.getElementById('fixUppercase').checked,
      demoteForced: document.getElementById('demoteForced').checked
    };
    var seg = b64url(JSON.stringify(cfg));

    // Built with DOM nodes rather than innerHTML. The values here are
    // base64url and an origin, so concatenation would be safe today, but a
    // page that renders user-derived strings should not depend on that
    // staying true.
    links.textContent = '';
    function codeLine(text) {
      var code = document.createElement('code');
      code.textContent = text;
      return code;
    }
    if (document.getElementById('splitRanks').checked) {
      var n = cfg.maxResults > 0 ? Math.min(cfg.maxResults, 10) : 6;
      var ol = document.createElement('ol');
      for (var i = 1; i <= n; i++) {
        var li = document.createElement('li');
        li.appendChild(codeLine(origin + '/c/' + seg + '/r/' + i + '/manifest.json'));
        ol.appendChild(li);
      }
      links.appendChild(ol);
      var note = document.createElement('p');
      note.className = 'hint';
      note.textContent = 'Install all of them, in order. Each supplies one position and carries its own name.';
      links.appendChild(note);
    } else {
      var p = document.createElement('p');
      p.appendChild(codeLine(origin + '/c/' + seg + '/manifest.json'));
      links.appendChild(p);
    }
    out.style.display = 'block';
  });
})();
</script>
</div></body></html>`;
}
