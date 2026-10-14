/**
 * Document HTML autonome qui joue une composition : polices, styles de base,
 * GSAP, petite boîte à outils « IZ » pour les effets de motion design, puis la
 * timeline écrite par l'IA. Le même document sert à l'aperçu (iframe isolée)
 * et à l'export (navigateur sans écran qui photographie chaque image).
 */
import { KIT_JS } from './kit';
import { expandBlocks } from './templates';
import { COMP_SIZE, type Comp } from './types';

const FONTS = 'https://fonts.googleapis.com/css2?family=Geist:wght@300..900&family=Inter:wght@300..900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Space+Grotesk:wght@300..700&family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Instrument+Serif:ital@0;1&family=Archivo+Black&family=DM+Serif+Display:ital@0;1&display=block';

/** Boîte à outils exposée aux compositions (écrite pour rester courte et sûre). */
const IZ_LIB = String.raw`
window.IZ = (function () {
  var q = function (s) { return typeof s === 'string' ? Array.prototype.slice.call(document.querySelectorAll(s)) : (s && s.length !== undefined ? Array.prototype.slice.call(s) : [s]); };
  function split(sel, by) {
    var out = [];
    q(sel).forEach(function (el) {
      if (el.__izSplit) { out = out.concat(el.__izSplit); return; }
      var text = el.textContent; el.textContent = ''; var parts = [];
      var words = text.split(/(\s+)/);
      words.forEach(function (w) {
        if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(w)); return; }
        var ws = document.createElement('span'); ws.className = 'iz-w'; ws.style.display = 'inline-block'; ws.style.whiteSpace = 'nowrap';
        if (by === 'chars') { Array.from(w).forEach(function (ch) { var c = document.createElement('span'); c.className = 'iz-c'; c.style.display = 'inline-block'; c.textContent = ch; ws.appendChild(c); parts.push(c); }); }
        else { ws.textContent = w; parts.push(ws); }
        el.appendChild(ws);
      });
      el.__izSplit = parts; out = out.concat(parts);
    });
    return out;
  }
  function type(tl, sel, at, cps) {
    q(sel).forEach(function (el) {
      var full = el.getAttribute('data-text') || el.textContent; el.setAttribute('data-text', full);
      var o = { n: 0 }; el.textContent = '';
      tl.to(o, { n: full.length, duration: Math.max(0.2, full.length / (cps || 22)), ease: 'none', onUpdate: function () { el.textContent = full.slice(0, Math.round(o.n)); } }, at);
    });
  }
  function count(tl, sel, from, to, at, dur, opts) {
    opts = opts || {};
    q(sel).forEach(function (el) {
      var o = { v: from };
      var fmt = function (v) { var n = opts.decimals ? v.toFixed(opts.decimals) : Math.round(v).toLocaleString('fr-FR'); return (opts.prefix || '') + n + (opts.suffix || ''); };
      el.textContent = fmt(from);
      tl.to(o, { v: to, duration: dur || 1.2, ease: opts.ease || 'power3.out', onUpdate: function () { el.textContent = fmt(o.v); } }, at);
    });
  }
  function draw(tl, sel, at, dur, ease) {
    q(sel).forEach(function (p) {
      var len = p.getTotalLength ? p.getTotalLength() : 1000;
      p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
      tl.to(p, { strokeDashoffset: 0, duration: dur || 1, ease: ease || 'power2.inOut' }, at);
    });
  }
  function scene(tl, sel, from, to) {
    tl.set(sel, { autoAlpha: 0 }, 0);
    tl.set(sel, { autoAlpha: 1 }, from);
    if (to !== undefined) tl.set(sel, { autoAlpha: 0 }, to);
  }
  return { q: q, split: split, type: type, count: count, draw: draw, scene: scene };
})();
`;

const BASE_CSS = (w: number, h: number) => `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:#000}
#stage{position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden;transform-origin:0 0;font-family:Geist,Inter,system-ui,sans-serif;color:#fff;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
#stage img{display:block;max-width:none}
.scene{position:absolute;inset:0;overflow:hidden}
.abs{position:absolute}
.center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
.full{position:absolute;inset:0}
.cover{width:100%;height:100%;object-fit:cover}
`;

function escAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Remplace les repères {{photo:0}}, {{logo}}, {{search:…}} par les vraies images (ou un dégradé neutre). */
export function fillAssets(text: string, assets: Record<string, string>, forCss = false): string {
  return text.replace(/\{\{\s*(logo|photo:\d{1,2}|search:[^}]{2,60})\s*\}\}/g, (_, k: string) => {
    const v = assets[k.trim()];
    const fallback = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#2b2f3a"/><stop offset="1" stop-color="#5b5f6a"/></linearGradient></defs><rect width="8" height="8" fill="url(#g)"/></svg>');
    const url = v || fallback;
    return forCss ? url : escAttr(url);
  });
}

export function buildCompDocument(comp: Comp, o: { assets: Record<string, string>; gsap: { src?: string; inline?: string }; mode: 'preview' | 'render' }): string {
  const { w, h } = COMP_SIZE[comp.format];
  const bpm = comp.sound?.bpm ?? 120;
  const palette = comp.palette ?? { primary: '#f28be0', secondary: '#8fa6ff', bg: '#0a0a0a', text: '#ffffff' };
  const tpl = expandBlocks(comp.blocks, { W: w, H: h, vertical: comp.format === '9:16', palette, bpm });
  const html = fillAssets(comp.html + tpl.html, o.assets);
  const css = fillAssets(comp.css + tpl.css, o.assets, true);
  const gsapTag = o.gsap.inline ? `<script>${o.gsap.inline}</script>` : `<script src="${escAttr(o.gsap.src ?? '')}"></script>`;
  const dur = Math.max(Number(comp.duration) || 15, tpl.end);
  const control = o.mode === 'preview'
    ? String.raw`
  var playing = true, t0 = performance.now(), offset = 0;
  function now() { return playing ? offset + (performance.now() - t0) / 1000 : offset; }
  function loop() { var t = now() % DUR; tl.seek(t, false); try { parent.postMessage({ iz: 'time', t: t }, '*'); } catch (e) {} requestAnimationFrame(loop); }
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.iz === 'pause') { offset = now() % DUR; playing = false; }
    if (d.iz === 'play') { t0 = performance.now(); playing = true; }
    if (d.iz === 'seek') { offset = Math.max(0, Math.min(DUR, d.t || 0)); t0 = performance.now(); tl.seek(offset, false); }
  });
  function fit() { var s = Math.min(window.innerWidth / W, window.innerHeight / H); var st = document.getElementById('stage'); st.style.transform = 'translate(' + (window.innerWidth - W * s) / 2 + 'px,' + (window.innerHeight - H * s) / 2 + 'px) scale(' + s + ')'; }
  window.addEventListener('resize', fit); fit();
  ready.then(function () { try { parent.postMessage({ iz: 'ready', duration: DUR }, '*'); } catch (e) {} t0 = performance.now(); loop(); });`
    : String.raw`
  window.__izSeek = function (t) { tl.seek(Math.max(0, Math.min(DUR, t)), false); };
  window.__izDuration = DUR;`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}">
<style>${BASE_CSS(w, h)}</style><style>${css.replace(/<\/style/gi, '')}</style></head>
<body><div id="stage">${html}</div>
${gsapTag}
<script>window.__izBpm = ${bpm};</script>
<script>${IZ_LIB}</script>
<script>${KIT_JS}</script>
<script>
(function () {
  var W = ${w}, H = ${h}, DUR = ${dur};
  window.__izErrors = [];
  function report(m) { window.__izErrors.push(String(m)); try { parent.postMessage({ iz: 'error', msg: String(m).slice(0, 300) }, '*'); } catch (e) {} }
  window.addEventListener('error', function (e) { report(e.message); });
  var tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  window.__izTl = tl;
  try {
    (function (tl, IZ, gsap, W, H, DUR) {
${(comp.js + tpl.js).replace(/<\/script/gi, '')}
    })(tl, window.IZ, gsap, W, H, DUR);
  } catch (e) { report(e && e.message ? e.message : e); }
  if (tl.duration() < DUR) tl.to({}, { duration: DUR - tl.duration() });
  var imgs = Array.prototype.slice.call(document.images).map(function (im) { return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; setTimeout(r, 8000); }); });
  var ready = Promise.all([document.fonts ? document.fonts.ready : 0].concat(imgs)).then(function () { tl.seek(0, false); window.__izReady = true; });
  window.__izReadyP = ready;
  ${control}
})();
</script></body></html>`;
}
