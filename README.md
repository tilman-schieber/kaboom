# KABOOM

A Bomberman-style arena battle game, built in TypeScript with no runtime dependencies. Runs entirely in the browser. A sibling of [VEKTOR](https://github.com/tilman-schieber/vektor) and [jtris](https://github.com/tilman-schieber/jtris): same font, same high score tables, with sprite art drawn with [PixelLab](https://pixellab.ai).

**Play:** https://gh.tschieber.de/kaboom/

Lay bombs, break the blocks, catch your rivals in the blast: the last bomber standing wins the round. A bomb goes off after two and a half seconds in a cross of flame, sets off any bomb it reaches, and burns whoever stands in it, its owner included. Every round has two minutes on the clock; when it runs out, HURRY UP: the walls close in from the outside, ring by ring.

## Games

| Game | What it is |
| --- | --- |
| ARCADE | You against three CPU bombers. Win two rounds to take the match, then on to the next arena, where they are sharper. Lose a match and it is over. Each CPU level (EASY, NORMAL, HARD) has its own high score table. |
| BATTLE | 1 to 4 players and up to 3 CPUs, at most four bombers in all. Pick the arena (or RANDOM, a new one every round) and how many round wins take the match (1 to 5). |

Arcade points: 10 a block, 50 a power-up, 1000 a rival, and for a round won 2000 times the stage plus 10 a second left on the clock.

## Arenas

| Arena | Twist |
| --- | --- |
| GARDEN | The classic field: pillars in a grid, blocks everywhere else. |
| TEMPLE | Two pairs of warp holes: step on one and you come out of the other. |
| FACTORY | A loop of conveyor belts that carries bombers and bombs along. |

## Power-ups

Blocks hide power-ups. Flames burn them, and when a bomber goes, the power-ups they had scatter over the arena.

| Item | What it does |
| --- | --- |
| Bomb | One more bomb at a time, up to 8 |
| Fire | Longer flames, up to 8 |
| Skate | Faster, up to 4 times |
| Boot | Walk into a bomb to kick it; it slides until it hits something |
| Glove | ACT throws the bomb you stand on (or face) three cells, bouncing on over whatever it lands on, round the edge of the arena |
| Remote | Your bombs wait; ACT sets off the oldest |
| Pierce | Flames go through blocks |
| Gold flame | Full fire |
| Skull | A curse for ten seconds: SLOW, FAST, REVERSE, DIARRHEA (bombs drop on their own), NOBOMB or SHORT fuses. Touch another bomber and they catch it too |

## The CPUs

Each CPU keeps a danger map: when every cell will be on fire, chain reactions included, and which cells sit in the blast of a remote bomb nobody has set off yet. It only walks paths that are never in a flame when it gets there, and only lays a bomb when it has a way out. Between dangers it goes for power-ups, for spots where a bomb breaks the most blocks, and for its rivals. EASY reacts slowly, keeps little margin, walks into skulls and now and then misjudges how quick it is; HARD reacts at once, keeps clear of skulls and goes harder after its rivals. In arcade they get a little sharper with every match you win.

## Controls

| Key | Action |
| --- | --- |
| Arrows / W A S D | Move |
| Space / Z / J | Bomb |
| X / Shift / K | Act (glove, remote) |
| Enter / Esc | Start / pause |
| Backspace | Quit to menu (while paused) |
| M | Music on/off |
| H | High scores (title screen) |

With two players on one keyboard, player 1 has W A S D, Space to bomb and the left Shift (or E) to act; player 2 has the arrows, `.` to bomb and the key right of it (`-` on a German keyboard, `/` on a US one) or the right Shift to act. Gamepads take the players the keyboard can't: with one pad and two players the pad is player 2; with as many pads as players, one each. Three or four players need at least one or two pads; the title screen says who plays with what (browsers only report a gamepad once a button on it has been pressed).

A gamepad: stick or d-pad to move, A (or X) to bomb, B (or Y) to act, Start to pause and Select to quit from the pause screen. On the title screen Y shows the high scores; when typing a name, Up/Down pick a letter, A enters it and B rubs one out.

On phones and tablets a d-pad and BOMB, ACT and START buttons appear below the screen.

## Art

The bombers, tiles, items, bomb and logo were generated with PixelLab and finished with small Pillow scripts; [tools/ASSETS.md](tools/ASSETS.md) lists the tool, prompt, seed and id of each, and the scripts in `tools/` rebuild `src/assets/` from the raw downloads in `tools/raw/`. The four bombers are one character in four colours. Flames, belts, warp holes and the HUD are drawn in code. Music and sound are a small Web Audio synth; each arena has its own tune, which builds up as the round goes on and speeds up when the walls close in.

High scores: the top 10 per CPU level, both worldwide and in your own browser (Up/Down switches between them on the score screen, Left/Right between the levels). World scores live in a small [Val Town](https://www.val.town/x/tilmanschieber/kaboom-scores) val with a SQLite table; your own scores and settings stay in the browser's local storage, so they still work offline. Games finished while the server can't be reached wait in local storage and are sent the next time the score screen opens.

## Development

```sh
npm install
npm run dev
npm run build
```

Add `?debug` to the URL for debug mode: in play, U gives the human bombers full power, K knocks out every CPU, T runs the clock down to a second and R toggles the remote. Games in debug mode don't go into the high scores.

In a dev build the console has helpers: `sim(frames, held, pressed)` steps the game by hand with player 1 holding and pressing those actions, `live()` lets it run again, and `cpuRound(arena, skill, seed, trace)` plays a whole round of four CPUs headless and reports the winner, the time, every death (who lit the flame, and any curse) and, with `trace` set to a bomber, a log of its moves and decisions.
