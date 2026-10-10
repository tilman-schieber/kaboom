// One round in an arena: the bombers, their bombs and flames, the blocks and power-ups,
// the clock and, when it runs out, the walls closing in.
import { Rng } from './rng';
import { sfx } from './audio';
import {
  ArenaDef, Layout, Dir, ItemKind, ITEMS, COLS, ROWS, TILE, CELLS, FLOOR, SOLID, BLOCK, DX, DY,
  idx, cellX, cellY, mid, inside, buildArena, hurryOrder,
} from './arena';

/** Frames a bomb burns before it goes off. */
export const FUSE = 150;
/** A cursed SHORT fuse. */
const SHORT_FUSE = 70;
/** Frames a flame stays, and a block takes to burn away. */
export const FLAME_T = 32;
export const READY_FRAMES = 120;
export const ROUND_FRAMES = 60 * 120;
/** After the last but one bomber goes, the round waits this long before it is decided. */
const END_WAIT = 120;
export const DYING_FRAMES = 60;
/** Frames a dropping wall block takes to land. */
export const DROP_T = 14;
/** HURRY UP: frames between two wall blocks, and the pause after a ring is closed. */
const HURRY_STEP = 6;
const HURRY_PAUSE = 60 * 10;
export const CURSE_T = 60 * 10;
const KICK_SPEED = 3;
const BELT_SPEED = 0.5;
/** Throws fly this many cells, and bounce on one at a time while they land on something. */
const THROW_CELLS = 3;
const THROW_FRAMES = 24;
const BOUNCE_FRAMES = 10;
/** Off-centre by at least this much, a bomber is steered round a corner it runs into. */
const ASSIST = 3;

export const MAX_BOMBS = 8;
export const MAX_FIRE = 8;
export const MAX_SPEED = 4;

export const CURSES = ['slow', 'fast', 'reverse', 'diarrhea', 'nobomb', 'short'] as const;
export type Curse = (typeof CURSES)[number];

/** One bomber's input for a frame: the direction held, and the buttons just pressed. */
export interface Controls {
  dir: Dir | -1;
  bomb: boolean;
  act: boolean;
}
export const NO_CONTROLS: Controls = { dir: -1, bomb: false, act: false };

export interface Bomber {
  /** Player slot 0-3: colour, spawn and HUD place. */
  id: number;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  state: 'alive' | 'dying' | 'gone';
  /** Frames in the current state. */
  t: number;
  bombs: number;
  fire: number;
  speed: number;
  kick: boolean;
  glove: boolean;
  remote: boolean;
  pierce: boolean;
  curse: Curse | null;
  curseT: number;
  /** Power-ups picked up, scattered again when the bomber goes. */
  collected: ItemKind[];
  /** Walk animation distance. */
  walk: number;
  /** The warp hole just come out of; it can't be taken again until stepped off. */
  warpFrom: number;
  kills: number;
}

export interface Bomb {
  owner: number;
  x: number;
  y: number;
  fuse: number;
  range: number;
  pierce: boolean;
  remote: boolean;
  /** Sliding after a kick, or along a belt. */
  slide: Dir | -1;
  slideSpeed: number;
  /** Bombers still standing on it when it was laid can walk off it. */
  passers: Set<number>;
  /** Flying after a throw: from where, to which cell, how far through. */
  air: { x0: number; y0: number; to: number; t: number; n: number; dir: Dir } | null;
  /** Frame it was laid, for the oldest-first remote. */
  born: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface Popup {
  text: string;
  x: number;
  y: number;
  life: number;
}

export type WorldState = 'ready' | 'play' | 'end' | 'done';

/** Flame mask bits: the arms out of a cell (up, right, down, left), and the centre. */
export const F_CENTER = 16;
const bit = (d: number) => 1 << d;
const opposite = (d: number) => ((d + 2) % 4) as Dir;

/** Who spawns where: with two, in opposite corners. */
const SPAWN_ORDER = [0, 3, 1, 2];
const WHITE_SPARK = '#fcfcfc';

export class World {
  readonly def: ArenaDef;
  readonly cells: Uint8Array;
  readonly belt: Int8Array;
  readonly warp: Int16Array;
  readonly hidden: Map<number, ItemKind>;
  readonly spawns: number[];
  /** Frames of flame left per cell, its arms, and whose bomb lit it. */
  readonly flame = new Int16Array(CELLS);
  readonly flameMask = new Uint8Array(CELLS);
  readonly flameOwner = new Int8Array(CELLS);
  /** Frames left of a block burning away. */
  readonly burn = new Int16Array(CELLS);
  /** Power-up lying in a cell (index into ITEMS), -1 for none. */
  readonly item = new Int8Array(CELLS).fill(-1);
  /** Frames left of an item burning up. */
  readonly itemBurn = new Int16Array(CELLS);

  bombers: Bomber[] = [];
  bombs: Bomb[] = [];
  drops: { c: number; t: number }[] = [];
  /** HURRY UP: the rings still to close, where it is, and the pause before the next ring. */
  hurry = false;
  private rings: number[][] = [];
  private ring = 0;
  private ringPos = 0;
  private hurryWait = 0;

  state: WorldState = 'ready';
  stateT = 0;
  frames = 0;
  /** Frames left on the clock. */
  clock = ROUND_FRAMES;
  /** The bomber who won the round, -1 for a draw; set once the round is done. */
  winner = -1;
  /** Points per bomber this round (kills, blocks, power-ups). */
  points: number[];
  /** Goes up whenever bombs are laid or go off, so the CPUs know to look again. */
  events = 0;
  particles: Particle[] = [];
  popups: Popup[] = [];
  shake = 0;

  constructor(def: ArenaDef, private rng: Rng, players: number) {
    this.def = def;
    const layout: Layout = buildArena(def, rng);
    this.cells = layout.cells;
    this.belt = layout.belt;
    this.warp = layout.warp;
    this.hidden = layout.hidden;
    this.spawns = layout.spawns;
    for (let i = 0; i < players; i++) {
      const c = this.spawns[SPAWN_ORDER[i]];
      this.bombers.push({
        id: i, x: mid(cellX(c)), y: mid(cellY(c)), dir: 2, moving: false, state: 'alive', t: 0,
        bombs: 1, fire: 2, speed: 0, kick: false, glove: false, remote: false, pierce: false,
        curse: null, curseT: 0, collected: [], walk: 0, warpFrom: -1, kills: 0,
      });
    }
    this.points = this.bombers.map(() => 0);
  }

  // ---------- queries ----------

  cellOf = (x: number, y: number) => idx(Math.floor(x / TILE), Math.floor(y / TILE));
  bomberCell = (b: Bomber) => this.cellOf(b.x, b.y);
  bombCell = (bm: Bomb) => this.cellOf(bm.x, bm.y);
  bombAt = (c: number) => this.bombs.find((bm) => !bm.air && this.bombCell(bm) === c);
  alive = () => this.bombers.filter((b) => b.state === 'alive');
  active = (b: Bomber) => this.bombs.filter((bm) => bm.owner === b.id).length;

  /** Pixels a bomber moves a frame. */
  speedOf(b: Bomber) {
    if (b.curse === 'slow') return 0.75;
    if (b.curse === 'fast') return 3;
    return 1.25 + b.speed * 0.25;
  }

  /** Can bomber b walk into cell c? */
  blockedFor(b: Bomber, c: number) {
    if (this.cells[c] !== FLOOR) return true;
    const bm = this.bombAt(c);
    return !!bm && !bm.passers.has(b.id);
  }

  /** Can a sliding or landing bomb go into cell c? */
  private blockedForBomb(c: number, self?: Bomb) {
    if (this.cells[c] !== FLOOR) return true;
    if (this.bombs.some((bm) => bm !== self && !bm.air && this.bombCell(bm) === c)) return true;
    const x = mid(cellX(c)), y = mid(cellY(c));
    return this.bombers.some((b) => b.state === 'alive' && Math.abs(b.x - x) < 12 && Math.abs(b.y - y) < 12);
  }

  // ---------- the round ----------

  update(controls: Controls[]) {
    this.frames++;
    this.stateT++;
    this.updateFx();
    if (this.state === 'ready') {
      if (this.stateT === READY_FRAMES) {
        this.state = 'play';
        this.stateT = 0;
        sfx.go();
      } else if (this.stateT === 30) sfx.ready();
      for (const b of this.bombers) b.moving = false;
      return;
    }
    if (this.state === 'done') {
      for (const b of this.bombers) b.moving = false;
      return;
    }
    if (this.state === 'play' && this.clock > 0 && --this.clock === 0) this.startHurry();
    if (this.hurry) this.stepHurry();
    this.stepDrops();

    for (const b of this.bombers) {
      if (b.state === 'alive') this.stepBomber(b, controls[b.id] ?? NO_CONTROLS);
      else b.moving = false;
    }
    this.stepBombs();
    this.explodeDue();
    this.stepFlames();
    this.stepHazards();
    this.stepDying();

    const left = this.alive().length;
    if (this.state === 'play' && left <= 1) {
      this.state = 'end';
      this.stateT = 0;
    }
    if (this.state === 'end' && this.stateT >= END_WAIT && !this.bombers.some((b) => b.state === 'dying')) {
      const last = this.alive();
      this.winner = last.length === 1 ? last[0].id : -1;
      this.state = 'done';
      this.stateT = 0;
    }
  }

  // ---------- bombers ----------

  private stepBomber(b: Bomber, ctl: Controls) {
    if (b.curse && --b.curseT <= 0) b.curse = null;
    // The bomb goes down where the bomber stands before it moves on.
    if (ctl.bomb || b.curse === 'diarrhea') this.layBomb(b);
    let dir = ctl.dir;
    if (dir >= 0 && b.curse === 'reverse') dir = opposite(dir);
    b.moving = false;
    if (dir >= 0) {
      b.dir = dir as Dir;
      b.moving = this.move(b, dir as Dir, this.speedOf(b));
      if (b.moving) b.walk += this.speedOf(b);
    }
    const c = this.bomberCell(b);
    if (this.belt[c] >= 0) this.move(b, this.belt[c] as Dir, BELT_SPEED, false);
    this.stepWarp(b);
    if (ctl.act) this.act(b);
  }

  /**
   * Moves a bomber up to `dist` pixels in direction d along the grid: lined up with the lane
   * first, steered round a corner it is nearly past, stopped at the middle of its cell
   * when the way ahead is shut. Returns whether it moved.
   */
  move(b: Bomber, d: Dir, dist: number, kick = true): boolean {
    const cx = Math.floor(b.x / TILE), cy = Math.floor(b.y / TILE);
    const dx = DX[d], dy = DY[d];
    const ahead = idx(cx + dx, cy + dy);
    const shut = this.blockedFor(b, ahead);
    const perp = dx ? b.y - mid(cy) : b.x - mid(cx);
    const nudge = (by: number) => (dx ? (b.y += by) : (b.x += by));
    let moved = false;

    if (perp !== 0) {
      if (!shut) {
        const s = Math.min(Math.abs(perp), dist);
        nudge(-Math.sign(perp) * s);
        dist -= s;
        moved = true;
        if (dist <= 0) return true;
      } else {
        // Round the corner to the side it leans to, if that way is open.
        const side = Math.sign(perp);
        const beside = dx ? idx(cx, cy + side) : idx(cx + side, cy);
        const round = dx ? idx(cx + dx, cy + side) : idx(cx + side, cy + dy);
        if (Math.abs(perp) >= ASSIST && !this.blockedFor(b, beside) && !this.blockedFor(b, round)) {
          nudge(side * dist);
          return true;
        }
        return false;
      }
    }

    const sign = dx || dy;
    const pos = dx ? b.x : b.y;
    const centre = dx ? mid(cx) : mid(cy);
    let np = pos + sign * dist;
    if (shut && sign * (np - centre) > 0) np = sign > 0 ? Math.max(pos, Math.min(np, centre)) : Math.min(pos, Math.max(np, centre));
    if (dx) b.x = np;
    else b.y = np;
    if (np !== pos) moved = true;

    // Pushed against a bomb with the boot on: kick it.
    if (kick && shut && b.kick && np === centre) {
      const bm = this.bombAt(ahead);
      if (bm && bm.slide < 0 && !this.blockedForBomb(idx(cx + 2 * dx, cy + 2 * dy), bm)) {
        bm.slide = d;
        bm.slideSpeed = KICK_SPEED;
        sfx.kick();
      }
    }
    return moved;
  }

  private stepWarp(b: Bomber) {
    const c = this.bomberCell(b);
    if (c !== b.warpFrom) b.warpFrom = -1;
    const to = this.warp[c];
    if (to < 0 || c === b.warpFrom) return;
    if (Math.abs(b.x - mid(cellX(c))) > 2 || Math.abs(b.y - mid(cellY(c))) > 2) return;
    this.sparks(b.x, b.y, '#b060f8', 8);
    b.x = mid(cellX(to));
    b.y = mid(cellY(to));
    b.warpFrom = to;
    this.sparks(b.x, b.y, '#b060f8', 8);
    sfx.throw();
  }

  layBomb(b: Bomber) {
    if (b.curse === 'nobomb') return;
    const c = this.bomberCell(b);
    if (this.cells[c] !== FLOOR || this.bombAt(c) || this.active(b) >= b.bombs) return;
    const x = mid(cellX(c)), y = mid(cellY(c));
    const passers = new Set(
      this.bombers.filter((o) => o.state === 'alive' && Math.abs(o.x - x) < TILE && Math.abs(o.y - y) < TILE).map((o) => o.id),
    );
    this.bombs.push({
      owner: b.id, x, y, fuse: b.remote ? Infinity : b.curse === 'short' ? SHORT_FUSE : FUSE, range: b.fire,
      pierce: b.pierce, remote: b.remote, slide: -1, slideSpeed: 0, passers, air: null, born: this.frames,
    });
    this.events++;
    sfx.place();
  }

  /** The action button: set off the oldest remote bomb, or throw a bomb with the glove. */
  act(b: Bomber) {
    const remote = this.bombs.filter((bm) => bm.owner === b.id && bm.remote && !bm.air).sort((p, q) => p.born - q.born)[0];
    if (remote) {
      remote.fuse = 0;
      return;
    }
    if (!b.glove) return;
    const c = this.bomberCell(b);
    const ahead = idx(cellX(c) + DX[b.dir], cellY(c) + DY[b.dir]);
    const bm = this.bombAt(c) ?? this.bombAt(ahead);
    if (!bm) return;
    const from = this.bombCell(bm);
    bm.slide = -1;
    bm.air = { x0: bm.x, y0: bm.y, to: this.wrapStep(from, b.dir, THROW_CELLS), t: 0, n: THROW_FRAMES, dir: b.dir };
    bm.passers.clear();
    this.events++;
    sfx.throw();
  }

  /** The cell n steps from c in direction d, wrapping round the inside of the arena. */
  private wrapStep(c: number, d: Dir, n: number) {
    const w = COLS - 2, h = ROWS - 2;
    const x = ((((cellX(c) - 1 + DX[d] * n) % w) + w) % w) + 1;
    const y = ((((cellY(c) - 1 + DY[d] * n) % h) + h) % h) + 1;
    return idx(x, y);
  }

  // ---------- bombs and flames ----------

  private stepBombs() {
    for (const bm of this.bombs) {
      if (bm.air) {
        const a = bm.air;
        a.t++;
        const tx = mid(cellX(a.to)), ty = mid(cellY(a.to));
        const k = a.t / a.n;
        bm.x = a.x0 + (tx - a.x0) * k;
        bm.y = a.y0 + (ty - a.y0) * k;
        if (a.t < a.n) continue;
        bm.x = tx;
        bm.y = ty;
        if (this.blockedForBomb(a.to, bm)) {
          bm.air = { x0: tx, y0: ty, to: this.wrapStep(a.to, a.dir, 1), t: 0, n: BOUNCE_FRAMES, dir: a.dir };
          sfx.bounce();
        } else {
          bm.air = null;
          sfx.bounce();
        }
        continue;
      }
      bm.fuse--;
      for (const id of bm.passers) {
        const o = this.bombers[id];
        if (o.state !== 'alive' || Math.abs(o.x - bm.x) >= TILE || Math.abs(o.y - bm.y) >= TILE) bm.passers.delete(id);
      }
      this.slideBomb(bm);
    }
  }

  private slideBomb(bm: Bomb) {
    const c = this.bombCell(bm);
    const cx = mid(cellX(c)), cy = mid(cellY(c));
    // Belts carry bombs that lie still on them.
    if (bm.slide < 0 && this.belt[c] >= 0 && bm.x === cx && bm.y === cy) {
      const d = this.belt[c] as Dir;
      if (!this.blockedForBomb(idx(cellX(c) + DX[d], cellY(c) + DY[d]), bm)) {
        bm.slide = d;
        bm.slideSpeed = BELT_SPEED;
      }
    }
    if (bm.slide < 0) return;
    const d = bm.slide;
    const dx = DX[d], dy = DY[d];
    const pos = dx ? bm.x : bm.y, centre = dx ? cx : cy, sign = dx || dy;
    let np = pos + sign * bm.slideSpeed;
    // Crossing the middle of a cell: stop there if the next one is taken.
    if (sign * (pos - centre) < 0 && sign * (np - centre) >= 0) {
      const next = idx(cellX(c) + dx, cellY(c) + dy);
      const turn = this.belt[c] >= 0 && bm.slideSpeed === BELT_SPEED && this.belt[c] !== d;
      if (turn || this.blockedForBomb(next, bm)) {
        np = centre;
        bm.slide = -1;
        if (bm.slideSpeed === KICK_SPEED) sfx.bounce();
      }
    }
    if (dx) bm.x = np;
    else bm.y = np;
  }

  /** Sets off every bomb whose time is up or that a flame has reached, chains included. */
  private explodeDue() {
    for (let again = true; again; ) {
      again = false;
      for (const bm of [...this.bombs]) {
        if (bm.air || (bm.fuse > 0 && !this.flame[this.bombCell(bm)])) continue;
        this.explode(bm);
        again = true;
      }
    }
  }

  private explode(bm: Bomb) {
    this.bombs.splice(this.bombs.indexOf(bm), 1);
    const c = this.bombCell(bm);
    const x0 = cellX(c), y0 = cellY(c);
    this.light(c, F_CENTER, bm.owner);
    for (let d = 0; d < 4; d++) {
      let prev = c;
      for (let k = 1; k <= bm.range; k++) {
        const x = x0 + DX[d] * k, y = y0 + DY[d] * k;
        if (!inside(x, y)) break;
        const cc = idx(x, y);
        if (this.cells[cc] === SOLID) break;
        if (this.cells[cc] === BLOCK) {
          if (!this.burn[cc]) {
            this.burn[cc] = FLAME_T;
            this.points[bm.owner] += 10;
          }
          if (!bm.pierce) break;
          continue;
        }
        this.flameMask[prev] |= bit(d);
        this.light(cc, bit(opposite(d)), bm.owner);
        prev = cc;
        if (this.item[cc] >= 0) {
          this.item[cc] = -1;
          this.itemBurn[cc] = 20;
          break;
        }
        if (this.bombAt(cc)) break;
      }
    }
    this.shake = Math.max(this.shake, 8);
    this.events++;
    sfx.boom();
  }

  private light(c: number, mask: number, owner: number) {
    if (!this.flame[c]) this.flameMask[c] = 0;
    this.flame[c] = FLAME_T;
    this.flameMask[c] |= mask;
    this.flameOwner[c] = owner;
  }

  private stepFlames() {
    for (let c = 0; c < CELLS; c++) {
      if (this.flame[c] && --this.flame[c] === 0) this.flameMask[c] = 0;
      if (this.itemBurn[c]) this.itemBurn[c]--;
      if (this.burn[c] && --this.burn[c] === 0) {
        this.cells[c] = FLOOR;
        const hid = this.hidden.get(c);
        if (hid) {
          this.item[c] = ITEMS.indexOf(hid);
          this.hidden.delete(c);
        }
        this.debris(c);
      }
    }
  }

  // ---------- hazards, power-ups, curses ----------

  private stepHazards() {
    const alive = this.alive();
    for (const b of alive) {
      const c = this.bomberCell(b);
      if (this.flame[c]) {
        this.kill(b, this.flameOwner[c]);
        continue;
      }
      if (this.item[c] >= 0) {
        this.pickUp(b, ITEMS[this.item[c]]);
        this.item[c] = -1;
      }
    }
    // A curse spreads to whoever touches its bearer.
    for (const a of alive)
      for (const o of alive)
        if (a.curse && !o.curse && a !== o && Math.abs(a.x - o.x) < 12 && Math.abs(a.y - o.y) < 12) {
          o.curse = a.curse;
          o.curseT = CURSE_T;
          sfx.curse();
        }
  }

  private pickUp(b: Bomber, k: ItemKind) {
    const gain = (ok: boolean) => ok && b.collected.push(k);
    switch (k) {
      case 'bomb':
        gain(b.bombs < MAX_BOMBS) && b.bombs++;
        break;
      case 'fire':
        gain(b.fire < MAX_FIRE) && b.fire++;
        break;
      case 'speed':
        gain(b.speed < MAX_SPEED) && b.speed++;
        break;
      case 'full':
        gain(b.fire < MAX_FIRE) && (b.fire = MAX_FIRE);
        break;
      case 'kick':
      case 'glove':
      case 'remote':
      case 'pierce':
        if (gain(!b[k])) b[k] = true;
        break;
      case 'skull':
        b.curse = CURSES[Math.floor(this.rng() * CURSES.length)];
        b.curseT = CURSE_T;
        sfx.curse();
        this.popups.push({ text: b.curse.toUpperCase(), x: b.x, y: b.y - 16, life: 60 });
        return;
    }
    this.points[b.id] += 50;
    sfx.item();
  }

  kill(b: Bomber, killer: number) {
    if (b.state !== 'alive') return;
    b.state = 'dying';
    b.t = 0;
    b.moving = false;
    if (killer >= 0 && killer !== b.id) {
      this.points[killer] += 1000;
      this.bombers[killer].kills++;
    }
    // Remote bombs left behind go off on their own.
    for (const bm of this.bombs) if (bm.owner === b.id && bm.remote) bm.fuse = FUSE;
    this.events++;
    sfx.die();
  }

  private stepDying() {
    for (const b of this.bombers) {
      b.t++;
      if (b.state !== 'dying' || b.t < DYING_FRAMES) continue;
      b.state = 'gone';
      b.t = 0;
      this.scatter(b.collected);
      b.collected = [];
    }
  }

  /** Power-ups of a fallen bomber land on free floor round the arena. */
  private scatter(items: ItemKind[]) {
    const free: number[] = [];
    for (let c = 0; c < CELLS; c++)
      if (this.cells[c] === FLOOR && this.item[c] < 0 && !this.flame[c] && !this.bombAt(c) && this.belt[c] < 0 && this.warp[c] < 0)
        free.push(c);
    for (const k of items) {
      if (!free.length) return;
      const c = free.splice(Math.floor(this.rng() * free.length), 1)[0];
      this.item[c] = ITEMS.indexOf(k);
      this.sparks(mid(cellX(c)), mid(cellY(c)), WHITE_SPARK, 4);
    }
  }

  // ---------- hurry up ----------

  private startHurry() {
    this.hurry = true;
    this.rings = hurryOrder(this.cells);
    this.popups.push({ text: 'HURRY UP!', x: (COLS * TILE) / 2, y: (ROWS * TILE) / 2, life: 120 });
    sfx.hurry();
  }

  private stepHurry() {
    if (this.hurryWait > 0) return void this.hurryWait--;
    if (this.frames % HURRY_STEP) return;
    const ring = this.rings[this.ring];
    if (!ring) return;
    const c = ring[this.ringPos++];
    if (this.ringPos >= ring.length) {
      this.ring++;
      this.ringPos = 0;
      if (this.ring >= 2) this.hurryWait = HURRY_PAUSE;
    }
    if (this.cells[c] !== SOLID) this.drops.push({ c, t: 0 });
  }

  /** The cells the walls will close on next, with the frames until they land. */
  hurryNext(n: number): [number, number][] {
    const out: [number, number][] = this.drops.map((d) => [d.c, DROP_T - d.t]);
    if (!this.hurry && this.clock > 60 * 3) return out;
    const rings = this.hurry ? this.rings : hurryOrder(this.cells);
    let wait = (this.hurry ? this.hurryWait : this.clock) + DROP_T;
    let r = this.ring, p = this.ringPos;
    for (let i = 0; i < n && rings[r]; i++) {
      out.push([rings[r][p], wait]);
      wait += HURRY_STEP;
      if (++p >= rings[r].length) {
        r++;
        p = 0;
        if (r >= 2) wait += HURRY_PAUSE;
      }
    }
    return out;
  }

  private stepDrops() {
    for (const d of this.drops) {
      if (++d.t < DROP_T) continue;
      const c = d.c;
      this.cells[c] = SOLID;
      this.burn[c] = 0;
      this.hidden.delete(c);
      this.item[c] = -1;
      this.flame[c] = 0;
      this.flameMask[c] = 0;
      this.bombs = this.bombs.filter((bm) => bm.air || this.bombCell(bm) !== c);
      for (const b of this.alive()) if (this.bomberCell(b) === c) this.kill(b, -1);
      this.shake = Math.max(this.shake, 3);
      sfx.slam();
    }
    this.drops = this.drops.filter((d) => d.t < DROP_T);
  }

  // ---------- effects ----------

  private updateFx() {
    if (this.shake > 0) this.shake--;
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) {
      p.life--;
      p.y -= 0.3;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  private sparks(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, s = 0.5 + this.rng() * 1.5;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 20 + this.rng() * 15, color });
    }
  }

  private debris(c: number) {
    const color = this.def.colors[3];
    for (let i = 0; i < 6; i++)
      this.particles.push({
        x: mid(cellX(c)) + (this.rng() - 0.5) * 12, y: mid(cellY(c)) + (this.rng() - 0.5) * 12,
        vx: (this.rng() - 0.5) * 2, vy: -1 - this.rng() * 1.5, life: 18 + this.rng() * 10, color,
      });
  }
}
