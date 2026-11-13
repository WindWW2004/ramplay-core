/*
 * The W65C02S. An original implementation: every opcode of the WDC part
 * (including RMB/SMB/BBR/BBS, WAI and STP), binary and decimal arithmetic,
 * and cycle counts.
 *
 * v2's CPU had one register and three-byte instructions. This one is the real
 * chip: A, X, Y, a stack pointer, and instructions of one to three bytes. What
 * stays the same: PC is 16 bits, operands are little endian, and reset reads
 * the vector at $FFFC/$FFFD.
 *
 * SPDX-License-Identifier: MIT
 */

export interface CpuBus {
  read(addr: number): number;
  write(addr: number, value: number): void;
}

export interface Cpu {
  a: number; x: number; y: number;
  s: number;            // stack pointer; the stack is $0100 + s
  pc: number;
  p: number;            // flags NV-BDIZC
  cycles: number;       // total since power on
  irq: boolean;         // the IRQB line, held by the device (level)
  nmi: boolean;         // an NMIB edge waiting to be taken
  waiting: boolean;     // WAI: stopped until an interrupt
  stopped: boolean;     // STP: stopped until reset
}

export const C = 0x01, Z = 0x02, I = 0x04, D = 0x08, B = 0x10, U = 0x20, V = 0x40, N = 0x80;
export const VEC_NMI = 0xFFFA, VEC_RESET = 0xFFFC, VEC_IRQ = 0xFFFE;

type Mode = 'imp' | 'acc' | 'imm' | 'zp' | 'zpx' | 'zpy' | 'abs' | 'abx' | 'aby'
  | 'ind' | 'iax' | 'izx' | 'izy' | 'izp' | 'rel' | 'zpr';

interface Op { mn: string; mode: Mode; cycles: number; bit: number; }

/*
 * The opcode matrix, columns 0 1 2 4 5 6 8 9 A C D E of each row. Columns 3
 * and B are one-byte NOPs (except WAI $CB and STP $DB); column 7 is RMB/SMB
 * and column F is BBR/BBS.
 */
const MATRIX = `
BRK.imp.7 ORA.izx.6 NOP.imm.2 TSB.zp.5  ORA.zp.3  ASL.zp.5  PHP.imp.3 ORA.imm.2 ASL.acc.2 TSB.abs.6 ORA.abs.4 ASL.abs.6
BPL.rel.2 ORA.izy.5 ORA.izp.5 TRB.zp.5  ORA.zpx.4 ASL.zpx.6 CLC.imp.2 ORA.aby.4 INC.acc.2 TRB.abs.6 ORA.abx.4 ASL.abx.6
JSR.abs.6 AND.izx.6 NOP.imm.2 BIT.zp.3  AND.zp.3  ROL.zp.5  PLP.imp.4 AND.imm.2 ROL.acc.2 BIT.abs.4 AND.abs.4 ROL.abs.6
BMI.rel.2 AND.izy.5 AND.izp.5 BIT.zpx.4 AND.zpx.4 ROL.zpx.6 SEC.imp.2 AND.aby.4 DEC.acc.2 BIT.abx.4 AND.abx.4 ROL.abx.6
RTI.imp.6 EOR.izx.6 NOP.imm.2 NOP.zp.3  EOR.zp.3  LSR.zp.5  PHA.imp.3 EOR.imm.2 LSR.acc.2 JMP.abs.3 EOR.abs.4 LSR.abs.6
BVC.rel.2 EOR.izy.5 EOR.izp.5 NOP.zpx.4 EOR.zpx.4 LSR.zpx.6 CLI.imp.2 EOR.aby.4 PHY.imp.3 NOP.abs.8 EOR.abx.4 LSR.abx.6
RTS.imp.6 ADC.izx.6 NOP.imm.2 STZ.zp.3  ADC.zp.3  ROR.zp.5  PLA.imp.4 ADC.imm.2 ROR.acc.2 JMP.ind.6 ADC.abs.4 ROR.abs.6
BVS.rel.2 ADC.izy.5 ADC.izp.5 STZ.zpx.4 ADC.zpx.4 ROR.zpx.6 SEI.imp.2 ADC.aby.4 PLY.imp.4 JMP.iax.6 ADC.abx.4 ROR.abx.6
BRA.rel.2 STA.izx.6 NOP.imm.2 STY.zp.3  STA.zp.3  STX.zp.3  DEY.imp.2 BIT.imm.2 TXA.imp.2 STY.abs.4 STA.abs.4 STX.abs.4
BCC.rel.2 STA.izy.6 STA.izp.5 STY.zpx.4 STA.zpx.4 STX.zpy.4 TYA.imp.2 STA.aby.5 TXS.imp.2 STZ.abs.4 STA.abx.5 STZ.abx.5
LDY.imm.2 LDA.izx.6 LDX.imm.2 LDY.zp.3  LDA.zp.3  LDX.zp.3  TAY.imp.2 LDA.imm.2 TAX.imp.2 LDY.abs.4 LDA.abs.4 LDX.abs.4
BCS.rel.2 LDA.izy.5 LDA.izp.5 LDY.zpx.4 LDA.zpx.4 LDX.zpy.4 CLV.imp.2 LDA.aby.4 TSX.imp.2 LDY.abx.4 LDA.abx.4 LDX.aby.4
CPY.imm.2 CMP.izx.6 NOP.imm.2 CPY.zp.3  CMP.zp.3  DEC.zp.5  INY.imp.2 CMP.imm.2 DEX.imp.2 CPY.abs.4 CMP.abs.4 DEC.abs.6
BNE.rel.2 CMP.izy.5 CMP.izp.5 NOP.zpx.4 CMP.zpx.4 DEC.zpx.6 CLD.imp.2 CMP.aby.4 PHX.imp.3 NOP.abs.4 CMP.abx.4 DEC.abx.7
CPX.imm.2 SBC.izx.6 NOP.imm.2 CPX.zp.3  SBC.zp.3  INC.zp.5  INX.imp.2 SBC.imm.2 NOP.imp.2 CPX.abs.4 SBC.abs.4 INC.abs.6
BEQ.rel.2 SBC.izy.5 SBC.izp.5 NOP.zpx.4 SBC.zpx.4 INC.zpx.6 SED.imp.2 SBC.aby.4 PLX.imp.4 NOP.abs.4 SBC.abx.4 INC.abx.7
`;
const COLUMNS = [0, 1, 2, 4, 5, 6, 8, 9, 0xA, 0xC, 0xD, 0xE];

export const OPS: Op[] = (() => {
  const ops: Op[] = new Array(256);
  MATRIX.trim().split('\n').forEach((line, row) => {
    line.trim().split(/\s+/).forEach((tok, k) => {
      const [mn, mode, cyc] = tok.split('.');
      ops[row * 16 + COLUMNS[k]] = { mn, mode: mode as Mode, cycles: Number(cyc), bit: 0 };
    });
    ops[row * 16 + 0x3] = { mn: 'NOP', mode: 'imp', cycles: 1, bit: 0 };
    ops[row * 16 + 0xB] = { mn: 'NOP', mode: 'imp', cycles: 1, bit: 0 };
    ops[row * 16 + 0x7] = { mn: row < 8 ? 'RMB' : 'SMB', mode: 'zp', cycles: 5, bit: row & 7 };
    ops[row * 16 + 0xF] = { mn: row < 8 ? 'BBR' : 'BBS', mode: 'zpr', cycles: 5, bit: row & 7 };
  });
  ops[0xCB] = { mn: 'WAI', mode: 'imp', cycles: 3, bit: 0 };
  ops[0xDB] = { mn: 'STP', mode: 'imp', cycles: 3, bit: 0 };
  return ops;
})();

/* Instructions that take one more cycle when an indexed address crosses a page. */
const CROSS = new Set(['ORA', 'AND', 'EOR', 'ADC', 'SBC', 'CMP', 'LDA', 'LDX', 'LDY', 'BIT', 'ASL', 'LSR', 'ROL', 'ROR']);

const OPERAND_BYTES: Record<Mode, number> = {
  imp: 0, acc: 0, imm: 1, zp: 1, zpx: 1, zpy: 1, abs: 2, abx: 2, aby: 2,
  ind: 2, iax: 2, izx: 1, izy: 1, izp: 1, rel: 1, zpr: 2,
};

export function createCpu(): Cpu {
  return { a: 0, x: 0, y: 0, s: 0xFD, pc: 0, p: U | I, cycles: 0, irq: false, nmi: false, waiting: false, stopped: false };
}

const read16 = (bus: CpuBus, addr: number): number => bus.read(addr) | (bus.read((addr + 1) & 0xFFFF) << 8);

/** RESB: two reads at $FFFC/$FFFD, little endian. A, X and Y keep what they held. */
export function resetCpu(c: Cpu, bus: CpuBus): void {
  c.s = 0xFD;
  c.p = (c.p | U | I) & ~D;
  c.pc = read16(bus, VEC_RESET);
  c.waiting = false; c.stopped = false; c.nmi = false;
  c.cycles += 7;
}

function push(c: Cpu, bus: CpuBus, v: number): void {
  bus.write(0x0100 | c.s, v & 0xFF);
  c.s = (c.s - 1) & 0xFF;
}
function pull(c: Cpu, bus: CpuBus): number {
  c.s = (c.s + 1) & 0xFF;
  return bus.read(0x0100 | c.s);
}

function setNZ(c: Cpu, v: number): void {
  c.p = (c.p & ~(N | Z)) | (v & 0x80) | ((v & 0xFF) === 0 ? Z : 0);
}
function setC(c: Cpu, on: boolean): void {
  c.p = on ? c.p | C : c.p & ~C;
}

function interrupt(c: Cpu, bus: CpuBus, vector: number, brk: boolean): void {
  push(c, bus, c.pc >> 8);
  push(c, bus, c.pc);
  push(c, bus, (c.p | U) & ~B | (brk ? B : 0));
  c.p = (c.p | I) & ~D;         // the 65C02 clears D on every interrupt
  c.pc = read16(bus, vector);
  c.cycles += 7;
}

function adc(c: Cpu, v: number): void {
  const a = c.a, cin = c.p & C;
  if (c.p & D) {
    let lo = (a & 0x0F) + (v & 0x0F) + cin;
    if (lo > 9) lo = ((lo + 6) & 0x0F) + 0x10;
    let r = (a & 0xF0) + (v & 0xF0) + lo;
    c.p = (c.p & ~V) | (~(a ^ v) & (a ^ r) & 0x80 ? V : 0);
    if (r >= 0xA0) r += 0x60;
    setC(c, r > 0xFF);
    c.a = r & 0xFF;
    c.cycles += 1;
  } else {
    const r = a + v + cin;
    c.p = (c.p & ~V) | (~(a ^ v) & (a ^ r) & 0x80 ? V : 0);
    setC(c, r > 0xFF);
    c.a = r & 0xFF;
  }
  setNZ(c, c.a);
}

function sbc(c: Cpu, v: number): void {
  const a = c.a, borrow = c.p & C ? 0 : 1;
  const bin = a - v - borrow;
  c.p = (c.p & ~V) | ((a ^ v) & (a ^ bin) & 0x80 ? V : 0);
  setC(c, bin >= 0);
  if (c.p & D) {
    let r = bin;
    if (r < 0) r -= 0x60;
    if ((a & 0x0F) - (v & 0x0F) - borrow < 0) r -= 0x06;
    c.a = r & 0xFF;
    c.cycles += 1;
  } else {
    c.a = bin & 0xFF;
  }
  setNZ(c, c.a);
}

function compare(c: Cpu, reg: number, v: number): void {
  const r = reg - v;
  setC(c, r >= 0);
  setNZ(c, r & 0xFF);
}

function branch(c: Cpu, take: boolean, offset: number): void {
  if (!take) return;
  const target = (c.pc + (offset < 0x80 ? offset : offset - 0x100)) & 0xFFFF;
  c.cycles += (target ^ c.pc) & 0xFF00 ? 2 : 1;
  c.pc = target;
}

/** One instruction (or one interrupt entry). Returns the cycles it took. */
export function step(c: Cpu, bus: CpuBus): number {
  const start = c.cycles;
  if (c.stopped) { c.cycles += 1; return 1; }
  if (c.nmi) {
    c.nmi = false; c.waiting = false;
    interrupt(c, bus, VEC_NMI, false);
    return c.cycles - start;
  }
  if (c.irq) {
    c.waiting = false;              // WAI ends even with I set; then the next instruction runs
    if (!(c.p & I)) { interrupt(c, bus, VEC_IRQ, false); return c.cycles - start; }
  }
  if (c.waiting) { c.cycles += 1; return 1; }

  const opcode = bus.read(c.pc);
  const op = OPS[opcode];
  c.pc = (c.pc + 1) & 0xFFFF;
  c.cycles += op.cycles;

  // The operand: addr is where it is in memory (-1 for none).
  let addr = -1, rel = 0;
  const next = (): number => { const v = bus.read(c.pc); c.pc = (c.pc + 1) & 0xFFFF; return v; };
  const next16 = (): number => { const lo = next(); return lo | (next() << 8); };
  const indexed = (base: number, idx: number): number => {
    const a = (base + idx) & 0xFFFF;
    if ((a ^ base) & 0xFF00 && CROSS.has(op.mn)) c.cycles += 1;
    return a;
  };
  switch (op.mode) {
    case 'imm': addr = c.pc; c.pc = (c.pc + 1) & 0xFFFF; break;
    case 'zp': addr = next(); break;
    case 'zpx': addr = (next() + c.x) & 0xFF; break;
    case 'zpy': addr = (next() + c.y) & 0xFF; break;
    case 'abs': addr = next16(); break;
    case 'abx': addr = indexed(next16(), c.x); break;
    case 'aby': addr = indexed(next16(), c.y); break;
    case 'ind': addr = read16(bus, next16()); break;
    case 'iax': addr = read16(bus, (next16() + c.x) & 0xFFFF); break;
    case 'izx': { const z = (next() + c.x) & 0xFF; addr = bus.read(z) | (bus.read((z + 1) & 0xFF) << 8); break; }
    case 'izy': { const z = next(); addr = indexed(bus.read(z) | (bus.read((z + 1) & 0xFF) << 8), c.y); break; }
    case 'izp': { const z = next(); addr = bus.read(z) | (bus.read((z + 1) & 0xFF) << 8); break; }
    case 'rel': rel = next(); break;
    case 'zpr': addr = next(); rel = next(); break;
    default: break;
  }
  const acc = op.mode === 'acc';
  const load = (): number => acc ? c.a : bus.read(addr);
  const store = (v: number): void => { if (acc) c.a = v & 0xFF; else bus.write(addr, v & 0xFF); };

  let v: number;
  switch (op.mn) {
    case 'LDA': c.a = bus.read(addr); setNZ(c, c.a); break;
    case 'LDX': c.x = bus.read(addr); setNZ(c, c.x); break;
    case 'LDY': c.y = bus.read(addr); setNZ(c, c.y); break;
    case 'STA': bus.write(addr, c.a); break;
    case 'STX': bus.write(addr, c.x); break;
    case 'STY': bus.write(addr, c.y); break;
    case 'STZ': bus.write(addr, 0); break;

    case 'ADC': adc(c, bus.read(addr)); break;
    case 'SBC': sbc(c, bus.read(addr)); break;
    case 'AND': c.a &= bus.read(addr); setNZ(c, c.a); break;
    case 'ORA': c.a |= bus.read(addr); setNZ(c, c.a); break;
    case 'EOR': c.a ^= bus.read(addr); setNZ(c, c.a); break;
    case 'CMP': compare(c, c.a, bus.read(addr)); break;
    case 'CPX': compare(c, c.x, bus.read(addr)); break;
    case 'CPY': compare(c, c.y, bus.read(addr)); break;
    case 'BIT':
      v = bus.read(addr);
      c.p = (c.p & ~Z) | (c.a & v ? 0 : Z);
      if (op.mode !== 'imm') c.p = (c.p & ~(N | V)) | (v & (N | V));   // BIT # sets Z only
      break;
    case 'TSB': v = bus.read(addr); c.p = (c.p & ~Z) | (c.a & v ? 0 : Z); bus.write(addr, v | c.a); break;
    case 'TRB': v = bus.read(addr); c.p = (c.p & ~Z) | (c.a & v ? 0 : Z); bus.write(addr, v & ~c.a & 0xFF); break;

    case 'ASL': v = load(); setC(c, (v & 0x80) !== 0); v = (v << 1) & 0xFF; store(v); setNZ(c, v); break;
    case 'LSR': v = load(); setC(c, (v & 1) !== 0); v >>= 1; store(v); setNZ(c, v); break;
    case 'ROL': { v = load(); const cin = c.p & C; setC(c, (v & 0x80) !== 0); v = ((v << 1) | cin) & 0xFF; store(v); setNZ(c, v); break; }
    case 'ROR': { v = load(); const cin = c.p & C; setC(c, (v & 1) !== 0); v = (v >> 1) | (cin << 7); store(v); setNZ(c, v); break; }
    case 'INC': v = (load() + 1) & 0xFF; store(v); setNZ(c, v); break;
    case 'DEC': v = (load() - 1) & 0xFF; store(v); setNZ(c, v); break;
    case 'INX': c.x = (c.x + 1) & 0xFF; setNZ(c, c.x); break;
    case 'INY': c.y = (c.y + 1) & 0xFF; setNZ(c, c.y); break;
    case 'DEX': c.x = (c.x - 1) & 0xFF; setNZ(c, c.x); break;
    case 'DEY': c.y = (c.y - 1) & 0xFF; setNZ(c, c.y); break;

    case 'TAX': c.x = c.a; setNZ(c, c.x); break;
    case 'TAY': c.y = c.a; setNZ(c, c.y); break;
    case 'TXA': c.a = c.x; setNZ(c, c.a); break;
    case 'TYA': c.a = c.y; setNZ(c, c.a); break;
    case 'TSX': c.x = c.s; setNZ(c, c.x); break;
    case 'TXS': c.s = c.x; break;

    case 'PHA': push(c, bus, c.a); break;
    case 'PHX': push(c, bus, c.x); break;
    case 'PHY': push(c, bus, c.y); break;
    case 'PHP': push(c, bus, c.p | B | U); break;
    case 'PLA': c.a = pull(c, bus); setNZ(c, c.a); break;
    case 'PLX': c.x = pull(c, bus); setNZ(c, c.x); break;
    case 'PLY': c.y = pull(c, bus); setNZ(c, c.y); break;
    case 'PLP': c.p = (pull(c, bus) & ~B) | U; break;

    case 'JMP': c.pc = addr; break;
    case 'JSR': {
      const ret = (c.pc - 1) & 0xFFFF;          // the address of the last byte of the JSR
      push(c, bus, ret >> 8); push(c, bus, ret);
      c.pc = addr;
      break;
    }
    case 'RTS': { const lo = pull(c, bus); c.pc = ((lo | (pull(c, bus) << 8)) + 1) & 0xFFFF; break; }
    case 'RTI': { c.p = (pull(c, bus) & ~B) | U; const lo = pull(c, bus); c.pc = lo | (pull(c, bus) << 8); break; }
    case 'BRK':
      c.pc = (c.pc + 1) & 0xFFFF;               // BRK has a padding byte
      c.cycles -= op.cycles;
      interrupt(c, bus, VEC_IRQ, true);
      break;

    case 'BPL': branch(c, !(c.p & N), rel); break;
    case 'BMI': branch(c, (c.p & N) !== 0, rel); break;
    case 'BVC': branch(c, !(c.p & V), rel); break;
    case 'BVS': branch(c, (c.p & V) !== 0, rel); break;
    case 'BCC': branch(c, !(c.p & C), rel); break;
    case 'BCS': branch(c, (c.p & C) !== 0, rel); break;
    case 'BNE': branch(c, !(c.p & Z), rel); break;
    case 'BEQ': branch(c, (c.p & Z) !== 0, rel); break;
    case 'BRA': branch(c, true, rel); break;
    case 'BBR': branch(c, !(bus.read(addr) & (1 << op.bit)), rel); break;
    case 'BBS': branch(c, (bus.read(addr) & (1 << op.bit)) !== 0, rel); break;
    case 'RMB': bus.write(addr, bus.read(addr) & ~(1 << op.bit) & 0xFF); break;
    case 'SMB': bus.write(addr, bus.read(addr) | (1 << op.bit)); break;

    case 'CLC': c.p &= ~C; break;
    case 'SEC': c.p |= C; break;
    case 'CLI': c.p &= ~I; break;
    case 'SEI': c.p |= I; break;
    case 'CLD': c.p &= ~D; break;
    case 'SED': c.p |= D; break;
    case 'CLV': c.p &= ~V; break;

    case 'WAI': c.waiting = true; break;
    case 'STP': c.stopped = true; break;
    default: break;                              // NOP, with or without an operand
  }
  return c.cycles - start;
}

// ------------------------------------------------------------------ text

const h2 = (v: number): string => (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
const h4 = (v: number): string => (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');

/** The instruction at addr as text. `peek` must have no side effects. */
export function disassemble(peek: (addr: number) => number, addr: number): { text: string; length: number; bytes: number[] } {
  const opcode = peek(addr), op = OPS[opcode];
  const length = 1 + OPERAND_BYTES[op.mode];
  const bytes = [opcode];
  for (let k = 1; k < length; k++) bytes.push(peek((addr + k) & 0xFFFF));
  const b1 = bytes[1] ?? 0, w = b1 | ((bytes[2] ?? 0) << 8);
  const relTo = (off: number): string => '$' + h4(addr + length + (off < 0x80 ? off : off - 0x100));
  const mn = op.mn + (['RMB', 'SMB', 'BBR', 'BBS'].includes(op.mn) ? String(op.bit) : '');
  let arg = '';
  switch (op.mode) {
    case 'acc': arg = 'A'; break;
    case 'imm': arg = '#$' + h2(b1); break;
    case 'zp': arg = '$' + h2(b1); break;
    case 'zpx': arg = '$' + h2(b1) + ',X'; break;
    case 'zpy': arg = '$' + h2(b1) + ',Y'; break;
    case 'abs': arg = '$' + h4(w); break;
    case 'abx': arg = '$' + h4(w) + ',X'; break;
    case 'aby': arg = '$' + h4(w) + ',Y'; break;
    case 'ind': arg = '($' + h4(w) + ')'; break;
    case 'iax': arg = '($' + h4(w) + ',X)'; break;
    case 'izx': arg = '($' + h2(b1) + ',X)'; break;
    case 'izy': arg = '($' + h2(b1) + '),Y'; break;
    case 'izp': arg = '($' + h2(b1) + ')'; break;
    case 'rel': arg = relTo(b1); break;
    case 'zpr': arg = '$' + h2(b1) + ',' + relTo(bytes[2]); break;
    default: break;
  }
  return { text: arg ? `${mn} ${arg}` : mn, length, bytes };
}

/** The flags as text, NV-BDIZC, a dot for a clear flag. */
export const flagsText = (p: number): string =>
  'NV-BDIZC'.split('').map((ch, k) => (ch === '-' ? '-' : p & (0x80 >> k) ? ch : '.')).join('');
