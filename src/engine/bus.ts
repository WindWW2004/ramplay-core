/*
 * The 16-bit bus. RAMPLAY_SPEC.md section 3. The top address lines pick the
 * chip, as in v2, here with three NAND gates of a 74HC00:
 *
 *   A15 = 1                    $8000-$FFFF  cartridge ROM, 32 KB
 *   A15 = 0, A14 = 1, A13 = 1  $6000-$7FFF  VIA, 16 registers, mirrored every $10
 *   A15 = 0, A14 = 1, A13 = 0  $4000-$5FFF  nothing: open bus
 *   A15 = 0, A14 = 0           $0000-$3FFF  RAM, the lower half of a 62256
 *
 * Open bus (and the ROM region with the slot empty) reads the last byte that
 * was on the data bus, because nothing drives it.
 *
 * SPDX-License-Identifier: MIT
 */
import { ROM_BASE } from './cart.ts';
import type { Machine } from './machine.ts';
import { viaPeek, viaRead, viaWrite } from './via.ts';

export type Chip = 'ram' | 'open' | 'via' | 'rom';

/** Which chip answers an address. */
export function chipAt(m: Machine, addr: number): Chip {
  addr &= 0xFFFF;
  if (addr & 0x8000) return m.cart ? 'rom' : 'open';
  if (!(addr & 0x4000)) return 'ram';
  return addr & 0x2000 ? 'via' : 'open';
}

/** The cell inside the chip: what the chip sees on the address lines it has. */
export function cellOf(m: Machine, addr: number): number | null {
  switch (chipAt(m, addr)) {
    case 'ram': return addr & 0x3FFF;
    case 'via': return addr & 0x000F;
    case 'rom': return addr & 0x7FFF;
    default: return null;
  }
}

export function read(m: Machine, addr: number): number {
  addr &= 0xFFFF;
  switch (chipAt(m, addr)) {
    case 'ram': m.lastBus = m.ram[addr]; break;
    case 'via': m.lastBus = viaRead(m.via, addr & 15); break;
    case 'rom': m.lastBus = m.cart!.rom[addr - ROM_BASE]; break;
    default: break;
  }
  return m.lastBus;
}

export function write(m: Machine, addr: number, value: number): void {
  addr &= 0xFFFF; value &= 0xFF;
  m.lastBus = value;
  switch (chipAt(m, addr)) {
    case 'ram': m.ram[addr] = value; break;
    case 'via': {
      const sent = viaWrite(m.via, addr & 15, value);
      if (sent >= 0) m.send(sent);
      break;
    }
    case 'rom': m.romWrites++; break;      // /WE is tied high: the chip ignores it
    default: break;
  }
}

/** A read with no side effects, for the memory viewer and the disassembler. */
export function peek(m: Machine, addr: number): number {
  addr &= 0xFFFF;
  switch (chipAt(m, addr)) {
    case 'ram': return m.ram[addr];
    case 'via': return viaPeek(m.via, addr & 15);
    case 'rom': return m.cart!.rom[addr - ROM_BASE];
    default: return m.lastBus;
  }
}
