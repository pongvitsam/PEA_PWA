# -*- coding: utf-8 -*-
"""Generate simple PEA Map PWA icons (PNG) without Pillow."""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "docs" / "icons"


def png_rgba(w, h, pixels):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b""
    for y in range(h):
        raw += b"\x00"
        for x in range(w):
            raw += bytes(pixels[y * w + x])
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def color_at(x, y, size):
    # normalized coords centered
    nx = (x + 0.5) / size
    ny = (y + 0.5) / size
    cx, cy = 0.5, 0.48
    # rounded square background
    bg = (37, 99, 235, 255)  # #2563eb
    # darker bottom gradient
    t = ny
    r = int(37 + (14 - 37) * t * 0.35)
    g = int(99 + (78 - 99) * t * 0.35)
    b = int(235 + (216 - 235) * t * 0.2)
    bg = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), 255)

    # rounded rect mask
    rad = 0.18
    px, py = nx, ny
    # distance to rounded rect
    ax = abs(px - 0.5) - (0.5 - rad)
    ay = abs(py - 0.5) - (0.5 - rad)
    dx = max(ax, 0)
    dy = max(ay, 0)
    outside = (dx * dx + dy * dy) > (rad * rad) or (ax > 0 and ay > 0 and (dx * dx + dy * dy) > rad * rad)
    # simpler circle-ish app icon: use circular clip for soft edges? Keep rounded square:
    hx = abs(px - 0.5)
    hy = abs(py - 0.5)
    if hx > 0.5 - rad and hy > 0.5 - rad:
        if (hx - (0.5 - rad)) ** 2 + (hy - (0.5 - rad)) ** 2 > rad * rad:
            return (0, 0, 0, 0)
    elif hx > 0.5 or hy > 0.5:
        return (0, 0, 0, 0)

    # white pin body
    pin_x, pin_y = 0.5, 0.42
    pr = 0.16
    d = math.hypot(nx - pin_x, ny - pin_y)
    # teardrop tip
    tip_y = 0.72
    # triangle-ish stem under circle
    in_circle = d <= pr
    # diamond tip: from (0.5, 0.52) to tip
    in_tip = False
    if 0.48 <= ny <= tip_y:
        half = (tip_y - ny) / (tip_y - 0.48) * 0.14
        if abs(nx - 0.5) <= half:
            in_tip = True

    if in_circle or in_tip:
        # inner teal hole
        if math.hypot(nx - pin_x, ny - pin_y) <= pr * 0.38:
            return (14, 165, 233, 255)  # #0ea5e9
        return (255, 255, 255, 255)

    # small bolt accent top-right
    if 0.62 < nx < 0.82 and 0.18 < ny < 0.38:
        # rough lightning
        lx = (nx - 0.72) * 8
        ly = (ny - 0.28) * 8
        if abs(lx + ly * 0.3) < 0.55 and abs(ly) < 0.9:
            return (94, 234, 212, 255)  # #5eead4

    return bg


def make(size, name):
    pixels = [color_at(x, y, size) for y in range(size) for x in range(size)]
    data = png_rgba(size, size, pixels)
    path = OUT / name
    path.write_bytes(data)
    print("wrote", path, len(data), "bytes")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    make(180, "apple-touch-icon.png")
    make(192, "icon-192.png")
    make(512, "icon-512.png")
    # maskable-ish same as 512
    make(512, "icon-512-maskable.png")


if __name__ == "__main__":
    main()
