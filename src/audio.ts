// Tiny Web Audio chiptune synth: SFX and a tune of its own for each arena.

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;

export function unlockAudio() {
  // iOS: play through the silent switch like a media app (Safari 16.4+).
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session && session.type !== 'playback') session.type = 'playback';
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number) {
  if (!ctx) return;
  const t = at || ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function noise(dur: number, vol: number, cutoff: number, at = 0, type: BiquadFilterType = 'lowpass', sweepTo?: number) {
  if (!ctx) return;
  const t = at || ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(cutoff, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur);
}

function arp(notes: number[], step: number, vol = 0.25, type: OscillatorType = 'square') {
  if (!ctx) return;
  const t = ctx.currentTime;
  notes.forEach((n, i) => n && tone(midiHz(n), step, type, vol, t + i * step));
}

/** Skips a sound already played this many seconds ago, so rapid fire doesn't pile up. */
const last: Record<string, number> = {};
function every(key: string, gap: number) {
  if (!ctx) return false;
  if (ctx.currentTime - (last[key] ?? -1) < gap) return false;
  last[key] = ctx.currentTime;
  return true;
}

export const sfx = {
  move: () => tone(1400, 0.02, 'square', 0.12),
  select: () => tone(988, 0.04, 'square', 0.18),
  start: () => arp([60, 67, 72, 0, 72, 75, 79, 84], 0.06, 0.2),
  pause: () => arp([84, 79], 0.06, 0.18),
  place: () => every('place', 0.03) && tone(180, 0.06, 'square', 0.16, 0, 90),
  boom: () => {
    if (!every('boom', 0.05)) return;
    noise(0.5, 0.55, 2400, 0, 'lowpass', 90);
    tone(110, 0.25, 'square', 0.14, 0, 35);
  },
  kick: () => tone(300, 0.05, 'square', 0.14, 0, 600),
  throw: () => tone(400, 0.2, 'triangle', 0.14, 0, 900),
  bounce: () => every('bounce', 0.04) && tone(220, 0.05, 'triangle', 0.14, 0, 140),
  item: () => arp([79, 84, 88, 91], 0.035, 0.18),
  curse: () => arp([66, 65, 64, 63, 62], 0.05, 0.16, 'sawtooth'),
  burn: () => every('burn', 0.05) && noise(0.15, 0.12, 4000, 0, 'bandpass', 800),
  die: () => {
    if (!ctx) return;
    for (let k = 0; k < 6; k++) tone(880 - k * 110, 0.1, 'square', 0.15, ctx.currentTime + k * 0.07, 440 - k * 60);
  },
  ready: () => tone(660, 0.12, 'square', 0.16),
  go: () => tone(1320, 0.3, 'square', 0.18),
  hurry: () => {
    if (!ctx) return;
    for (let k = 0; k < 4; k++) {
      tone(880, 0.12, 'square', 0.16, ctx.currentTime + k * 0.3);
      tone(660, 0.12, 'square', 0.12, ctx.currentTime + k * 0.3 + 0.15);
    }
  },
  slam: () => every('slam', 0.03) && noise(0.12, 0.3, 900, 0, 'lowpass', 100),
  tally: () => every('tally', 0.03) && tone(1600, 0.02, 'square', 0.08),
  win: () => arp([72, 76, 79, 84, 0, 79, 84, 88, 91], 0.08, 0.22),
  draw: () => arp([67, 0, 63, 0, 60], 0.12, 0.2, 'triangle'),
  champion: () => arp([60, 64, 67, 72, 0, 67, 72, 76, 79, 0, 76, 79, 84, 0, 84, 84, 84], 0.09, 0.22),
  over: () => arp([67, 63, 60, 55, 51, 48], 0.12, 0.22),
};

// ---------- music ----------
// A tune for each arena, a loop of sixteenths written out as data: a melody,
// a chord a bar, and parts that come in as intensity (1-5) rises over the round.

interface Tune {
  name: string;
  /** Seconds per unit at tempo 1. */
  unit: number;
  length: number;
  /** Schedule whatever sounds at unit i (already wrapped into the loop). */
  play(i: number, t: number, lv: number, tr: number, unitSec: number): void;
}

const perc = {
  snare: (t: number, vol: number) => noise(0.08, vol, 5000, t, 'highpass'),
  hat: (t: number, vol: number) => noise(0.03, vol, 9000, t, 'highpass'),
  kick: (t: number, vol: number) => {
    tone(140, 0.12, 'sine', vol, t, 40);
    noise(0.04, vol * 0.4, 300, t);
  },
  tom: (t: number, vol: number, hz = 120) => tone(hz, 0.16, 'sine', vol, t, hz * 0.55),
  /** Darbuka rim. */
  tek: (t: number, vol: number) => noise(0.03, vol, 3000, t, 'bandpass'),
  shaker: (t: number, vol: number) => noise(0.05, vol, 8000, t, 'bandpass'),
  clap: (t: number, vol: number) => {
    noise(0.02, vol, 1500, t, 'bandpass');
    noise(0.12, vol, 1500, t + 0.012, 'bandpass');
  },
  /** Big eighties snare. */
  gated: (t: number, vol: number) => {
    noise(0.25, vol, 2500, t);
    noise(0.06, vol * 0.6, 6000, t, 'highpass');
  },
  crash: (t: number, vol: number) => noise(0.5, vol, 5000, t, 'highpass'),
};

type Wave = OscillatorType | 'pulse' | 'thin';
interface Opts {
  /** Vibrato depth in semitones, fading in. */
  vib?: number;
  /** Detune in cents. */
  det?: number;
  /** A bell: dies away over this many seconds, whatever the note length. */
  pluck?: number;
  /** Fade-in seconds. */
  att?: number;
  /** Lowpass cutoff in Hz, closing to a quarter over the note. */
  lp?: number;
}

const waves: Partial<Record<Wave, PeriodicWave>> = {};
/** A pulse wave of the given duty: 'pulse' 25%, 'thin' 12.5%. */
function pulseWave(duty: number) {
  const re = new Float32Array(32), im = new Float32Array(32);
  for (let n = 1; n < 32; n++) {
    re[n] = Math.sin(2 * Math.PI * n * duty) / n;
    im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / n;
  }
  return ctx!.createPeriodicWave(re, im);
}

/** A music note at MIDI m: like tone(), with a few more ways to shape it. */
function voice(m: number, dur: number, type: Wave, vol: number, t: number, o: Opts = {}) {
  if (!ctx || !(dur > 0)) return;
  const osc = ctx.createOscillator();
  if (type === 'pulse' || type === 'thin') osc.setPeriodicWave((waves[type] ??= pulseWave(type === 'pulse' ? 0.25 : 0.125)));
  else osc.type = type;
  osc.frequency.setValueAtTime(midiHz(m), t);
  if (o.det) osc.detune.setValueAtTime(o.det, t);
  const end = t + (o.pluck ?? dur);
  const g = ctx.createGain();
  if (o.pluck) {
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
  } else {
    const att = Math.min(o.att ?? 0, dur * 0.5);
    g.gain.setValueAtTime(att ? 0 : vol, t);
    if (att) g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, t + Math.max(att, dur * 0.7));
    g.gain.linearRampToValueAtTime(0, end);
  }
  if (o.vib && dur > 0.2) {
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(o.vib * 100, t + Math.min(0.3, dur * 0.6));
    lfo.connect(depth).connect(osc.detune);
    lfo.start(t);
    lfo.stop(end + 0.01);
  }
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(o.lp, t);
    f.frequency.exponentialRampToValueAtTime(o.lp / 4, end);
    osc.connect(f).connect(g);
  } else osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(end + 0.01);
}

/** A bell with two echoes, 3 and 6 units later. */
function bell(m: number, vol: number, t: number, u: number, type: Wave = 'triangle') {
  [1, 0.35, 0.12].forEach((k, j) => voice(m, 1, type, vol * k, t + j * 3 * u, { pluck: 0.35 }));
}

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** Pitch class of a leading 'c', 'f#', 'bb' (any case), and what follows it. */
function pc(s: string): [number, string] {
  s = s.toLowerCase();
  let n = PC[s[0]], k = 1;
  if (s[1] === '#') (n++, k++);
  else if (s[1] === 'b') (n--, k++);
  return [(n + 12) % 12, s.slice(k)];
}
/** 'c#5' → 73. */
function pitch(s: string) {
  const [p, oct] = pc(s);
  return 12 * (+oct + 1) + p;
}

/** A melody: n holds the note starting at each sixteenth (0 none), d its length. */
interface Mel {
  n: number[];
  d: number[];
}
/** 'a4:3 r:2 c#5 | ...': notes with lengths in sixteenths (default 2), r a rest, | ignored. */
function mel(src: string): Mel {
  const n: number[] = [], d: number[] = [];
  for (const tok of src.split(/[\s|]+/).filter(Boolean)) {
    const [name, len = '2'] = tok.split(':');
    const k = +len;
    n.push(name === 'r' ? 0 : pitch(name), ...Array(k - 1).fill(0));
    d.push(k, ...Array(k - 1).fill(0));
  }
  return { n, d };
}
/** Calls f(note, length in units) if a note of m starts at i. */
function at(m: Mel, i: number, f: (n: number, d: number) => void) {
  if (m.n[i]) f(m.n[i], m.d[i]);
}

const QUAL: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], '7': [0, 4, 7, 10], '7b9': [0, 4, 7, 10, 13], add9: [0, 4, 7, 14],
};
interface Chord {
  r: number;
  t: number[];
}
/** 'F#m Dadd9 C#7 ...': a chord a bar. */
const prog = (src: string): Chord[] =>
  src.split(/\s+/).filter(Boolean).map((s) => {
    const [r, q] = pc(s);
    return { r, t: QUAL[q] };
  });
/** The chord's root at or above base, its tones stacked on it. */
const voicing = (c: Chord, base: number) => {
  const r = base + ((((c.r - base) % 12) + 12) % 12);
  return c.t.map((x) => r + x);
};
/** The k-th chord tone up from the root at or above base, climbing octaves. */
const ar = (c: Chord, base: number, k: number) => {
  const v = voicing(c, base);
  return v[k % v.length] + 12 * Math.floor(k / v.length);
};

// GARDEN, C major, 150: a bouncy march, bass on the beat.
// 1 bass, kick, pulse lead · 2 snare, hats · 3 square arpeggio · 4 lead doubled low · 5 crash, fills.
const GARDEN_CH = prog('C Am F G C Am Dm G');
const GARDEN_MEL = mel(`
  c5 e5 g5:4 e5 g5 c6:4 | a5:3 g5:1 e5 c5 e5:4 a4:4 | f5 a5 c6:4 a5 f5 c5:4 | d5:3 e5:1 f5 g5 b5:4 g5:4
  c6:4 b5 c6 g5:4 e5:4 | a5 g5 a5 c6 e6:4 c6:4 | d6:3 c6:1 a5 f5 d5:4 f5:4 | g5:6 f5 e5 d5 b4:4`);
const GARDEN: Tune = {
  name: 'GARDEN',
  unit: 60 / 150 / 4,
  length: 128,
  play(i, t, lv, tr, u) {
    const bar = i >> 4, s = i & 15, c = GARDEN_CH[bar];
    if (s % 4 === 0) voice(voicing(c, 36)[0] + tr + (s % 8 ? 7 : 0), u * 1.8, 'triangle', 0.2, t);
    if (s % 8 === 0) perc.kick(t, 0.45);
    if (lv >= 2 && s % 8 === 4) perc.snare(t, 0.14);
    if (lv >= 2 && s % 4 === 2) perc.hat(t, 0.05);
    if (lv >= 3 && s % 2 === 0) voice(ar(c, 60, [0, 1, 2, 1][(s >> 1) % 4]) + tr, u * 0.8, 'square', 0.025, t);
    if (lv >= 5 && s === 0 && bar % 4 === 0) perc.crash(t, 0.1);
    if (lv >= 5 && bar % 4 === 3 && s >= 12) perc.snare(t, 0.1);
    at(GARDEN_MEL, i, (n, d) => {
      voice(n + tr, d * u * 0.9, 'pulse', 0.09, t, { vib: d >= 4 ? 0.2 : 0 });
      if (lv >= 4) voice(n + tr - 12, d * u * 0.9, 'triangle', 0.06, t);
    });
  },
};

// TEMPLE, A minor, 132: echoing bells over a drone and toms.
// 1 drone, toms, bell lead · 2 kick, shaker · 3 bell arpeggio · 4 lead doubled low · 5 claps, fills.
const TEMPLE_CH = prog('Am F C G Am F E7 E7');
const TEMPLE_MEL = mel(`
  e5:4 a5:4 c6:4 b5 a5 | c6:6 a5 f5:4 a5:4 | g5:4 e5 g5 c6:4 e6:4 | d6:6 b5 g5:8
  e5:4 a5:4 c6:4 e6 d6 | c6:4 a5 c6 f6:4 e6 d6 | b5:4 g#5 e5 g#5:4 b5:4 | e6:8 d6 c6 b5 g#5`);
const TEMPLE: Tune = {
  name: 'TEMPLE',
  unit: 60 / 132 / 4,
  length: 128,
  play(i, t, lv, tr, u) {
    const bar = i >> 4, s = i & 15, c = TEMPLE_CH[bar], r = voicing(c, 33)[0] + tr;
    if (s === 0) voice(r, u * 16, 'triangle', 0.16, t, { att: u * 2 });
    if (s === 0 || s === 6 || s === 10) perc.tom(t, 0.3, s ? 140 : 100);
    if (lv >= 2 && s % 8 === 0) perc.kick(t, 0.35);
    if (lv >= 2 && s % 2 === 1) perc.shaker(t, 0.03);
    if (lv >= 3 && s % 2 === 0) bell(ar(c, 69, [0, 1, 2, 3, 2, 1, 2, 3][s >> 1]) + tr, 0.035, t, u);
    if (lv >= 5 && (s === 4 || s === 12)) perc.clap(t, 0.12);
    if (lv >= 5 && bar % 2 === 1 && s >= 12) perc.tom(t, 0.25, [200, 170, 140, 110][s - 12]);
    at(TEMPLE_MEL, i, (n, d) => {
      bell(n + tr, 0.07, t, u, 'pulse');
      if (lv >= 4) voice(n + tr - 12, d * u * 0.9, 'triangle', 0.07, t);
    });
  },
};

// FACTORY, D minor, 160: a driving sawtooth riff over a pumping bass.
// 1 bass, kick, saw lead · 2 backbeat, hats · 3 square stabs · 4 lead doubled low · 5 crash, sixteenth hats.
const FACTORY_CH = prog('Dm Dm Bb C Dm Dm Gm A7');
const FACTORY_MEL = mel(`
  d5 d5 f5 a5:4 g5 f5 e5 | d5:4 a4 d5 f5 e5 d5 c5 | bb4:4 d5 f5 bb5:4 a5 g5 | c5:4 e5 g5 c6:4 bb5 a5
  d6:4 c6 a5 f5:4 a5 c6 | d6 c6 a5 f5 d5:4 e5 f5 | g5:4 bb5 a5 g5 d5 g5:4 | a5:6 c#6 e6:4 a5:4`);
const FACTORY: Tune = {
  name: 'FACTORY',
  unit: 60 / 160 / 4,
  length: 128,
  play(i, t, lv, tr, u) {
    const bar = i >> 4, s = i & 15, c = FACTORY_CH[bar], r = voicing(c, 38)[0] + tr;
    if (s % 2 === 0) voice(r + (s % 4 ? 12 : 0), u * 1.5, 'sawtooth', 0.09, t, { lp: 1200 });
    if (s % 4 === 0) perc.kick(t, 0.5);
    if (lv >= 2 && s % 8 === 4) perc.gated(t, 0.14);
    if (lv >= 2 && s % 4 === 2) perc.hat(t, 0.05);
    if (lv >= 3 && (s === 3 || s === 11)) for (const x of voicing(c, 62)) voice(x + tr, u * 0.8, 'square', 0.02, t);
    if (lv >= 5 && s % 2 === 1) perc.hat(t, 0.025);
    if (lv >= 5 && s === 0 && bar % 4 === 0) perc.crash(t, 0.1);
    at(FACTORY_MEL, i, (n, d) => {
      voice(n + tr, d * u * 0.9, 'sawtooth', 0.06, t, { lp: 4000 });
      voice(n + tr, d * u * 0.9, 'pulse', 0.05, t);
      if (lv >= 4) voice(n + tr - 12, d * u * 0.9, 'triangle', 0.06, t);
    });
  },
};

export const TUNES = [GARDEN, TEMPLE, FACTORY];

let musicOn = true;
let playing = false;
let tune = 0;
let unit = 0;
let nextTime = 0;
let timer: number | undefined;
let transpose = 0;
let intensity = 0;
let tempo = 1;

function schedule() {
  if (!ctx) return;
  const tn = TUNES[tune];
  while (nextTime < ctx.currentTime + 0.12) {
    const u = tn.unit / tempo;
    tn.play(unit % tn.length, nextTime, intensity, transpose, u);
    unit++;
    nextTime += u;
  }
}

export const music = {
  /** Start (or keep playing) a tune; switching tunes starts it from the top. */
  play(which = tune, restart = false) {
    if (which !== tune || restart) {
      this.halt();
      tune = which;
      unit = 0;
    }
    playing = true;
    if (!ctx || !musicOn || timer !== undefined) return;
    nextTime = ctx.currentTime + 0.05;
    timer = window.setInterval(schedule, 25);
  },
  resume() {
    if (playing) this.play();
  },
  stop() {
    playing = false;
    this.halt();
  },
  halt() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  },
  setKey(semis: number) {
    transpose = ((semis + 18) % 12) - 6;
  },
  setIntensity(lv: number) {
    intensity = lv;
  },
  setTempo(mult: number) {
    tempo = mult;
  },
  toggle() {
    musicOn = !musicOn;
    if (!musicOn) this.halt();
    else if (playing) this.play();
    return musicOn;
  },
  set enabled(on: boolean) {
    if (on !== musicOn) this.toggle();
  },
  get enabled() {
    return musicOn;
  },
  get running() {
    return timer !== undefined;
  },
  get tune() {
    return tune;
  },
};
