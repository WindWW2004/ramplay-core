/*
 * The cartridge: one 32 KB ROM chip (AT28C256) on the bus at $8000-$FFFF.
 * RAMPLAY_SPEC.md section 8.
 *
 * As in v2, the CPU does not look at a header: it reads the reset vector at
 * $FFFC/$FFFD and runs. The fields at $FF00-$FF54 are for tools, for
 * RamPlayer's cartridge panel, and later for Root.
 *
 * SPDX-License-Identifier: MIT
 */
export const ROM_SIZE = 32768;
export const ROM_BASE = 0x8000;

export interface Cart {
  name: string;           // the file name, for the UI
  rom: Uint8Array;
  magicOk: boolean;       // "RPL1" at $FF40
  version: number;        // $FF44
  title: string;          // $FF45-$FF54, trimmed
  signed: boolean;        // any non-zero byte at $FF00-$FF3F
  vectors: { nmi: number; reset: number; irq: number };
}

export type CartResult = { ok: true; cart: Cart } | { ok: false; error: string };

export function makeCart(bytes: Uint8Array | ArrayLike<number>, name = 'cart'): CartResult {
  const rom = bytes instanceof Uint8Array ? bytes.slice() : Uint8Array.from(bytes);
  if (rom.length !== ROM_SIZE) return { ok: false, error: `a .rpl image is ${ROM_SIZE} bytes; this file is ${rom.length}` };
  const at = (addr: number): number => rom[addr - ROM_BASE];
  const word = (addr: number): number => at(addr) | (at(addr + 1) << 8);
  let title = '';
  for (let a = 0xFF45; a <= 0xFF54; a++) title += at(a) >= 0x20 && at(a) <= 0x7E ? String.fromCharCode(at(a)) : '?';
  let signed = false;
  for (let a = 0xFF00; a <= 0xFF3F; a++) if (at(a)) signed = true;
  return {
    ok: true,
    cart: {
      name, rom,
      magicOk: at(0xFF40) === 0x52 && at(0xFF41) === 0x50 && at(0xFF42) === 0x4C && at(0xFF43) === 0x31,
      version: at(0xFF44),
      title: title.trimEnd(),
      signed,
      vectors: { nmi: word(0xFFFA), reset: word(0xFFFC), irq: word(0xFFFE) },
    },
  };
}
