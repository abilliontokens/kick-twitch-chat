#!/usr/bin/env python3
"""Generate the extension icons (purple chat bubble, Twitch-style glyph)."""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
SIZES = [16, 32, 48, 128]
BG = (145, 71, 255)
BG2 = (90, 43, 176)
FG = (255, 255, 255)
SS = 4  # supersampling factor


def rounded_rect(x, y, w, h, r, px, py):
    if px < x or py < y or px > x + w or py > y + h:
        return False
    rx = min(max(px, x + r), x + w - r)
    ry = min(max(py, y + r), y + h - r)
    return (px - rx) ** 2 + (py - ry) ** 2 <= r * r


def bubble(px, py, size):
    # Speech bubble with a small tail, centered.
    w = size * 0.66
    h = size * 0.54
    x = (size - w) / 2
    y = size * 0.2
    r = size * 0.14
    if rounded_rect(x, y, w, h, r, px, py):
        return True
    # tail triangle bottom-left of the bubble
    tx = x + w * 0.2
    ty = y + h
    if ty <= py <= ty + size * 0.14 and tx <= px <= tx + size * 0.16:
        rel = (py - ty) / (size * 0.14)
        if px - tx <= size * 0.16 * (1 - rel):
            return True
    return False


def glyph(px, py, size):
    # Two small bars + a dot, evoking the Twitch glitch mark inside the bubble.
    cx = size / 2
    cy = size * 0.47
    bar_w = size * 0.055
    bar_h = size * 0.16
    gap = size * 0.075
    if abs(px - (cx - gap / 2)) <= bar_w / 2 and abs(py - cy) <= bar_h / 2:
        return True
    if abs(px - (cx + gap / 2)) <= bar_w / 2 and abs(py - cy) <= bar_h / 2:
        return True
    # bottom stub
    if abs(px - (cx - gap / 2)) <= bar_w / 2 and cy + bar_h / 2 <= py <= cy + bar_h:
        return True
    return False


def render(size):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            bg_hits = 0
            fg_hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = x + (sx + 0.5) / SS
                    py = y + (sy + 0.5) / SS
                    if not rounded_rect(0, 0, size, size, size * 0.22, px, py):
                        continue
                    bg_hits += 1
                    if bubble(px, py, size) and glyph(px, py, size):
                        fg_hits += 1
            total = SS * SS
            if bg_hits == 0:
                row += bytes([0, 0, 0, 0])
                continue
            t = y / max(1, size - 1)
            base = tuple(
                int(BG[i] * (1 - t) + BG2[i] * t) for i in range(3)
            )
            coverage = bg_hits / total
            fg = fg_hits / total
            if fg > 0:
                mix = fg / max(coverage, 1e-6)
                color = tuple(int(base[i] * (1 - mix) + FG[i] * mix) for i in range(3))
            else:
                color = base
            alpha = int(255 * coverage)
            row += bytes([*color, alpha])
        rows.append(bytes(row))

    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    return png


def main():
    OUT.mkdir(exist_ok=True)
    for size in SIZES:
        path = OUT / f"icon{size}.png"
        path.write_bytes(render(size))
        print(f"wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
