// The bus, the VIA, the machine, and the example cartridges on it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BTN, CYCLES_PER_FRAME, cellOf, chipAt, createMachine, makeCart, peek, powerOff, powerOn, read, reset,
  runFrame, runFrames, setButtons, stepInstruction, write,
} from '../src/engine/machine.ts';
import { boot, example, romOf, textRow } from './helpers.ts';

const INIT = [0xA9, 0xFF, 0x8D, 0x02, 0x60, 0xA9, 0x00, 0x8D, 0x03, 0x60, 0xA9, 0xA0, 0x8D, 0x0C, 0x60, 0xA9, 0x7F, 0x8D, 0x0E, 0x60];
const SPIN = (at: number) => [0x4C, at & 0xFF, at >> 8];

test('the decoder: which chip answers', () => {
  const m = boot(romOf(SPIN(0x8000)));
  assert.deepEqual([0x0000, 0x3FFF, 0x4000, 0x5FFF, 0x6000, 0x7FFF, 0x8000, 0xFFFF].map((a) => chipAt(m, a)),
    ['ram', 'ram', 'open', 'open', 'via', 'via', 'rom', 'rom']);
  assert.equal(cellOf(m, 0x7FFD), 0x0D);      // the VIA is mirrored every 16 addresses
  assert.equal(cellOf(m, 0xFFFC), 0x7FFC);
  assert.equal(cellOf(m, 0x4123), null);
  write(m, 0x1234, 0x5A);
  assert.equal(read(m, 0x1234), 0x5A);
  assert.equal(read(m, 0x4000), 0x5A, 'open bus reads the last byte on the bus');
  write(m, 0x8000, 0x00);
  assert.equal(peek(m, 0x8000), 0x4C, 'the ROM ignores writes');
  assert.equal(m.romWrites, 1);
});

test('cartridge header', () => {
  assert.equal(makeCart(new Uint8Array(100)).ok, false);
  const c = makeCart(romOf(SPIN(0x8000)));
  assert.ok(c.ok);
  if (c.ok) {
    assert.ok(c.cart.magicOk); assert.equal(c.cart.version, 1); assert.equal(c.cart.signed, false);
    assert.deepEqual(c.cart.vectors, { nmi: 0x8000, reset: 0x8000, irq: 0x8000 });
  }
});

test('power on runs from the reset vector; a frame is 33333 cycles', () => {
  const m = boot(romOf(SPIN(0x8000)));
  assert.equal(m.cpu.pc, 0x8000);
  runFrames(m, 30);
  assert.equal(m.frame, 30);
  assert.ok(Math.abs(m.cpu.cycles - 30 * CYCLES_PER_FRAME) < 16, `${m.cpu.cycles} cycles in a second`);
});

test('VBLANK sets IFR bit 1 once a frame; reading port A clears it', () => {
  const m = boot(romOf(SPIN(0x8000)));
  assert.equal(peek(m, 0x600D) & 0x02, 0);
  runFrame(m);
  assert.equal(peek(m, 0x600D) & 0x02, 0x02);
  read(m, 0x6001);
  assert.equal(peek(m, 0x600D) & 0x02, 0);
  runFrame(m);
  assert.equal(read(m, 0x7FFD) & 0x02, 0x02, 'through a mirror too');
});

test('buttons are active low on port A, bit 7 reads 1', () => {
  const m = boot(romOf(SPIN(0x8000)));
  assert.equal(read(m, 0x6001), 0xFF);
  setButtons(m, BTN.UP | BTN.START);
  assert.equal(read(m, 0x6001), 0xFF & ~0x41);
  setButtons(m, 0xFF);
  assert.equal(read(m, 0x6001), 0x80);
});

test('a write to ORB reaches the display only after the VIA is set up', () => {
  // LDA #$08 (CLEAR is harmless); STA $6000; then init; LDA #$05; STA $6000 x3 (SCROLL 5,5)
  const code = [0xA9, 0x08, 0x8D, 0x00, 0x60, ...INIT, 0xA9, 0x05, 0x8D, 0x00, 0x60, 0x8D, 0x00, 0x60, 0x8D, 0x00, 0x60];
  const m = boot(romOf([...code, ...SPIN(0x8000 + code.length)]));
  runFrames(m, 2);
  assert.equal(m.via.dropped, 1);
  assert.equal(m.bytesSent, 3);
  assert.deepEqual(m.log.map((e) => e.bytes), [[5, 5, 5]]);
  assert.equal(m.picture.scrollX, 5);
});

test('commands sent during a frame show in the next one', () => {
  const code = [...INIT, 0xA9, 0x05, 0x8D, 0x00, 0x60, 0x8D, 0x00, 0x60, 0x8D, 0x00, 0x60];
  const m = boot(romOf([...code, ...SPIN(0x8000 + code.length)]));
  for (let i = 0; i < 40; i++) stepInstruction(m);
  assert.equal(m.gpu.v.scrollX, 5, 'the Pico has it');
  assert.equal(m.picture.scrollX, 0, 'the picture does not yet');
  runFrame(m);
  assert.equal(m.picture.scrollX, 5);
});

test('reset keeps RAM and clears the display; power off clears RAM', () => {
  const code = [...INIT, 0xA9, 0x05, 0x8D, 0x00, 0x60, 0x8D, 0x00, 0x60, 0x8D, 0x00, 0x60];
  const m = boot(romOf([...code, ...SPIN(0x8000 + code.length)]));
  runFrames(m, 2);
  write(m, 0x0300, 0x77);
  reset(m);
  assert.equal(m.cpu.pc, 0x8000);
  assert.equal(peek(m, 0x0300), 0x77);
  assert.equal(m.gpu.v.scrollX, 0);
  assert.equal(peek(m, 0x600C), 0, 'the VIA is reset too');
  powerOff(m);
  assert.equal(peek(m, 0x0300), 0);
  powerOn(m);
  assert.equal(m.frame, 0);
});

test('an enabled CA1 interrupt pulls IRQ, so VBLANK can be an interrupt', () => {
  // init; LDA #$82; STA $600E (enable CA1); CLI; spin.   IRQ handler at $8100: INC $10; LDA $6001; RTI
  const code = [...INIT, 0xA9, 0x82, 0x8D, 0x0E, 0x60, 0x58];
  const rom = romOf([...code, ...SPIN(0x8000 + code.length)]);
  rom.set([0xE6, 0x10, 0xAD, 0x01, 0x60, 0x40], 0x0100);
  rom.set([0x00, 0x81], 0x7FFE);
  const m = boot(rom);
  runFrames(m, 10);
  assert.equal(peek(m, 0x0010), 9, 'one interrupt per frame after the first');
});

test('the empty slot: nothing drives the bus, nothing is drawn', () => {
  const m = createMachine();
  powerOn(m);
  runFrames(m, 3);
  assert.equal(m.bytesSent, 0);
  assert.equal(chipAt(m, 0xFFFC), 'open');
});

test('hello.rpl prints its line', (t) => {
  const rom = example('hello');
  if (!rom) return t.skip('run `make examples` first');
  const m = boot(rom);
  runFrames(m, 3);
  assert.equal(textRow(m, 7), '    HELLO RAMPLAY   ');
  assert.equal(m.bytesSent, 19);
  assert.equal(m.log[0].bytes[0], 0x08);
  assert.equal(m.log[1].bytes[0], 0x07);
});

test('catch.rpl: title, a game, game over, best score through reset', (t) => {
  const rom = example('catch');
  if (!rom) return t.skip('run `make examples` first');
  const m = boot(rom);
  runFrames(m, 5);
  assert.equal(textRow(m, 0), 'SCORE 00   BEST 00  ');
  assert.match(textRow(m, 9), /PRESS START/);
  setButtons(m, BTN.START); runFrames(m, 3); setButtons(m, 0); runFrames(m, 3);
  assert.equal(textRow(m, 9).trim(), '', 'the title is gone');
  assert.ok(m.picture.spr[3] & 0x80, 'the item is on screen');
  assert.equal(m.picture.spr[1], 8, 'on row 1');
  const x0 = m.picture.spr[4];
  setButtons(m, BTN.LEFT); runFrames(m, 4); setButtons(m, 0);
  assert.equal(m.picture.spr[4], x0 - 16, 'the bowl moved one cell every 2 frames');
  // Play: move the bowl under the item and hold Down, until five are caught.
  let frames = 0;
  while (textRow(m, 0).slice(6, 8) !== '05' && frames++ < 3000) {
    const item = m.picture.spr[0], bowl = m.picture.spr[4];
    setButtons(m, (item < bowl ? BTN.LEFT : item > bowl + 16 ? BTN.RIGHT : BTN.DOWN));
    runFrame(m);
  }
  assert.equal(textRow(m, 0).slice(0, 8), 'SCORE 05');
  // Now walk away from it.
  frames = 0;
  while (!/GAME OVER/.test(textRow(m, 6)) && frames++ < 3000) {
    setButtons(m, m.picture.spr[0] < 80 ? BTN.RIGHT | BTN.DOWN : BTN.LEFT | BTN.DOWN);
    runFrame(m);
  }
  assert.match(textRow(m, 6), /GAME OVER/);
  assert.match(textRow(m, 0), /BEST 0[5-9]/);
  const best = textRow(m, 0).slice(11);
  setButtons(m, 0);
  reset(m); runFrames(m, 5);
  assert.equal(textRow(m, 0).slice(11), best, 'BEST is in RAM, and Reset keeps RAM');
  powerOff(m); powerOn(m); runFrames(m, 5);
  assert.equal(textRow(m, 0), 'SCORE 00   BEST 00  ', 'power off loses it');
});

test('pong.rpl: paddles, a serve, a point', (t) => {
  const rom = example('pong');
  if (!rom) return t.skip('run `make examples` first');
  const m = boot(rom);
  runFrames(m, 5);
  const spr = (i: number) => Array.from(m.picture.spr.subarray(i * 4, i * 4 + 4));
  assert.deepEqual(spr(0), [8, 56, 1, 0x80]);
  assert.deepEqual(spr(5), [144, 72, 1, 0x80]);
  assert.deepEqual(spr(6), [76, 60, 2, 0x80]);
  assert.match(textRow(m, 6), /PRESS START/);
  setButtons(m, BTN.START); runFrames(m, 2);
  setButtons(m, BTN.UP); runFrames(m, 10);
  assert.equal(spr(0)[1], 56 - 20, 'Up moves the paddle 2 pixels a frame');
  setButtons(m, BTN.DOWN); runFrames(m, 100);
  assert.equal(spr(0)[1], 104, 'and Down stops at the bottom');
  setButtons(m, 0);
  let frames = 0;
  while (textRow(m, 0).replace(/ /g, '') === '00' && frames++ < 3000) runFrame(m);
  assert.notEqual(textRow(m, 0).replace(/ /g, ''), '00', 'somebody scored');
  assert.ok(m.sounds.length > 0, 'and there was a beep');
});
