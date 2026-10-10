"""Build the 16x16 arena tiles from the raw create_tiles_pro output in tools/raw/tiles.

Run:  uv run --with pillow python tools/tiles.py

No resampling: only row selection (dropping whole rows), copies and per-pixel colour math.
  floor : the tile's 1px dark frame is replaced by a single 1px joint line on the top and left (garden x0.9, so the lawn stays calm)
          edge (floor colour x0.72), the bottom/right frame pixels copy their inner neighbour,
          so the tile repeats seamlessly with thin slab joints.
  wall  : same joint fix but with a darker joint (x0.45), so the border reads as masonry.
  solid / block : 3/4 view. Rows 6-9 of the top-down tile are dropped so the top face is 12
          rows (rows 0-11, ending in the tile's own dark bottom frame row), then a 3-row front face
          (tile rows 1-3 darkened, x0.55 for pillars, x0.70 for soft blocks, with a 1px lighter lip
          on the first row) and a black bottom row.
Also writes tools/raw/tiles_preview.png, a mock arena per theme.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "raw", "tiles")
OUT = os.path.join(ROOT, "..", "src", "assets", "tiles")

PICK = {
    # theme: floor, solid, wall, block (raw file names, see ASSETS.md)
    "garden": ("tg_0", "tg_5", "tg_9", "tg_12"),
    "temple": ("tt_0", "tt_5", "tt_8", "tt_13"),
    "factory": ("tf_0", "tf_5", "tf_9", "tf_13"),
}


def load(n):
    im = Image.open(os.path.join(RAW, n + ".png")).convert("RGBA")
    px = im.load()
    for y in range(16):
        for x in range(16):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255)  # tiles are fully opaque
    return im


def mul(c, k):
    return tuple(max(0, min(255, int(round(v * k)))) for v in c[:3]) + (255,)


def joint_fix(im, k):
    out = im.copy()
    s, d = im.load(), out.load()
    # bottom row / right column: copy inner neighbour
    for x in range(16):
        d[x, 15] = s[x, 14]
    for y in range(16):
        d[15, y] = d[14, y]
    # top row / left column: joint line, darkened from the inner neighbour
    for x in range(16):
        d[x, 0] = mul(s[x, 1], k)
    for y in range(16):
        d[0, y] = mul(d[1, y] if y else s[1, 1], k)
    return out


def three_quarter(im, k_front):
    s = im.load()
    out = Image.new("RGBA", (16, 16))
    d = out.load()
    rows = [r for r in range(16) if r not in (6, 7, 8, 9)]  # 12 rows
    for ny, sy in enumerate(rows):
        for x in range(16):
            d[x, ny] = s[x, sy]
    outline = s[0, 0]
    for i, sy in enumerate((1, 2, 3)):
        for x in range(16):
            if x in (0, 15):
                d[x, 12 + i] = outline
            else:
                d[x, 12 + i] = mul(s[x, sy], k_front + (0.25 if i == 0 else 0))
    for x in range(16):
        d[x, 15] = (12, 10, 14, 255)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    previews = []
    for theme, (f, so, w, b) in PICK.items():
        tiles = {
            "floor": joint_fix(load(f), 0.9 if theme == "garden" else 0.72),
            "solid": three_quarter(load(so), 0.55),
            "wall": joint_fix(load(w), 0.45),
            "block": three_quarter(load(b), 0.70),
        }
        for k, im in tiles.items():
            im.save(os.path.join(OUT, f"{theme}_{k}.png"))
        # mock 9x7 arena: wall ring, pillars on even cells, a few soft blocks
        W, H = 11, 9
        arena = Image.new("RGBA", (W * 16, H * 16))
        for y in range(H):
            for x in range(W):
                if x in (0, W - 1) or y in (0, H - 1):
                    t = "wall"
                elif x % 2 == 0 and y % 2 == 0:
                    t = "solid"
                elif (x * 7 + y * 3) % 5 == 0:
                    t = "block"
                else:
                    t = "floor"
                arena.paste(tiles[t], (x * 16, y * 16))
        previews.append(arena)
    sheet = Image.new("RGBA", (sum(p.width + 4 for p in previews), previews[0].height), (0, 0, 0, 255))
    x = 0
    for p in previews:
        sheet.paste(p, (x, 0))
        x += p.width + 4
    sheet.save(os.path.join(ROOT, "raw", "tiles_preview.png"))


if __name__ == "__main__":
    main()
