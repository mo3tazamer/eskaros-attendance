#!/usr/bin/env python3
"""Generate Android/PWA PNG icons from the SVG design without external assets.

Reproduces public/icon.svg: teal rounded square + clock ring + hands.
Requires Pillow:  pip install Pillow
Outputs: public/icon-180.png, public/icon-192.png, public/icon-512.png
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public"

# Palette (matches icon.svg gradients)
TOP = (11, 71, 69)       # #0b4745
MID = (15, 92, 90)       # #0f5c5a
BOTTOM = (20, 128, 124)  # #14807c
ACCENT = (110, 231, 216) # #6ee7d8
WHITE = (255, 255, 255)


def lerp(a, b, t: float):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background: vertical-ish gradient via horizontal scanlines + rounded clip
    radius = int(size * 0.226)  # 116/512
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    grad = Image.new("RGB", (size, size))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / max(size - 1, 1)
        color = lerp(TOP, BOTTOM, t) if t < 0.6 else lerp(MID, BOTTOM, (t - 0.6) / 0.4)
        gd.line([(0, y), (size, y)], fill=color)
    img.paste(grad, (0, 0), mask)
    draw = ImageDraw.Draw(img, "RGBA")

    cx, cy = size / 2, size * 0.527  # 268/512
    ring_r = size * 0.246            # 126/512
    line_w = max(2, int(size * 0.043))  # 22/512

    # Small top accent line (like SVG)
    top_y = size * 0.188  # 96/512
    draw.line([(size * 0.344, top_y), (size * 0.656, top_y)],
              fill=(255, 255, 255, 140), width=max(2, int(size * 0.035)))

    # Clock ring
    draw.ellipse([cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r],
                 outline=(220, 245, 242, 255), width=line_w)
    # Teal arc top-right (like SVG arc)
    draw.arc([cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r],
             start=-65, end=35, fill=ACCENT + (255,), width=line_w)

    # Hands: up + down-right
    hand_w = max(2, int(size * 0.047))  # 24/512
    draw.line([(cx, cy - ring_r * 0.55), (cx, cy)],
              fill=WHITE + (255,), width=hand_w)
    ex = cx + ring_r * 0.40
    ey = cy + ring_r * 0.24
    draw.line([(cx, cy), (ex, ey)], fill=WHITE + (255,), width=hand_w)
    draw.ellipse([cx - size * 0.035, cy - size * 0.035,
                  cx + size * 0.035, cy + size * 0.035], fill=WHITE + (255,))
    return img


def main() -> None:
    for size in (180, 192, 512, 1024):
        img = make_icon(size)
        target = OUT / f"icon-{size}.png"
        img.save(target, "PNG")
        print(f"  {target.relative_to(ROOT)}  {size}x{size}")
    print("OK")


if __name__ == "__main__":
    main()
