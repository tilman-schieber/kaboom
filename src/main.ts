import { Game, Action, Input, PlayerInput } from './game';
import { render, W, H } from './render';
import { unlockAudio, music } from './audio';
import { setupTouch, TouchButton } from './touch';
import { loadSprites } from './sprites';
import { World } from './world';
import { Bot } from './bot';
import { ARENAS } from './arena';
import { makeRng } from './rng';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

const touchPanel = setupTouch(onTouch);

function resize() {
  const reserved = touchPanel ? touchPanel.el.offsetHeight + 8 : 0;
  const scale = Math.min(innerWidth / W, (innerHeight - reserved) / H);
  // Whole-number scaling keeps pixels crisp; phones may need a fractional fit.
  const s = scale >= 2 ? Math.floor(scale) : Math.max(0.5, scale);
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
}
addEventListener('resize', resize);
resize();

// By e.key so labels match any layout.
const ARROWS: Record<string, Action> = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' };
const KEYS: Record<string, Action> = {
  ...ARROWS,
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  ' ': 'bomb',
  z: 'bomb',
  j: 'bomb',
  x: 'act',
  shift: 'act',
  k: 'act',
  enter: 'start',
  p: 'start',
  escape: 'back',
  backspace: 'quit',
  m: 'mute',
  h: 'scores',
};
/** Keys that stay the game's own when two players share the keyboard. */
const GLOBAL: Action[] = ['start', 'back', 'quit', 'mute', 'scores'];

// Two on one keyboard, by key position: player 1 on W A S D, bombs with Space and acts with
// the left Shift (or E); player 2 on the arrows, . to bomb, and the key right of it (- on a
// German keyboard, / on a US one) or the right Shift to act.
const SPLIT_KEYS: Record<string, [number, Action]> = {
  KeyW: [0, 'up'],
  KeyS: [0, 'down'],
  KeyA: [0, 'left'],
  KeyD: [0, 'right'],
  Space: [0, 'bomb'],
  ShiftLeft: [0, 'act'],
  KeyE: [0, 'act'],
  ArrowUp: [1, 'up'],
  ArrowDown: [1, 'down'],
  ArrowLeft: [1, 'left'],
  ArrowRight: [1, 'right'],
  Period: [1, 'bomb'],
  Slash: [1, 'act'],
  ShiftRight: [1, 'act'],
};

const game = new Game();
const newPlayer = (): PlayerInput => ({ held: new Set(), pressed: new Set() });
const input: Input = { held: new Set(), pressed: new Set(), typed: [], players: [0, 1, 2, 3].map(newPlayer) };

/** A round is on: keys and pads go to the bombers. */
const playing = () => game.phase === 'play';
/** Keys currently down: e.code -> lower-cased e.key at press time (key-up may report a different key). */
const heldKeys = new Map<string, string>();
const touchHeld = new Set<TouchButton>();

/** While typing a name, letters are letters. */
const actionFor = (key: string) => (game.phase === 'entry' ? ARROWS[key] ?? (key === 'enter' ? undefined : KEYS[key]) : KEYS[key]);
/** Which player a key drives, and as what, with the keyboard split in two. */
const splitFor = (code: string) => (playing() && game.controlPlan.split ? SPLIT_KEYS[code] : undefined);

addEventListener('keydown', (e) => {
  unlockAudio();
  const key = e.key.toLowerCase();
  if (/^[a-z0-9]$/i.test(e.key) && !e.repeat) input.typed.push(e.key.toUpperCase());
  else if (e.key === 'Backspace' || (e.key === 'Enter' && !e.repeat)) input.typed.push(e.key);
  const split = splitFor(e.code);
  const a = split ? undefined : actionFor(key);
  if (split || a || e.key === 'Backspace') e.preventDefault();
  heldKeys.set(e.code, key);
  if (e.repeat) return;
  if (split) input.players[split[0]].pressed.add(split[1]);
  else if (a) {
    input.pressed.add(a);
    input.players[0].pressed.add(a);
  }
});
addEventListener('keyup', (e) => heldKeys.delete(e.code));
// Any tap unlocks sound; mobile browsers only allow it after a gesture.
for (const ev of ['pointerdown', 'pointerup', 'touchend']) addEventListener(ev, unlockAudio, { passive: true });
addEventListener('blur', () => {
  heldKeys.clear();
  if (playing() && !game.paused) input.pressed.add('start');
});

function onTouch(b: TouchButton, down: boolean) {
  unlockAudio();
  if (!down) return void touchHeld.delete(b);
  touchHeld.add(b);
  input.pressed.add(b.a);
  input.players[0].pressed.add(b.a);
  if (b.typed) input.typed.push(b.typed);
}

// Gamepads, in the standard mapping: d-pad or left stick to move, A (the right face button,
// or the left one) bombs, B (the bottom one, or the top one) acts, Start pauses, Select quits
// from pause. The top button opens the scores on the title screen.
const PAD_BUTTONS: [number, Action][] = [
  [1, 'bomb'],
  [2, 'bomb'],
  [0, 'act'],
  [3, 'act'],
  [9, 'start'],
  [8, 'quit'],
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
];
const STICK = 0.4;
let padHeld: Set<Action>[] = [];

/** What each connected pad holds. */
function readPads(): Set<Action>[] {
  const pads = (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p);
  game.pads = pads.length;
  return pads.map((pad) => {
    const held = new Set<Action>();
    for (const [i, a] of PAD_BUTTONS) if (pad.buttons[i]?.pressed) held.add(i === 3 && game.phase === 'title' ? 'scores' : a);
    const [x = 0, y = 0] = pad.axes;
    if (x < -STICK) held.add('left');
    if (x > STICK) held.add('right');
    if (y < -STICK) held.add('up');
    if (y > STICK) held.add('down');
    return held;
  });
}

function refreshHeld() {
  input.held.clear();
  for (const p of input.players) p.held.clear();
  const split = playing() && game.controlPlan.split;
  for (const [code, key] of heldKeys) {
    const sk = split ? SPLIT_KEYS[code] : undefined;
    if (sk) input.players[sk[0]].held.add(sk[1]);
    const a = sk ? undefined : actionFor(key);
    if (!a) continue;
    input.held.add(a);
    if (!split || GLOBAL.includes(a)) input.players[0].held.add(a);
  }
  for (const b of touchHeld) {
    input.held.add(b.a);
    input.players[0].held.add(b.a);
  }
  // In a round, pad i drives player padBase + i; Start and Select always count for the game.
  const pads = readPads();
  const base = game.controlPlan.padBase;
  pads.forEach((held, i) => {
    const before = padHeld[i] ?? new Set<Action>();
    const player = playing() ? input.players[base + i] : input.players[0];
    for (const a of held) {
      const fresh = !before.has(a);
      const toGame = !playing() || GLOBAL.includes(a);
      if (toGame) {
        input.held.add(a);
        if (fresh) input.pressed.add(a);
      }
      if (player && (!toGame || !playing())) {
        player.held.add(a);
        if (fresh) player.pressed.add(a);
      }
      if (!fresh) continue;
      unlockAudio();
      // Typing a name: A or Start enters it, B rubs out a letter.
      if (game.phase === 'entry' && (a === 'bomb' || a === 'start')) input.typed.push('Enter');
      if (game.phase === 'entry' && a === 'act') input.typed.push('Backspace');
    }
  });
  padHeld = pads;
}

// Fixed 60 Hz simulation.
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();
let frame = 0;
/** Dev: the live loop is frozen while tests drive the game with sim(). */
let frozen = false;

function clearPressed() {
  input.pressed.clear();
  for (const p of input.players) p.pressed.clear();
  input.typed.length = 0;
}

function loop(now: number) {
  if (frozen) {
    last = now;
    return void requestAnimationFrame(loop);
  }
  acc += Math.min(250, now - last);
  last = now;
  while (acc >= STEP) {
    refreshHeld();
    game.step(input);
    clearPressed();
    acc -= STEP;
    frame++;
  }
  render(ctx, game, frame);
  touchPanel?.update(music.enabled);
  requestAnimationFrame(loop);
}

loadSprites().then(() => requestAnimationFrame(loop));

if (import.meta.env.DEV) {
  const dev = {
    game,
    music,
    /** Runs n frames with these actions held by player 1, then draws: for testing in a background tab. */
    sim: (n: number, held: Action[] = [], pressed: Action[] = []) => {
      frozen = true;
      for (let i = 0; i < n; i++) {
        const p0: PlayerInput = { held: new Set(held), pressed: new Set(i === 0 ? pressed : []) };
        const inp: Input = { held: new Set(held), pressed: new Set(i === 0 ? pressed : []), typed: [], players: [p0, newPlayer(), newPlayer(), newPlayer()] };
        game.step(inp);
        frame++;
      }
      render(ctx, game, frame);
    },
    live: () => (frozen = false),
    /** A whole round of four CPUs, headless: who won, when, and who blew up whom. */
    cpuRound: (arena = 0, skill = 0.5, seed = 1, trace = -1) => {
      const log: string[] = [];
      const rng = makeRng(seed);
      const w = new World(ARENAS[arena], rng, 4);
      const bots = [0, 1, 2, 3].map((i) => new Bot(i, skill, rng));
      const deaths: string[] = [];
      const seen = new Set<number>();
      while (w.state !== 'done' && w.frames < 60 * 300) {
        const ctls = bots.map((b) => b.update(w));
        const t = w.bombers[trace];
        if (t && t.state === 'alive' && w.frames % 3 === 0)
          log.push(`${w.frames} ${t.x.toFixed(1)},${t.y.toFixed(1)} c${w.bomberCell(t)} dir${ctls[trace].dir}${ctls[trace].bomb ? ' BOMB' : ''} [${bots[trace].why}] bombs:${w.bombs.map((bm) => w.bombCell(bm) + "/" + bm.fuse + "o" + bm.owner).join(" ")} others:${w.bombers.filter((o) => o !== t && o.state === "alive").map((o) => o.id + "@" + w.bomberCell(o)).join(" ")}`);
        w.update(ctls);
        for (const b of w.bombers)
          if (b.state !== 'alive' && !seen.has(b.id)) {
            seen.add(b.id);
            const c = w.bomberCell(b);
            deaths.push(`${b.id}@${w.frames}:${w.flame[c] ? 'by' + w.flameOwner[c] : 'crushed'}:${b.curse ?? ''}`);
          }
      }
      return { log, winner: w.winner, frames: w.frames, hurry: w.hurry, deaths, kills: w.bombers.map((b) => b.kills), stats: w.bombers.map((b) => `${b.bombs}/${b.fire}/${b.speed}`) };
    },
  };
  Object.assign(window, dev);
}
