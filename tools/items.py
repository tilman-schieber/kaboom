"""Build power-up items (16x16 icon on a hand-drawn bevelled panel) and the bomb frames.

Run:  uv run --with pillow python tools/items.py

Icons come from the PixelLab 64-candidate grid (object 4656a174-98d0-4318-a36c-2e688f579e18,
frames saved as tools/raw/items/f<N>.png). No resampling: icons taller/wider than 14px lose
their most redundant interior row/column (the one most similar to its neighbour), and the
bomb is enlarged only by duplicating whole rows/columns.
"""
import colorsys
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "raw", "items")
ASSETS = os.path.join(ROOT, "..", "src", "assets")

ITEMS = {
    # name: (grid frame, panel colour)
    "bomb": (1, (80, 150, 240)),
    "fire": (6, (196, 40, 52)),
    "speed": (14, (40, 176, 168)),
    "kick": (19, (92, 184, 72)),
    "glove": (29, (236, 136, 40)),
    "remote": (34, (232, 204, 56)),
    "pierce": (45, (44, 62, 150)),
    "full": (49, (224, 72, 156)),
    "skull": (54, (112, 40, 156)),
}
OUTLINE = (16, 12, 20, 255)


def load(n):
    im = Image.open(os.path.join(RAW, f"f{n}.png")).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return im.crop(im.getbbox())


def mul(c, k):
    return tuple(max(0, min(255, int(round(v * k)))) for v in c[:3]) + (255,)


def panel(color):
    im = Image.new("RGBA", (16, 16))
    px = im.load()
    for y in range(16):
        for x in range(16):
            edge = x in (0, 15) or y in (0, 15)
            corner = (x in (0, 15)) and (y in (0, 15))
            if corner:
                continue
            if edge:
                px[x, y] = OUTLINE
            elif (x in (1, 14)) and (y in (1, 14)):
                px[x, y] = OUTLINE  # rounded corner
            elif y == 1 or x == 1:
                px[x, y] = mul(color, 1.45)
            elif y == 14 or x == 14:
                px[x, y] = mul(color, 0.58)
            else:
                px[x, y] = color + (255,)
    # soft inner highlight in the top-left quarter
    for y in range(2, 6):
        for x in range(2, 6):
            if x + y <= 6:
                px[x, y] = mul(color, 1.2)
    return im


def _diff(a, b):
    return sum(abs(p - q) for pa, pb in zip(a, b) for p, q in zip(pa, pb))


def shrink(im, max_w=14, max_h=14):
    """Drop interior rows/columns (the one most like its neighbour) until it fits."""
    while im.height > max_h:
        px = im.load()
        rows = [[px[x, y] for x in range(im.width)] for y in range(im.height)]
        y = min(range(1, im.height - 1), key=lambda y: _diff(rows[y], rows[y + 1]))
        im = _drop_row(im, y)
    while im.width > max_w:
        im = _drop_row(im.transpose(Image.Transpose.TRANSPOSE), None, True)
    return im


def _drop_row(im, y, transposed=False):
    if transposed:
        px = im.load()
        rows = [[px[x, yy] for x in range(im.width)] for yy in range(im.height)]
        y = min(range(1, im.height - 1), key=lambda yy: _diff(rows[yy], rows[yy + 1]))
    out = Image.new("RGBA", (im.width, im.height - 1))
    out.paste(im.crop((0, 0, im.width, y)), (0, 0))
    out.paste(im.crop((0, y + 1, im.width, im.height)), (0, y))
    if transposed:
        out = out.transpose(Image.Transpose.TRANSPOSE)
    return out


def build_items():
    os.makedirs(os.path.join(ASSETS, "items"), exist_ok=True)
    for name, (frame, color) in ITEMS.items():
        icon = shrink(load(frame))
        im = panel(color)
        ox = (16 - icon.width) // 2
        oy = (16 - icon.height + 1) // 2
        im.alpha_composite(icon, (ox, oy))
        im.save(os.path.join(ASSETS, "items", f"{name}.png"))


def dup(im, cols=(), rows=()):
    """Enlarge by duplicating whole columns/rows (nearest neighbour, indices in source coords)."""
    xs = []
    for x in range(im.width):
        xs.append(x)
        if x in cols:
            xs.append(x)
    ys = []
    for y in range(im.height):
        ys.append(y)
        if y in rows:
            ys.append(y)
    s = im.load()
    out = Image.new("RGBA", (len(xs), len(ys)))
    d = out.load()
    for ny, sy in enumerate(ys):
        for nx, sx in enumerate(xs):
            d[nx, ny] = s[sx, sy]
    return out


def spark_bright(im):
    out = im.copy()
    px = out.load()
    tip = None
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s > 0.5 and v > 0.6 and h * 360 < 70:  # orange/yellow spark pixels
                if h * 360 > 40:
                    px[x, y] = (255, 255, 236, 255)
                else:
                    px[x, y] = (255, 228, 72, 255)
                if tip is None or y < tip[1]:
                    tip = (x, y)
    return out, tip


def build_bomb():
    """fx/bomb_0..2: grid frame 61, widened 11->13 px (cols 6,7 and row 10 duplicated)."""
    os.makedirs(os.path.join(ASSETS, "fx"), exist_ok=True)
    src = Image.open(os.path.join(RAW, "f61.png")).convert("RGBA")
    px = src.load()
    for y in range(16):
        for x in range(16):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)

    def place(im, dx):
        out = Image.new("RGBA", (16, 16))
        out.paste(im, (dx, 15 - (im.getbbox()[3] - 1)), im)  # bottom row of the body on y=15
        return out

    normal = dup(src, cols=(6, 7), rows=(10,))        # body 13x12, x2..14 before the shift
    swollen = dup(src, cols=(5, 6, 7), rows=(9, 10))  # body 14x13
    b0 = place(normal, -1)   # body x1..13
    b1 = place(swollen, -2)  # body x0..13
    b2, tip = spark_bright(b0)
    if tip:
        p = b2.load()
        tx, ty = tip
        for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            x, y = tx + dx * 2, ty + dy
            if 0 <= x < 16 and 0 <= y < 16 and not p[x, y][3]:
                p[x, y] = (255, 236, 120, 255)
    for i, im in enumerate((b0, b1, b2)):
        im.save(os.path.join(ASSETS, "fx", f"bomb_{i}.png"))


if __name__ == "__main__":
    build_items()
    build_bomb()
