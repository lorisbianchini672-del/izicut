/**
 * Kit de motion design avancé, injecté dans chaque composition (après GSAP) :
 *  - courbes « ressort » physiques (oscillateur amorti) : spring, spring.soft, spring.bouncy, spring.snappy ;
 *  - IZ.beat(n) : instant du n-ième temps de la musique (synchro rythmique) ;
 *  - IZ.springText : lettres / mots élastiques avec flou de mouvement simulé ;
 *  - IZ.mockup : interface (navigateur, barre de recherche, carte) qui zoome et pivote en 3D, ombre dynamique ;
 *  - IZ.morph : forme qui change de taille, d'arrondi et de couleur par morphing fluide ;
 *  - IZ.press : micro-interaction de bouton (enfoncement, rebond, onde).
 */
export const KIT_JS = String.raw`
(function () {
  // ---------- Ressort physique : x(t) = 1 - e^(-ζωt)(cos ωd t + ζω/ωd sin ωd t) ----------
  function springEase(zeta, omega) {
    var wd = omega * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta));
    // Durée « physique » ramenée à [0,1] : on s'arrête quand l'amplitude résiduelle < 0,1 %.
    var T = Math.log(1000) / (zeta * omega);
    return function (p) {
      if (p <= 0) return 0; if (p >= 1) return 1;
      var t = p * T;
      return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + (zeta * omega / wd) * Math.sin(wd * t));
    };
  }
  gsap.registerEase('spring', springEase(0.42, 10));
  gsap.registerEase('spring.soft', springEase(0.65, 8));
  gsap.registerEase('spring.bouncy', springEase(0.28, 11));
  gsap.registerEase('spring.snappy', springEase(0.55, 16));

  var IZ = window.IZ;
  var BPM = window.__izBpm || 120;
  var OFFSET = window.__izBeatOffset || 0;
  IZ.bpm = BPM;
  /** Instant (s) du n-ième temps (0 = début). IZ.beat(4) = début de la 2e mesure en 4/4. */
  IZ.beat = function (n) { return OFFSET + n * 60 / BPM; };
  /** Durée de n temps. */
  IZ.beats = function (n) { return n * 60 / BPM; };

  /** Lettres (ou mots) élastiques : arrivée en ressort + flou de mouvement qui retombe avec la vitesse. */
  IZ.springText = function (tl, sel, at, o) {
    o = o || {};
    var parts = IZ.split(sel, o.by === 'words' ? 'words' : 'chars');
    var from = o.from || 'bottom';
    var dist = o.distance || 140;
    var vars = { duration: o.duration || 0.9, stagger: o.stagger === undefined ? (o.by === 'words' ? 0.09 : 0.035) : o.stagger, ease: o.ease || 'spring' };
    var start = { opacity: 0 };
    if (from === 'bottom') { start.y = dist; start.rotate = 8; }
    else if (from === 'top') { start.y = -dist; start.rotate = -8; }
    else if (from === 'left') { start.x = -dist * 1.6; start.skewX = 18; }
    else if (from === 'right') { start.x = dist * 1.6; start.skewX = -18; }
    else if (from === 'scale') { start.scale = 2.6; }
    else if (from === 'drop') { start.y = -dist * 2.2; start.rotationX = -80; }
    start.scaleY = from === 'bottom' || from === 'top' ? 1.35 : 1;
    tl.fromTo(parts, start, Object.assign({ opacity: 1, x: 0, y: 0, rotate: 0, skewX: 0, scale: 1, scaleY: 1, rotationX: 0 }, vars), at);
    // Flou de mouvement simulé : fort au départ, nul à l'arrivée (plus rapide que le mouvement).
    tl.fromTo(parts, { filter: 'blur(' + (o.blur === undefined ? 14 : o.blur) + 'px)' }, { filter: 'blur(0px)', duration: vars.duration * 0.45, stagger: vars.stagger, ease: 'power2.out' }, at);
    if (o.out !== undefined) {
      tl.to(parts, { y: -dist * 0.8, opacity: 0, filter: 'blur(12px)', scaleY: 1.3, duration: 0.32, stagger: Math.min(0.02, vars.stagger), ease: 'power3.in' }, o.out);
    }
    return parts;
  };

  /** Interface qui arrive en 3D, zoome puis se pose ; l'ombre portée suit l'inclinaison. */
  IZ.mockup = function (tl, sel, at, o) {
    o = o || {};
    var dur = o.duration || 1.2;
    IZ.q(sel).forEach(function (el) { el.style.transformStyle = 'preserve-3d'; if (el.parentElement) el.parentElement.style.perspective = (o.perspective || 1800) + 'px'; });
    tl.fromTo(sel,
      { rotationX: o.tiltX === undefined ? 28 : o.tiltX, rotationY: o.tiltY === undefined ? -22 : o.tiltY, scale: o.fromScale || 0.72, y: o.fromY === undefined ? 220 : o.fromY, opacity: 0, boxShadow: '0px 120px 160px -40px rgba(0,0,0,0.85)' },
      { rotationX: 0, rotationY: 0, scale: 1, y: 0, opacity: 1, boxShadow: '0px 40px 80px -30px rgba(0,0,0,0.6)', duration: dur, ease: o.ease || 'spring.soft' }, at);
    if (o.zoom) tl.to(sel, { scale: o.zoom, y: o.zoomY || 0, duration: o.zoomDuration || 1.4, ease: 'power3.inOut' }, at + dur * 0.8);
    if (o.float !== false) tl.to(sel, { rotationY: 6, rotationX: -3, duration: o.floatDuration || 2.4, ease: 'sine.inOut' }, at + dur);
  };

  /**
   * Morphing d'une forme : chaque étape { w, h, r (arrondi), bg (couleur), x, y, rotate, d (durée) }.
   * Exemple : pastille → rond → carte → plein écran.
   */
  IZ.morph = function (tl, sel, at, steps, o) {
    o = o || {};
    var t = at;
    steps.forEach(function (s, i) {
      var v = { duration: s.d || 0.6, ease: s.ease || o.ease || 'spring.snappy' };
      if (s.w !== undefined) v.width = s.w;
      if (s.h !== undefined) v.height = s.h;
      if (s.r !== undefined) v.borderRadius = s.r;
      if (s.bg !== undefined) v.backgroundColor = s.bg;
      if (s.x !== undefined) v.x = s.x;
      if (s.y !== undefined) v.y = s.y;
      if (s.rotate !== undefined) v.rotate = s.rotate;
      if (s.scale !== undefined) v.scale = s.scale;
      tl.to(sel, v, t);
      t += (s.d || 0.6) + (s.hold === undefined ? 0.15 : s.hold);
    });
    return t;
  };

  /** Bouton pressé : enfoncement, rebond, onde qui s'étend. */
  IZ.press = function (tl, sel, at, o) {
    o = o || {};
    tl.to(sel, { scale: 0.88, duration: 0.09, ease: 'power2.in' }, at);
    tl.to(sel, { scale: 1, duration: 0.6, ease: 'spring.bouncy' }, at + 0.09);
    if (o.color) tl.to(sel, { backgroundColor: o.color, duration: 0.25 }, at + 0.05);
    IZ.q(sel).forEach(function (el) {
      var ring = document.createElement('span');
      ring.style.cssText = 'position:absolute;left:50%;top:50%;width:100%;height:100%;border-radius:inherit;border:4px solid ' + (o.ring || 'rgba(255,255,255,.8)') + ';opacity:0;pointer-events:none';
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.appendChild(ring);
      gsap.set(ring, { xPercent: -50, yPercent: -50 });
      tl.fromTo(ring, { opacity: 0.9, scale: 1 }, { opacity: 0, scale: 1.8, duration: 0.6, ease: 'power2.out' }, at + 0.08);
    });
  };
})();
`;
