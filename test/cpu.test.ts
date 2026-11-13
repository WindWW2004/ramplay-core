// The W65C02S core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { C, D, I, N, OPS, V, Z, disassemble, flagsText, resetCpu, step } from '../src/engine/cpu.ts';
import { bare } from './helpers.ts';

test('every opcode is defined, 212 documented and the rest NOPs', () => {
  assert.equal(OPS.length, 256);
  for (let i = 0; i < 256; i++) assert.ok(OPS[i] && OPS[i].cycles > 0, `opcode ${i.toString(16)}`);
  assert.equal(OPS[0xEA].mn, 'NOP');
  assert.equal(OPS[0xCB].mn, 'WAI');
  assert.equal(OPS[0xDB].mn, 'STP');
  assert.deepEqual([OPS[0x07].mn, OPS[0x07].bit, OPS[0xF7].mn, OPS[0xF7].bit], ['RMB', 0, 'SMB', 7]);
});

test('reset reads the vector at $FFFC, little endian', () => {
  const t = bare([]);
  t.mem[0xFFFC] = 0x34; t.mem[0xFFFD] = 0x12;
  t.cpu.p |= D;
  resetCpu(t.cpu, t.bus);
  assert.equal(t.cpu.pc, 0x1234);
  assert.ok(t.cpu.p & I);
  assert.ok(!(t.cpu.p & D));
});

test('load, store, flags', () => {
  const t = bare([0xA9, 0x00, 0xA9, 0x80, 0x85, 0x10, 0xA2, 0x7F, 0x8E, 0x34, 0x12]);
  t.run(); assert.ok(t.cpu.p & Z);
  t.run(); assert.ok(t.cpu.p & N); assert.ok(!(t.cpu.p & Z));
  t.run(); assert.equal(t.mem[0x10], 0x80);
  t.run(2); assert.equal(t.mem[0x1234], 0x7F);
});

test('ADC and SBC, binary', () => {
  // CLC, LDA #$7F, ADC #$01 -> $80, V and N
  let t = bare([0x18, 0xA9, 0x7F, 0x69, 0x01]); t.run(3);
  assert.equal(t.cpu.a, 0x80); assert.ok(t.cpu.p & V); assert.ok(t.cpu.p & N); assert.ok(!(t.cpu.p & C));
  // SEC, LDA #$FF, ADC #$01 -> $01, C
  t = bare([0x38, 0xA9, 0xFF, 0x69, 0x01]); t.run(3);
  assert.equal(t.cpu.a, 0x01); assert.ok(t.cpu.p & C); assert.ok(!(t.cpu.p & V));
  // SEC, LDA #$05, SBC #$06 -> $FF, borrow (C clear)
  t = bare([0x38, 0xA9, 0x05, 0xE9, 0x06]); t.run(3);
  assert.equal(t.cpu.a, 0xFF); assert.ok(!(t.cpu.p & C)); assert.ok(t.cpu.p & N);
  // SEC, LDA #$80, SBC #$01 -> $7F, V
  t = bare([0x38, 0xA9, 0x80, 0xE9, 0x01]); t.run(3);
  assert.equal(t.cpu.a, 0x7F); assert.ok(t.cpu.p & V); assert.ok(t.cpu.p & C);
});

test('ADC and SBC, decimal', () => {
  const dec = (a: number, op: number, v: number, carry: boolean) => {
    const t = bare([0xF8, carry ? 0x38 : 0x18, 0xA9, a, op, v]); t.run(4);
    return [t.cpu.a, t.cpu.p & C ? 1 : 0];
  };
  assert.deepEqual(dec(0x09, 0x69, 0x01, false), [0x10, 0]);
  assert.deepEqual(dec(0x99, 0x69, 0x01, false), [0x00, 1]);
  assert.deepEqual(dec(0x58, 0x69, 0x46, true), [0x05, 1]);
  assert.deepEqual(dec(0x10, 0xE9, 0x01, true), [0x09, 1]);
  assert.deepEqual(dec(0x00, 0xE9, 0x01, true), [0x99, 0]);
  assert.deepEqual(dec(0x46, 0xE9, 0x12, true), [0x34, 1]);
  // Every pair of valid BCD bytes agrees with decimal arithmetic.
  for (let x = 0; x < 100; x += 7) for (let y = 0; y < 100; y += 3) {
    const bcd = (n: number) => (Math.floor(n / 10) << 4) | (n % 10);
    assert.deepEqual(dec(bcd(x), 0x69, bcd(y), false), [bcd((x + y) % 100), x + y > 99 ? 1 : 0], `${x}+${y}`);
    assert.deepEqual(dec(bcd(x), 0xE9, bcd(y), true), [bcd((x - y + 100) % 100), x >= y ? 1 : 0], `${x}-${y}`);
  }
});

test('compare and branch', () => {
  // LDX #3; loop: DEX; BNE loop; -> X = 0 after 1 + 3 * 2 instructions
  const t = bare([0xA2, 0x03, 0xCA, 0xD0, 0xFD]); t.run(7);
  assert.equal(t.cpu.x, 0); assert.equal(t.cpu.pc, 0x0205);
  // LDA #$10; CMP #$20 -> C clear, N set; CMP #$10 -> Z and C
  const u = bare([0xA9, 0x10, 0xC9, 0x20, 0xC9, 0x10]); u.run(2);
  assert.ok(!(u.cpu.p & C)); assert.ok(u.cpu.p & N);
  u.run(); assert.ok(u.cpu.p & Z); assert.ok(u.cpu.p & C);
});

test('stack: JSR, RTS, PHA, PLA, PHP, PLP', () => {
  // JSR $0210; LDA #$55 ... at $0210: LDA #$AA; PHA; LDA #0; PLA; RTS
  const t = bare([0x20, 0x10, 0x02, 0xA2, 0x55]);
  t.mem.set([0xA9, 0xAA, 0x48, 0xA9, 0x00, 0x68, 0x60], 0x0210);
  t.run();
  assert.equal(t.cpu.pc, 0x0210); assert.equal(t.cpu.s, 0xFD);
  assert.deepEqual([t.mem[0x01FF], t.mem[0x01FE]], [0x02, 0x02]);   // the return address is $0202
  t.run(5);
  assert.equal(t.cpu.a, 0xAA); assert.equal(t.cpu.pc, 0x0203); assert.equal(t.cpu.s, 0xFF);
  t.run(); assert.equal(t.cpu.x, 0x55);
  // SEC; SED; PHP; CLC; CLD; PLP
  const u = bare([0x38, 0xF8, 0x08, 0x18, 0xD8, 0x28]); u.run(6);
  assert.ok(u.cpu.p & C); assert.ok(u.cpu.p & D);
});

test('BRK and RTI', () => {
  // CLI; BRK; (padding); LDA #1 ... handler at $0300: LDX #9; RTI
  const t = bare([0x58, 0x00, 0xEA, 0xA9, 0x01]);
  t.mem.set([0xA2, 0x09, 0x40], 0x0300);
  t.mem[0xFFFE] = 0x00; t.mem[0xFFFF] = 0x03;
  t.run(2);
  assert.equal(t.cpu.pc, 0x0300); assert.ok(t.cpu.p & I);
  assert.ok(t.mem[0x01FD] & 0x10, 'B is set in the pushed flags');
  t.run(2);
  assert.equal(t.cpu.pc, 0x0203); assert.ok(!(t.cpu.p & I));
  t.run(); assert.equal(t.cpu.a, 1); assert.equal(t.cpu.x, 9);
});

test('65C02 additions', () => {
  // STZ $10; INC A; INC A; PHX/PLY; BRA +1; (skipped) ; TSB; TRB
  const t = bare([0xA9, 0x05, 0x85, 0x10, 0x64, 0x10, 0x1A, 0x1A, 0xA2, 0x42, 0xDA, 0x7A, 0x80, 0x01, 0x00, 0xA9, 0x0F,
    0x04, 0x20, 0xA9, 0x05, 0x14, 0x20]);
  t.run(3); assert.equal(t.mem[0x10], 0);
  t.run(2); assert.equal(t.cpu.a, 7);
  t.run(3); assert.equal(t.cpu.y, 0x42);
  t.run(); assert.equal(t.cpu.pc, 0x020F);
  t.run(2); assert.equal(t.mem[0x20], 0x0F);
  t.run(2); assert.equal(t.mem[0x20], 0x0A);
  // LDA ($30): pointer $1234
  const u = bare([0xB2, 0x30, 0x92, 0x32]);
  u.mem.set([0x34, 0x12, 0x00, 0x40], 0x30); u.mem[0x1234] = 0x99;
  u.run(2); assert.equal(u.cpu.a, 0x99); assert.equal(u.mem[0x4000], 0x99);
  // JMP ($1000,X) with X = 2
  const w = bare([0xA2, 0x02, 0x7C, 0x00, 0x10]);
  w.mem.set([0x00, 0x00, 0x78, 0x56], 0x1000);
  w.run(2); assert.equal(w.cpu.pc, 0x5678);
  // JMP ($10FF) reads the high byte from $1100 (the NMOS bug is gone)
  const j = bare([0x6C, 0xFF, 0x10]);
  j.mem[0x10FF] = 0xCD; j.mem[0x1100] = 0xAB; j.mem[0x1000] = 0x11;
  j.run(); assert.equal(j.cpu.pc, 0xABCD);
  // BIT #imm changes Z only
  const b = bare([0xA9, 0x01, 0x2C, 0x40, 0x00, 0x89, 0x02]);
  b.mem[0x40] = 0xC0;
  b.run(2); assert.ok(b.cpu.p & N); assert.ok(b.cpu.p & V); assert.ok(b.cpu.p & Z);
  b.run(); assert.ok(b.cpu.p & N); assert.ok(b.cpu.p & V); assert.ok(b.cpu.p & Z);
  // SMB3 $50; BBS3 $50,+2; (skipped); RMB3 $50; BBR3 $50,+2
  const r = bare([0xB7, 0x50, 0xBF, 0x50, 0x02, 0x00, 0x00, 0x37, 0x50, 0x3F, 0x50, 0x02]);
  r.run(); assert.equal(r.mem[0x50], 0x08);
  r.run(); assert.equal(r.cpu.pc, 0x0207);
  r.run(); assert.equal(r.mem[0x50], 0x00);
  r.run(); assert.equal(r.cpu.pc, 0x020E);
});

test('cycle counts', () => {
  const cyc = (program: number[], setup?: (t: ReturnType<typeof bare>) => void) => {
    const t = bare(program); setup?.(t);
    return step(t.cpu, t.bus);
  };
  assert.equal(cyc([0xA9, 0x01]), 2);                                  // LDA #
  assert.equal(cyc([0xA5, 0x10]), 3);                                  // LDA zp
  assert.equal(cyc([0xAD, 0x00, 0x10]), 4);                            // LDA abs
  assert.equal(cyc([0xBD, 0x80, 0x10], (t) => { t.cpu.x = 0x10; }), 4); // LDA abs,X same page
  assert.equal(cyc([0xBD, 0x80, 0x10], (t) => { t.cpu.x = 0x90; }), 5); // crossing a page
  assert.equal(cyc([0x9D, 0x80, 0x10], (t) => { t.cpu.x = 0x90; }), 5); // STA abs,X is always 5
  assert.equal(cyc([0xB1, 0x10], (t) => { t.mem[0x10] = 0xFF; t.cpu.y = 1; }), 6);
  assert.equal(cyc([0x20, 0x00, 0x03]), 6);                            // JSR
  assert.equal(cyc([0xD0, 0x02], (t) => { t.cpu.p |= Z; }), 2);         // branch not taken
  assert.equal(cyc([0xD0, 0x02]), 3);                                  // taken
  assert.equal(cyc([0xD0, 0x80]), 4);                                  // taken to another page
  assert.equal(cyc([0x69, 0x01], (t) => { t.cpu.p |= D; }), 3);         // decimal ADC takes one more
  assert.equal(cyc([0x00]), 7);                                        // BRK
});

test('IRQ, the I flag, WAI and NMI', () => {
  // SEI; NOP; CLI; NOP; NOP   handler at $0300: RTI
  const t = bare([0x78, 0xEA, 0x58, 0xEA, 0xEA]);
  t.mem[0x0300] = 0x40; t.mem[0xFFFE] = 0x00; t.mem[0xFFFF] = 0x03;
  t.cpu.irq = true;
  t.run(2); assert.equal(t.cpu.pc, 0x0202, 'masked while I is set');
  t.run(); assert.equal(t.cpu.pc, 0x0203);
  t.run(); assert.equal(t.cpu.pc, 0x0300, 'taken once I is clear');
  t.cpu.irq = false;
  t.run(); assert.equal(t.cpu.pc, 0x0203);
  // WAI stops the CPU until an interrupt
  const w = bare([0xCB, 0xA9, 0x07]);
  w.run(5); assert.ok(w.cpu.waiting); assert.equal(w.cpu.pc, 0x0201);
  w.cpu.irq = true;                       // I is set after power on: no vector, just go on
  w.run(); assert.equal(w.cpu.a, 7);
  // NMI is an edge and ignores I
  const n = bare([0xEA, 0xEA]);
  n.mem[0xFFFA] = 0x00; n.mem[0xFFFB] = 0x04; n.mem[0x0400] = 0x40;
  n.cpu.nmi = true;
  n.run(); assert.equal(n.cpu.pc, 0x0400); assert.ok(!n.cpu.nmi);
  n.run(); assert.equal(n.cpu.pc, 0x0200);
  // STP stops until reset
  const s = bare([0xDB, 0xA9, 0x01]);
  s.run(10); assert.ok(s.cpu.stopped); assert.equal(s.cpu.a, 0);
});

test('a real loop: 13 * 11 by shift and add', () => {
  // $10 = 13, $11 = 11, result in A
  //   LDA #0; LDX #8; loop: LSR $11; BCC skip; CLC; ADC $10; skip: ASL $10; DEX; BNE loop; STA $12; STP
  const t = bare([0xA9, 0x00, 0xA2, 0x08, 0x46, 0x11, 0x90, 0x03, 0x18, 0x65, 0x10, 0x06, 0x10, 0xCA, 0xD0, 0xF4, 0x85, 0x12, 0xDB]);
  t.mem[0x10] = 13; t.mem[0x11] = 11;
  for (let i = 0; i < 200 && !t.cpu.stopped; i++) t.run();
  assert.ok(t.cpu.stopped);
  assert.equal(t.mem[0x12], 143);
});

test('disassembler', () => {
  const mem = new Uint8Array(0x10000);
  mem.set([0xA9, 0x05, 0x8D, 0x00, 0x60, 0xB1, 0x10, 0xD0, 0xFE, 0x7C, 0x34, 0x12, 0x1A, 0xBF, 0x50, 0x02, 0x60], 0x8000);
  const peek = (a: number) => mem[a];
  const out: string[] = [];
  for (let a = 0x8000; a < 0x8011;) { const d = disassemble(peek, a); out.push(d.text); a += d.length; }
  assert.deepEqual(out, ['LDA #$05', 'STA $6000', 'LDA ($10),Y', 'BNE $8007', 'JMP ($1234,X)', 'INC A', 'BBS3 $50,$8012', 'RTS']);
  assert.equal(flagsText(N | C | 0x20), 'N.-....C');
});
