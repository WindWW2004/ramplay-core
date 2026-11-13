#!/usr/bin/env python3
"""Conformance: the host build of firmware/common against the expected frames.

    python3 tests/protocol/run.py [--render build/rplrender] [--bless]

For every NN_name.bin here, runs `rplrender` and compares its frame with
NN_name.png, pixel for pixel. --bless writes the PNGs instead (look at them
before committing). The emulator checks the same vectors in
core/test/conformance.test.ts.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from pngio import read_png, write_png

HERE = Path(__file__).resolve().parent
W, H = 160, 128


def read_ppm(path: Path) -> bytes:
    data = path.read_bytes()
    head = f"P6\n{W} {H}\n255\n".encode()
    if not data.startswith(head) or len(data) != len(head) + W * H * 3:
        raise ValueError(f"{path}: not a {W}x{H} P6 file")
    return data[len(head):]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--render", default=str(HERE.parent.parent / "build" / "rplrender"))
    ap.add_argument("--bless", action="store_true")
    args = ap.parse_args()

    bins = sorted(HERE.glob("*.bin"))
    if len(bins) < 10:
        print(f"only {len(bins)} vectors; the spec asks for at least 10")
        return 1
    bad = 0
    with tempfile.TemporaryDirectory() as tmp:
        for b in bins:
            ppm = Path(tmp) / (b.stem + ".ppm")
            subprocess.run([args.render, str(b), str(ppm)], check=True)
            got = read_ppm(ppm)
            png = b.with_suffix(".png")
            if args.bless:
                write_png(png, W, H, got)
                print(f"blessed {png.name}")
                continue
            if not png.exists():
                print(f"FAIL {b.stem}: no expected PNG")
                bad += 1
                continue
            w, h, want = read_png(png)
            if (w, h) != (W, H):
                print(f"FAIL {b.stem}: expected PNG is {w}x{h}")
                bad += 1
            elif want != got:
                diff = [i // 3 for i in range(0, len(got), 3) if got[i:i + 3] != want[i:i + 3]]
                x, y = diff[0] % W, diff[0] // W
                print(f"FAIL {b.stem}: {len(diff)} pixels differ, first at ({x},{y})")
                bad += 1
            else:
                print(f"ok   {b.stem}")
    if not args.bless:
        print(f"protocol: {len(bins) - bad}/{len(bins)} vectors match")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
