// The arenas: a 15x13 grid of 16px cells, drawn from a map per theme, with soft blocks
// scattered over the free cells and power-ups hidden under some of them.
import { Rng } from './rng';

export const COLS = 15;
export const ROWS = 13;
export const TILE = 16;
export const CELLS = COLS * ROWS;

export const FLOOR = 0;
export const SOLID = 1;
export const BLOCK = 2;

export type Dir = 0 | 1 | 2 | 3;
/** Up, right, down, left. */
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export const idx = (x: number, y: number) => y * COLS + x;
export const cellX = (c: number) => c % COLS;
export const cellY = (c: number) => (c / COLS) | 0;
/** Centre of a cell in arena pixels. */
export const mid = (n: number) => n * TILE + TILE / 2;
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

export const ITEMS = ['bomb', 'fire', 'speed', 'kick', 'glove', 'remote', 'pierce', 'full', 'skull'] as const;
export type ItemKind = (typeof ITEMS)[number];
/** How often each item turns up under a block. */
const ITEM_WEIGHT: Record<ItemKind, number> = { bomb: 30, fire: 30, speed: 14, kick: 8, glove: 5, remote: 4, pierce: 4, full: 3, skull: 6 };

export interface ArenaDef {
  id: string;
  name: string;
  /** Index into TUNES. */
  tune: number;
  /**
   * '#' wall or pillar, ' ' floor that may get a block, '.' floor that never does,
   * '1'-'4' spawns, '^>v<' conveyor belts, letters warp holes (two of each, linked).
   */
  map: string[];
  /** Share of the free cells that get a block. */
  density: number;
  /** Fallback colours when the tiles aren't drawn yet: floor, floor 2, pillar, block. */
  colors: [string, string, string, string];
}

export const ARENAS: ArenaDef[] = [
  {
    id: 'garden',
    name: 'GARDEN',
    tune: 0,
    density: 0.8,
    colors: ['#3c8c2c', '#348024', '#7c7c7c', '#c87c3c'],
    map: [
      '###############',
      '#1.         .2#',
      '#.# # # # # #.#',
      '#             #',
      '# # # # # # # #',
      '#             #',
      '# # # # # # # #',
      '#             #',
      '# # # # # # # #',
      '#             #',
      '#.# # # # # #.#',
      '#3.         .4#',
      '###############',
    ],
  },
  {
    id: 'temple',
    name: 'TEMPLE',
    tune: 1,
    density: 0.75,
    colors: ['#c8a868', '#bc9c5c', '#806040', '#a86838'],
    map: [
      '###############',
      '#1.         .2#',
      '#.# # # # # #.#',
      '#      a      #',
      '# # # # # # # #',
      '#             #',
      '#b# # # # # #b#',
      '#             #',
      '# # # # # # # #',
      '#      a      #',
      '#.# # # # # #.#',
      '#3.         .4#',
      '###############',
    ],
  },
  {
    id: 'factory',
    name: 'FACTORY',
    tune: 2,
    density: 0.8,
    colors: ['#58607c', '#505870', '#383c48', '#a07848'],
    map: [
      '###############',
      '#1.         .2#',
      '#.# # # # # #.#',
      '#  >>>>>>>>v  #',
      '# #^# # # #v# #',
      '#  ^       v  #',
      '# #^# # # #v# #',
      '#  ^       v  #',
      '# #^# # # #v# #',
      '#  ^<<<<<<<<  #',
      '#.# # # # # #.#',
      '#3.         .4#',
      '###############',
    ],
  },
];

const BELT_CHARS = '^>v<';

export interface Layout {
  cells: Uint8Array;
  /** Belt direction per cell, -1 for none. */
  belt: Int8Array;
  /** The linked warp hole per cell, -1 for none. */
  warp: Int16Array;
  /** Spawn cell of players 1-4. */
  spawns: number[];
  /** Power-up hidden under a block, by cell. */
  hidden: Map<number, ItemKind>;
}

function pickItem(rng: Rng): ItemKind {
  const total = ITEMS.reduce((n, k) => n + ITEM_WEIGHT[k], 0);
  let r = rng() * total;
  for (const k of ITEMS) if ((r -= ITEM_WEIGHT[k]) < 0) return k;
  return 'bomb';
}

/** Share of the blocks that hide an item. */
const ITEM_SHARE = 0.32;

export function buildArena(def: ArenaDef, rng: Rng): Layout {
  const cells = new Uint8Array(CELLS);
  const belt = new Int8Array(CELLS).fill(-1);
  const warp = new Int16Array(CELLS).fill(-1);
  const spawns: number[] = [];
  const warps = new Map<string, number>();
  const blocks: number[] = [];
  def.map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = idx(x, y);
      if (ch === '#') cells[c] = SOLID;
      else if (ch >= '1' && ch <= '4') spawns[+ch - 1] = c;
      else if (BELT_CHARS.includes(ch)) belt[c] = BELT_CHARS.indexOf(ch);
      else if (/[a-z]/.test(ch)) {
        const other = warps.get(ch);
        if (other === undefined) warps.set(ch, c);
        else {
          warp[c] = other;
          warp[other] = c;
        }
      } else if (ch === ' ' && rng() < def.density) {
        cells[c] = BLOCK;
        blocks.push(c);
      }
    }),
  );
  const hidden = new Map<number, ItemKind>();
  // Shuffle, then hide items under the first share of the blocks.
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }
  for (const c of blocks.slice(0, Math.round(blocks.length * ITEM_SHARE))) hidden.set(c, pickItem(rng));
  return { cells, belt, warp, spawns, hidden };
}

/**
 * HURRY UP: the order the walls close in, ring by ring from the outside, clockwise from
 * the top left. Pillars already standing are skipped.
 */
export function hurryOrder(cells: Uint8Array): number[][] {
  const rings: number[][] = [];
  let x0 = 1, y0 = 1, x1 = COLS - 2, y1 = ROWS - 2;
  while (x0 < x1 && y0 < y1) {
    const ring: number[] = [];
    for (let x = x0; x <= x1; x++) ring.push(idx(x, y0));
    for (let y = y0 + 1; y <= y1; y++) ring.push(idx(x1, y));
    for (let x = x1 - 1; x >= x0; x--) ring.push(idx(x, y1));
    for (let y = y1 - 1; y > y0; y--) ring.push(idx(x0, y));
    rings.push(ring.filter((c) => cells[c] !== SOLID));
    x0++, y0++, x1--, y1--;
  }
  return rings;
}
