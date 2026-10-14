/**
 * Composition d'exemple donnée à l'IA (niveau attendu : pub motion design pro,
 * caméra vivante, typographie cinétique, interfaces animées, transitions liées).
 * Marque fictive.
 */
import type { Comp } from './types';

export const EXAMPLE_COMP: Comp = {
  v: 1,
  format: '9:16',
  duration: 9,
  title: 'Exemple — boulangerie',
  brand: 'Maison Ondine',
  css: `
.bg{background:radial-gradient(120% 70% at 50% 110%,#3a1d0e 0%,#0b0806 60%)}
.glow{position:absolute;left:50%;top:62%;width:1400px;height:1400px;margin:-700px 0 0 -700px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,150,80,.45),transparent 70%);filter:blur(40px)}
.hook{width:960px;text-align:center;font:800 150px/0.95 Geist;letter-spacing:-0.05em}
.grad{background:linear-gradient(90deg,#ffd29a,#ff8a4c);-webkit-background-clip:text;background-clip:text;color:transparent}
.kicker{font:500 34px Geist;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.55)}
.search{left:90px;top:520px;width:900px;height:130px;border-radius:65px;background:#fff;color:#111;display:flex;align-items:center;padding:0 50px;font:500 48px Geist;box-shadow:0 30px 80px -20px rgba(0,0,0,.6)}
.search svg{margin-left:auto;width:52px;height:52px}
.tile{width:280px;border-radius:28px;overflow:hidden;box-shadow:0 20px 50px -20px rgba(0,0,0,.7)}
.tile img{width:100%;height:100%;object-fit:cover}
.card{left:190px;top:520px;width:700px;height:900px;border-radius:56px;overflow:hidden;box-shadow:0 40px 120px -30px rgba(0,0,0,.8)}
.btn{width:110px;height:110px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 14px 40px -10px rgba(0,0,0,.5)}
.btn svg{width:48px;height:48px;stroke:#111;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.wipe{left:50%;top:50%;width:80px;height:80px;margin:-40px 0 0 -40px;border-radius:50%;background:#ff8a4c}
.end{width:900px;text-align:center;font:800 120px/1 Geist;letter-spacing:-0.04em;color:#1a0d05}
`,
  html: `
<div class="bg full"></div><div class="glow"></div>
<section class="scene" id="s1"><div class="cam full">
  <p class="kicker center" style="top:700px">Nouveau ce week-end</p>
  <h1 class="hook center" id="h1">Le vrai pain <span class="grad">au levain</span></h1>
</div></section>
<section class="scene" id="s2"><div class="cam full">
  <div class="search abs"><span id="q">pain au levain bio</span><svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7"/><path d="M15.5 15.5 20.5 20.5"/></svg></div>
  <div class="tile abs t" style="left:90px;top:720px;height:360px"><img src="{{search:sourdough bread loaf}}"></div>
  <div class="tile abs t" style="left:400px;top:720px;height:460px"><img src="{{search:croissant bakery}}"></div>
  <div class="tile abs t" style="left:710px;top:720px;height:320px"><img src="{{search:bakery oven bread}}"></div>
  <div class="tile abs t" style="left:90px;top:1110px;height:420px"><img src="{{search:baguette french bakery}}"></div>
  <div class="tile abs t" style="left:400px;top:1210px;height:330px"><img src="{{search:pastry display}}"></div>
  <div class="tile abs t" style="left:710px;top:1070px;height:460px"><img src="{{search:flour hands dough}}"></div>
</div></section>
<section class="scene" id="s3"><div class="cam full">
  <div class="card abs"><img class="cover" src="{{search:sourdough bread loaf}}"></div>
  <div class="btn abs b" style="left:930px;top:640px"><svg viewBox="0 0 24 24"><path d="M12 20.5C5 15.5 2.5 12.2 2.5 8.6 2.5 5.6 4.8 3.5 7.5 3.5c1.9 0 3.5 1.1 4.5 2.7 1-1.6 2.6-2.7 4.5-2.7 2.7 0 5 2.1 5 5.1 0 3.6-2.5 6.9-9.5 11.9z"/></svg></div>
  <div class="btn abs b" style="left:930px;top:800px"><svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6.5"/></svg></div>
  <div class="wipe abs"></div>
  <h2 class="end center" id="end">Maison Ondine</h2>
</div></section>
`,
  js: `
// Scène 1 (0 → 2,6 s) : lettres qui arrivent floues avec rotation, caméra qui pousse.
IZ.scene(tl, '#s1', 0, 2.6);
var ch = IZ.split('#h1', 'chars');
tl.from(ch, { yPercent: 120, rotate: 12, opacity: 0, filter: 'blur(14px)', duration: 0.7, stagger: 0.03, ease: 'expo.out' }, 0.1)
  .from('#s1 .kicker', { y: 30, opacity: 0, duration: 0.6 }, 0.5)
  .fromTo('#s1 .cam', { scale: 1.15 }, { scale: 1, duration: 2.6, ease: 'power2.out' }, 0)
  .to(ch, { yPercent: -120, opacity: 0, filter: 'blur(14px)', duration: 0.35, stagger: 0.01, ease: 'power3.in' }, 2.2);
// Scène 2 (2,5 → 5,6 s) : barre de recherche en très gros plan, on tape, la caméra recule, mosaïque en cascade.
IZ.scene(tl, '#s2', 2.5, 5.6);
tl.fromTo('#s2 .cam', { scale: 2.4, x: 300, y: 600 }, { scale: 2.2, x: 260, y: 600, duration: 1.4, ease: 'none' }, 2.5);
IZ.type(tl, '#q', 2.6, 24);
tl.to('#s2 .cam', { scale: 1, x: 0, y: 0, duration: 0.9, ease: 'expo.inOut' }, 3.9)
  .from('#s2 .t', { y: 160, opacity: 0, scale: 0.7, duration: 0.8, stagger: 0.07, ease: 'back.out(1.6)' }, 4.3)
  .to('#s2 .cam', { y: -700, filter: 'blur(10px)', duration: 0.4, ease: 'power3.in' }, 5.25);
// Scène 3 (5,5 → 9 s) : la carte tournoie, boutons qui gravitent, cœur appuyé, cercle de couleur qui envahit tout, nom de la marque.
IZ.scene(tl, '#s3', 5.5);
tl.from('#s3 .card', { rotate: -30, scale: 0.4, rotationY: 50, opacity: 0, duration: 0.9, ease: 'expo.out' }, 5.5)
  .from('#s3 .b', { x: -400, y: 200, rotate: 180, opacity: 0, duration: 0.8, stagger: 0.12, ease: 'back.out(1.4)' }, 5.9)
  .to('#s3 .b:first-of-type', { scale: 0.85, duration: 0.1, ease: 'power2.in' }, 6.9)
  .to('#s3 .b:first-of-type', { scale: 1.15, backgroundColor: '#ff8a4c', duration: 0.35, ease: 'back.out(3)' }, 7.0)
  .fromTo('#s3 .wipe', { scale: 0 }, { scale: 60, duration: 0.8, ease: 'expo.in' }, 7.3);
var e = IZ.split('#end', 'chars');
tl.from(e, { y: 80, opacity: 0, rotate: 8, filter: 'blur(10px)', duration: 0.6, stagger: 0.035, ease: 'expo.out' }, 7.95)
  .fromTo('#s3 .cam', { scale: 1 }, { scale: 1.06, duration: 3.5, ease: 'none' }, 5.5);
`,
  sound: { music: 'electro', bpm: 118, cues: [{ at: 0.1, sfx: 'whoosh' }, { at: 2.6, sfx: 'click' }, { at: 4.3, sfx: 'pop' }, { at: 7.0, sfx: 'click' }, { at: 7.3, sfx: 'whoosh' }] }
};
