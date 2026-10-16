// CPU bombers. Each looks at a danger map (when every cell will be on fire, chains included),
// plans paths that are never in a flame when it gets there, and only lays a bomb it can
// get away from. Between dangers it goes for power-ups, blocks to break and its rivals.
import { World, Bomber, Bomb, Controls, FUSE, FLAME_T } from './world';
import { Dir, CELLS, SOLID, BLOCK, DX, DY, ITEMS, TILE, idx, cellX, cellY, mid, inside } from './arena';
import { Rng } from 'arcade-kit/rng';

const INF = 1e9;

export interface Danger {
  /** Frame (from now) the first flame reaches a cell, INF if none will. */
  t: Float64Array;
  /** Frame the last flame there dies down. */
  end: Float64Array;
  /** In the blast of a remote bomb nobody has set off yet: fine to pass, not to stay. */
  zone: Uint8Array;
}

/** A bomb as the planner sees it: where, how big, and when it goes off. */
interface Charge {
  c: number;
  range: number;
  pierce: boolean;
  time: number;
}

/** Cells a bomb at c would set on fire, and the blocks it would break. */
export function blast(w: World, c: number, range: number, pierce: boolean) {
  const fire = [c];
  const blocks: number[] = [];
  for (let d = 0; d < 4; d++)
    for (let k = 1; k <= range; k++) {
      const x = cellX(c) + DX[d] * k, y = cellY(c) + DY[d] * k;
      if (!inside(x, y)) break;
      const cc = idx(x, y);
      if (w.cells[cc] === SOLID) break;
      if (w.cells[cc] === BLOCK) {
        blocks.push(cc);
        if (!pierce) break;
        continue;
      }
      fire.push(cc);
      if (w.item[cc] >= 0 || w.bombAt(cc)) break;
    }
  return { fire, blocks };
}

/**
 * The danger map, optionally with one more bomb of its own laid, or with
 * one of its remote bombs set off now.
 */
export function dangerMap(w: World, extra?: Charge, trigger?: Bomb): Danger {
  const t = new Float64Array(CELLS).fill(INF);
  const end = new Float64Array(CELLS).fill(-1);
  const zone = new Uint8Array(CELLS);
  for (let c = 0; c < CELLS; c++)
    if (w.flame[c]) {
      t[c] = 0;
      end[c] = w.flame[c];
    }
  for (const [c, eta] of w.hurryNext(24)) {
    t[c] = Math.min(t[c], eta);
    end[c] = INF;
  }
  const charges: Charge[] = w.bombs.map((bm) => ({
    c: bm.air ? bm.air.to : w.bombCell(bm),
    range: bm.range,
    pierce: bm.pierce,
    // A remote goes off when its owner says so: a zone, not a time.
    time: bm === trigger ? 0 : bm.remote ? INF : Math.max(0, bm.fuse) + (bm.air ? bm.air.n - bm.air.t : 0),
  }));
  if (extra) charges.push(extra);
  const fires = charges.map((ch) => blast(w, ch.c, ch.range, ch.pierce).fire);
  // Chains: a bomb in another's blast goes off with it.
  for (let changed = true; changed; ) {
    changed = false;
    charges.forEach((a, i) =>
      charges.forEach((b, j) => {
        if (i !== j && a.time < b.time && fires[i].includes(b.c)) {
          b.time = a.time;
          changed = true;
        }
      }),
    );
  }
  charges.forEach((ch, i) => {
    if (ch.time >= INF) {
      for (const c of fires[i]) zone[c] = 1;
      return;
    }
    for (const c of fires[i]) {
      t[c] = Math.min(t[c], ch.time);
      end[c] = Math.max(end[c], ch.time + FLAME_T);
    }
  });
  return { t, end, zone };
}

/** A cell to stop in: no flame coming, no remote waiting. */
const safe = (d: Danger, c: number) => d.t[c] >= INF && !d.zone[c];

/** A remote bomb set off after this long anyway, so it doesn't hold a bomb back forever. */
const REMOTE_PATIENCE = 60 * 4;

interface Step {
  dir: Dir;
  /** The cell walked into (a warp hole sends you on from there). */
  via: number;
}

interface Found {
  cell: number;
  steps: number;
  path: Step[];
}

/** How a bot plays: 0 is a beginner, 1 sharp. */
function traits(skill: number) {
  return {
    /** Frames before it reacts to a new bomb or blast. */
    reaction: Math.round(20 - 18 * skill),
    /** Frames of safety it keeps from flames. */
    margin: 2 + 8 * skill,
    /** Chance of thinking it can outrun its own bomb when it can't quite. */
    blunder: 0.3 * (1 - skill) ** 2,
    avoidSkulls: skill > 0.35,
    /** How much a rival in reach counts against a block. */
    aggression: 1.5 + 3 * skill,
    /** Chance it dawdles a moment instead of acting. */
    dawdle: 0.25 * (1 - skill),
  };
}

export class Bot {
  private path: Step[] = [];
  private seenEvents = -1;
  private replanAt = 0;
  private waitUntil = 0;
  private stuck = 0;
  private lastX = 0;
  private lastY = 0;
  private trait: ReturnType<typeof traits>;
  /** Dev: what it last decided, and why. */
  why = '';

  constructor(readonly id: number, skill: number, private rng: Rng) {
    this.trait = traits(Math.max(0, Math.min(1, skill)));
  }

  update(w: World): Controls {
    const ctl: Controls = { dir: -1, bomb: false, act: false };
    const b = w.bombers[this.id];
    if (b.state !== 'alive' || w.state === 'ready' || w.state === 'done') return ctl;

    if (w.events !== this.seenEvents) {
      this.seenEvents = w.events;
      this.replanAt = w.frames + this.trait.reaction + Math.floor(this.rng() * 4);
    }
    // Arrived at the next cell: line up on its middle and go on.
    const sp = w.speedOf(b);
    let warping = false;
    while (this.path.length && !warping) {
      const s = this.path[0];
      const at = w.bomberCell(b) === s.via && Math.abs(b.x - mid(cellX(s.via))) <= sp && Math.abs(b.y - mid(cellY(s.via))) <= sp;
      if (!at) break;
      b.x = mid(cellX(s.via));
      b.y = mid(cellY(s.via));
      this.path.shift();
      // Stand still on a warp hole a frame, so it can take us.
      warping = w.warp[s.via] >= 0;
    }
    if (warping) return ctl;
    // Walking into a wall for a while: think again.
    if (this.path.length && b.x === this.lastX && b.y === this.lastY) {
      if (++this.stuck > 20) this.path = [];
    } else this.stuck = 0;
    this.lastX = b.x;
    this.lastY = b.y;

    // About to step into a cell that has turned dangerous: stop and think again.
    if (this.path.length) {
      const next = this.path[0].via;
      if (w.bomberCell(b) !== next) {
        const d = dangerMap(w);
        const at = (Math.abs(b.x - mid(cellX(next))) + Math.abs(b.y - mid(cellY(next)))) / sp;
        if (d.t[next] <= at + TILE / sp / 2 + 2 && d.end[next] >= at - TILE / sp / 2) {
          this.path = [];
          this.replanAt = w.frames;
        }
      }
    }
    const replan = this.replanAt && w.frames >= this.replanAt;
    if ((!this.path.length && w.frames >= this.waitUntil) || replan) {
      this.replanAt = 0;
      this.decide(w, b, ctl);
    }
    if (this.path.length) ctl.dir = this.path[0].dir;
    // Reversed by a curse: push the other way to go the right way.
    if (ctl.dir >= 0 && b.curse === 'reverse') ctl.dir = ((ctl.dir + 2) % 4) as Dir;
    return ctl;
  }

  private decide(w: World, b: Bomber, ctl: Controls) {
    const T = this.trait;
    const here = w.bomberCell(b);
    let danger = dangerMap(w);
    this.path = [];

    // Remote bombs: set the oldest off once its blast (chains and all) misses us and is worth it;
    // then plan with that blast in mind.
    const rivals = w.alive().filter((o) => o.id !== b.id);
    const rivalCells = new Set(rivals.map((o) => w.bomberCell(o)));
    const remote = w.bombs.filter((bm) => bm.owner === b.id && bm.remote && !bm.air).sort((p, q) => p.born - q.born)[0];
    if (remote && safe(danger, here)) {
      const boom = dangerMap(w, undefined, remote);
      const hit = (c: number) => boom.t[c] === 0 && !w.flame[c];
      const worth = [...rivalCells].some(hit) || blast(w, w.bombCell(remote), remote.range, remote.pierce).blocks.some((k) => !w.burn[k]);
      if (!hit(here) && (worth || w.frames - remote.born > REMOTE_PATIENCE)) {
        ctl.act = true;
        danger = boom;
      }
    }

    if (!safe(danger, here)) {
      const out = this.search(w, b, danger, (c) => safe(danger, c));
      this.why = `flee ${out ? out.path.map((s) => s.dir).join('') : 'NONE'}`;
      if (out) this.path = out.path;
      else {
        // Nowhere safe: the cell that burns last.
        const best = this.search(w, b, danger, () => false, (c) => danger.t[c] - danger.zone[c] * 10);
        if (best) this.path = best.path;
      }
      return;
    }

    if (this.rng() < T.dawdle * 0.3) {
      this.waitUntil = w.frames + 10 + Math.floor(this.rng() * 20);
      return;
    }

    // What a bomb laid at cell c would be worth.
    const worth = (c: number) => {
      const { fire, blocks } = blast(w, c, b.fire, b.pierce);
      const fresh = blocks.filter((k) => !w.burn[k] && safe(danger, k)).length;
      const hits = fire.filter((k) => rivalCells.has(k)).length;
      return fresh + hits * T.aggression;
    };
    const canLay = w.active(b) < b.bombs && b.curse !== 'nobomb' && !w.bombAt(here);

    if (canLay && worth(here) > 0 && this.layAndRun(w, b, here, ctl)) return;

    // Look round for the best thing to do within reach.
    let best: { cell: number; score: number; path: Step[] } | null = null;
    const consider = (cell: number, score: number, path: Step[]) => {
      if (score > 0 && (!best || score > best.score)) best = { cell, score, path };
    };
    this.search(w, b, danger, (c, steps, path) => {
      if (!safe(danger, c)) return false;
      const k = w.item[c];
      if (k >= 0 && !(ITEMS[k] === 'skull' && T.avoidSkulls)) consider(c, 4 - steps * 0.15, path);
      if (canLay && c !== here) {
        const v = worth(c);
        if (v > 0) consider(c, v * 1.2 - steps * 0.15, path);
      }
      return false;
    });
    if (best) {
      this.path = (best as { path: Step[] }).path;
      return;
    }

    // Nothing in reach: head for the nearest rival, or wander.
    const hunt = this.search(w, b, danger, (c) => {
      if (!safe(danger, c)) return false;
      return rivals.some((o) => {
        const oc = w.bomberCell(o);
        return Math.abs(cellX(oc) - cellX(c)) + Math.abs(cellY(oc) - cellY(c)) <= 1;
      });
    });
    if (hunt && hunt.path.length) {
      this.path = hunt.path.slice(0, 3);
      return;
    }
    const near = this.search(w, b, danger, (c, steps) => steps > 0 && steps <= 3 && safe(danger, c) && this.rng() < 0.3);
    if (near) this.path = near.path;
    else this.waitUntil = w.frames + 15;
  }

  /** Lays a bomb here if there is a way out of its blast, and sets off along it. */
  private layAndRun(w: World, b: Bomber, here: number, ctl: Controls) {
    const fuse = b.curse === 'short' ? 70 : FUSE;
    const after = dangerMap(w, { c: here, range: b.fire, pierce: b.pierce, time: fuse });
    // A blunder: it reckons on being twice as quick as it is, and no margin.
    const hasty = this.rng() < this.trait.blunder;
    const out = this.search(w, b, after, (c) => safe(after, c), undefined, hasty);
    if (!out) return false;
    ctl.bomb = true;
    this.path = out.path;
    this.why = `bomb@${here} run ${out.path.map((s) => s.dir).join('')}`;
    return true;
  }

  /**
   * Breadth-first search over the cells the bot can walk, never into one that will be on fire
   * while it passes. Returns the first cell `goal` accepts; with `rank`, the best-ranked one
   * reached instead.
   */
  private search(
    w: World,
    b: Bomber,
    danger: Danger,
    goal: (c: number, steps: number, path: Step[]) => boolean,
    rank?: (c: number) => number,
    hasty = false,
  ): Found | null {
    const fpc = TILE / w.speedOf(b) / (hasty ? 2 : 1);
    const margin = hasty ? 0 : this.trait.margin;
    const start = w.bomberCell(b);
    const seen = new Uint8Array(CELLS);
    seen[start] = 1;
    const queue: { c: number; time: number; path: Step[] }[] = [{ c: start, time: 0, path: [] }];
    let bestFound: Found | null = null;
    let bestRank = -Infinity;
    for (let qi = 0; qi < queue.length; qi++) {
      const { c, time, path } = queue[qi];
      if (goal(c, path.length, path)) return { cell: c, steps: path.length, path };
      if (rank) {
        const r = rank(c);
        if (r > bestRank) {
          bestRank = r;
          bestFound = { cell: c, steps: path.length, path };
        }
      }
      for (let d = 0; d < 4; d++) {
        const via = idx(cellX(c) + DX[d], cellY(c) + DY[d]);
        if (seen[via] || w.blockedFor(b, via)) continue;
        const to = w.warp[via] >= 0 ? w.warp[via] : via;
        // The first step is timed from where the bot really is, which may be off the middle.
        const at = qi ? time + fpc : (Math.abs(b.x - mid(cellX(via))) + Math.abs(b.y - mid(cellY(via)))) / (TILE / fpc);
        const unsafe = (k: number) => danger.t[k] <= at + fpc / 2 + margin && danger.end[k] >= at - fpc / 2;
        if (unsafe(via) || unsafe(to)) continue;
        seen[via] = 1;
        seen[to] = 1;
        queue.push({ c: to, time: at, path: [...path, { dir: d as Dir, via }] });
      }
    }
    return bestFound;
  }
}

