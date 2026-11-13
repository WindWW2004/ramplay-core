#!/usr/bin/env python3
"""Check a .rpl cartridge image and print its header (spec section 8.2).

    python3 tools/rplinfo.py game.rpl

Exit 0 if the image is valid: 32768 bytes, magic "RPL1", version 1, an ASCII
title, reserved bytes $FF, and a reset vector that points into the cartridge.
"""
from __future__ import annotations

import sys
from pathlib import Path

SIZE = 32768
BASE = 0x8000


def check(image: bytes) -> tuple[list[str], dict[str, object]]:
    """Returns (errors, fields)."""
    errors: list[str] = []
    if len(image) != SIZE:
        return [f"size is {len(image)} bytes, not {SIZE}"], {}

    def at(addr: int, n: int = 1) -> bytes:
        return image[addr - BASE:addr - BASE + n]

    def word(addr: int) -> int:
        return at(addr)[0] | at(addr + 1)[0] << 8

    magic, version, title = at(0xFF40, 4), at(0xFF44)[0], at(0xFF45, 16)
    if magic != b"RPL1":
        errors.append(f"magic at $FF40 is {magic!r}, not b'RPL1'")
    if version != 1:
        errors.append(f"version at $FF44 is {version}, not 1")
    if any(c < 0x20 or c > 0x7E for c in title):
        errors.append("title at $FF45 is not ASCII")
    if at(0xFF55, 1)[0] not in (0xFF, 0x01):
        errors.append("label byte $FF55 is not $FF (no label) or $01 (the cartridge draws its label)")
    if any(b != 0xFF for b in at(0xFF56, 0xFFFA - 0xFF56)):
        errors.append("reserved bytes $FF56-$FFF9 are not all $FF")
    vectors = {"nmi": word(0xFFFA), "reset": word(0xFFFC), "irq": word(0xFFFE)}
    if not 0x8000 <= vectors["reset"] <= 0xFEFF:
        errors.append(f"reset vector ${vectors['reset']:04X} is outside $8000-$FEFF")
    used = sum(1 for b in at(0x8000, 0x7F00) if b != 0xFF)
    fields = {
        "title": title.decode("ascii", "replace").rstrip(),
        "version": version,
        "signed": any(at(0xFF00, 64)),
        "used": used,
        **vectors,
    }
    return errors, fields


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    path = Path(sys.argv[1])
    errors, f = check(path.read_bytes())
    if f:
        print(f"{path.name}: \"{f['title']}\" v{f['version']}, "
              f"{'signed' if f['signed'] else 'unsigned'}, about {f['used']} bytes used, "
              f"reset ${f['reset']:04X} nmi ${f['nmi']:04X} irq ${f['irq']:04X}")
    for e in errors:
        print(f"{path.name}: error: {e}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
