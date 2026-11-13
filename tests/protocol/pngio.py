"""A small PNG reader and writer, standard library only.

Reads 8-bit RGB and RGBA, not interlaced, which is all the vectors use.
Writes 8-bit RGB.
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

SIG = b"\x89PNG\r\n\x1a\n"


def write_png(path: Path, width: int, height: int, rgb: bytes) -> None:
    """rgb is width * height * 3 bytes, top row first."""
    assert len(rgb) == width * height * 3

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    raw = b"".join(b"\x00" + rgb[y * width * 3:(y + 1) * width * 3] for y in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(SIG + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def read_png(path: Path) -> tuple[int, int, bytes]:
    """Returns (width, height, rgb)."""
    data = path.read_bytes()
    if data[:8] != SIG:
        raise ValueError(f"{path}: not a PNG")
    pos, idat, header = 8, b"", None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
    if header is None:
        raise ValueError(f"{path}: no IHDR")
    width, height, depth, ctype, _, _, interlace = header
    if depth != 8 or ctype not in (2, 6) or interlace:
        raise ValueError(f"{path}: only 8-bit RGB or RGBA, not interlaced")
    bpp = 3 if ctype == 2 else 4
    stride = width * bpp
    raw = zlib.decompress(idat)
    out = bytearray()
    prev = bytearray(stride)
    for y in range(height):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if f == 1:
                line[i] = (line[i] + a) & 0xFF
            elif f == 2:
                line[i] = (line[i] + b) & 0xFF
            elif f == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 0xFF
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 0xFF
        prev = line
        if bpp == 3:
            out += line
        else:
            for x in range(width):
                out += line[x * 4:x * 4 + 3]
    return width, height, bytes(out)
