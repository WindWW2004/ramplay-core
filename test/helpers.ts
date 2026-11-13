// Shared by the tests: a PNG reader, a bare CPU on RAM, a cartridge builder.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createCpu, step, type Cpu, type CpuBus } from '../src/engine/cpu.ts';
import { createMachine, insertCart, makeCart, powerOn, ROM_SIZE, type Machine } from '../src/engine/machine.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 8-bit RGB or RGBA PNG, not interlaced -> { width, height, rgb }. */
export function readPng(path: string): { width: number; height: number; rgb: Uint8Array } {
  const data = readFileSync(path);
  let pos = 8, width = 0, height = 0, ctype = 2;
  const idat: Buffer[] = [];
  while (pos < data.length) {
    const length = data.readUInt32BE(pos), kind = data.toString('latin1', pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); ctype = body[9];
      if (body[8] !== 8 || (ctype !== 2 && ctype !== 6) || body[12]) throw new Error(`${path}: only 8-bit RGB or RGBA, not interlaced`);
    } else if (kind === 'IDAT') idat.push(body);
  }
  const bpp = ctype === 2 ? 3 : 4, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const rgb = new Uint8Array(width * height * 3);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      if (f === 1) line[i] += a;
      else if (f === 2) line[i] += b;
      else if (f === 3) line[i] += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
    }
    for (let x = 0; x < width; x++) rgb.set(line.subarray(x * bpp, x * bpp + 3), (y * width + x) * 3);
    prev = line;
  }
  return { width, height, rgb };
}

/** A CPU on 64 KB of RAM, the program at $0200, PC there. */
export function bare(program: number[]): { cpu: Cpu; mem: Uint8Array; bus: CpuBus; run: (instructions?: number) => void } {
  const mem = new Uint8Array(0x10000);
  mem.set(program, 0x0200);
  const bus: CpuBus = { read: (a) => mem[a & 0xFFFF], write: (a, v) => { mem[a & 0xFFFF] = v & 0xFF; } };
  const cpu = createCpu();
  cpu.pc = 0x0200; cpu.s = 0xFF;
  return { cpu, mem, bus, run: (n = 1) => { for (let i = 0; i < n; i++) step(cpu, bus); } };
}

/** A cartridge image with `code` at $8000 and all three vectors there. */
export function romOf(code: number[]): Uint8Array {
  const rom = new Uint8Array(ROM_SIZE).fill(0xFF);
  rom.set(code, 0);
  rom.set([0x52, 0x50, 0x4C, 0x31, 1], 0x7F40);
  rom.fill(0x20, 0x7F45, 0x7F55);
  rom.fill(0x00, 0x7F00, 0x7F40);
  rom.set([0x00, 0x80, 0x00, 0x80, 0x00, 0x80], 0x7FFA);
  return rom;
}

/** A powered machine with a cartridge in the slot. */
export function boot(rom: Uint8Array): Machine {
  const made = makeCart(rom, 'test');
  if (!made.ok) throw new Error(made.error);
  const m = createMachine();
  insertCart(m, made.cart);
  powerOn(m);
  return m;
}

/** A built example, or null if `make examples` has not run. */
export function example(name: string): Uint8Array | null {
  const p = join(ROOT, 'examples', name, name + '.rpl');
  return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
}

/** Row `row` of the text layer as a string. */
export const textRow = (m: Machine, row: number): string =>
  String.fromCharCode(...m.picture.textCh.subarray(row * 20, row * 20 + 20));
