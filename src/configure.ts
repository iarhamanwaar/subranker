/**
 * The setup page.
 *
 * Stremio addons are configured by handing the user a URL with their settings
 * encoded into it. This page builds that URL in the browser: nothing is stored
 * server-side, so one deployment serves everyone and no user's settings touch
 * the disk.
 *
 * Design note: the page presents itself as a subtitle file. Each step is a cue
 * block with a real timecode, because the steps genuinely are a sequence, and
 * the hero renders a caption the way a player would. The vocabulary comes from
 * the subject rather than from decoration — timecode amber and title-safe
 * magenta are the colours of a broadcast overlay.
 */
import type { Config } from './config.js';
import { logoSvg } from './logo.js';

/**
 * Upstream addons offered as one-tap presets.
 *
 * Every entry was checked against a live subtitle request, not just its
 * manifest: a manifest can answer 200 while the subtitles endpoint returns
 * nothing, which is exactly how a bare, unconfigured addon fails. Addons that
 * require their own configuration first are deliberately absent — a preset
 * that hands someone a broken link is worse than no preset.
 */
export interface Preset {
  id: string;
  name: string;
  blurb: string;
  /** `{lang}` is replaced with the chosen language code. */
  template: string;
  /** Whether the URL varies by language. */
  perLanguage: boolean;
}

export const PRESETS: Preset[] = [
  {
    id: 'subsense',
    name: 'SubSense',
    blurb: 'Ten sources at once, including AnimeTosho',
    template: 'https://subsense.nepiraw.com/{lang}',
    perLanguage: true,
  },
  {
    id: 'os-v3-plus',
    name: 'OpenSubtitles v3+',
    blurb: 'Reports an exact file match, which outranks everything',
    template:
      'https://opensubtitles.stremio.homes/{lang}/ai-translated=false|from=all|auto-adjustment=true',
    perLanguage: true,
  },
  {
    id: 'os-v3',
    name: 'OpenSubtitles v3',
    blurb: "Stremio's official addon",
    template: 'https://opensubtitles-v3.strem.io',
    perLanguage: false,
  },
];

const LANGUAGES: Array<[string, string]> = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['ar', 'Arabic'],
  ['hi', 'Hindi'],
  ['ur', 'Urdu'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh', 'Chinese'],
  ['ru', 'Russian'],
  ['tr', 'Turkish'],
];

export function configurePage(base: Config): string {
  const d = {
    maxResults: base.maxResults,
    autoShift: base.autoShift,
    removeHearingImpaired: base.removeHearingImpaired,
    fixUppercase: base.fixUppercase,
    fixOcr: base.fixOcr,
    fixOverlaps: base.fixOverlaps,
    demoteForced: base.demoteForced,
  };
  const on = (v: boolean) => (v ? ' checked' : '');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SubRanker — set up</title>
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chivo+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{
  /* Colours of a broadcast overlay: letterbox black, caption white,
     timecode amber, title-safe magenta. */
  --frame:#0A0B0D; --panel:#141619; --raise:#1B1E23; --line:#262A31;
  --caption:#F5F6F7; --dim:#8A919D; --tc:#FFC24B; --safe:#FF3D7F;
  --mono:"Chivo Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--frame);color:var(--caption);font:16px/1.6 var(--sans)}
.wrap{max-width:820px;margin:0 auto;padding:0 20px 96px}

/* hero: a letterboxed plate with a caption drawn on it */
.plate{position:relative;margin:28px 0 8px;border:1px solid var(--line);border-radius:14px;
  background:radial-gradient(120% 140% at 50% 0%,#191C22 0%,#0C0E11 70%);overflow:hidden}
.plate::after{content:"";position:absolute;inset:14px;border:1px dashed rgba(255,61,127,.22);
  border-radius:8px;pointer-events:none}
.plate-inner{aspect-ratio:16/7;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:18px;padding:34px 24px}
.mark{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:auto}
.mark svg{display:block}
.mark span{font:600 12px/1 var(--mono);letter-spacing:.3em;text-transform:uppercase;color:var(--dim)}
.cap{margin-top:auto;font-size:clamp(19px,3.4vw,30px);font-weight:600;letter-spacing:-.01em;text-align:center;
  max-width:24ch;text-shadow:0 2px 0 #000,0 0 10px rgba(0,0,0,.85);transition:opacity .45s}
.cap.out{opacity:0}
.badge{position:absolute;top:14px;left:16px;font:600 11px/1 var(--mono);letter-spacing:.16em;
  text-transform:uppercase;color:var(--tc)}
.rec{position:absolute;top:13px;right:16px;font:400 11px/1 var(--mono);color:var(--dim)}

h1{font:600 clamp(30px,5vw,46px)/1.02 var(--sans);letter-spacing:-.035em;margin:26px 0 10px}
h1 em{font-style:normal;color:var(--safe)}
.lede{color:var(--dim);max-width:56ch;margin:0 0 30px}

.modes{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:999px;
  padding:4px;gap:4px;margin-bottom:26px}
.modes button{appearance:none;border:0;background:transparent;color:var(--dim);font:600 13px var(--sans);
  padding:8px 16px;border-radius:999px;cursor:pointer}
.modes button[aria-pressed=true]{background:var(--raise);color:var(--caption)}
.modes button:focus-visible{outline:2px solid var(--safe);outline-offset:2px}

.cue{display:grid;grid-template-columns:104px 1fr;gap:20px;padding:26px 0;border-top:1px solid var(--line)}
.cue-meta{font:400 12px/1.5 var(--mono);color:var(--tc)}
.cue-meta b{display:block;font-weight:600;font-size:22px;color:var(--caption);margin-bottom:4px}
.cue h2{font:600 19px/1.3 var(--sans);letter-spacing:-.015em;margin:0 0 6px}
.cue p.note{color:var(--dim);font-size:14px;margin:0 0 16px;max-width:54ch}

.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.chip{display:inline-flex;align-items:center;gap:9px;background:var(--panel);border:1px solid var(--line);
  color:var(--caption);border-radius:999px;padding:9px 15px 9px 11px;font:600 13px var(--sans);
  cursor:pointer;text-align:left}
.chip:hover{border-color:#3A404A}
.chip:focus-visible{outline:2px solid var(--safe);outline-offset:2px}
.chip .pl{flex:none;width:18px;height:18px;border-radius:50%;background:var(--safe);color:#12070C;
  display:grid;place-items:center;font:700 13px/1 var(--sans)}
.chip[aria-pressed=true]{border-color:var(--safe);background:rgba(255,61,127,.10)}
.chip[aria-pressed=true] .pl{background:var(--caption);color:#0A0B0D}
.chip small{display:block;color:var(--dim);font-weight:400;font-size:11.5px}

label.fld{display:block;font:600 13px var(--sans);margin:0 0 7px}
select,input[type=number],textarea{background-color:#0D0F12;border:1px solid var(--line);
  color:var(--caption);border-radius:10px;padding:11px 12px;font:400 13px/1.5 var(--mono)}
textarea{width:100%;min-height:88px;resize:vertical}
select,input[type=number]{min-width:200px}
/* The native arrow sits hard against the right edge and is styled
   inconsistently across browsers, so it is replaced with a chevron that has
   room around it. padding-right reserves that room; without it the text runs
   underneath the arrow on long option names. */
select{
  appearance:none;-webkit-appearance:none;-moz-appearance:none;
  padding-right:42px;
  background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5 6 6.5l5-5' stroke='%238A919D' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat;
  background-position:right 15px center;
  background-size:12px 8px;
}
select::-ms-expand{display:none}
:is(select,input,textarea):focus-visible{outline:2px solid var(--safe);outline-offset:1px;border-color:transparent}
.hint{color:var(--dim);font-size:12.5px;margin:7px 0 0}

.opt{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-top:1px solid #1E2127}
.opt:first-of-type{border-top:0}
.opt input{margin:4px 0 0;accent-color:var(--safe);width:17px;height:17px}
.opt .t{font-weight:600;font-size:14.5px}
.opt .d{color:var(--dim);font-size:13px}
.opt code{font:400 12.5px var(--mono);color:var(--tc)}

.go{appearance:none;border:0;background:var(--safe);color:#12070C;font:700 15px var(--sans);
  padding:14px 24px;border-radius:11px;cursor:pointer;margin-top:8px}
.go:hover{filter:brightness(1.07)}
.go:focus-visible{outline:2px solid var(--caption);outline-offset:3px}

#out{display:none;margin-top:16px}
.link{display:flex;gap:10px;align-items:center;background:#0D0F12;border:1px solid var(--line);
  border-radius:10px;padding:12px}
.link code{flex:1;font:400 12.5px/1.5 var(--mono);color:var(--tc);word-break:break-all}
.copy{appearance:none;border:1px solid var(--line);background:var(--raise);color:var(--caption);
  border-radius:8px;padding:8px 13px;font:600 12.5px var(--sans);cursor:pointer;white-space:nowrap}
.copy:focus-visible{outline:2px solid var(--safe);outline-offset:2px}
.warn{border-left:2px solid var(--tc);padding:2px 0 2px 12px;color:#E8C88A;font-size:13px;margin-top:14px}
.err{color:var(--safe);font-size:13.5px;margin:10px 0 0}

.adv{display:none}
body[data-mode=advanced] .adv{display:grid}
footer{border-top:1px solid var(--line);margin-top:40px;padding-top:18px;color:var(--dim);font-size:12.5px}

@media (max-width:640px){
  .cue{grid-template-columns:1fr;gap:10px}
  .cue-meta{display:flex;align-items:baseline;gap:10px}
  .cue-meta b{margin:0;font-size:17px}
}
@media (prefers-reduced-motion:reduce){ .cap{transition:none} }
</style>
</head>
<body data-mode="simple">
<div class="wrap">

  <div class="plate">
    <span class="badge">SubRanker</span>
    <span class="rec">01:00:00:00</span>
    <div class="plate-inner">
      <div class="mark">${logoSvg(84, false)}<span>SubRanker</span></div>
      <div class="cap" id="cap">The right subtitle, first in the list.</div>
    </div>
  </div>

  <h1>Stop guessing which subtitle <em>works</em>.</h1>
  <p class="lede">SubRanker sits in front of the subtitle addons you already use. It ranks them against the release you are actually playing, drops the dead ones, and repairs the rest.</p>

  <div class="modes" role="group" aria-label="Detail level">
    <button type="button" id="mSimple" aria-pressed="true">Simple</button>
    <button type="button" id="mAdv" aria-pressed="false">Advanced</button>
  </div>

  <section class="cue">
    <div class="cue-meta"></div>
    <div>
      <h2>Pick your sources</h2>
      <p class="note">Tap to add. Several are queried at once and merged, which is worth doing because they carry different information — one may know the exact file, another simply covers more ground.</p>
      <div class="chips" id="chips"></div>
      <label class="fld" for="lang">Subtitle language</label>
      <select id="lang">${LANGUAGES.map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select>
      <p class="hint">Applies to the sources above. Ones without a language setting ignore it.</p>
      <div style="margin-top:16px">
        <label class="fld" for="ups">Sources to use</label>
        <textarea id="ups" spellcheck="false" placeholder="Tap a source above, or paste an addon URL here — one per line."></textarea>
        <p class="note">Any subtitle addon works here, including the AI translation ones. They need their own settings, so paste the configured URL they gave you rather than their plain address.</p>
      </div>
    </div>
  </section>

  <section class="cue adv">
    <div class="cue-meta"></div>
    <div>
      <h2>Repairs</h2>
      <p class="note">Applied to the file before it reaches your player.</p>
      <div class="opt"><input type="checkbox" id="autoShift"${on(d.autoShift)}><div><div class="t">Fix timing</div><div class="d">Corrects subtitles that run late or drift out of sync.</div></div></div>
      <div class="opt"><input type="checkbox" id="fixOverlaps"${on(d.fixOverlaps)}><div><div class="t">Separate overlapping lines</div><div class="d">Stops two lines being drawn on top of each other when people talk at once.</div></div></div>
      <div class="opt"><input type="checkbox" id="removeHearingImpaired"${on(d.removeHearingImpaired)}><div><div class="t">Remove sound descriptions</div><div class="d">Strips <code>[DOOR CREAKS]</code> and speaker names. Rewrites the dialogue, so turn it on deliberately.</div></div></div>
      <div class="opt"><input type="checkbox" id="fixOcr"${on(d.fixOcr)}><div><div class="t">Repair scanning errors</div><div class="d">Fixes characters that scanners confuse, such as <code>l</code> for <code>I</code>.</div></div></div>
      <div class="opt"><input type="checkbox" id="fixUppercase"${on(d.fixUppercase)}><div><div class="t">Fix shouting</div><div class="d">Converts files written entirely in capitals to normal sentences.</div></div></div>
    </div>
  </section>

  <section class="cue adv">
    <div class="cue-meta"></div>
    <div>
      <h2>What you see</h2>
      <p class="note">How much of the ranked list reaches your player.</p>
      <div class="opt"><input type="checkbox" id="demoteForced"${on(d.demoteForced)}><div><div class="t">Push signs-only tracks down</div><div class="d">Tracks that translate only signs look broken if picked by mistake.</div></div></div>
      <div style="margin-top:14px">
        <label class="fld" for="maxResults">Show at most</label>
        <input type="number" id="maxResults" min="0" max="50" value="${d.maxResults}">
        <p class="hint">0 shows everything. Many players label every row identically, so a short list is easier to use than a long one.</p>
      </div>
    </div>
  </section>

  <section class="cue">
    <div class="cue-meta"></div>
    <div>
      <h2>Install</h2>
      <p class="note">Your settings live inside the link, so nothing is kept here.</p>
      <button class="go" type="button" id="go">Create install link</button>
      <p class="err" id="err" hidden></p>
      <div id="out">
        <div class="link"><code id="url"></code><button class="copy" type="button" id="copy">Copy</button></div>
        <p class="warn">Keep this link private. Source addresses often contain your own API key, and it is part of the link.</p>
      </div>
    </div>
  </section>

  <footer>Paste the link into Stremio, or add it as a custom addon inside an aggregator such as AIOStreams.</footer>
</div>

<script>
(function () {
  var PRESETS = ${JSON.stringify(PRESETS)};
  var chips = document.getElementById('chips');
  var ups = document.getElementById('ups');
  var lang = document.getElementById('lang');

  function urlFor(p) { return p.template.replace('{lang}', p.perLanguage ? lang.value : ''); }
  function lines() { return ups.value.split(/\\n+/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function setLines(list) { ups.value = list.join('\\n'); }

  function syncChips() {
    var current = lines();
    PRESETS.forEach(function (p) {
      var el = document.getElementById('chip-' + p.id);
      var isOn = current.indexOf(urlFor(p)) !== -1;
      el.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      el.querySelector('.pl').textContent = isOn ? '\\u2713' : '+';
    });
  }

  PRESETS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.id = 'chip-' + p.id;
    b.setAttribute('aria-pressed', 'false');
    var plus = document.createElement('span'); plus.className = 'pl'; plus.textContent = '+';
    var txt = document.createElement('span');
    var nm = document.createElement('span'); nm.textContent = p.name;
    var sm = document.createElement('small'); sm.textContent = p.blurb;
    txt.appendChild(nm); txt.appendChild(sm);
    b.appendChild(plus); b.appendChild(txt);
    b.addEventListener('click', function () {
      var u = urlFor(p);
      var current = lines();
      var at = current.indexOf(u);
      if (at === -1) current.push(u); else current.splice(at, 1);
      setLines(current); syncChips();
    });
    chips.appendChild(b);
  });

  // Changing language rewrites presets already chosen, so the list never keeps
  // a stale language behind.
  lang.addEventListener('change', function () {
    var current = lines();
    PRESETS.filter(function (p) { return p.perLanguage; }).forEach(function (p) {
      var stem = p.template.split('{lang}')[0];
      for (var i = 0; i < current.length; i++) {
        if (current[i].indexOf(stem) === 0) current[i] = urlFor(p);
      }
    });
    setLines(current); syncChips();
  });
  ups.addEventListener('input', syncChips);

  var simple = document.getElementById('mSimple');
  var adv = document.getElementById('mAdv');
  // Cue numbers and timecodes are derived from the steps actually on screen.
  // Hiding the advanced steps in Simple mode would otherwise leave the
  // sequence reading 1, 4 — numbering that describes the markup rather than
  // the reader's path through it.
  function stamp(seconds) {
    var m = Math.floor(seconds / 60), s = seconds % 60;
    return '00:' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ',000';
  }
  function renumber() {
    var cues = Array.prototype.filter.call(document.querySelectorAll('.cue'), function (el) {
      return el.offsetParent !== null;
    });
    cues.forEach(function (el, i) {
      var meta = el.querySelector('.cue-meta');
      meta.textContent = '';
      var n = document.createElement('b');
      n.textContent = String(i + 1);
      meta.appendChild(n);
      meta.appendChild(document.createTextNode(stamp(i * 12)));
      meta.appendChild(document.createElement('br'));
      meta.appendChild(document.createTextNode('\u2192 ' + stamp((i + 1) * 12)));
    });
  }

  function mode(m) {
    document.body.dataset.mode = m;
    simple.setAttribute('aria-pressed', String(m === 'simple'));
    adv.setAttribute('aria-pressed', String(m === 'advanced'));
    renumber();
  }
  simple.addEventListener('click', function () { mode('simple'); });
  adv.addEventListener('click', function () { mode('advanced'); });

  function b64url(s) {
    return btoa(unescape(encodeURIComponent(s))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }

  var out = document.getElementById('out');
  var err = document.getElementById('err');
  var urlEl = document.getElementById('url');

  document.getElementById('go').addEventListener('click', function () {
    var list = lines()
      .map(function (s) { return s.replace(/\\/manifest\\.json$/, '').replace(/\\/+$/, ''); })
      .filter(function (s) { return /^https?:\\/\\//.test(s); });

    if (!list.length) {
      err.hidden = false;
      err.textContent = 'Add at least one source before creating a link.';
      out.style.display = 'none';
      return;
    }
    err.hidden = true;

    var cfg = {
      upstreams: list,
      maxResults: parseInt(document.getElementById('maxResults').value, 10) || 0,
      autoShift: document.getElementById('autoShift').checked,
      fixOverlaps: document.getElementById('fixOverlaps').checked,
      removeHearingImpaired: document.getElementById('removeHearingImpaired').checked,
      fixOcr: document.getElementById('fixOcr').checked,
      fixUppercase: document.getElementById('fixUppercase').checked,
      demoteForced: document.getElementById('demoteForced').checked
    };
    // textContent, not innerHTML: this string is built from user input.
    urlEl.textContent = location.origin + '/c/' + b64url(JSON.stringify(cfg)) + '/manifest.json';
    out.style.display = 'block';
  });

  document.getElementById('copy').addEventListener('click', function () {
    var btn = this;
    navigator.clipboard.writeText(urlEl.textContent).then(function () {
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
    });
  });

  // One orchestrated moment: the plate cycles captions the way a player would.
  var cap = document.getElementById('cap');
  var LINES = [
    'The right subtitle, first in the list.',
    'Dead links never reach you.',
    'Late by 2.5 seconds? Corrected.',
    'Two people talking at once stay readable.'
  ];
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var i = 0;
    setInterval(function () {
      cap.classList.add('out');
      setTimeout(function () {
        i = (i + 1) % LINES.length;
        cap.textContent = LINES[i];
        cap.classList.remove('out');
      }, 450);
    }, 4200);
  }

  syncChips();
  renumber();
})();
</script>
</body>
</html>`;
}
