/**
 * Modèles de scènes motion design « niveau pub » (briques réutilisables).
 * L'orchestrateur (IA ou client) choisit un modèle, fixe son instant, sa durée
 * et ses variables (textes, images, couleurs) ; le modèle produit le HTML, le
 * CSS et la timeline GSAP de la scène, réglés au pixel et calés sur le tempo.
 * Ils se mélangent librement aux scènes écrites sur mesure par l'IA.
 */
import { z } from 'zod';

// ---------- Modèle de données ----------
export const PaletteSchema = z.object({
  /** Couleur principale (accents, boutons). */
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Couleur secondaire (dégradés, formes). */
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Fond. */
  bg: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Texte principal. */
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});
export type Palette = z.infer<typeof PaletteSchema>;

/** Image : photo du client, logo ou photo libre de droits. */
const ImgRef = z.string().regex(/^(logo|photo:\d{1,2}|search:[^{}]{2,60})$/);
const Txt = (n: number) => z.string().trim().min(1).max(n);

export const TEMPLATE_VARS = {
  /** Typographie cinétique élastique (1 à 3 lignes, un mot clé surligné). */
  kinetic: z.object({ lines: z.array(Txt(28)).min(1).max(3), highlight: z.number().int().min(0).max(2).optional(), from: z.enum(['bottom', 'left', 'right', 'scale', 'drop']).optional() }),
  /** Barre de recherche qui zoome en 3D, texte tapé, validation, résultats en cascade. */
  search: z.object({ query: Txt(40), results: z.array(ImgRef).min(0).max(6).optional(), label: z.string().trim().max(40).optional() }),
  /** Fenêtre de navigateur en 3D avec page, curseur et clic sur le bouton. */
  browser: z.object({ url: Txt(40), title: Txt(40), subtitle: z.string().trim().max(60).optional(), image: ImgRef.optional(), button: Txt(22) }),
  /** Forme qui se transforme (pastille → rond → carte → plein écran) avec texte. */
  morph: z.object({ label: Txt(24), final: Txt(30), sub: z.string().trim().max(40).optional() }),
  /** Téléphone avec écran d'appli qui défile, tap et notification. */
  phone: z.object({ title: Txt(30), items: z.array(Txt(28)).min(2).max(5), button: Txt(20), notif: z.string().trim().max(40).optional(), image: ImgRef.optional() }),
  /** Chiffre qui compte dans un anneau qui se dessine (uniquement un chiffre réel). */
  stat: z.object({ value: z.number().min(0).max(1e9), prefix: z.string().max(4).optional(), suffix: z.string().max(10).optional(), label: Txt(40) }),
  /** Photo en vedette : carte qui pivote, zoom lent, reflet, légende élastique. */
  hero: z.object({ image: ImgRef, caption: Txt(36), kicker: z.string().trim().max(30).optional() }),
  /** Signature finale : logo / nom, bouton pressé, lien. */
  cta: z.object({ title: Txt(36), button: Txt(24), link: z.string().trim().max(40).optional(), logo: z.boolean().optional() })
} as const;
export type TemplateId = keyof typeof TEMPLATE_VARS;
export const TEMPLATE_IDS = Object.keys(TEMPLATE_VARS) as [TemplateId, ...TemplateId[]];

/** Durée par défaut de chaque modèle, en temps musicaux (ajustée au tempo). */
export const TEMPLATE_BEATS: Record<TemplateId, number> = { kinetic: 5, search: 8, browser: 8, morph: 8, phone: 9, stat: 6, hero: 6, cta: 7 };

export const BlockSchema = z.object({
  use: z.enum(TEMPLATE_IDS),
  /** Début (s) dans la vidéo. */
  at: z.number().min(0).max(60),
  /** Durée (s) ; sinon calée sur le tempo. */
  dur: z.number().min(1).max(12).optional(),
  vars: z.record(z.string(), z.unknown())
});
export type TemplateBlock = z.infer<typeof BlockSchema>;

export type TemplateCtx = { id: string; at: number; dur: number; W: number; H: number; vertical: boolean; p: Palette };
export type TemplateOut = { html: string; css: string; js: string };

// ---------- Outils ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const img = (ref: string) => `{{${ref}}}`;
const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114; };
const on = (h: string) => (lum(h) > 150 ? '#0a0a0a' : '#ffffff');
const n = (v: number) => Number(v.toFixed(3));

// ---------- Modèles ----------
const BUILD: { [K in TemplateId]: (v: z.infer<(typeof TEMPLATE_VARS)[K]>, c: TemplateCtx) => TemplateOut } = {
  kinetic(v, c) {
    const S = `#${c.id}`;
    const size = Math.round(Math.min(c.vertical ? 150 : 140, ((c.vertical ? 980 : 1600) / Math.max(...v.lines.map((l) => l.length), 6)) * 1.7));
    const top = c.H / 2 - (v.lines.length * size * 1.05) / 2;
    const lines = v.lines.map((l, i) => {
      const hl = v.highlight === i;
      return `<div class="kl" style="top:${Math.round(top + i * size * 1.05)}px;font-size:${size}px"><span class="kt${hl ? ' khl' : ''}" id="${c.id}l${i}">${esc(l)}</span></div>`;
    }).join('');
    const css = `${S} .kl{position:absolute;left:0;width:${c.W}px;text-align:center;font-family:'Bricolage Grotesque',Geist,sans-serif;font-weight:800;letter-spacing:-0.045em;line-height:1;color:${c.p.text}}${S} .khl{position:relative;display:inline-block;color:${on(c.p.primary)};padding:0 .12em}${S} .khl::before{content:'';position:absolute;inset:.06em -.02em -.02em;background:${c.p.primary};border-radius:.14em;z-index:-1;transform-origin:left;transform:scaleX(var(--hl,0))}${S} .kbg{position:absolute;left:50%;top:50%;width:${Math.round(c.W * 1.4)}px;height:${Math.round(c.W * 1.4)}px;margin:-${Math.round(c.W * 0.7)}px;border-radius:50%;background:radial-gradient(closest-side,${c.p.secondary}55,transparent 70%)}`;
    const step = 60 / 120 * 0.6;
    const js = [
      `IZ.scene(tl,'${S}',${n(c.at)},${n(c.at + c.dur)});`,
      `tl.fromTo('${S} .kbg',{scale:.4,opacity:0},{scale:1.1,opacity:1,duration:${n(c.dur)},ease:'power2.out'},${n(c.at)});`,
      `tl.fromTo('${S} .cam',{scale:1.12},{scale:1,duration:${n(c.dur)},ease:'power3.out'},${n(c.at)});`,
      ...v.lines.map((_, i) => `IZ.springText(tl,'#${c.id}l${i}',${n(c.at + 0.08 + i * step)},{from:'${v.from ?? (i % 2 ? 'right' : 'bottom')}',out:${n(c.at + c.dur - 0.38)}});`),
      v.highlight !== undefined ? `tl.fromTo('#${c.id}l${v.highlight}',{'--hl':0},{'--hl':1,duration:.5,ease:'power3.inOut'},${n(c.at + 0.5 + v.highlight * step)});` : ''
    ].join('\n');
    return { html: `<section class="scene" id="${c.id}"><div class="cam full"><div class="kbg"></div>${lines}</div></section>`, css, js };
  },

  search(v, c) {
    const S = `#${c.id}`;
    const bw = c.vertical ? 900 : 1100, bx = (c.W - bw) / 2, by = c.vertical ? 560 : 260;
    const res = (v.results ?? []).slice(0, 6);
    const cols = c.vertical ? 3 : 6, tw = c.vertical ? 280 : 260, th = Math.round(tw * 1.25), gap = 20;
    const gx = (c.W - (cols * tw + (cols - 1) * gap)) / 2;
    const tiles = res.map((r, i) => `<div class="st" style="left:${Math.round(gx + (i % cols) * (tw + gap))}px;top:${Math.round(by + 190 + Math.floor(i / cols) * (th + gap))}px;width:${tw}px;height:${th}px"><img src="${img(r)}"></div>`).join('');
    const css = `${S}{background:${c.p.bg}}${S} .sb{position:absolute;left:${bx}px;top:${by}px;width:${bw}px;height:130px;border-radius:65px;background:#fff;display:flex;align-items:center;padding:0 52px;font:500 46px Inter,Geist,sans-serif;color:#111;gap:20px}${S} .caret{display:inline-block;width:4px;height:52px;background:${c.p.primary};margin-left:4px;vertical-align:middle}${S} .go{margin-left:auto;width:84px;height:84px;border-radius:50%;background:${c.p.primary};display:grid;place-items:center;flex:none}${S} .st{position:absolute;border-radius:28px;overflow:hidden;box-shadow:0 30px 60px -25px rgba(0,0,0,.6)}${S} .st img{width:100%;height:100%;object-fit:cover}${S} .slabel{position:absolute;left:0;width:${c.W}px;top:${by - 160}px;text-align:center;font:700 64px 'Bricolage Grotesque',Geist,sans-serif;letter-spacing:-0.03em;color:${c.p.text}}`;
    const tType = c.at + 0.75, typed = Math.min(1.4, v.query.length / 22);
    const js = [
      `IZ.scene(tl,'${S}',${n(c.at)},${n(c.at + c.dur)});`,
      `IZ.mockup(tl,'${S} .sb',${n(c.at)},{duration:1,zoom:1.06,float:false});`,
      `tl.fromTo('${S} .cam',{scale:2.2,x:${Math.round(c.W * 0.12)},y:${Math.round((c.H / 2 - (by + 65)) * 2.2)}},{scale:2.05,x:-${Math.round(c.W * 0.12)},y:${Math.round((c.H / 2 - (by + 65)) * 2.05)},duration:${n(typed + 0.9)},ease:'none'},${n(c.at)});`,
      `IZ.type(tl,'${S} .q',${n(tType)},22);`,
      `tl.to('${S} .caret',{opacity:0,repeat:${Math.round(c.dur * 3)},yoyo:true,duration:.18,ease:'steps(1)'},${n(c.at)});`,
      `IZ.press(tl,'${S} .go',${n(tType + typed + 0.15)},{ring:'${c.p.primary}'});`,
      `tl.to('${S} .cam',{scale:1,x:0,y:0,duration:1,ease:'expo.inOut'},${n(tType + typed + 0.35)});`,
      res.length ? `tl.from('${S} .st',{y:220,opacity:0,scale:.6,rotate:()=>gsap.utils.random(-10,10),duration:.9,stagger:.07,ease:'spring'},${n(tType + typed + 0.9)});` : '',
      v.label ? `IZ.springText(tl,'${S} .slabel',${n(tType + typed + 0.8)},{by:'words'});` : '',
      `tl.to('${S} .cam',{y:-${Math.round(c.H * 0.3)},filter:'blur(18px)',opacity:0,duration:.4,ease:'power3.in'},${n(c.at + c.dur - 0.4)});`
    ].join('\n');
    return { html: `<section class="scene" id="${c.id}"><div class="cam full">${v.label ? `<div class="slabel">${esc(v.label)}</div>` : ''}<div class="sb"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7"/><path d="M15.5 15.5 20.5 20.5"/></svg><span class="q">${esc(v.query)}</span><span class="caret"></span><span class="go"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="${on(c.p.primary)}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></div>${tiles}</div></section>`, css, js };
  },

  browser(v, c) {
    const S = `#${c.id}`;
    const bw = c.vertical ? 920 : 1300, bh = c.vertical ? 1180 : 760, bx = (c.W - bw) / 2, by = (c.H - bh) / 2;
    const css = `${S}{background:radial-gradient(120% 80% at 50% 0%,${c.p.secondary}44,${c.p.bg} 60%)}${S} .bw{position:absolute;left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px;border-radius:34px;background:#fff;overflow:hidden}${S} .bar{height:96px;background:#f1f2f4;display:flex;align-items:center;gap:14px;padding:0 30px}${S} .bar i{width:22px;height:22px;border-radius:50%;background:#d0d2d6}${S} .url{margin-left:24px;flex:1;height:58px;border-radius:29px;background:#fff;display:flex;align-items:center;padding:0 28px;font:500 30px Inter,sans-serif;color:#555}${S} .pg{padding:60px 64px;color:#111}${S} .pg h3{font:800 ${c.vertical ? 76 : 70}px/1.02 'Bricolage Grotesque',Geist,sans-serif;letter-spacing:-0.04em}${S} .pg p{font:500 34px Inter,sans-serif;color:#666;margin-top:22px}${S} .pim{margin-top:44px;height:${c.vertical ? 470 : 220}px;border-radius:26px;overflow:hidden;background:${c.p.secondary}}${S} .pim img{width:100%;height:100%;object-fit:cover}${S} .btn{position:absolute;left:64px;bottom:60px;height:110px;padding:0 54px;border-radius:55px;background:${c.p.primary};color:${on(c.p.primary)};display:grid;place-items:center;font:700 38px Inter,sans-serif}${S} .cur{position:absolute;width:64px;height:64px;left:${Math.round(bx + bw * 0.75)}px;top:${Math.round(by + bh * 0.95)}px}`;
    const t = c.at;
    const js = [
      `IZ.scene(tl,'${S}',${n(t)},${n(t + c.dur)});`,
      `IZ.mockup(tl,'${S} .bw',${n(t)},{duration:1.3,tiltX:34,tiltY:-26});`,
      `IZ.type(tl,'${S} .uq',${n(t + 0.6)},26);`,
      `IZ.springText(tl,'${S} .pg h3',${n(t + 0.9)},{by:'words',distance:60,blur:8});`,
      `tl.from('${S} .pg p',{y:30,opacity:0,duration:.6},${n(t + 1.3)});`,
      `tl.from('${S} .pim',{clipPath:'inset(0 0 100% 0 round 26px)',duration:.9,ease:'expo.out'},${n(t + 1.4)});`,
      `tl.fromTo('${S} .pim img',{scale:1.3},{scale:1,duration:${n(c.dur - 1.4)},ease:'power2.out'},${n(t + 1.4)});`,
      `tl.from('${S} .btn',{scale:0,duration:.7,ease:'spring.bouncy'},${n(t + 1.8)});`,
      `tl.fromTo('${S} .cur',{x:260,y:260,opacity:0},{x:-${Math.round(bw * 0.45)},y:-110,opacity:1,duration:.9,ease:'power3.inOut'},${n(t + 2.2)});`,
      `IZ.press(tl,'${S} .btn',${n(t + 3.15)},{ring:'${c.p.primary}'});`,
      `tl.to('${S} .bw',{scale:1.9,y:${Math.round(bh * 0.3)},duration:.7,ease:'expo.in'},${n(t + c.dur - 0.7)});`,
      `tl.to('${S} .cam',{opacity:0,filter:'blur(14px)',duration:.3},${n(t + c.dur - 0.3)});`
    ].join('\n');
    const html = `<section class="scene" id="${c.id}"><div class="cam full"><div style="position:absolute;inset:0;perspective:1800px"><div class="bw"><div class="bar"><i></i><i></i><i></i><div class="url"><span class="uq">${esc(v.url)}</span></div></div><div class="pg"><h3>${esc(v.title)}</h3>${v.subtitle ? `<p>${esc(v.subtitle)}</p>` : ''}<div class="pim">${v.image ? `<img src="${img(v.image)}">` : ''}</div></div><div class="btn">${esc(v.button)}</div></div></div><svg class="cur" viewBox="0 0 24 24"><path d="M4 2 L20 12 L12.5 13.5 L16 21 L13 22.5 L9.5 15 L4 19 Z" fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg></div></section>`;
    return { html, css, js };
  },

  morph(v, c) {
    const S = `#${c.id}`;
    const pw = Math.min(c.W * 0.8, v.label.length * 36 + 220);
    const css = `${S}{background:${c.p.bg}}${S} .shape{position:absolute;left:50%;top:50%;width:140px;height:140px;margin:0;border-radius:70px;background:${c.p.primary};transform:translate(-50%,-50%);display:grid;place-items:center;overflow:hidden}${S} .ml{font:700 52px Inter,Geist,sans-serif;color:${on(c.p.primary)};white-space:nowrap}${S} .mf{position:absolute;left:0;width:${c.W}px;top:${Math.round(c.H / 2 - 90)}px;text-align:center;font:800 ${c.vertical ? 140 : 130}px/1 'Bricolage Grotesque',Geist,sans-serif;letter-spacing:-0.05em;color:${on(c.p.secondary)}}${S} .ms{position:absolute;left:0;width:${c.W}px;top:${Math.round(c.H / 2 + 80)}px;text-align:center;font:500 44px Inter,sans-serif;color:${on(c.p.secondary)};opacity:.8}`;
    const t = c.at;
    const js = [
      `IZ.scene(tl,'${S}',${n(t)},${n(t + c.dur)});`,
      `gsap.set('${S} .shape',{xPercent:-50,yPercent:-50,x:0,y:0});`,
      `tl.fromTo('${S} .shape',{scale:0,rotate:-90},{scale:1,rotate:0,duration:.7,ease:'spring.bouncy'},${n(t)});`,
      `var mEnd=IZ.morph(tl,'${S} .shape',${n(t + 0.75)},[{w:${Math.round(pw)},h:150,r:75,d:.45,hold:.35},{w:150,h:150,r:75,bg:'${c.p.secondary}',d:.3,hold:.05},{w:${Math.round(c.W * 0.62)},h:${Math.round(c.W * 0.62 * 1.25)},r:60,rotate:-6,d:.45,hold:.08},{w:${Math.round(c.W * 1.6)},h:${Math.round(c.H * 1.4)},r:0,rotate:0,d:.5,ease:'expo.inOut',hold:0}]);`,
      `IZ.springText(tl,'${S} .ml',${n(t + 0.95)},{by:'chars',distance:60,blur:6});`,
      `tl.to('${S} .ml',{opacity:0,scale:.6,duration:.2},${n(t + 1.55)});`,
      `IZ.springText(tl,'${S} .mf',mEnd-.25,{from:'scale'});`,
      v.sub ? `tl.from('${S} .ms',{y:40,opacity:0,duration:.6,ease:'spring.soft'},mEnd+.15);` : '',
      `tl.to('${S} .cam',{scale:1.15,opacity:0,filter:'blur(16px)',duration:.4,ease:'power3.in'},${n(t + c.dur - 0.4)});`
    ].filter(Boolean).join('\n');
    return { html: `<section class="scene" id="${c.id}"><div class="cam full"><div class="shape"><span class="ml">${esc(v.label)}</span></div><div class="mf">${esc(v.final)}</div>${v.sub ? `<div class="ms">${esc(v.sub)}</div>` : ''}</div></section>`, css, js };
  },

  phone(v, c) {
    const S = `#${c.id}`;
    const pw = c.vertical ? 560 : 440, ph = Math.round(pw * 2.05), px = (c.W - pw) / 2, py = (c.H - ph) / 2 + (c.vertical ? 40 : 0);
    const rows = v.items.map((it, i) => `<div class="row${i === 1 ? ' on' : ''}">${esc(it)}<b></b></div>`).join('');
    const css = `${S}{background:radial-gradient(90% 60% at 50% 100%,${c.p.primary}40,${c.p.bg} 70%)}${S} .ph{position:absolute;left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;border-radius:${Math.round(pw * 0.16)}px;background:#0d0d10;border:14px solid #1d1d21;overflow:hidden}${S} .scr{position:absolute;inset:0;padding:${Math.round(pw * 0.2)}px 36px 0}${S} .scr h4{font:800 ${Math.round(pw * 0.095)}px/1.05 'Bricolage Grotesque',Geist,sans-serif;color:#fff;letter-spacing:-0.03em}${S} .himg{margin:26px 0;height:${Math.round(ph * 0.28)}px;border-radius:26px;overflow:hidden;background:${c.p.secondary}}${S} .himg img{width:100%;height:100%;object-fit:cover}${S} .row{display:flex;align-items:center;justify-content:space-between;margin-top:18px;padding:26px 28px;border-radius:24px;background:#1a1a1e;color:#fff;font:600 ${Math.round(pw * 0.05)}px Inter,sans-serif}${S} .row b{width:30px;height:30px;border-radius:50%;border:3px solid #555}${S} .row.on{background:${c.p.primary};color:${on(c.p.primary)}}${S} .row.on b{border-color:${on(c.p.primary)};background:${on(c.p.primary)}}${S} .pb{position:absolute;left:36px;right:36px;bottom:46px;height:${Math.round(pw * 0.2)}px;border-radius:${Math.round(pw * 0.1)}px;background:${c.p.primary};color:${on(c.p.primary)};display:grid;place-items:center;font:800 ${Math.round(pw * 0.065)}px Inter,sans-serif}${S} .nt{position:absolute;left:${Math.round(c.W * 0.08)}px;top:${c.vertical ? 150 : 60}px;width:${Math.round(c.W * 0.84)}px;height:150px;border-radius:44px;background:rgba(36,36,40,.82);backdrop-filter:blur(30px);display:flex;align-items:center;gap:28px;padding:0 36px;color:#fff;font:600 38px Inter,sans-serif;box-shadow:0 30px 60px -20px rgba(0,0,0,.7)}${S} .nt i{flex:none;width:84px;height:84px;border-radius:24px;background:${c.p.primary};display:grid;place-items:center}`;
    const t = c.at;
    const js = [
      `IZ.scene(tl,'${S}',${n(t)},${n(t + c.dur)});`,
      `IZ.mockup(tl,'${S} .ph',${n(t)},{duration:1.2,tiltX:20,tiltY:-38,fromY:${Math.round(c.H * 0.4)}});`,
      `IZ.springText(tl,'${S} .scr h4',${n(t + 0.7)},{by:'words',distance:50,blur:6});`,
      v.image ? `tl.from('${S} .himg',{scale:.7,opacity:0,duration:.8,ease:'spring.soft'},${n(t + 0.9)});` : '',
      `tl.from('${S} .row',{x:120,opacity:0,duration:.7,stagger:.08,ease:'spring'},${n(t + 1.1)});`,
      `tl.from('${S} .pb',{y:160,duration:.7,ease:'spring.soft'},${n(t + 1.5)});`,
      `tl.to('${S} .scr',{y:-${Math.round(ph * 0.12)},duration:1.2,ease:'power2.inOut'},${n(t + 2.1)});`,
      `IZ.press(tl,'${S} .pb',${n(t + 3.3)},{ring:'#ffffff'});`,
      v.notif ? `tl.from('${S} .nt',{y:-340,duration:.9,ease:'spring'},${n(t + 3.6)});` : '',
      `tl.to('${S} .ph',{scale:1.05,duration:${n(c.dur - 3.6)},ease:'none'},${n(t + 3.6)});`,
      `tl.to('${S} .cam',{xPercent:-110,filter:'blur(26px)',duration:.4,ease:'power4.in'},${n(t + c.dur - 0.4)});`
    ].filter(Boolean).join('\n');
    const html = `<section class="scene" id="${c.id}"><div class="cam full"><div style="position:absolute;inset:0;perspective:1800px"><div class="ph"><div class="scr"><h4>${esc(v.title)}</h4>${v.image ? `<div class="himg"><img src="${img(v.image)}"></div>` : ''}${rows}</div><div class="pb">${esc(v.button)}</div></div></div>${v.notif ? `<div class="nt"><i><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="${on(c.p.primary)}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5 9.5 17.5 19.5 6.5"/></svg></i><span>${esc(v.notif)}</span></div>` : ''}</div></section>`;
    return { html, css, js };
  },

  stat(v, c) {
    const S = `#${c.id}`;
    const r = c.vertical ? 360 : 300;
    const css = `${S}{background:${c.p.bg}}${S} svg.ring{position:absolute;left:${c.W / 2 - r - 20}px;top:${c.H / 2 - r - 60}px}${S} .sv{position:absolute;left:0;width:${c.W}px;top:${Math.round(c.H / 2 - 160)}px;text-align:center;font:800 ${c.vertical ? 190 : 170}px/1 'Bricolage Grotesque',Geist,sans-serif;letter-spacing:-0.05em;background:linear-gradient(90deg,${c.p.text},${c.p.primary});-webkit-background-clip:text;background-clip:text;color:transparent}${S} .sl{position:absolute;left:0;width:${c.W}px;top:${Math.round(c.H / 2 + 60)}px;text-align:center;font:600 46px Inter,sans-serif;color:${c.p.text};opacity:.85}`;
    const t = c.at;
    const js = [
      `IZ.scene(tl,'${S}',${n(t)},${n(t + c.dur)});`,
      `IZ.draw(tl,'${S} .ring circle.fg',${n(t + 0.1)},1.4,'power3.inOut');`,
      `tl.from('${S} .ring',{rotate:-120,scale:.6,duration:1.2,ease:'spring.soft',transformOrigin:'50% 50%'},${n(t)});`,
      `IZ.count(tl,'${S} .sv',0,${v.value},${n(t + 0.2)},1.5,{prefix:${JSON.stringify(v.prefix ?? '')},suffix:${JSON.stringify(v.suffix ?? '')}});`,
      `tl.from('${S} .sv',{scale:.4,duration:.9,ease:'spring.bouncy'},${n(t + 0.2)});`,
      `IZ.springText(tl,'${S} .sl',${n(t + 0.9)},{by:'words',distance:50});`,
      `tl.to('${S} .cam',{scale:.85,opacity:0,filter:'blur(14px)',duration:.4,ease:'power3.in'},${n(t + c.dur - 0.4)});`
    ].join('\n');
    const html = `<section class="scene" id="${c.id}"><div class="cam full"><svg class="ring" width="${2 * r + 40}" height="${2 * r + 40}" viewBox="0 0 ${2 * r + 40} ${2 * r + 40}"><circle cx="${r + 20}" cy="${r + 20}" r="${r}" fill="none" stroke="${c.p.text}22" stroke-width="10"/><circle class="fg" cx="${r + 20}" cy="${r + 20}" r="${r}" fill="none" stroke="${c.p.primary}" stroke-width="14" stroke-linecap="round" transform="rotate(-90 ${r + 20} ${r + 20})"/></svg><div class="sv">0</div><div class="sl">${esc(v.label)}</div></div></section>`;
    return { html, css, js };
  },

  hero(v, c) {
    const S = `#${c.id}`;
    const cw = c.vertical ? 860 : 820, ch = c.vertical ? 1120 : 720, cx = (c.W - cw) / 2, cy = (c.H - ch) / 2 - (c.vertical ? 60 : 0);
    const css = `${S}{background:${c.p.bg}}${S} .hc{position:absolute;left:${cx}px;top:${cy}px;width:${cw}px;height:${ch}px;border-radius:56px;overflow:hidden}${S} .hc img{width:100%;height:100%;object-fit:cover}${S} .hc .sh{position:absolute;inset:-40%;background:linear-gradient(100deg,transparent 42%,rgba(255,255,255,.4) 50%,transparent 58%)}${S} .hc .gr{position:absolute;inset:0;background:linear-gradient(180deg,transparent 45%,rgba(0,0,0,.75))}${S} .hk{position:absolute;left:${cx + 60}px;top:${cy + ch - 250}px;font:600 30px Inter,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.75)}${S} .hcap{position:absolute;left:${cx + 60}px;width:${cw - 120}px;top:${cy + ch - 200}px;font:800 ${c.vertical ? 78 : 66}px/1.02 'Bricolage Grotesque',Geist,sans-serif;letter-spacing:-0.04em;color:#fff}`;
    const t = c.at;
    const js = [
      `IZ.scene(tl,'${S}',${n(t)},${n(t + c.dur)});`,
      `IZ.mockup(tl,'${S} .hc',${n(t)},{duration:1.1,tiltX:12,tiltY:30,fromScale:.55});`,
      `tl.fromTo('${S} .hc img',{scale:1.35},{scale:1.04,duration:${n(c.dur)},ease:'power2.out'},${n(t)});`,
      `tl.fromTo('${S} .sh',{xPercent:-100},{xPercent:100,duration:1.1,ease:'power2.inOut'},${n(t + 0.9)});`,
      v.kicker ? `tl.from('${S} .hk',{y:20,opacity:0,duration:.5},${n(t + 0.8)});` : '',
      `IZ.springText(tl,'${S} .hcap',${n(t + 0.95)},{by:'words',distance:70});`,
      `tl.to('${S} .hc',{scale:2.6,duration:.6,ease:'expo.in'},${n(t + c.dur - 0.6)});`,
      `tl.to('${S} .cam',{opacity:0,duration:.25},${n(t + c.dur - 0.25)});`
    ].filter(Boolean).join('\n');
    return { html: `<section class="scene" id="${c.id}"><div class="cam full"><div style="position:absolute;inset:0;perspective:1800px"><div class="hc"><img src="${img(v.image)}"><div class="gr"></div><div class="sh"></div></div></div>${v.kicker ? `<div class="hk">${esc(v.kicker)}</div>` : ''}<div class="hcap">${esc(v.caption)}</div></div></section>`, css, js };
  },

  cta(v, c) {
    const S = `#${c.id}`;
    const bw = Math.min(c.W * 0.8, v.button.length * 30 + 220);
    const css = `${S}{background:radial-gradient(100% 70% at 50% 60%,${c.p.primary}55,${c.p.bg} 65%)}${S} .lg{position:absolute;left:${c.W / 2 - 110}px;top:${Math.round(c.H / 2 - 420)}px;width:220px;height:220px;object-fit:contain}${S} .ct{position:absolute;left:${c.W * 0.06}px;width:${c.W * 0.88}px;top:${Math.round(c.H / 2 - 160)}px;text-align:center;font:800 ${c.vertical ? 110 : 100}px/1.02 'Bricolage Grotesque',Geist,sans-serif;letter-spacing:-0.05em;color:${c.p.text}}${S} .cb{position:absolute;left:${(c.W - bw) / 2}px;top:${Math.round(c.H / 2 + 120)}px;width:${bw}px;height:140px;border-radius:70px;background:${c.p.primary};color:${on(c.p.primary)};display:grid;place-items:center;font:800 46px Inter,sans-serif;box-shadow:0 30px 70px -20px ${c.p.primary}aa}${S} .cl{position:absolute;left:0;width:${c.W}px;top:${Math.round(c.H / 2 + 300)}px;text-align:center;font:600 40px Inter,sans-serif;color:${c.p.text};opacity:.75}`;
    const t = c.at;
    const js = [
      `IZ.scene(tl,'${S}',${n(t)},${n(t + c.dur)});`,
      v.logo ? `tl.from('${S} .lg',{scale:0,rotate:-30,duration:.9,ease:'spring.bouncy'},${n(t + 0.1)});` : '',
      `IZ.springText(tl,'${S} .ct',${n(t + 0.3)},{by:'chars',stagger:.025});`,
      `tl.fromTo('${S} .cb',{width:140,scale:0},{scale:1,duration:.5,ease:'spring.bouncy'},${n(t + 0.9)}).to('${S} .cb',{width:${Math.round(bw)},duration:.6,ease:'spring.snappy'},${n(t + 1.3)});`,
      `tl.from('${S} .cb span',{opacity:0,y:20,duration:.4},${n(t + 1.6)});`,
      `IZ.press(tl,'${S} .cb',${n(t + 2.6)},{ring:'${c.p.primary}'});`,
      v.link ? `tl.from('${S} .cl',{y:30,opacity:0,duration:.6,ease:'spring.soft'},${n(t + 1.9)});` : '',
      `tl.fromTo('${S} .cam',{scale:1.08},{scale:1,duration:${n(c.dur)},ease:'power2.out'},${n(t)});`
    ].filter(Boolean).join('\n');
    return { html: `<section class="scene" id="${c.id}"><div class="cam full">${v.logo ? `<img class="lg" src="{{logo}}">` : ''}<div class="ct">${esc(v.title)}</div><div class="cb"><span>${esc(v.button)}</span></div>${v.link ? `<div class="cl">${esc(v.link)}</div>` : ''}</div></section>`, css, js };
  }
};

/** Remet les modèles bout à bout s'ils se chevauchent (léger fondu enchaîné de 0,15 s). */
export function sequenceBlocks<T extends { use: TemplateId; at: number; dur?: number }>(blocks: T[], bpm: number): T[] {
  const sorted = [...blocks].sort((a, b) => a.at - b.at);
  let end = 0;
  return sorted.map((b) => {
    const dur = b.dur ?? Math.max(2, TEMPLATE_BEATS[b.use] * 60 / bpm);
    const at = Math.round(Math.max(b.at, end > 0 ? end - 0.15 : 0) * 100) / 100;
    end = at + dur;
    return { ...b, at, dur };
  });
}

/** Transforme les modèles utilisés par une composition en HTML / CSS / JS (les variables invalides sont ignorées). */
export function expandBlocks(blocks: unknown, o: { W: number; H: number; vertical: boolean; palette: Palette; bpm: number }): TemplateOut & { errors: string[]; end: number } {
  const out = { html: '', css: '', js: '', errors: [] as string[], end: 0 };
  if (!Array.isArray(blocks)) return out;
  blocks.slice(0, 12).forEach((raw, i) => {
    const b = BlockSchema.safeParse(raw);
    if (!b.success) { out.errors.push(`bloc ${i + 1} invalide`); return; }
    const vars = TEMPLATE_VARS[b.data.use].safeParse(b.data.vars);
    if (!vars.success) { out.errors.push(`bloc ${i + 1} (${b.data.use}) : ${vars.error.issues.slice(0, 2).map((x) => `${x.path.join('.')} ${x.message}`).join(', ')}`); return; }
    const dur = b.data.dur ?? Math.max(2, TEMPLATE_BEATS[b.data.use] * 60 / o.bpm);
    const ctx: TemplateCtx = { id: `tb${i + 1}`, at: b.data.at, dur, W: o.W, H: o.H, vertical: o.vertical, p: o.palette };
    const r = (BUILD[b.data.use] as (v: unknown, c: TemplateCtx) => TemplateOut)(vars.data, ctx);
    out.end = Math.max(out.end, b.data.at + dur);
    out.html += r.html;
    out.css += r.css;
    out.js += `\n// --- modèle ${b.data.use} (${dur.toFixed(2)} s) ---\n${r.js}`;
  });
  return out;
}

/** Documentation des modèles pour l'IA. */
export const TEMPLATES_DOC = `MODÈLES PRÊTS (scènes premium, réglées au pixel ; tu fournis seulement les variables) — à mettre dans "blocks": [{"use":"…","at":début_s,"dur":durée_s,"vars":{…}}] :
- kinetic : {"lines":["1 à 3 lignes courtes"],"highlight":index_ligne_surlignée,"from":"bottom|left|right|scale|drop"} — typographie cinétique élastique (ressort + flou de mouvement).
- search : {"query":"texte tapé","results":["search:…","photo:0",…],"label":"titre au-dessus (optionnel)"} — barre de recherche en très gros plan qui pivote en 3D, texte tapé, bouton pressé, recul de caméra, résultats en cascade.
- browser : {"url":"monsite.fr","title":"…","subtitle":"…","image":"search:…","button":"…"} — fenêtre de navigateur 3D, page qui se construit, curseur qui clique, zoom de sortie.
- morph : {"label":"texte de la pastille","final":"mot final","sub":"…"} — pastille → rond → carte → plein écran, changements de couleur, mot final élastique.
- phone : {"title":"…","items":["2 à 5 lignes"],"button":"…","notif":"notification (optionnel)","image":"search:…"} — téléphone 3D, appli qui défile, bouton tapé, notification qui tombe.
- stat : {"value":1200,"prefix":"+","suffix":" clients","label":"…"} — UNIQUEMENT un chiffre réel donné par le client.
- hero : {"image":"photo:0|search:…","caption":"…","kicker":"…"} — photo en vedette qui pivote, reflet, légende élastique, zoom de sortie.
- cta : {"title":"…","button":"…","link":"…","logo":true si le client a un logo} — signature finale.
Les modèles sont calés sur le tempo (sans "dur", ils durent un nombre de temps musicaux). Tu peux mélanger modèles et scènes écrites sur mesure dans "html"/"js" (évite les mêmes instants).`;
