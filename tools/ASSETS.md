# KABOOM asset log

All art was generated with PixelLab (MCP) and saved under `src/assets/`. The common style is high top-down / 3/4 view, a single-color black outline, medium shading, a transparent background and bright arcade colours.
Generations spent: **54** (balance went from 776 to 722 subscription generations).

Post-processing is done with small Pillow scripts in `tools/`. They can be re-run with `uv run --with pillow python tools/<script>.py`. They read the PixelLab downloads kept in `tools/raw/` and write into `src/assets/`. There is **no smooth scaling anywhere**: the scripts only use integer shifts, alpha thresholding at 128 (so every PNG has alpha 0 or 255 only), whole-row/column drops or duplications, and per-pixel colour maths.

| script | builds |
|---|---|
| `tools/bombers.py` | `bomber/*` (all 112 frames for 4 colours) |
| `tools/tiles.py` | `tiles/*` (also writes `tools/raw/tiles_preview.png`, a mock arena per theme) |
| `tools/items.py` | `items/*`, `fx/bomb_*` |
| `tools/logo.py` | `ui/logo.png` |

## Bombers

| path | tool | prompt | size | id | notes |
|---|---|---|---|---|---|
| raw `tools/raw/bomber/{south,east,north,west}.png` | create_character, standard, 4 dirs, size 24 (canvas comes back 36x36), high top-down, black outline, medium shading, medium detail, proportions custom head 1.8 / arms 0.8 / legs 0.7 / shoulders 0.9 / hips 0.9 | "classic Bomberman style chibi bomber hero, very big round white helmet head with a dark navy visor face plate showing two big white eyes, small pink pompom antenna on top of the helmet, tiny white suit body, pink gloves and pink boots, blue belt, cute arcade game character" | 36x36 | character 61169f8b-d6fc-43ca-a0d1-3e99be36c03e | Picked from 4 characters (see rejected). It is the only one with a correct back view (north shows the back of the helmet) and the classic big-helmet look. |
| walk | animate_character, template `walking-4-frames`, all 4 dirs | n/a | 36x36 | group 38c19049-50b1-4fe9-b907-76e389b41f2d | 4 gens. Used as `<color>_<dir>_walk_0..3`. |
| death | animate_character v3, south, 6 frames | "gets hit by an explosion: jolts in shock with arms flung out, then slumps and collapses down to the ground, flattening" | 48x48 | group 7f6b954d-1735-4c69-92c5-92e0a313ecd1 | Generated frames 1-6 (frame 0 is the reference) become death_0..5. Frames 0-2 have a yellow-white flash and sparks. The script chars frames 3/4/5 (lerp towards soot (40,30,34) by 0.45/0.75/0.85), and frame 5 also has every other pixel removed in a checkerboard so it looks like it is vanishing. |
| win | animate_character v3, south, 4 frames | "victory celebration: throws both arms straight up above the head with fists raised high, then pumps them, happy jump" | 48x48 | group 26b6af30-09c8-4760-a29d-a4b46815f75f | win_0 = generated frame 2 and win_1 = frame 4: gloves raised beside or above the head. Frame 1 had a drop shadow, so it was skipped. |

Placement (`bombers.py`): every frame goes on a 32x32 canvas. The lowest opaque row is **y=29 in every frame**. Horizontally, one shift per direction is taken from the idle frame so that its bbox centre is x=16, and the walk frames reuse it so the body does not slide. Death and win use the shift of their own reference frame. Stray clusters under 3 px are removed, except in the death frames, where the sparks are small on purpose. Nothing was clipped.

Recolours (palette remap, no generations): suit pixels (saturation < 0.14, value > 0.45, excluding the yellow death flash) are mapped by value onto a 2-colour ramp:
- `white`: as generated.
- `black`: (66,66,88) → (138,136,162), a slate grey so it doesn't merge with the black outline. Pink accents are kept.
- `red`: (168,30,40) → (240,78,64). The pink gloves, boots and pompom are re-hued to gold (hue 46°) so they stay distinct from the suit.
- `blue`: (40,78,176) → (88,156,246). Pink accents are kept.

The navy visor and the eyes are unchanged in all four.

Rejected (all kept in PixelLab):
- 098e52eb-c682-4a77-b242-be9d3fbd63b0 (same prompt, size 32, chibi preset): a nice classic look, but 30-33 px tall on a 48 canvas.
- 3d44ea24-ed37-4809-a1f8-3cf9b45ddf04 (size 32, custom big head): 34-36 px tall, and the side views show eyes on the side of the head.
- 10619e03-f5ee-428e-a88f-bdf7392f75f6 (size 24, chibi preset): the north view has a visor (it faces the wrong way).
- Victory group c0dcf68d-7ab5-45a8-88f7-13dc05ebe014 ("cheering victory pose, raising both arms high above the head and hopping slightly"): the arms only went out sideways.

## Tiles (create_tiles_pro, square_topdown, 16px, view top-down, seed 7; 10 gens each)

| theme | tiles id | prompt | picks (raw file → asset) |
|---|---|---|---|
| garden | 09ed457b-233c-48ad-88e5-c1228b98da9a | "1). green grass lawn floor, calm, low contrast 2). grey stone pillar block seen from above with a darker front face 3). dark green trimmed hedge wall 4). wooden crate with planks, light warm brown" | tg_0 floor, tg_5 solid, tg_9 wall, tg_12 block |
| temple | e7010325-784e-4eb3-b3da-8f09fd92bb92 | "1). pale sandstone temple floor slabs, calm, low contrast 2). carved grey-brown stone temple pillar block seen from above with carved glyph border 3). dark sandstone brick temple wall 4). cracked terracotta clay pot rubble block, warm orange" | tt_0 floor, tt_5 solid, tt_8 wall, tt_13 block |
| factory | 2bd8a4d2-f368-4e97-8d4b-213ef108b6e5 | "1). grey metal factory floor plate with subtle diamond tread, calm, low contrast 2). dark blue steel pillar block seen from above with rivets and bolted edge 3). dark steel factory wall with yellow and black hazard stripes 4). wooden shipping crate with metal corner brackets, light warm brown" | tf_0 floor, tf_5 solid, tf_9 wall, tf_13 block |

Each call returns 16 tiles, 4 variants per numbered prompt (indices 0-3, 4-7, 8-11, 12-15). All 48 are kept in `tools/raw/tiles/`.

`tiles.py`:
- **floor / wall**: the tool draws every tile with a 1px dark frame, which doubles into a 2px grid when tiled. The script replaces the bottom row and right column with their inner neighbours, and the top row and left column with a darkened copy of the inner row or column (floor ×0.72, garden floor ×0.9 so the lawn stays calm, wall ×0.45). The result tiles seamlessly with 1px joints.
- **solid / block**: 3/4 view built from the top-down tile. Rows 6-9 are dropped, so the top face is 12 rows and ends in the tile's own dark frame row. Then come a 3-row front face (tile rows 1-3 darkened ×0.55 for pillars or ×0.70 for soft blocks, with a lighter first lip row) and a dark bottom row. Both fill the full 16x16.

## Items and bomb (create_1_direction_object, 64-candidate grid at 16px, view sidescroller; 10 gens)

Object 4656a174-98d0-4318-a36c-2e688f579e18 (left in review state; the candidates used are saved in `tools/raw/items/f<N>.png`). Grid description: "bright arcade game power-up item icon, simple bold shape, single color black outline, medium shading, centered, NES SNES colors". There were 6-7 item descriptions per item: bomb icon (0-5), flame (6-11), red roller skate with yellow wheels (12-18), brown leather kicking boot (19-25), white cartoon glove (26-32), detonator "grey box with big red button and small antenna" (33-39), "spiked blue-white piercing flame icon shaped like a drill tip" (40-46), "big golden yellow flame icon with white-hot core" (47-52), white skull (53-58), and "classic round black cartoon bomb with shiny highlight and short fuse with orange spark, front view" (59-63).

| path | grid frame | panel colour | notes |
|---|---|---|---|
| items/bomb.png | 1 | light blue (80,150,240) | |
| items/fire.png | 6 | crimson (196,40,52) | |
| items/speed.png | 14 | teal (40,176,168) | |
| items/kick.png | 19 | green (92,184,72) | |
| items/glove.png | 29 | orange (236,136,40) | |
| items/remote.png | 34 | yellow (232,204,56) | |
| items/pierce.png | 45 | navy (44,62,150) | A blue-white drill cone. |
| items/full.png | 49 | pink (224,72,156) | A round golden flame with a white core. |
| items/skull.png | 54 | purple (112,40,156) | |

The panels are drawn by hand (`items.py panel()`), so they are identical for all items: a 16x16 rounded square with a dark (16,12,20) outline and cut corners, a 1px light bevel on the top and left (×1.45), a dark bevel on the bottom and right (×0.58), and a small highlight in the top-left. Icons are cropped to their bbox and fitted to ≤14x14 by dropping their most redundant interior row or column (frames 49 and 54 were 15 tall), then centred.

**fx/bomb_0..2**: from grid frame 61, whose body was 11x11. `bomb_0` duplicates columns 6 and 7 and row 10, giving a 13x12 body at x1-13 that sits on y=15. `bomb_1` (swollen) duplicates columns 5-7 and rows 9-10, giving a 14x13 body at x0-13. `bomb_2` is bomb_0 with the spark recoloured brighter (yellow → white, orange → yellow) and 4 extra spark pixels around the tip. The fuse and spark go up to the top-right corner.

## UI

| path | tool | prompt | seed | size | id |
|---|---|---|---|---|---|
| ui/logo.png | create_image_pixflux (text_guidance 12, black outline, medium shading, no_background) | 'pixel art game title logo text "KABOOM" in big chunky bold arcade letters, hot fire gradient from yellow at top to orange and red at bottom, thick dark outline, the O letters look like round black bombs with a lit fuse, centered, legible letters K A B O O M' | 1 | 176x44 | job a48195d8-0694-49a5-8e90-84f49d72299e |

The logo is fully legible: uppercase KABOOM with a yellow → orange gradient, a dark outline, and a black bomb with a lit fuse as the first O. The flame touches row 0. The other candidates were seed 2 (84425fa0…, lowercase "Kaboom" with a red outline) and seed 3 (d8af84aa…, lowercase with drips).

## Deviations from the spec

- Bombers are **13-14 px wide** (spec 16-18) and **25-29 px tall** including the pompom (spec 22-26). The side views are the tallest (up to 29, top at y=1). Shrinking them would have meant decimating rows, which hurts at this size, so they were left as generated. The win frames are 18 wide.
- The win pose has the gloves raised to head height or just above, not fully stretched arms.
- death_5 is the collapsed, charred body with a 50% checkerboard of pixels removed (a fade-out), not a separate ash sprite.
- The bomb body is 13 px (normal) / 14 px (swollen) across but 12/13 px tall. The spark of bomb_0/2 reaches x=15 and y=0.
