import { LEVELS, Level, TABLES, TableId } from './modes';
import { loadTables, saveTables, rankFor, ScoreEntry, Tables, MAX_SCORES, load, save, fetchGlobal, submitGlobal, flushPending } from './scores';
import { sfx, music } from './audio';
import { makeRng, randomSeed, Rng } from './rng';
import { World, Controls, NO_CONTROLS, ROUND_FRAMES } from './world';
import { Bot } from './bot';
import { ARENAS, ArenaDef, Dir } from './arena';
import { HELP_PAGES } from './help';

export type Action = 'up' | 'down' | 'left' | 'right' | 'bomb' | 'act' | 'start' | 'back' | 'quit' | 'mute' | 'scores';

export interface PlayerInput {
  held: Set<Action>;
  pressed: Set<Action>;
}

export interface Input extends PlayerInput {
  /** Raw A-Z / 0-9 / Backspace / Enter, for name entry. */
  typed: string[];
  /** Each human bomber's own input while a round is on. */
  players: PlayerInput[];
}

export type Phase = 'title' | 'play' | 'round' | 'match' | 'over' | 'entry' | 'scores' | 'help';

export interface Settings {
  /** 0 arcade, 1 battle. */
  game: number;
  /** Battle: human players 1-4 and CPU bombers 0-3, at most four in all. */
  players: number;
  cpus: number;
  /** Index into LEVELS. */
  level: number;
  /** Battle: 0 random, else ARENAS[arena - 1]. */
  arena: number;
  /** Battle: rounds to win a match. */
  wins: number;
  /** Index into MUSIC_NAMES. */
  music: number;
  /** M mutes without changing the selection. */
  muted: boolean;
}

export const GAMES = ['ARCADE', 'BATTLE'];
export const MUSIC_NAMES = ['ON', 'OFF'];
const MUSIC_OFF = 1;
export const MENU = ['GAME', 'PLAYERS', 'CPUS', 'LEVEL', 'ARENA', 'WINS', 'MUSIC', 'HELP'] as const;
export type MenuRow = (typeof MENU)[number];
/** Rows that only mean something in battle. */
const BATTLE_ROWS: MenuRow[] = ['PLAYERS', 'CPUS', 'ARENA', 'WINS'];
export const NAME_LEN = 6;
const NAME_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEFAULT_SETTINGS: Settings = { game: 0, players: 1, cpus: 3, level: 1, arena: 0, wins: 3, music: 0, muted: false };

/** Arcade: rounds to win a match, and what a won round pays. */
export const ARCADE_WINS = 2;
export const ROUND_BONUS = 2000;
/** Points a second for the time left on the clock when a round is won. */
export const TIME_BONUS = 10;
/** Arcade: how much sharper the CPUs get with each match won. */
const SKILL_STEP = 0.08;
/** The round result shows this long before the next round starts. */
export const ROUND_CARD = 200;

const DIR_ACTIONS: Action[] = ['up', 'right', 'down', 'left'];

function loadSettings(): Settings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(load('kaboom.settings') ?? '{}') };
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v | 0));
    s.game = clamp(s.game, 0, 1);
    s.players = clamp(s.players, 1, 4);
    s.cpus = clamp(s.cpus, Math.max(0, 2 - s.players), 4 - s.players);
    s.level = clamp(s.level, 0, LEVELS.length - 1);
    s.arena = clamp(s.arena, 0, ARENAS.length);
    s.wins = clamp(s.wins, 1, 5);
    s.music = clamp(s.music, 0, MUSIC_NAMES.length - 1);
    s.muted = !!s.muted;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export class Game {
  phase: Phase = 'title';
  settings = loadSettings();
  menuRow = 0;
  paused = false;
  timer = 0;

  world: World | null = null;
  bots: Bot[] = [];
  /** Humans in the game being played (the rest are CPUs). */
  humans = 1;
  /** Round wins per bomber in this match. */
  wins: number[] = [];
  /** Rounds played in this match. */
  round = 0;
  /** Arcade: matches won so far, score, rivals caught. */
  stage = 0;
  score = 0;
  kills = 0;
  /** Points the last round paid: [label, points]. */
  tally: [string, number][] = [];
  /** The match winner, once a match is decided. */
  champion = -1;
  private rng: Rng = makeRng(randomSeed());
  /** Each human's held direction, newest last. */
  private dirs: Dir[][] = [[], [], [], []];

  /** CPUs bombing it out behind the title screen. */
  attract: World | null = null;
  private attractBots: Bot[] = [];

  tables: Tables = loadTables();
  /** World top 10s from the server; null until loaded or while offline. */
  global: Tables | null = null;
  globalState: 'loading' | 'ok' | 'offline' = 'loading';
  /** Show the world table (true) or this browser's own (false). */
  scoresGlobal = true;
  /** Row of the last game in the world table, or -1. */
  globalRank = -1;
  entryRank = -1;
  entryName: string[] = [];
  entryCursor = 0;
  private entryFresh = false;

  helpPage = 0;
  /** Gamepads connected: they decide who plays with what. */
  pads = 0;
  /** Started with ?debug in the URL: cheat keys in play, and no high scores. */
  readonly debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

  constructor() {
    music.enabled = !this.settings.muted;
    this.refreshGlobal();
  }

  private async refreshGlobal() {
    // Games queued while offline go first, so the table includes them.
    await flushPending();
    const tables = await fetchGlobal();
    if (tables) this.global = tables;
    this.globalState = this.global ? 'ok' : 'offline';
    // Without world scores, show this browser's own.
    if (!this.global) this.scoresGlobal = false;
  }

  /** Posts a finished game to the world table and marks where it landed. */
  private async submitGlobal(e: ScoreEntry) {
    const mode = this.table;
    const res = await submitGlobal(mode, e);
    if (!res) return;
    this.global ??= Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Tables;
    this.global[mode] = res.top;
    this.globalState = 'ok';
    this.globalRank = res.rank;
  }

  get level(): Level {
    return LEVELS[this.settings.level];
  }

  get arcade() {
    return this.settings.game === 0;
  }

  /** The high score table: arcade, by CPU level. */
  get table(): TableId {
    return this.level.id;
  }

  get tableName() {
    return `ARCADE ${this.level.name}`;
  }

  best(): ScoreEntry | undefined {
    return this.tables[this.table]?.[0];
  }

  /** Rounds to win the match being played. */
  get winsNeeded() {
    return this.arcade ? ARCADE_WINS : this.settings.wins;
  }

  /** Whether a menu row means anything with the current settings. */
  rowLive(row: MenuRow) {
    return !this.arcade || !BATTLE_ROWS.includes(row);
  }

  /**
   * How the humans share the controls: the keyboard takes the players the gamepads can't,
   * one with the whole keyboard or two with half each; the pads take the rest in turn.
   */
  get controlPlan() {
    const humans = this.phase === 'title' ? (this.arcade ? 1 : this.settings.players) : this.humans;
    const keyboard = Math.max(0, humans - this.pads);
    return {
      humans,
      /** Two players share the keyboard. */
      split: humans >= 2 && keyboard !== 1,
      /** The player the first pad drives. */
      padBase: keyboard === 0 ? 0 : keyboard,
      /** Players left without any controls. */
      missing: Math.max(0, keyboard - 2),
    };
  }

  step(input: Input) {
    const { pressed } = input;
    if (this.phase === 'entry') return this.stepEntry(input);
    if (pressed.has('mute')) this.toggleMusic();
    if (this.phase === 'title' || this.phase === 'scores' || this.phase === 'help') this.stepAttract();

    switch (this.phase) {
      case 'title':
        return this.stepTitle(pressed);
      case 'play':
        return this.stepPlay(input);
      case 'round':
        return this.stepRound(input);
      case 'match':
        return this.stepMatch(input);
      case 'over':
        this.world!.update([]);
        if (++this.timer > 60 && (pressed.has('start') || pressed.has('bomb'))) {
          if (this.entryRank >= 0) this.phase = 'entry';
          else this.showScores();
          sfx.select();
        }
        return;
      case 'scores':
        return this.stepScores(pressed);
      case 'help':
        return this.stepHelp(pressed);
    }
  }

  // ---------- menu ----------

  private saveSettings() {
    save('kaboom.settings', JSON.stringify(this.settings));
  }

  private toggleMusic() {
    this.settings.muted = !music.toggle();
    this.saveSettings();
  }

  private get musicWanted() {
    return this.settings.music !== MUSIC_OFF;
  }

  /** Four CPUs fight on behind the menus; a new round whenever one is done. */
  private stepAttract() {
    const w = this.attract;
    if (!w || (w.state === 'done' && w.stateT > 90)) {
      const arena = ARENAS[Math.floor(this.rng() * ARENAS.length)];
      this.attract = new World(arena, makeRng(randomSeed()), 4);
      this.attractBots = [0, 1, 2, 3].map((i) => new Bot(i, 0.6, this.rng));
      return;
    }
    w.update(this.attractBots.map((b) => b.update(w)));
  }

  private stepTitle(pressed: Set<Action>) {
    const s = this.settings;
    if (music.running) music.stop();
    const live = MENU.filter((r) => this.rowLive(r));
    const at = Math.max(0, live.indexOf(MENU[this.menuRow]));
    if (pressed.has('up') || pressed.has('down')) {
      const next = live[(at + (pressed.has('up') ? live.length - 1 : 1)) % live.length];
      this.menuRow = MENU.indexOf(next);
      sfx.move();
    }

    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    const row = MENU[this.menuRow];
    if (row === 'HELP' && (d || pressed.has('start') || pressed.has('bomb'))) {
      this.helpPage = 0;
      this.phase = 'help';
      sfx.select();
      return;
    }
    if (d) {
      const wrap = (v: number, n: number) => (v + d + n) % n;
      if (row === 'GAME') s.game = wrap(s.game, GAMES.length);
      if (row === 'PLAYERS') {
        s.players = wrap(s.players - 1, 4) + 1;
        s.cpus = Math.min(Math.max(s.cpus, 2 - s.players), 4 - s.players);
      }
      if (row === 'CPUS') {
        const lo = Math.max(0, 2 - s.players), n = 4 - s.players - lo + 1;
        s.cpus = lo + wrap(s.cpus - lo, n);
      }
      if (row === 'LEVEL') s.level = wrap(s.level, LEVELS.length);
      if (row === 'ARENA') s.arena = wrap(s.arena, ARENAS.length + 1);
      if (row === 'WINS') s.wins = wrap(s.wins - 1, 5) + 1;
      if (row === 'MUSIC') s.music = wrap(s.music, MUSIC_NAMES.length);
      sfx.select();
      this.saveSettings();
    }
    if (pressed.has('scores')) {
      this.refreshGlobal();
      this.entryRank = -1;
      this.globalRank = -1;
      this.phase = 'scores';
      sfx.select();
    } else if (pressed.has('start') || pressed.has('bomb')) this.startGame();
  }

  private stepHelp(pressed: Set<Action>) {
    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    if (d) {
      this.helpPage = (this.helpPage + d + HELP_PAGES.length) % HELP_PAGES.length;
      sfx.move();
    }
    if (pressed.has('start') || pressed.has('back') || pressed.has('quit') || pressed.has('bomb')) {
      this.phase = 'title';
      sfx.select();
    }
  }

  // ---------- a game ----------

  startGame() {
    const s = this.settings;
    this.humans = this.arcade ? 1 : s.players;
    this.stage = 0;
    this.score = 0;
    this.kills = 0;
    this.entryRank = -1;
    this.paused = false;
    this.startMatch();
    sfx.start();
  }

  /** Bombers in play: humans first, then the CPUs. */
  get bomberCount() {
    return this.arcade ? 4 : this.settings.players + this.settings.cpus;
  }

  private startMatch() {
    this.wins = Array(this.bomberCount).fill(0);
    this.round = 0;
    this.champion = -1;
    this.startRound();
  }

  /** The arena of the next round: arcade goes through them in turn, battle as chosen. */
  private nextArena(): ArenaDef {
    if (this.arcade) return ARENAS[this.stage % ARENAS.length];
    const a = this.settings.arena;
    return a ? ARENAS[a - 1] : ARENAS[Math.floor(this.rng() * ARENAS.length)];
  }

  private startRound() {
    const n = this.bomberCount;
    this.world = new World(this.nextArena(), makeRng(randomSeed()), n);
    const skill = this.level.skill + (this.arcade ? this.stage * SKILL_STEP : 0);
    this.bots = [];
    for (let i = this.humans; i < n; i++) this.bots[i] = new Bot(i, skill, this.rng);
    this.dirs = [[], [], [], []];
    this.round++;
    this.phase = 'play';
    this.timer = 0;
  }

  /** Each human's controls from their own input, the CPUs' from their bots. */
  private controls(input: Input): Controls[] {
    const w = this.world!;
    return w.bombers.map((b) => {
      const bot = this.bots[b.id];
      if (bot) return bot.update(w);
      const p = input.players[b.id];
      if (!p) return NO_CONTROLS;
      // The newest direction pressed wins while held; let go, and the one held before is back.
      const held = this.dirs[b.id].filter((d) => p.held.has(DIR_ACTIONS[d]));
      DIR_ACTIONS.forEach((a, d) => {
        if (p.held.has(a) && !held.includes(d as Dir)) held.push(d as Dir);
      });
      this.dirs[b.id] = held;
      return { dir: held.length ? held[held.length - 1] : -1, bomb: p.pressed.has('bomb'), act: p.pressed.has('act') };
    });
  }

  private stepMusic(w: World) {
    if (!this.musicWanted || w.state === 'done') {
      if (music.running) music.stop();
      return;
    }
    const alive = w.alive().length;
    music.setIntensity(w.hurry ? 5 : Math.min(5, 1 + Math.floor((1 - w.clock / ROUND_FRAMES) * 3) + (w.bombers.length - alive)));
    music.setTempo(w.hurry ? 1.2 : 1);
    music.setKey(0);
    if (!music.running || music.tune !== w.def.tune) music.play(w.def.tune, true);
  }

  private stepPlay(input: Input) {
    const { pressed } = input;
    const w = this.world!;
    this.timer++;
    if (pressed.has('start') || pressed.has('back')) {
      this.paused = !this.paused;
      sfx.pause();
      if (this.paused) music.halt();
      else music.resume();
      return;
    }
    if (this.paused) {
      if (pressed.has('quit')) this.toTitle();
      return;
    }
    if (this.debug) this.debugKeys(input.typed);
    w.update(this.controls(input));
    this.stepMusic(w);
    if (w.state === 'done') this.endRound();
  }

  private endRound() {
    const w = this.world!;
    this.phase = 'round';
    this.timer = 0;
    music.stop();
    if (w.winner >= 0) this.wins[w.winner]++;
    if (w.winner >= 0) sfx.win();
    else sfx.draw();
    if (this.arcade) {
      const won = w.winner === 0;
      this.tally = [
        ['BLOCKS AND ITEMS', w.points[0] - w.bombers[0].kills * 1000],
        [`RIVALS ${w.bombers[0].kills} X 1000`, w.bombers[0].kills * 1000],
        ['ROUND WON', won ? ROUND_BONUS * (this.stage + 1) : 0],
        ['TIME LEFT', won ? Math.ceil(w.clock / 60) * TIME_BONUS : 0],
      ];
      this.kills += w.bombers[0].kills;
      for (const [, pts] of this.tally) this.score += pts;
    }
    const top = this.wins.findIndex((n) => n >= this.winsNeeded);
    if (top >= 0) this.champion = top;
  }

  private stepRound(input: Input) {
    const w = this.world!;
    this.timer++;
    w.update([]);
    const skip = this.timer > 60 && (input.pressed.has('start') || input.pressed.has('bomb'));
    if (this.timer < ROUND_CARD && !skip) return;
    if (this.champion < 0) return this.startRound();
    // The match is decided.
    if (this.arcade && this.champion !== 0) return this.gameOver();
    this.phase = 'match';
    this.timer = 0;
    sfx.champion();
  }

  /** A match won: in arcade on to the next one; in battle, a rematch or back to the menu. */
  private stepMatch(input: Input) {
    const { pressed } = input;
    this.timer++;
    this.world!.update([]);
    if (this.timer < 90) return;
    if (pressed.has('start') || pressed.has('bomb')) {
      if (this.arcade) this.stage++;
      this.startMatch();
      sfx.start();
    } else if (!this.arcade && (pressed.has('back') || pressed.has('quit'))) this.toTitle();
  }

  private gameOver() {
    this.phase = 'over';
    this.timer = 0;
    music.stop();
    sfx.over();
    this.prepareEntry();
  }

  private toTitle() {
    this.phase = 'title';
    this.world = null;
    this.paused = false;
    this.entryRank = -1;
    music.stop();
    sfx.select();
  }

  // ---------- high scores ----------

  private prepareEntry() {
    this.entryRank = -1;
    this.globalRank = -1;
    this.scoresGlobal = !!this.global;
    if (this.score <= 0 || this.debug) return;
    const entry: ScoreEntry = { name: '', score: this.score, matches: this.stage, kills: this.kills };
    const list = this.tables[this.table];
    const at = rankFor(list, entry);
    const last = (load('kaboom.name') ?? '').slice(0, NAME_LEN);
    if (at < 0) {
      // Not a personal record, but it still goes to the world table under the last name used.
      if (last.trim()) this.submitGlobal({ ...entry, name: last.trim() });
      return;
    }
    list.splice(at, 0, entry);
    list.length = Math.min(list.length, MAX_SCORES);
    this.entryRank = at;
    this.entryName = last.padEnd(NAME_LEN, ' ').split('');
    this.entryCursor = Math.min(NAME_LEN - 1, last.length);
    this.entryFresh = last.length > 0;
  }

  private stepEntry({ pressed, typed }: Input) {
    const name = this.entryName;
    const cycle = (d: number) => {
      const i = NAME_CHARS.indexOf(name[this.entryCursor]);
      name[this.entryCursor] = NAME_CHARS[(i + d + NAME_CHARS.length) % NAME_CHARS.length];
      sfx.move();
    };
    if (pressed.has('up')) cycle(1);
    if (pressed.has('down')) cycle(-1);
    if (pressed.has('left') && this.entryCursor > 0) this.entryCursor--;
    if (pressed.has('right') && this.entryCursor < NAME_LEN - 1) this.entryCursor++;

    for (const key of typed) {
      if (key === 'Enter') return this.commitName();
      if (key === 'Backspace') {
        if (name[this.entryCursor] === ' ' && this.entryCursor > 0) this.entryCursor--;
        name[this.entryCursor] = ' ';
      } else {
        // A suggested name is replaced as soon as you type.
        if (this.entryFresh) {
          name.fill(' ');
          this.entryCursor = 0;
        }
        name[this.entryCursor] = key;
        this.entryCursor = Math.min(NAME_LEN - 1, this.entryCursor + 1);
      }
      this.entryFresh = false;
      sfx.move();
    }
    if (pressed.size) this.entryFresh = false;
  }

  private commitName() {
    const name = this.entryName.join('').trim() || '------';
    const entry = this.tables[this.table][this.entryRank];
    entry.name = name;
    saveTables(this.tables);
    save('kaboom.name', name);
    this.submitGlobal(entry);
    this.phase = 'scores';
    this.timer = 0;
    sfx.win();
  }

  private showScores() {
    this.refreshGlobal();
    this.phase = 'scores';
    this.timer = 0;
  }

  private stepScores(pressed: Set<Action>) {
    if ((pressed.has('up') || pressed.has('down')) && this.global) {
      this.scoresGlobal = !this.scoresGlobal;
      sfx.move();
    }
    // Left and right page through the levels' tables.
    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    if (d) {
      this.settings.level = (this.settings.level + d + LEVELS.length) % LEVELS.length;
      this.saveSettings();
      this.entryRank = this.globalRank = -1;
      sfx.move();
    }
    if (pressed.has('start') || pressed.has('back') || pressed.has('scores') || pressed.has('bomb')) this.toTitle();
  }

  // ---------- debug mode ----------

  /** U full power, K knocks out every CPU, T runs the clock out, R remote on/off. */
  private debugKeys(typed: string[]) {
    const w = this.world!;
    for (const k of typed) {
      if (k === 'U')
        for (const b of w.bombers.slice(0, this.humans)) Object.assign(b, { bombs: 8, fire: 8, speed: 3, kick: true, glove: true });
      else if (k === 'K') {
        for (const b of w.alive()) if (b.id >= this.humans) w.kill(b, 0);
      }
      else if (k === 'T') w.clock = Math.min(w.clock, 61);
      else if (k === 'R') w.bombers[0].remote = !w.bombers[0].remote;
      else continue;
      sfx.select();
    }
  }
}
