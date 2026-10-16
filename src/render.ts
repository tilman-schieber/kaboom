import { Game, MENU, MenuRow, GAMES, MUSIC_NAMES, NAME_LEN, ROUND_CARD } from './game';
import { World, Bomber, Bomb, FLAME_T, F_CENTER, READY_FRAMES, DROP_T, DYING_FRAMES } from './world';
import { ARENAS, COLS, ROWS, TILE, CELLS, SOLID, BLOCK, ITEMS, DX, DY, cellX, cellY, idx, inside } from './arena';
import { LEVELS } from './modes';
import { MAX_SCORES } from './scores';
import { HELP_PAGES, wrapText } from './help';
import { drawText, drawTextCentered, drawTextScaled, drawTextShadow, textWidth } from 'arcade-kit/font';
import { WHITE, RED, GREY, LIGHT, DARK, YELLOW, GOLD, Ctx, drawBox, pad } from 'arcade-kit/draw';
import { spr, anim, has, flash, drawAt, BOMBER_COLORS } from './sprites';

export const W = 256;
export const H = 224;

/** Where the arena sits on the screen: below the HUD, centred. */
const AX = 8;
const AY = 16;
const DIR_NAMES = ['up', 'right', 'down', 'left'];

const color = (id: number) => BOMBER_COLORS[id % BOMBER_COLORS.length];

// ---------- the arena ----------

function drawFloor(ctx: Ctx, w: World, frame: number, ox: number, oy: number) {
  const theme = w.def.id;
  for (let c = 0; c < CELLS; c++) {
    if (w.cells[c] === SOLID && !isDropping(w, c)) continue;
    const x = ox + cellX(c) * TILE, y = oy + cellY(c) * TILE;
    ctx.drawImage(spr(`tiles/${theme}_floor`), x, y);
    // Shade under whatever stands in the cell above.
    const above = c - COLS;
    if (above >= 0 && w.cells[above] !== 0 && w.cells[c] === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y, TILE, 4);
    }
    if (w.belt[c] >= 0) {
      const from = beltFrom(w, c);
      if (from < 0) drawBelt(ctx, x, y, w.belt[c], frame);
      else drawBeltCorner(ctx, x, y, from, w.belt[c], frame);
    }
    if (w.warp[c] >= 0) drawWarp(ctx, x, y, frame);
  }
}

const isDropping = (w: World, c: number) => w.drops.some((d) => d.c === c);

/** A conveyor belt: dark rails and chevrons running its way. */
function drawBelt(ctx: Ctx, x: number, y: number, dir: number, frame: number) {
  ctx.fillStyle = '#282830';
  ctx.fillRect(x, y, TILE, TILE);
  const along = dir === 1 || dir === 3;
  ctx.fillStyle = '#606878';
  if (along) {
    ctx.fillRect(x, y + 1, TILE, 1);
    ctx.fillRect(x, y + 14, TILE, 1);
  } else {
    ctx.fillRect(x + 1, y, 1, TILE);
    ctx.fillRect(x + 14, y, 1, TILE);
  }
  // Chevrons, two to a cell, sliding along: u runs the belt's way, v across it.
  const plot = (u: number, v: number) => {
    const [px, py] = [[v, 15 - u], [u, v], [15 - v, u], [15 - u, 15 - v]][dir];
    ctx.fillRect(x + px, y + py, 1, 1);
  };
  ctx.fillStyle = '#f8b800';
  const shift = Math.floor(frame / 2) % 8;
  for (let k = 0; k < 2; k++)
    for (let dv = -3; dv <= 3; dv++)
      for (const du of [0, 1]) {
        const u = (k * 8 + shift + 3 - Math.abs(dv) - du + 16) % 16;
        plot(u, 7 + dv);
      }
}

/** The side a belt turning in cell c is fed from, or -1 when it runs straight. */
function beltFrom(w: World, c: number) {
  const d = w.belt[c];
  for (const s of [(d + 1) % 4, (d + 3) % 4]) {
    const x = cellX(c) + DX[s], y = cellY(c) + DY[s];
    if (inside(x, y) && w.belt[idx(x, y)] === (s + 2) % 4) return s;
  }
  return -1;
}

/**
 * A belt corner, fed from side s and running out to side d: the rails of drawBelt bent round
 * the inner corner (u, along, turned into the angle through the bend; v, across, the radius),
 * and its chevrons set along that bend.
 */
function drawBeltCorner(ctx: Ctx, x: number, y: number, s: number, d: number, frame: number) {
  // The inner corner, and the edges running from it on the way in and the way out.
  const kx = 8 + 8 * (DX[s] + DX[d]), ky = 8 + 8 * (DY[s] + DY[d]);
  const at = (u: number, v: number) => {
    const a = ((u + 0.5) / 16) * (Math.PI / 2), r = v + 0.5;
    const ex = -r * Math.cos(a), ox = -r * Math.sin(a);
    return [Math.floor(kx + ex * DX[d] + ox * DX[s]), Math.floor(ky + ex * DY[d] + ox * DY[s])];
  };
  const dot = (px: number, py: number) => {
    if (px >= 0 && py >= 0 && px < TILE && py < TILE) ctx.fillRect(x + px, y + py, 1, 1);
  };
  ctx.fillStyle = '#282830';
  for (let py = 0; py < TILE; py++)
    for (let px = 0; px < TILE; px++) if (Math.hypot(px + 0.5 - kx, py + 0.5 - ky) < 16) dot(px, py);
  ctx.fillStyle = '#606878';
  for (let u = 0; u < 32; u++) for (const v of [1, 14]) dot(...(at(u / 2, v) as [number, number]));
  // Chevrons, as in drawBelt; what runs over the edge the cells either side draw.
  ctx.fillStyle = '#f8b800';
  const shift = Math.floor(frame / 2) % 8;
  for (let k = -1; k < 3; k++) {
    const u0 = k * 8 + shift;
    const [bx, by] = at(u0 + 2, 8);
    // Square on, facing the way in for the first half of the bend and the way out after.
    const t = u0 + 2 < 8 ? (s + 2) % 4 : d, n = (t + 1) % 4;
    for (let dv = -3; dv <= 3; dv++)
      for (const du of [0, 1]) {
        const au = 3 - Math.abs(dv) - du - 2;
        dot(bx + au * DX[t] + dv * DX[n], by + au * DY[t] + dv * DY[n]);
      }
  }
}

/** A warp hole: a dark pit with rings turning in it. */
function drawWarp(ctx: Ctx, x: number, y: number, frame: number) {
  const cx = x + 8, cy = y + 8;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const t = (frame % 30) / 30;
  for (let k = 0; k < 2; k++) {
    const r = ((t + k / 2) % 1) * 6;
    ctx.strokeStyle = k ? '#b060f8' : '#f878f8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.5, r), Math.max(0.5, r * 0.8), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Flames: layered orange, yellow and white bars along the arms, swelling in and dying down. */
function drawFlames(ctx: Ctx, w: World, frame: number, ox: number, oy: number) {
  const layers: [string, number][] = [['#f83800', 7], ['#fca044', 5], ['#f8d838', 3], ['#fcfcfc', 1]];
  for (let c = 0; c < CELLS; c++) {
    const f = w.flame[c];
    if (!f) continue;
    const m = w.flameMask[c];
    const age = FLAME_T - f;
    const s = age < 4 ? (age + 1) / 5 : f < 10 ? f / 10 : 1;
    const flick = (frame + c) % 4 < 2 ? 0 : 1;
    const cx = ox + cellX(c) * TILE + 8, cy = oy + cellY(c) * TILE + 8;
    for (const [col, size] of layers) {
      const hw = Math.max(0, Math.round(size * s) - (size > 1 ? flick : 0));
      if (!hw && size > 1) continue;
      ctx.fillStyle = col;
      const arms = [0, 1, 2, 3].filter((d) => m & (1 << d));
      for (const d of arms) {
        if (d === 0) ctx.fillRect(cx - hw, cy - 8, hw * 2, 8 + hw);
        if (d === 2) ctx.fillRect(cx - hw, cy - hw, hw * 2, 8 + hw);
        if (d === 1) ctx.fillRect(cx - hw, cy - hw, 8 + hw, hw * 2);
        if (d === 3) ctx.fillRect(cx - 8, cy - hw, 8 + hw, hw * 2);
      }
      // The centre and the tips are round.
      const r = m & F_CENTER ? hw + 1 : hw;
      ctx.fillRect(cx - r, cy - r + 1, r * 2, r * 2 - 2);
      ctx.fillRect(cx - r + 1, cy - r, r * 2 - 2, r * 2);
    }
  }
}

function drawBlock(ctx: Ctx, w: World, c: number, x: number, y: number, frame: number) {
  const theme = w.def.id;
  const burn = w.burn[c];
  if (!burn) {
    ctx.drawImage(spr(`tiles/${theme}_block`), x, y);
    return;
  }
  // Burning away: flickering, charring, then falling apart.
  const k = 1 - burn / FLAME_T;
  ctx.save();
  ctx.globalAlpha = 1 - k * 0.7;
  ctx.drawImage(frame % 4 < 2 ? spr(`tiles/${theme}_block`) : flash(spr(`tiles/${theme}_block`)), x, y);
  ctx.restore();
  ctx.fillStyle = `rgba(0,0,0,${(k * 0.6).toFixed(2)})`;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = frame % 6 < 3 ? '#f83800' : '#f8d838';
  for (let i = 0; i < 4; i++) {
    const fx = (i * 5 + frame) % 14, fy = 12 - ((frame * 2 + i * 7) % 12) * k;
    ctx.fillRect(x + 1 + fx, y + fy, 2, 3);
  }
}

function drawItem(ctx: Ctx, w: World, c: number, x: number, y: number, frame: number) {
  const k = w.item[c];
  if (k >= 0) {
    const s = spr(`items/${ITEMS[k]}`);
    // A gentle shine every so often.
    ctx.drawImage((frame + c * 7) % 90 < 4 ? flash(s) : s, x, y);
  } else if (w.itemBurn[c]) {
    ctx.fillStyle = w.itemBurn[c] % 4 < 2 ? '#f8d838' : '#f83800';
    const r = 8 - Math.floor(w.itemBurn[c] / 3);
    ctx.fillRect(x + 8 - r, y + 8 - r, r * 2, r * 2);
  }
}

function drawBomb(ctx: Ctx, bm: Bomb, frame: number, ox: number, oy: number) {
  let x = ox + bm.x, y = oy + bm.y;
  if (bm.air) {
    // A throw arcs over the arena.
    const k = bm.air.t / bm.air.n;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(Math.round(x) - 5, Math.round(y) + 5, 10, 2);
    y -= Math.sin(k * Math.PI) * (bm.air.n > 12 ? 20 : 8);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(Math.round(x) - 6, Math.round(y) + 6, 12, 2);
  }
  // Pulses quicken as the fuse burns down.
  const rate = bm.remote ? 16 : bm.fuse < 40 ? 4 : bm.fuse < 90 ? 8 : 14;
  const strip = anim('fx/bomb', 3);
  const s = strip[Math.floor(frame / rate) % strip.length];
  drawAt(ctx, s, x, y);
  if (bm.remote && frame % 30 < 15) {
    ctx.fillStyle = RED;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }
}

function bomberSprite(w: World, b: Bomber, frame: number) {
  const col = color(b.id);
  if (b.state === 'dying') {
    const strip = anim(`bomber/${col}_death`, 6);
    return strip[Math.min(strip.length - 1, Math.floor((b.t / DYING_FRAMES) * strip.length))];
  }
  if (w.state === 'done' && w.winner === b.id) {
    const strip = anim(`bomber/${col}_win`, 2);
    return strip[Math.floor(frame / 15) % strip.length];
  }
  const dir = DIR_NAMES[b.dir];
  if (!b.moving) return spr(`bomber/${col}_${dir}`);
  const strip = anim(`bomber/${col}_${dir}_walk`, 4);
  return strip[Math.floor(b.walk / 5) % strip.length];
}

function drawBomber(ctx: Ctx, w: World, b: Bomber, frame: number, ox: number, oy: number) {
  if (b.state === 'gone') return;
  const x = Math.round(ox + b.x), y = Math.round(oy + b.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x - 6, y + 5, 12, 2);
  let s = bomberSprite(w, b, frame);
  if (b.curse && frame % 8 < 3) s = flash(s);
  ctx.drawImage(s, x - 16, y + 6 - 29);
}

/** The whole arena at (ox, oy): floor, then row by row, so heads overlap the row above. */
export function drawWorld(ctx: Ctx, w: World, frame: number, ox = AX, oy = AY) {
  drawFloor(ctx, w, frame, ox, oy);
  for (let c = 0; c < CELLS; c++) if (w.cells[c] === 0) drawItem(ctx, w, c, ox + cellX(c) * TILE, oy + cellY(c) * TILE, frame);
  drawFlames(ctx, w, frame, ox, oy);
  const theme = w.def.id;
  const bombers = [...w.bombers].sort((a, b) => a.y - b.y);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = row * COLS + col;
      const x = ox + col * TILE, y = oy + row * TILE;
      if (w.cells[c] === SOLID && !isDropping(w, c)) {
        const edge = col === 0 || row === 0 || col === COLS - 1 || row === ROWS - 1;
        ctx.drawImage(spr(`tiles/${theme}_${edge ? 'wall' : 'solid'}`), x, y);
      } else if (w.cells[c] === BLOCK) drawBlock(ctx, w, c, x, y, frame);
    }
    for (const bm of w.bombs) if (!bm.air && Math.floor(bm.y / TILE) === row) drawBomb(ctx, bm, frame, ox, oy);
    for (const b of bombers) if (Math.floor(b.y / TILE) === row) drawBomber(ctx, w, b, frame, ox, oy);
  }
  for (const bm of w.bombs) if (bm.air) drawBomb(ctx, bm, frame, ox, oy);
  // HURRY UP: wall blocks falling in.
  for (const d of w.drops) {
    const x = ox + cellX(d.c) * TILE, y = oy + cellY(d.c) * TILE;
    const k = d.t / DROP_T;
    ctx.fillStyle = `rgba(0,0,0,${(0.2 + k * 0.3).toFixed(2)})`;
    ctx.fillRect(x + 2, y + 2, 12, 12);
    ctx.drawImage(spr(`tiles/${theme}_solid`), x, Math.round(y - (1 - k) * 48));
  }
  for (const p of w.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(ox + p.x), Math.round(oy + p.y), 2, 2);
  }
  for (const p of w.popups) {
    if (p.text === 'HURRY UP!') continue;
    drawTextShadow(ctx, p.text, Math.round(ox + p.x - textWidth(p.text) / 2), Math.round(oy + p.y), YELLOW);
  }
}

// ---------- HUD and cards ----------

/** Left edge of each bomber's HUD slot. */
const SLOT_X = [4, 54, 164, 214];

function drawHud(ctx: Ctx, game: Game, w: World, frame: number) {
  ctx.fillStyle = '#181820';
  ctx.fillRect(0, 0, W, AY);
  ctx.fillStyle = '#383848';
  ctx.fillRect(0, AY - 1, W, 1);
  for (const b of w.bombers) {
    const x = SLOT_X[b.id];
    ctx.save();
    if (b.state !== 'alive') ctx.globalAlpha = 0.35;
    // The bomber's head, cut from its sprite.
    ctx.drawImage(spr(`bomber/${color(b.id)}_down`), 7, 1, 18, 14, x, 0, 18, 14);
    ctx.restore();
    const need = game.winsNeeded;
    for (let i = 0; i < need; i++) {
      const won = i < (game.wins[b.id] ?? 0);
      ctx.fillStyle = won ? GOLD : '#000';
      ctx.fillRect(x + 20 + (i % 5) * 5, need > 3 ? 3 + Math.floor(i / 5) * 5 : 5, 4, 4);
      if (!won) {
        ctx.fillStyle = '#585868';
        ctx.fillRect(x + 21 + (i % 5) * 5, (need > 3 ? 3 + Math.floor(i / 5) * 5 : 5) + 1, 2, 2);
      }
    }
  }
  // The clock, or HURRY when it has run out.
  const secs = Math.ceil(w.clock / 60);
  const clock = w.hurry ? 'HURRY' : `${Math.floor(secs / 60)}:${pad(secs % 60, 2)}`;
  const low = w.hurry || (secs <= 30 && w.state === 'play');
  drawTextCentered(ctx, clock, W / 2, 4, low ? (frame % 30 < 15 ? RED : WHITE) : WHITE);
}

/** Big text with a drop shadow, centred. */
function bigText(ctx: Ctx, s: string, y: number, col: string, scale = 2) {
  const x = Math.round(W / 2 - (textWidth(s) * scale) / 2);
  drawTextScaled(ctx, s, x + 1, y + 1, scale, '#000');
  drawTextScaled(ctx, s, x, y, scale, col);
}

function drawCards(ctx: Ctx, game: Game, w: World, frame: number) {
  if (w.state === 'ready') {
    if (w.stateT < 30) return;
    if (w.stateT < READY_FRAMES - 30) {
      bigText(ctx, game.arcade ? `STAGE ${game.stage + 1}` : `ROUND ${game.round}`, 84, WHITE);
      drawTextCentered(ctx, w.def.name, W / 2, 104, LIGHT);
      bigText(ctx, 'READY?', 118, YELLOW);
    }
  }
  if (w.state === 'play' && w.stateT < 40) bigText(ctx, 'GO!', 106, frame % 8 < 4 ? YELLOW : WHITE, 3);
  const hurry = w.popups.find((p) => p.text === 'HURRY UP!');
  if (hurry && frame % 16 < 11) bigText(ctx, 'HURRY UP!', 104, RED, 3);
}

function drawPause(ctx: Ctx, game: Game) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  drawBox(ctx, 52, 74, 152, 76);
  drawTextCentered(ctx, 'PAUSED', W / 2, 84, YELLOW);
  drawTextCentered(ctx, game.arcade ? `STAGE ${game.stage + 1}  SCORE ${game.score}` : `ROUND ${game.round}`, W / 2, 98);
  drawTextCentered(ctx, 'ENTER RESUME', W / 2, 116, LIGHT);
  drawTextCentered(ctx, 'BKSP / SELECT QUIT', W / 2, 130, GREY);
}

const PLAYER_NAME = (game: Game, id: number) => (id < game.humans ? `${id + 1}P` : game.arcade ? `CPU ${id}` : `CPU ${id - game.humans + 1}`);

function drawRound(ctx: Ctx, game: Game, w: World, frame: number) {
  if (game.timer < 20) return;
  const tall = game.arcade ? 116 : 64;
  const top = Math.round((H - tall) / 2) + 8;
  drawBox(ctx, 32, top, 192, tall);
  const title = w.winner < 0 ? 'DRAW GAME' : `${PLAYER_NAME(game, w.winner)} WINS`;
  bigText(ctx, title, top + 10, w.winner < 0 ? LIGHT : w.winner === 0 || !game.arcade ? YELLOW : RED);
  if (!game.arcade) {
    // Who has how many.
    w.bombers.forEach((b, i) => {
      const x = 48 + i * 42;
      ctx.drawImage(spr(`bomber/${color(b.id)}_down`), 7, 1, 18, 14, x, top + 32, 18, 14);
      drawText(ctx, String(game.wins[b.id]), x + 22, top + 36, game.wins[b.id] ? GOLD : GREY);
    });
    return;
  }
  game.tally.forEach(([label, pts], i) => {
    const y = top + 34 + i * 12;
    if (game.timer < 30 + i * 20) return;
    drawText(ctx, label, 44, y, LIGHT);
    const v = String(pts);
    drawText(ctx, v, 212 - textWidth(v), y, pts ? WHITE : GREY);
  });
  if (game.timer >= 30 + game.tally.length * 20) {
    const y = top + 34 + game.tally.length * 12 + 4;
    drawText(ctx, 'SCORE', 44, y, GREY);
    const v = String(game.score);
    drawText(ctx, v, 212 - textWidth(v), y, YELLOW);
  }
  if (game.timer > ROUND_CARD - 60 && frame % 30 < 20)
    drawTextCentered(ctx, game.champion < 0 ? 'NEXT ROUND' : game.champion === 0 ? 'MATCH WON!' : 'MATCH LOST', W / 2, top + tall - 14, LIGHT);
}

function drawMatch(ctx: Ctx, game: Game, frame: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, H);
  drawBox(ctx, 32, 56, 192, 112);
  drawTextCentered(ctx, game.arcade ? `STAGE ${game.stage + 1} CLEAR` : 'MATCH WINNER', W / 2, 66, LIGHT);
  const s = anim(`bomber/${color(game.champion)}_win`, 2)[Math.floor(frame / 15) % 2];
  ctx.drawImage(s, W / 2 - 16, 78);
  bigText(ctx, PLAYER_NAME(game, game.champion), 114, YELLOW);
  if (game.arcade) drawTextCentered(ctx, `SCORE ${game.score}`, W / 2, 134, WHITE);
  if (game.timer > 90 && frame % 40 < 28)
    drawTextCentered(ctx, game.arcade ? 'ENTER NEXT STAGE' : 'ENTER REMATCH  ESC MENU', W / 2, 150, LIGHT);
}

function drawOver(ctx: Ctx, game: Game, frame: number) {
  if (game.timer < 20) return;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, H);
  drawBox(ctx, 44, 64, 168, 92);
  bigText(ctx, 'GAME OVER', 76, RED);
  const stats: [string, string][] = [
    ['SCORE', String(game.score)],
    ['STAGES CLEARED', String(game.stage)],
    ['RIVALS', String(game.kills)],
  ];
  stats.forEach(([k, v], i) => {
    drawText(ctx, k, 60, 98 + i * 11, GREY);
    drawText(ctx, v, 196 - textWidth(v), 98 + i * 11);
  });
  if (game.timer > 60 && (frame >> 5) % 2 === 0) drawTextCentered(ctx, 'PRESS ENTER', W / 2, 142, LIGHT);
}

// ---------- screens ----------

export function render(ctx: Ctx, game: Game, frame: number) {
  ctx.save();
  const w = game.world;
  if (w && w.shake > 0 && game.phase === 'play' && !game.paused) ctx.translate(frame % 2 ? 1 : -1, w.shake > 4 ? (frame % 4 < 2 ? 1 : -1) : 0);
  switch (game.phase) {
    case 'title':
      renderTitle(ctx, game, frame);
      break;
    case 'entry':
    case 'scores':
      renderScores(ctx, game, frame);
      break;
    case 'help':
      renderHelp(ctx, game, frame);
      break;
    default:
      renderPlay(ctx, game, frame);
  }
  ctx.restore();
}

function renderPlay(ctx: Ctx, game: Game, frame: number) {
  const w = game.world!;
  ctx.fillStyle = '#000';
  ctx.fillRect(-4, -4, W + 8, H + 8);
  drawWorld(ctx, w, frame);
  drawHud(ctx, game, w, frame);
  drawCards(ctx, game, w, frame);
  if (game.phase === 'play' && game.paused) drawPause(ctx, game);
  if (game.phase === 'round') drawRound(ctx, game, w, frame);
  if (game.phase === 'match') drawMatch(ctx, game, frame);
  if (game.phase === 'over') drawOver(ctx, game, frame);
}

/** The CPUs fighting it out behind the menus, dimmed. */
function backdrop(ctx: Ctx, game: Game, frame: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (game.attract) drawWorld(ctx, game.attract, frame, AX, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
}

function drawLogo(ctx: Ctx, frame: number, y: number) {
  if (has('ui/logo')) {
    const s = spr('ui/logo');
    drawAt(ctx, s, W / 2, y + s.height / 2);
    return;
  }
  const t = 'KABOOM';
  const scale = 5;
  const x = Math.round(W / 2 - (textWidth(t) * scale) / 2);
  drawTextScaled(ctx, t, x + 2, y + 2, scale, '#000');
  // Fire from the bottom up: red, orange, yellow, with a white shine sweeping across.
  const bands: [number, string][] = [[0, YELLOW], [2, '#fca044'], [4, RED]];
  for (const [row, col] of bands) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y + row * scale, W, 7 * scale);
    ctx.clip();
    drawTextScaled(ctx, t, x, y, scale, col);
    ctx.restore();
  }
  const sx = ((frame * 2) % 400) - 80;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, y, 8, 7 * scale);
  ctx.clip();
  drawTextScaled(ctx, t, x, y, scale, WHITE);
  ctx.restore();
}

function renderTitle(ctx: Ctx, game: Game, frame: number) {
  backdrop(ctx, game, frame);
  drawLogo(ctx, frame, 8);
  drawTextCentered(ctx, 'LAST BOMBER STANDING', W / 2, 50, LIGHT);

  const s = game.settings;
  drawBox(ctx, 40, 60, 176, 96);
  const values: Record<MenuRow, string> = {
    GAME: GAMES[s.game],
    PLAYERS: String(s.players),
    CPUS: String(s.cpus),
    LEVEL: LEVELS[s.level].name,
    ARENA: s.arena ? ARENAS[s.arena - 1].name : 'RANDOM',
    WINS: String(s.wins),
    MUSIC: MUSIC_NAMES[s.music],
    HELP: 'HOW TO PLAY',
  };
  MENU.forEach((row, i) => {
    const y = 69 + i * 10;
    const on = i === game.menuRow;
    const live = game.rowLive(row);
    if (on) drawText(ctx, '>', 50, y, YELLOW);
    drawText(ctx, row, 60, y, !live ? DARK : on ? YELLOW : WHITE);
    const v = live ? values[row] : '-';
    drawText(ctx, v, 124, y, !live ? DARK : on ? WHITE : LIGHT);
    if (on && row !== 'HELP') {
      drawText(ctx, '<', 116, y, GREY);
      drawText(ctx, '>', 126 + textWidth(v), y, GREY);
    }
  });

  drawBox(ctx, 16, 160, 224, 60);
  const best = game.best();
  if (game.arcade)
    drawTextCentered(ctx, best ? `TOP ${pad(best.score, 7)} ${best.name}` : 'NO RECORD YET', W / 2, 169, RED);
  else drawTextCentered(ctx, `${s.players + s.cpus} BOMBERS  FIRST TO ${s.wins}`, W / 2, 169, RED);
  if ((frame >> 5) % 2 === 0) drawTextCentered(ctx, 'PRESS ENTER OR BOMB', W / 2, 181, YELLOW);
  const plan = game.controlPlan;
  const lines: string[] = [];
  if (plan.humans === 1) lines.push('ARROWS MOVE  SPACE BOMB  X ACT', 'H SCORES   M MUSIC');
  else {
    lines.push(plan.split ? '1P WASD SPACE SHIFT  2P ARROWS . -' : '1P KEYBOARD');
    const padded = plan.humans - (plan.split ? 2 : plan.padBase === 0 ? 0 : 1);
    if (game.pads) lines.push(`${game.pads} GAMEPAD${game.pads > 1 ? 'S' : ''}: ${padded > 0 ? `${plan.padBase + 1}P` : ''}${padded > 1 ? ` TO ${plan.padBase + padded}P` : ''}`);
    if (plan.missing) lines.push(`PLUG IN ${plan.missing} MORE GAMEPAD${plan.missing > 1 ? 'S' : ''}`);
  }
  lines.slice(0, 2).forEach((l, i) => drawTextCentered(ctx, l, W / 2, 194 + i * 11, plan.missing && i === lines.length - 1 ? RED : GREY));
  if (game.debug) drawTextCentered(ctx, 'DEBUG - NO HIGH SCORES', W / 2, 2, YELLOW);
}

function renderScores(ctx: Ctx, game: Game, frame: number) {
  const entering = game.phase === 'entry';
  const name = game.tableName;
  backdrop(ctx, game, frame);

  drawBox(ctx, 24, 8, 208, 176);
  // The name is typed into your own table; afterwards the world table shows by default.
  const world = game.scoresGlobal && !entering && !!game.global;
  const title = entering ? 'NEW RECORD!' : world ? 'WORLD SCORES' : 'LOCAL SCORES';
  drawTextCentered(ctx, title, W / 2, 16, entering ? YELLOW : WHITE);
  drawTextCentered(ctx, entering ? name : `< ${name} >`, W / 2, 27, entering ? LIGHT : GREY);
  const cols: [string, number][] = [['NAME', 48], ['SCORE', 96], ['STG', 158], ['KO', 186]];
  for (const [label, x] of cols) drawText(ctx, label, x, 40, GREY);
  ctx.fillStyle = '#585858';
  ctx.fillRect(34, 49, 188, 1);

  const blink = (frame >> 4) % 2 === 0;
  const list = world ? (game.global?.[game.table] ?? []) : game.tables[game.table];
  const myRow = world ? game.globalRank : game.entryRank;
  for (let i = 0; i < MAX_SCORES; i++) {
    const y = 54 + i * 12;
    const e = list[i];
    const mine = i === myRow;
    const col = mine ? (entering || blink ? YELLOW : WHITE) : i < 3 ? WHITE : LIGHT;
    const n = String(i + 1);
    drawText(ctx, n, 43 - textWidth(n), y, mine ? col : GREY);
    if (!e) {
      drawText(ctx, '------', 48, y, DARK);
      continue;
    }
    if (mine && entering) {
      drawText(ctx, game.entryName.join(''), 48, y, col);
      if (blink) {
        ctx.fillStyle = WHITE;
        ctx.fillRect(48 + game.entryCursor * 6, y + 8, 5, 1);
      }
    } else drawText(ctx, e.name.slice(0, NAME_LEN), 48, y, col);
    drawText(ctx, pad(e.score, 7), 96, y, col);
    drawText(ctx, String(e.matches + 1), 158, y, col);
    drawText(ctx, pad(e.kills, 3), 186, y, col);
  }

  drawBox(ctx, 24, 190, 208, 24);
  if (entering) drawTextCentered(ctx, 'TYPE NAME  THEN ENTER', W / 2, 198);
  else drawTextCentered(ctx, game.global ? `UP ${world ? 'LOCAL' : 'WORLD'} SCORES   ENTER BACK` : 'ENTER BACK', W / 2, 198, blink ? WHITE : LIGHT);
}

function renderHelp(ctx: Ctx, game: Game, frame: number) {
  const page = HELP_PAGES[game.helpPage];
  backdrop(ctx, game, frame);
  drawBox(ctx, 4, 4, 248, 186);
  drawTextCentered(ctx, `< ${page.title} >`, W / 2, 12, YELLOW);
  ctx.fillStyle = '#585858';
  ctx.fillRect(14, 23, 228, 1);
  wrapText(page.text, 38).forEach((line, i) => drawText(ctx, line, 14, 30 + i * 10, line.includes('  ') ? LIGHT : WHITE));
  drawBox(ctx, 4, 194, 248, 24);
  const blink = (frame >> 4) % 2 === 0;
  drawTextCentered(ctx, `< > PAGE ${game.helpPage + 1}/${HELP_PAGES.length}   ENTER BACK`, W / 2, 202, blink ? WHITE : LIGHT);
}
