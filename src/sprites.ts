// Sprite registry: every PNG under src/assets, keyed by path without extension ("bomber/red_down").
// Numbered files ("fx/bomb_2") also form frame strips ("fx/bomb").
// Anything missing is drawn in code instead, so the game runs before the art is in.

import { ARENAS } from './arena';

const URLS = import.meta.glob(['./assets/**/*.png', '!./assets/**/*_example.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type Sprite = HTMLCanvasElement;

const sprites = new Map<string, Sprite>();
const strips = new Map<string, Sprite[]>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Loads every asset; call once before the game starts. */
export async function loadSprites() {
  await Promise.all(
    Object.entries(URLS).map(async ([path, url]) => {
      const img = await loadImage(url);
      if (!img) return;
      const c = canvas(img.width, img.height);
      c.getContext('2d')!.drawImage(img, 0, 0);
      sprites.set(path.replace(/^\.\/assets\//, '').replace(/\.png$/, ''), c);
    }),
  );
  const groups = new Map<string, [number, Sprite][]>();
  for (const [name, s] of sprites) {
    const m = /^(.*)_(\d+)$/.exec(name);
    if (!m) continue;
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1])!.push([+m[2], s]);
  }
  for (const [name, frames] of groups) strips.set(name, frames.sort((a, b) => a[0] - b[0]).map((f) => f[1]));
}

export const has = (name: string) => sprites.has(name);

/** Names of the loaded sprites that start with `prefix`, sorted. */
export const named = (prefix: string) => [...sprites.keys()].filter((n) => n.startsWith(prefix)).sort();

// ---------- placeholders, drawn in code ----------

export const BOMBER_COLORS = ['white', 'black', 'red', 'blue'] as const;
/** Suit, trim and shade of each bomber, also used for the HUD. */
export const BOMBER_LOOK: Record<(typeof BOMBER_COLORS)[number], [string, string, string]> = {
  white: ['#f8f8f8', '#f878b8', '#a8a8b8'],
  black: ['#404048', '#f8d838', '#202028'],
  red: ['#f83800', '#f8f8f8', '#a01800'],
  blue: ['#3c7cfc', '#f8f8f8', '#1830a0'],
};
const DIRS = ['up', 'right', 'down', 'left'];

function px(g: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

/** A round blob of radius r at (x, y), outlined. */
function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  for (const [rr, col] of [[r + 1, '#000'], [r, fill]] as [number, string][])
    for (let dy = -rr; dy <= rr; dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
      px(g, col, x - half, y + dy, half * 2 + 1, 1);
    }
}

/** A bomber, 32x32, feet on row 29: name is "<color>_<dir>", optionally "_walk_N", "_death_N" or "_win_N". */
function bomber(name: string): Sprite {
  const m = /^(\w+?)_(up|right|down|left|death|win)(?:_walk)?(?:_(\d+))?$/.exec(name)!;
  const [suit, trim, shade] = BOMBER_LOOK[m[1] as (typeof BOMBER_COLORS)[number]] ?? BOMBER_LOOK.white;
  const pose = m[2], n = +(m[3] ?? 0);
  const walking = name.includes('_walk_');
  const c = canvas(32, 32);
  const g = c.getContext('2d')!;
  if (pose === 'death') {
    // Flash, then sink into a blackened heap.
    const k = n / 5;
    const body = n < 2 ? (n % 2 ? '#fcfcfc' : suit) : '#383838';
    const top = Math.round(4 + k * 18);
    blob(g, 16, Math.max(top + 7, 14), Math.max(2, Math.round(7 - k * 4)), body);
    px(g, '#000', 9, 28, 14, 2);
    if (n >= 3) px(g, '#585858', 12, 26, 8, 2);
    return c;
  }
  const dir = DIRS.indexOf(pose);
  const step = walking ? [0, 1, 0, -1][n % 4] : 0;
  const side = dir === 1 ? 1 : dir === 3 ? -1 : 0;
  // Feet.
  px(g, '#000', 10, 26 + Math.min(0, step), 6, 4 - Math.abs(Math.min(0, step)));
  px(g, '#000', 16, 26 - Math.max(0, step), 6, 4 - Math.max(0, step));
  px(g, trim, 11, 27 + Math.min(0, step), 4, 2);
  px(g, trim, 17, 27 - Math.max(0, step), 4, 2);
  // Body and arms.
  px(g, '#000', 10, 18, 12, 9);
  px(g, suit, 11, 19, 10, 7);
  px(g, shade, 11, 24, 10, 2);
  px(g, trim, 11, 21, 10, 1);
  const armY = pose === 'win' ? 12 + (n % 2) * 2 : 20 + step;
  blob(g, 8, armY, 2, '#fcfcfc');
  blob(g, 24, pose === 'win' ? armY : 20 - step, 2, '#fcfcfc');
  // Head, antenna and face.
  blob(g, 16, 12, 8, suit);
  px(g, shade, 10, 17, 12, 2);
  px(g, '#000', 16, 2, 1, 3);
  blob(g, 16, 2, 2, trim);
  if (dir !== 0) {
    const fx = 11 + side * 3;
    px(g, '#000', fx, 9, 10, 7);
    px(g, '#f8c8a0', fx + 1, 10, 8, 5);
    if (side >= 0) px(g, '#000', fx + 5 + side, 11, 1, 3);
    if (side <= 0) px(g, '#000', fx + 2 + side, 11, 1, 3);
  }
  return c;
}

function tile(name: string): Sprite {
  const [theme, kind] = name.split('_');
  const [floor, floor2, pillar, block] = (ARENAS.find((a) => a.id === theme) ?? ARENAS[0]).colors;
  const c = canvas(16, 16);
  const g = c.getContext('2d')!;
  if (kind === 'floor') {
    px(g, floor, 0, 0, 16, 16);
    px(g, floor2, 0, 0, 8, 8);
    px(g, floor2, 8, 8, 8, 8);
  } else if (kind === 'block') {
    px(g, '#000', 0, 0, 16, 16);
    px(g, block, 1, 1, 14, 14);
    px(g, '#00000040', 1, 12, 14, 3);
    px(g, '#ffffff40', 1, 1, 14, 2);
    px(g, '#00000060', 1, 6, 14, 1);
    px(g, '#00000060', 7, 1, 1, 5);
    px(g, '#00000060', 4, 7, 1, 5);
    px(g, '#00000060', 11, 7, 1, 5);
  } else {
    px(g, '#000', 0, 0, 16, 16);
    px(g, pillar, 1, 1, 14, 14);
    px(g, '#ffffff50', 1, 1, 14, 9);
    px(g, '#ffffff30', 2, 2, 12, 2);
    px(g, '#00000050', 1, 11, 14, 4);
  }
  return c;
}

const ITEM_LOOK: Record<string, [string, string]> = {
  bomb: ['#3c7cfc', 'B'], fire: ['#f83800', 'F'], speed: ['#58d854', 'S'], kick: ['#a85820', 'K'],
  glove: ['#f878b8', 'G'], remote: ['#c8c8c8', 'R'], pierce: ['#b060f8', 'P'], full: ['#f8b800', '*'],
  skull: ['#582878', '!'],
};
/** Tiny 3x5 letters for the placeholder items. */
const MINI: Record<string, string> = {
  B: '##.#.####.###.', F: '####..##.#..#..', S: '.####..#..####.', K: '#.##.###.#.##.#', G: '.###..#.##.#.##',
  R: '##.#.###.#.##.#', P: '##.#.###.#..#..', '*': '#.#.#.###.#.#.#', '!': '.#..#..#.....#.',
};

function item(name: string): Sprite {
  const [color, ch] = ITEM_LOOK[name] ?? ['#f0f', '?'];
  const c = canvas(16, 16);
  const g = c.getContext('2d')!;
  px(g, '#000', 1, 1, 14, 14);
  px(g, color, 2, 2, 12, 12);
  px(g, '#ffffff60', 2, 2, 12, 1);
  px(g, '#ffffff60', 2, 2, 1, 12);
  px(g, '#00000060', 2, 13, 12, 1);
  px(g, '#00000060', 13, 2, 1, 12);
  const bits = MINI[ch] ?? '';
  for (let i = 0; i < 15; i++) if (bits[i] === '#') px(g, '#fcfcfc', 5 + (i % 3) * 2, 3 + Math.floor(i / 3) * 2, 2, 2);
  return c;
}

function bomb(n: number): Sprite {
  const c = canvas(16, 16);
  const g = c.getContext('2d')!;
  const r = n === 1 ? 7 : 6;
  blob(g, 8, 9, r - 1, '#282830');
  px(g, '#a8a8c0', 5, 6, 2, 2);
  px(g, '#c87c3c', 9, 1, 2, 3);
  if (n === 2) px(g, '#f8d838', 10, 0, 3, 2);
  return c;
}

function placeholder(name: string): Sprite {
  const [dir, rest] = name.split('/');
  if (dir === 'bomber') return bomber(rest);
  if (dir === 'tiles') return tile(rest);
  if (dir === 'items') return item(rest);
  if (dir === 'fx' && rest.startsWith('bomb')) return bomb(+rest.slice(5) || 0);
  return canvas(16, 16);
}

/** The sprite, or a placeholder of the right size. */
export function spr(name: string): Sprite {
  let s = sprites.get(name);
  if (!s) sprites.set(name, (s = placeholder(name)));
  return s;
}

/** The n frames of an animation: the loaded strip, or placeholders. */
export function anim(name: string, n: number): Sprite[] {
  const loaded = strips.get(name);
  if (loaded?.length) return loaded;
  return Array.from({ length: n }, (_, i) => spr(`${name}_${i}`));
}

// ---------- derived variants ----------

function recolor(s: Sprite, color: string, alpha = 1) {
  const c = canvas(s.width, s.height);
  const g = c.getContext('2d')!;
  g.drawImage(s, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

const derived = new Map<Sprite, Sprite>();

/** All-white silhouette, for flashes. */
export function flash(s: Sprite) {
  let f = derived.get(s);
  if (!f) derived.set(s, (f = recolor(s, '#fcfcfc')));
  return f;
}

/** Draws a sprite centred on (x, y). */
export function drawAt(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number) {
  ctx.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
}
