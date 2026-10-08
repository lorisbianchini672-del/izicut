/**
 * Studio Motion — sound design généré dans le navigateur (Web Audio).
 * Aucune musique sous droits : la bande-son est synthétisée à partir du
 * projet (style musical, tempo, effets sonores calés sur chaque scène, jingle
 * de fin). Rendue hors ligne en un AudioBuffer, elle sert à l'aperçu et à
 * l'export, parfaitement synchronisée avec l'animation.
 */
import { sceneCues } from './cues';
import { totalDuration, type MagicKind, type MotionProject, type Music, type Sfx } from './types';

type Chord = [number, 'M' | 'm' | 'M7' | 'm7'];
type Genre = {
  key: number; // note MIDI de la tonique
  prog: Chord[];
  kick: number[];
  snare: number[];
  hat: number[];
  openHat?: number[];
  clap?: boolean;
  bass: 'eighths' | 'offbeat' | 'sub' | 'long' | 'none';
  chords: 'pad' | 'stab' | 'pluck' | 'strings' | 'none';
  lead: 'arp' | 'bell' | 'none';
  swing?: number;
};

const MAJOR: Chord[] = [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']];
const MINOR: Chord[] = [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']];
const STEPS = (...n: number[]) => n;

const GENRES: Record<Exclude<Music, 'none'>, Genre> = {
  pop: { key: 60, prog: MAJOR, kick: STEPS(0, 6, 8), snare: STEPS(4, 12), hat: STEPS(0, 2, 4, 6, 8, 10, 12, 14), clap: true, bass: 'eighths', chords: 'stab', lead: 'arp' },
  electro: { key: 57, prog: MINOR, kick: STEPS(0, 4, 8, 12), snare: STEPS(4, 12), hat: STEPS(2, 6, 10, 14), openHat: STEPS(2, 6, 10, 14), clap: true, bass: 'offbeat', chords: 'pad', lead: 'arp' },
  chill: { key: 62, prog: [[0, 'M7'], [9, 'm7'], [2, 'm7'], [7, 'M']], kick: STEPS(0, 7, 10), snare: STEPS(4, 12), hat: STEPS(0, 2, 4, 6, 8, 10, 12, 14), bass: 'long', chords: 'pad', lead: 'bell', swing: 0.12 },
  epic: { key: 50, prog: MINOR, kick: STEPS(0, 3, 8, 11), snare: STEPS(8), hat: STEPS(0, 4, 8, 12), bass: 'long', chords: 'strings', lead: 'none' },
  acoustic: { key: 64, prog: MAJOR, kick: STEPS(0, 8), snare: STEPS(4, 12), hat: STEPS(2, 6, 10, 14), clap: true, bass: 'long', chords: 'pluck', lead: 'none' },
  hiphop: { key: 55, prog: MINOR, kick: STEPS(0, 3, 10), snare: STEPS(4, 12), hat: STEPS(0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14), bass: 'sub', chords: 'pad', lead: 'bell', swing: 0.08 }
};

const SHAPES: Record<Chord[1], number[]> = { M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10] };
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Effet sonore joué par défaut à chaque coupe, selon la transition. */
const DEFAULT_CUT: Record<NonNullable<MotionProject['transition']>, Sfx> = { flash: 'whoosh', slide: 'swipe', zoom: 'whoosh', wipe: 'swipe', glitch: 'glitch', blur: 'whoosh' };

const MAGIC_SFX: Record<MagicKind, Sfx> = { notification: 'chime', sticker: 'pop', badge: 'pop', button: 'pop', emoji: 'pop', review: 'chime', qr: 'click' };

/** Réplique de voix-off déjà synthétisée, calée sur la timeline. */
export type VoiceClip = { start: number; buffer: AudioBuffer };
export type VoiceTrack = { key: string; clips: VoiceClip[] };

export function hasSound(p: MotionProject): boolean {
  return Boolean(p.sound) || p.scenes.some((s) => s.sfx || s.magic?.length || sceneCues(s).length);
}

const cache = new Map<string, Promise<AudioBuffer | null>>();

/** Bande-son complète du projet (mise en cache tant que le projet sonore ne change pas). */
export function renderSoundtrack(project: MotionProject, voice?: VoiceTrack | null): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined' || typeof OfflineAudioContext === 'undefined' || (!hasSound(project) && !voice?.clips.length)) return Promise.resolve(null);
  const key = JSON.stringify([voice?.key ?? '', project.sound, project.transition, project.scenes.map((s) => [s.duration, s.sfx, s.type, s.magic?.map((m) => [m.kind, m.at, m.sfx]), sceneCues(s).map((q) => [q.at, q.kind])])]);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = render(project, voice?.clips ?? []).catch(() => null);
  cache.set(key, job);
  if (cache.size > 12) cache.delete(cache.keys().next().value as string);
  return job;
}

async function render(project: MotionProject, voice: VoiceClip[]): Promise<AudioBuffer> {
  const sr = 44100;
  const total = totalDuration(project);
  const ctx = new OfflineAudioContext(2, Math.ceil((total + 0.05) * sr), sr);
  const noise = ctx.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.setValueAtTime(1, 0);
  master.gain.setValueAtTime(1, Math.max(0, total - 0.25));
  master.gain.linearRampToValueAtTime(0, total);
  master.connect(comp);

  const music = project.sound?.music ?? 'none';
  if (music !== 'none') {
    const bus = ctx.createGain();
    const vol = project.sound?.volume ?? 0.6;
    const L = vol * 0.9;
    const duck = L * 0.25; // ≈ -12 dB pendant que la voix parle (ducking)
    bus.gain.setValueAtTime(0, 0);
    bus.gain.linearRampToValueAtTime(L, 0.15);
    let cursor = 0.15;
    for (const v of [...voice].sort((a, b) => a.start - b.start)) {
      const s0 = Math.max(cursor + 0.01, v.start - 0.12);
      const e0 = Math.min(total, v.start + v.buffer.duration);
      if (s0 >= e0) continue;
      bus.gain.setValueAtTime(L, s0);
      bus.gain.linearRampToValueAtTime(duck, Math.min(e0, s0 + 0.12));
      bus.gain.setValueAtTime(duck, e0);
      cursor = Math.min(total - 0.01, e0 + 0.3);
      bus.gain.linearRampToValueAtTime(L, cursor);
    }
    bus.gain.setValueAtTime(L, Math.max(cursor + 0.01, total - 1));
    bus.gain.linearRampToValueAtTime(L * 0.5, total);
    bus.connect(master);
    playMusic(ctx, bus, noise, GENRES[music], project.sound?.bpm ?? 110, total, project);
  }

  // Voix-off au-dessus de tout (le compresseur évite la saturation).
  if (voice.length) {
    const vBus = ctx.createGain();
    vBus.gain.value = 1.15;
    vBus.connect(master);
    for (const v of voice) {
      if (v.start >= total) continue;
      const src = ctx.createBufferSource();
      src.buffer = v.buffer;
      src.connect(vBus);
      src.start(v.start);
    }
  }

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.75;
  sfxBus.connect(master);
  let start = 0;
  const cut = DEFAULT_CUT[project.transition ?? 'flash'];
  project.scenes.forEach((scene, i) => {
    const isLast = i === project.scenes.length - 1 && i > 0;
    const sfx: Sfx | undefined = scene.sfx ?? (project.sound ? (i === 0 ? 'impact' : isLast ? 'impact' : cut) : undefined);
    if (sfx) playSfx(ctx, sfxBus, noise, sfx, Math.max(0, i === 0 ? 0.02 : start - 0.05));
    // Chaque apparition magique a son bruitage.
    for (const m of scene.magic ?? []) {
      const at = start + m.at;
      if (at >= total - 0.1) continue;
      playSfx(ctx, sfxBus, noise, m.sfx ?? MAGIC_SFX[m.kind], at);
      if (m.kind === 'button' && at + 0.9 < total) playSfx(ctx, sfxBus, noise, 'click', at + 0.9);
    }
    // Bruitages calés sur l'image des scènes « démo » (clic du curseur, frappe au clavier…).
    sceneCues(scene).forEach((q, qi) => {
      const at = start + q.at;
      if (at >= total - 0.05) return;
      if (q.kind === 'key') {
        // Frappe de clavier : petit claquement filtré, hauteur légèrement variable.
        const f = 2600 + ((qi * 7919) % 1700);
        noiseSrc(ctx, noise, at, 0.04, filter(ctx, 'bandpass', f, env(ctx, sfxBus, at, 0.22, 0.002, 0.035), 1.4));
      } else playSfx(ctx, sfxBus, noise, q.kind, at);
    });
    // Jingle de fin : petite signature mélodique sur la dernière scène.
    if (isLast && project.sound) jingle(ctx, sfxBus, start + 0.25, project.sound.music === 'none' ? 60 : GENRES[project.sound.music].key);
    start += scene.duration;
  });

  return ctx.startRendering();
}

// ---------- Instruments ----------
type Ctx = OfflineAudioContext;

function env(ctx: Ctx, dest: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

function osc(ctx: Ctx, type: OscillatorType, freq: number, t: number, dur: number, dest: AudioNode, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function noiseSrc(ctx: Ctx, buf: AudioBuffer, t: number, dur: number, dest: AudioNode): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
  return s;
}

function filter(ctx: Ctx, type: BiquadFilterType, freq: number, dest: AudioNode, q = 1): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(dest);
  return f;
}

function kick(ctx: Ctx, out: AudioNode, t: number, v = 1) {
  const g = env(ctx, out, t, 0.9 * v, 0.003, 0.32);
  const o = osc(ctx, 'sine', 150, t, 0.4, g);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
}
function snare(ctx: Ctx, out: AudioNode, nb: AudioBuffer, t: number, v = 1) {
  noiseSrc(ctx, nb, t, 0.2, filter(ctx, 'highpass', 1400, env(ctx, out, t, 0.45 * v, 0.002, 0.16)));
  osc(ctx, 'triangle', 190, t, 0.1, env(ctx, out, t, 0.3 * v, 0.002, 0.08));
}
function clap(ctx: Ctx, out: AudioNode, nb: AudioBuffer, t: number) {
  for (let k = 0; k < 3; k++) noiseSrc(ctx, nb, t + k * 0.012, 0.12, filter(ctx, 'bandpass', 1500, env(ctx, out, t + k * 0.012, 0.3, 0.001, k === 2 ? 0.14 : 0.02), 1.2));
}
function hat(ctx: Ctx, out: AudioNode, nb: AudioBuffer, t: number, open = false) {
  noiseSrc(ctx, nb, t, open ? 0.3 : 0.06, filter(ctx, 'highpass', 8000, env(ctx, out, t, open ? 0.12 : 0.14, 0.001, open ? 0.22 : 0.04)));
}

function playMusic(ctx: Ctx, out: AudioNode, nb: AudioBuffer, g: Genre, bpm: number, total: number, project: MotionProject) {
  const step = 60 / bpm / 4;
  const bars = Math.ceil(total / (step * 16)) + 1;
  // Section « drop » : la batterie entre complètement après l'accroche.
  const hookEnd = Math.min(project.scenes[0]?.duration ?? 2, 3);
  for (let bar = 0; bar < bars; bar++) {
    const [root, quality] = g.prog[bar % g.prog.length];
    const chord = SHAPES[quality].map((iv) => g.key + root + iv);
    const barT = bar * step * 16;
    if (barT > total) break;
    for (let s = 0; s < 16; s++) {
      const swing = s % 2 === 1 ? (g.swing ?? 0) * step : 0;
      const t = barT + s * step + swing;
      if (t > total - 0.05) break;
      const full = t >= hookEnd - 0.01;
      if (g.kick.includes(s) && (full || s === 0)) kick(ctx, out, t, 1);
      if (full && g.snare.includes(s)) (g.clap ? clap(ctx, out, nb, t) : snare(ctx, out, nb, t));
      if (g.hat.includes(s)) hat(ctx, out, nb, t, false);
      if (full && g.openHat?.includes(s)) hat(ctx, out, nb, t, true);
      // Basse
      const bassNote = hz(g.key + root - 24);
      if (full || bar === 0) {
        if (g.bass === 'eighths' && s % 2 === 0) bass(ctx, out, bassNote, t, step * 1.6, 'sawtooth');
        if (g.bass === 'offbeat' && s % 4 === 2) bass(ctx, out, bassNote, t, step * 1.8, 'sawtooth');
        if (g.bass === 'sub' && (s === 0 || s === 10)) sub(ctx, out, bassNote, t, step * 6);
        if (g.bass === 'long' && s === 0) bass(ctx, out, bassNote, t, step * 15, 'triangle');
      }
      // Accords
      if (g.chords === 'stab' && (s === 2 || s === 7 || s === 10)) stab(ctx, out, chord, t, step * 1.5);
      if (g.chords === 'pluck' && s % 2 === 0) pluck(ctx, out, hz(chord[(s / 2) % chord.length] + 12), t);
      // Mélodie
      if (full && g.lead === 'arp' && s % 2 === 1) pluck(ctx, out, hz(chord[((s - 1) / 2) % chord.length] + 24), t, 0.12);
      if (g.lead === 'bell' && (s === 0 || s === 6 || s === 12)) bell(ctx, out, hz(chord[(s / 6) % chord.length] + 24), t, 0.08);
    }
    if (g.chords === 'pad') pad(ctx, out, chord, barT, step * 16, 'sawtooth', 900);
    if (g.chords === 'strings') pad(ctx, out, chord, barT, step * 16, 'sawtooth', 1600);
    if (g.chords === 'strings' && bar % 2 === 0) boom(ctx, out, nb, barT);
  }
}

function bass(ctx: Ctx, out: AudioNode, f: number, t: number, dur: number, type: OscillatorType) {
  const g = env(ctx, out, t, 0.32, 0.01, dur);
  osc(ctx, type, f, t, dur, filter(ctx, 'lowpass', 420, g));
}
function sub(ctx: Ctx, out: AudioNode, f: number, t: number, dur: number) {
  const g = env(ctx, out, t, 0.55, 0.005, dur);
  const o = osc(ctx, 'sine', f * 1.5, t, dur, g);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
}
function stab(ctx: Ctx, out: AudioNode, notes: number[], t: number, dur: number) {
  const g = env(ctx, out, t, 0.09, 0.005, dur);
  const lp = filter(ctx, 'lowpass', 2400, g);
  notes.forEach((n) => { osc(ctx, 'sawtooth', hz(n), t, dur, lp, -6); osc(ctx, 'sawtooth', hz(n), t, dur, lp, 6); });
}
function pluck(ctx: Ctx, out: AudioNode, f: number, t: number, peak = 0.1) {
  const g = env(ctx, out, t, peak, 0.003, 0.28);
  const lp = filter(ctx, 'lowpass', 3000, g);
  lp.frequency.setValueAtTime(3500, t);
  lp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
  osc(ctx, 'triangle', f, t, 0.3, lp);
  osc(ctx, 'square', f, t, 0.12, env(ctx, lp, t, 0.25, 0.002, 0.08));
}
function bell(ctx: Ctx, out: AudioNode, f: number, t: number, peak = 0.08) {
  [1, 2.76, 5.4].forEach((m, i) => osc(ctx, 'sine', f * m, t, 1.2, env(ctx, out, t, peak / (i + 1), 0.003, 1.1 / (i + 1))));
}
function pad(ctx: Ctx, out: AudioNode, notes: number[], t: number, dur: number, type: OscillatorType, cutoff: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05, t + Math.min(0.4, dur / 3));
  g.gain.setValueAtTime(0.05, t + dur * 0.8);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  const lp = filter(ctx, 'lowpass', cutoff, g);
  notes.forEach((n) => { osc(ctx, type, hz(n), t, dur, lp, -8); osc(ctx, type, hz(n), t, dur, lp, 8); });
}
function boom(ctx: Ctx, out: AudioNode, nb: AudioBuffer, t: number) {
  const g = env(ctx, out, t, 0.7, 0.005, 1.1);
  const o = osc(ctx, 'sine', 90, t, 1.2, g);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.6);
  noiseSrc(ctx, nb, t, 0.5, filter(ctx, 'lowpass', 700, env(ctx, out, t, 0.25, 0.005, 0.45)));
}

// ---------- Effets sonores ----------
function playSfx(ctx: Ctx, out: AudioNode, nb: AudioBuffer, sfx: Sfx, t: number) {
  switch (sfx) {
    case 'whoosh':
    case 'swipe': {
      const dur = sfx === 'whoosh' ? 0.42 : 0.2;
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(-0.8, t);
      pan.pan.linearRampToValueAtTime(0.8, t + dur);
      pan.connect(out);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(sfx === 'whoosh' ? 0.6 : 0.45, t + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(pan);
      const bp = filter(ctx, 'bandpass', 400, g, 1.4);
      bp.frequency.setValueAtTime(sfx === 'whoosh' ? 300 : 900, t);
      bp.frequency.exponentialRampToValueAtTime(sfx === 'whoosh' ? 3200 : 6000, t + dur);
      noiseSrc(ctx, nb, t, dur, bp);
      break;
    }
    case 'pop': {
      const o = osc(ctx, 'sine', 900, t, 0.12, env(ctx, out, t, 0.6, 0.002, 0.1));
      o.frequency.exponentialRampToValueAtTime(240, t + 0.08);
      break;
    }
    case 'click':
      osc(ctx, 'square', 2200, t, 0.02, env(ctx, out, t, 0.25, 0.001, 0.015));
      noiseSrc(ctx, nb, t, 0.02, filter(ctx, 'highpass', 4000, env(ctx, out, t, 0.2, 0.001, 0.01)));
      break;
    case 'impact': {
      const o = osc(ctx, 'sine', 75, t, 1.1, env(ctx, out, t, 0.9, 0.004, 0.95));
      o.frequency.exponentialRampToValueAtTime(34, t + 0.7);
      noiseSrc(ctx, nb, t, 0.5, filter(ctx, 'lowpass', 900, env(ctx, out, t, 0.4, 0.003, 0.45)));
      break;
    }
    case 'riser': {
      const s = Math.max(0, t - 0.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      g.connect(out);
      const bp = filter(ctx, 'bandpass', 300, g, 2);
      bp.frequency.setValueAtTime(300, s);
      bp.frequency.exponentialRampToValueAtTime(5000, t);
      noiseSrc(ctx, nb, s, t - s + 0.05, bp);
      break;
    }
    case 'chime':
      [0, 4, 7].forEach((iv, i) => bell(ctx, out, hz(84 + iv), t + i * 0.08, 0.12));
      break;
    case 'fizz': {
      // Pétillement (ouverture de boisson, effervescence).
      const hp = filter(ctx, 'highpass', 4500, out);
      for (let k = 0; k < 45; k++) {
        const tk = t + Math.random() * 0.9;
        noiseSrc(ctx, nb, tk, 0.02, env(ctx, hp, tk, 0.05 + Math.random() * 0.25, 0.001, 0.01 + Math.random() * 0.02));
      }
      noiseSrc(ctx, nb, t, 0.25, filter(ctx, 'bandpass', 2500, env(ctx, out, t, 0.35, 0.003, 0.2), 0.8));
      break;
    }
    case 'bubble':
      for (let k = 0; k < 7; k++) {
        const tk = t + Math.random() * 0.5;
        const o = osc(ctx, 'sine', 380 + Math.random() * 300, tk, 0.08, env(ctx, out, tk, 0.25, 0.003, 0.06));
        o.frequency.exponentialRampToValueAtTime(1300 + Math.random() * 600, tk + 0.06);
      }
      break;
    case 'glitch':
      for (let k = 0; k < 8; k++) {
        const tk = t + k * 0.028;
        osc(ctx, 'square', 200 + Math.random() * 2400, tk, 0.025, env(ctx, out, tk, 0.12, 0.001, 0.02));
      }
      break;
  }
}

function jingle(ctx: Ctx, out: AudioNode, t: number, key: number) {
  // Signature de fin : arpège montant + accord tenu.
  [0, 4, 7, 12].forEach((iv, i) => bell(ctx, out, hz(key + 12 + iv), t + i * 0.11, 0.1));
}

// ---------- Lecture synchronisée ----------
/** Joue la bande-son en suivant le temps de l'aperçu (lecture, pause, saut, boucle). */
export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  private startCtx = 0;
  private startOffset = 0;
  buffer: AudioBuffer | null = null;

  context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  async unlock() {
    await this.context().resume().catch(() => undefined);
  }

  setBuffer(buf: AudioBuffer | null) {
    if (buf === this.buffer) return;
    this.buffer = buf;
    this.stop();
  }

  sync(t: number, playing: boolean, enabled: boolean) {
    if (!enabled || !playing || !this.buffer) { this.stop(); return; }
    const ctx = this.context();
    if (ctx.state !== 'running') return;
    if (this.src) {
      const expected = this.startOffset + (ctx.currentTime - this.startCtx);
      if (Math.abs(expected - t) < 0.2) return;
      this.stop();
    }
    if (t >= this.buffer.duration - 0.05) return;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(ctx.destination);
    src.start(0, t);
    this.src = src;
    this.startCtx = ctx.currentTime;
    this.startOffset = t;
  }

  stop() {
    if (this.src) {
      try { this.src.stop(); } catch { /* déjà arrêté */ }
      this.src.disconnect();
      this.src = null;
    }
  }
}
