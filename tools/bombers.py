"""Build all bomber sprites from the raw PixelLab frames in tools/raw/bomber.

Run:  uv run --with pillow python tools/bombers.py

Steps (no resampling anywhere, integer shifts only):
  1. alpha threshold at 128 (no partial alpha), drop stray clusters < 3 px
     (not in death frames, where the sparks are tiny on purpose);
  2. place on a 32x32 canvas: horizontal shift per direction taken from the idle
     frame so the body centre is at x=16 (walk frames share it, so the body
     does not slide); vertical shift per frame so the lowest opaque row is y=29;
  3. palette remap of the white suit for black / red / blue;
  4. death frames 3-5 are progressively charred, frame 5 is also dithered away.
"""
import colorsys
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "raw", "bomber")
OUT = os.path.join(ROOT, "..", "src", "assets", "bomber")
FEET = 29
CX = 16

DIRS = {"down": "south", "up": "north", "left": "west", "right": "east"}

# suit ramps: (shade, highlight) used for the white suit's value range
SUITS = {
    "white": None,
    "black": ((66, 66, 88), (138, 136, 162)),
    "red": ((168, 30, 40), (240, 78, 64)),
    "blue": ((40, 78, 176), (88, 156, 246)),
}
# accent (gloves/boots/pompom) hue override per colour; None keeps pink
ACCENT_HUE = {"white": None, "black": None, "red": 46, "blue": None}


def load(name):
    im = Image.open(os.path.join(RAW, name)).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return im


def drop_small(im, minsize=3):
    px = im.load()
    w, h = im.size
    seen = set()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0 or (x, y) in seen:
                continue
            stack, comp = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and px[nx, ny][3]:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            if len(comp) < minsize:
                for p in comp:
                    px[p] = (0, 0, 0, 0)
    return im


def body_dx(im):
    """x shift that puts the bbox centre of `im` on CX."""
    l, t, r, b = im.getbbox()
    return CX - (l + r) // 2


def place(im, dx):
    l, t, r, b = im.getbbox()
    dy = FEET - (b - 1)
    out = Image.new("RGBA", (32, 32))
    out.paste(im, (dx, dy), im)
    lost = sum(1 for p in im.get_flattened_data() if p[3]) - sum(1 for p in out.get_flattened_data() if p[3])
    return out, lost


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def recolor(im, color):
    if color == "white":
        return im.copy()
    shade, hi = SUITS[color]
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hd = h * 360
            flash = 30 <= hd <= 70 and s > 0.05  # yellow-white flash of the death frames
            if s < 0.14 and v > 0.45 and not flash:
                t = max(0.0, min(1.0, (v - 0.62) / (0.98 - 0.62)))
                px[x, y] = lerp(shade, hi, t) + (255,)
            elif ACCENT_HUE[color] is not None and (hd >= 295 or hd < 10) and s > 0.3 and v > 0.35:
                nr, ng, nb = colorsys.hsv_to_rgb(ACCENT_HUE[color] / 360, min(1, s * 1.0), min(1, v * 1.02))
                px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), 255)
    return out


def char(im, k, keep_light=False):
    """Darken towards a sooty brown-black; k=0 unchanged, k=1 fully black."""
    out = im.copy()
    px = out.load()
    soot = (40, 30, 34)
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = lerp((r, g, b), soot, k) + (255,)
    return out


def vanish(im):
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            if (x + y) % 2 == 0:
                px[x, y] = (0, 0, 0, 0)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    frames = {}  # name -> 32x32 white frame
    report = []
    for d, src in DIRS.items():
        idle = drop_small(load(f"{src}.png"))
        dx = body_dx(idle)
        frames[f"{d}"], lost = place(idle, dx)
        report.append((d, lost))
        for i in range(4):
            f = drop_small(load(f"walk_{src}_{i}.png"))
            frames[f"{d}_walk_{i}"], lost = place(f, dx)
            report.append((f"{d}_walk_{i}", lost))
    # death: generated frames 1..6 (frame 0 is the reference pose)
    ref = load("death_0.png")
    ddx = body_dx(ref)
    death_src = [load(f"death_{i}.png") for i in range(1, 7)]
    for i, f in enumerate(death_src):
        frames[f"death_{i}"], lost = place(f, ddx)
        report.append((f"death_{i}", lost))
    # victory: frames 2 and 4 of the second victory animation (arms raised)
    wref = load("win2_0.png")
    wdx = body_dx(wref)
    for i, src in enumerate((2, 4)):
        frames[f"win_{i}"], lost = place(drop_small(load(f"win2_{src}.png")), wdx)
        report.append((f"win_{i}", lost))

    for color in SUITS:
        for name, im in frames.items():
            out = recolor(im, color)
            if name == "death_3":
                out = char(out, 0.45)
            elif name == "death_4":
                out = char(out, 0.75)
            elif name == "death_5":
                out = vanish(char(out, 0.85))
            out.save(os.path.join(OUT, f"{color}_{name}.png"))
    for name, lost in report:
        if lost:
            print("clipped", name, lost, "px")


if __name__ == "__main__":
    main()
