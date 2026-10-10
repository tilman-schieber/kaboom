"""ui/logo.png from the pixflux seed-1 logo (tools/raw/ui/logo_seed1.png).

Run:  uv run --with pillow python tools/logo.py
Alpha threshold at 128 (no partial alpha) and removal of stray clusters < 3 px. Size unchanged (176x44).
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
from bombers import drop_small  # noqa: E402

im = Image.open(os.path.join(ROOT, "raw", "ui", "logo_seed1.png")).convert("RGBA")
px = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
im = drop_small(im)
os.makedirs(os.path.join(ROOT, "..", "src", "assets", "ui"), exist_ok=True)
im.save(os.path.join(ROOT, "..", "src", "assets", "ui", "logo.png"))
print(im.size, im.getbbox())
