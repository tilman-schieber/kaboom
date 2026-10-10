// Low-level pixel drawing: panels, colors.
export const W = 256;
export const H = 224;
export const WHITE = '#fcfcfc';
export const RED = '#f83800';
export const GREY = '#7c7c7c';
export const LIGHT = '#bcbcbc';
export const DARK = '#383838';
export const YELLOW = '#f8d838';
export const GOLD = '#f8b800';
export const BLUE = '#3cbcfc';
export const GREEN = '#58d854';

export type Ctx = CanvasRenderingContext2D;

export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Framed black panel with rounded corners; (x, y, w, h) is the outer edge.
export function drawBox(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const ring = (i: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + i, y + i, w - 2 * i, h - 2 * i);
  };
  ring(0, '#000');
  ring(1, LIGHT);
  ring(2, WHITE);
  ring(3, '#585858');
  ring(4, '#000');
  ctx.fillStyle = '#000';
  for (const [cx, cy] of [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 2], [x + w - 2, y + h - 2]])
    ctx.fillRect(cx, cy, 1, 1);
}

/** A filled pixel disc of radius r centred on (x, y). */
export function disc(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    ctx.fillRect(Math.round(x) - half, Math.round(y) + dy, half * 2 + 1, 1);
  }
}

export const pad = (n: number, len: number) => String(n).padStart(len, '0');

/** Cheap stable integer hash. */
export const hash = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
