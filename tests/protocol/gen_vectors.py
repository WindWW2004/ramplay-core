#!/usr/bin/env python3
"""Writes the conformance command streams, tests/protocol/NN_name.bin.

    python3 tests/protocol/gen_vectors.py

The .bin files are committed. Run this only when a vector changes, then
`python3 tests/protocol/run.py --bless` to write the expected PNGs, and look
at each PNG before committing it.
"""
from __future__ import annotations

from pathlib import Path

HERE = Path(__file__).resolve().parent

NOP, DEFTILE, SETBG, SETSPR, SETPAL, SCROLL, SOUND, TEXT, CLEAR, BGROW, CLRTXT, RESYNC = (
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0xFF)
VIS, HF, VF = 0x80, 0x04, 0x08


def tile(art: str) -> bytes:
    """8 rows of 8 hex digits (color indexes) -> 32 tile bytes. '.' is 0."""
    rows = art.split()
    assert len(rows) == 8 and all(len(r) == 8 for r in rows), art
    out = bytearray()
    for r in rows:
        v = [0 if ch == "." else int(ch, 16) for ch in r]
        out += bytes(v[i] << 4 | v[i + 1] for i in range(0, 8, 2))
    return bytes(out)


def deftile(i: int, art: str) -> bytes:
    return bytes([DEFTILE, i]) + tile(art)


def solid(i: int, c: int) -> bytes:
    return bytes([DEFTILE, i]) + bytes([c << 4 | c]) * 32


def text(x: int, y: int, pal: int, s: str) -> bytes:
    return bytes([TEXT, x, y, pal]) + s.encode("ascii") + b"\x00"


def rgb565(r: int, g: int, b: int) -> int:
    return (r >> 3) << 11 | (g >> 2) << 5 | (b >> 3)


def setpal(p: int, colors: list[int]) -> bytes:
    assert len(colors) == 16
    return bytes([SETPAL, p]) + b"".join(bytes([c & 0xFF, c >> 8]) for c in colors)


ARROW = """
...77...
..7777..
.777777.
77.77.77
...77...
...77...
...99...
...99...
"""
CHECK = """
22223333
22223333
22223333
22223333
55556666
55556666
55556666
55556666
"""
BALL = """
..FFFF..
.FEEEEF.
FEE..EEF
FE....EF
FE....EF
FEE..EEF
.FEEEEF.
..FFFF..
"""
CORNER = """
FFFFFFFF
F9......
F.9.....
F..9....
F...9...
F....9..
F.....9.
F......9
"""


def vectors() -> dict[str, bytes]:
    v: dict[str, bytes] = {}

    v["01_default"] = b""

    v["02_text"] = (
        text(4, 7, 0, "HELLO RAMPLAY")
        + text(0, 0, 0, " !\"#$%&'()*+,-./0123")
        + text(0, 1, 0, "456789:;<=>?@ABCDEFG")
        + text(0, 2, 0, "HIJKLMNOPQRSTUVWXYZ[")
        + text(0, 3, 0, "\\]^_`abcdefghijklmno")
        + text(0, 4, 0, "pqrstuvwxyz{|}~")
        + text(0, 15, 0, "bottom row, jumpy q.")
    )

    b = deftile(1, ARROW) + deftile(2, CHECK)
    for y in range(16):
        for x in range(20):
            if (x + y) % 3 == 0:
                b += bytes([SETBG, x, y, 1 + (x + y) % 2, 0])
    v["03_tiles_bg"] = b

    b = deftile(1, CORNER) + deftile(2, ARROW)
    for i, attr in enumerate([0, HF, VF, HF | VF]):
        b += bytes([SETBG, 2 + 3 * i, 2, 1, attr, SETBG, 2 + 3 * i, 5, 2, attr])
        b += bytes([SETSPR, i, 16 + 24 * i, 72, 1, VIS | attr, SETSPR, 4 + i, 16 + 24 * i, 96, 2, VIS | attr])
    v["04_flip"] = b

    ramp = lambda r, g, bl: [rgb565(r * i // 15, g * i // 15, bl * i // 15) for i in range(16)]
    b = setpal(1, ramp(255, 0, 0)) + setpal(2, ramp(0, 255, 0)) + setpal(3, ramp(0, 0, 255))
    for c in range(16):
        b += solid(16 + c, c)
    for p in range(4):
        for c in range(16):
            b += bytes([SETBG, 2 + c, 2 + 3 * p, 16 + c, p, SETBG, 2 + c, 3 + 3 * p, 16 + c, p])
    b += text(2, 14, 1, "RED") + text(8, 14, 2, "GREEN") + text(15, 14, 3, "BLUE")
    v["05_palettes"] = b

    b = solid(1, 9) + solid(2, 5) + solid(3, 2) + deftile(4, BALL) + deftile(5, CHECK)
    b += bytes([BGROW, 0, 4, 20]) + bytes([5] * 20)
    b += bytes([SETSPR, 2, 20, 20, 1, VIS, SETSPR, 1, 24, 24, 2, VIS, SETSPR, 0, 28, 28, 3, VIS])  # 0 on top
    b += bytes([SETSPR, 3, 60, 30, 4, VIS])           # holes show the background
    b += bytes([SETSPR, 4, 64, 34, 4, VIS])           # and the sprite under it
    b += bytes([SETSPR, 5, 156, 60, 1, VIS])          # clipped right
    b += bytes([SETSPR, 6, 80, 124, 2, VIS])          # clipped bottom
    b += bytes([SETSPR, 7, 156, 124, 3, VIS])         # the corner
    b += bytes([SETSPR, 8, 100, 60, 1, 0])            # not visible
    b += bytes([SETSPR, 9, 160, 60, 1, VIS])          # off-screen
    b += bytes([SETSPR, 10, 100, 128, 1, VIS])        # off-screen
    b += bytes([SETSPR, 11, 0, 0, 2, VIS])            # top-left corner
    b += bytes([SETSPR, 32 + 12, 120, 60, 4, VIS])    # id masked to 12
    v["06_sprites"] = b

    b = deftile(1, CHECK) + deftile(2, ARROW) + solid(3, 9)
    for i in range(32):
        b += bytes([SETBG, i, i, 1, 0, SETBG, i, 31 - i, 2, 0])
    b += bytes([SETBG, 0, 0, 3, 0, SETBG, 31, 31, 3, 0])
    b += bytes([SCROLL, 250, 245])
    b += bytes([SETSPR, 0, 76, 60, 3, VIS]) + text(0, 0, 0, "FIXED")
    v["07_scroll"] = b

    b = solid(1, 2) + solid(2, 5) + solid(3, 7) + solid(4, 9)
    b += bytes([BGROW, 0, 0, 20]) + bytes([1 + i % 4 for i in range(20)])
    b += bytes([SETBG, 18, 2, 0, 3])                  # BGROW sets attr back to 0
    b += bytes([BGROW, 16, 2, 8, 1, 2, 3, 4, 1, 2, 3, 4])            # onto the screen, then off it
    b += bytes([BGROW, 30, 4, 6, 4, 4, 3, 3, 2, 2])  # wraps to x = 0
    b += bytes([BGROW, 4, 6, 40]) + bytes([1 + i % 4 for i in range(40)])   # 32 stored, 40 consumed
    b += bytes([BGROW, 0, 8, 0])                      # n = 0
    b += bytes([BGROW, 32 + 2, 32 + 10, 3, 4, 3, 2])  # x, y masked
    v["08_bgrow"] = b

    b = solid(1, 4) + solid(2, 9)
    for y in range(16):
        b += bytes([BGROW, 0, y, 20]) + bytes([1] * 20)
    b += bytes([SETSPR, 0, 4, 20, 2, VIS, SETSPR, 1, 12, 20, 2, VIS])
    b += text(0, 2, 0, "OVER SPRITES") + text(14, 5, 0, "CLIPPED AT THE EDGE") + text(0, 6, 0, "next row untouched")
    b += text(19, 8, 0, "Z") + text(20, 9, 0, "gone") + text(0, 16, 0, "gone") + text(3, 10, 7, "pal 7 = pal 3")
    b += bytes([TEXT, 0, 12, 0, ord("A"), 0x7F, 0x01, ord("B"), 0x80, ord("C"), 0])
    b += text(0, 13, 0, "one") + text(0, 13, 0, "tw") + text(4, 13, 0, " ")
    v["09_text_layer"] = b

    b = solid(1, 6) + bytes([BGROW, 0, 0, 20]) + bytes([1] * 20)
    b += bytes([SETSPR, 0, 50, 50, 1, VIS, SCROLL, 5, 5]) + text(0, 3, 0, "ERASED")
    b += bytes([CLEAR])
    b += bytes([SETBG, 3, 3, 1, 0]) + text(5, 3, 0, "AFTER CLEAR")
    b += text(0, 5, 0, "ERASED TOO") + bytes([CLRTXT]) + text(0, 7, 0, "AFTER CLRTXT") + bytes([SETSPR, 1, 8, 100, 1, VIS])
    v["10_clear"] = b

    b = bytes([NOP, NOP, RESYNC, 0x0B, 0x10, 0x7F, 0xFE, NOP])
    b += solid(1, 3) + bytes([SETBG, 32 + 1, 64 + 1, 1, 0xF0])    # masked position, reserved attr bits
    b += bytes([SCROLL, 0xFF, 0xFF, SCROLL, 0, 0])                 # $FF is data inside arguments
    b += bytes([DEFTILE, 0xFF]) + bytes([0xFF] * 32)               # so is a tile of $FF
    b += bytes([SETBG, 3, 1, 0xFF, 0, RESYNC, SETBG, 5, 1, 0xFF, 2 | HF])
    b += bytes([SETSPR, 0xFF, 40, 40, 1, VIS | 0x70])              # id 31, reserved bits ignored
    b += bytes([0x55, 0xAA]) + text(1, 14, 0, "still in sync")
    v["11_clamp"] = b

    b = text(1, 1, 0, "sound does not draw")
    b += bytes([SOUND, 0xB8, 0x01, 10]) + solid(1, 8) + bytes([SOUND, 0x00, 0x00, 0x00])
    b += bytes([SETBG, 1, 4, 1, 0, SOUND, 0x08, 0x08, 0x08, SETBG, 3, 4, 1, 0])   # the arguments are not opcodes
    v["12_sound"] = b

    return v


def main() -> None:
    for name, data in vectors().items():
        (HERE / f"{name}.bin").write_bytes(data)
        print(f"{name}.bin  {len(data)} bytes")


if __name__ == "__main__":
    main()
