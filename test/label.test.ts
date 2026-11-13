// Label mode: a cartridge that draws its own label (RAMPLAY_SPEC.md section 11).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverOf, LABEL_FLAG, LABEL_FLAG_AT, LABEL_H, LABEL_W, labelOf } from '../src/snapshot.ts';
import { DEFAULT_PALETTE } from '../src/video/tables.ts';
import { romOf } from './helpers.ts';

const INIT = [0xA9, 0xFF, 0x8D, 0x02, 0x60, 0xA9, 0x00, 0x8D, 0x03, 0x60, 0xA9, 0xA0, 0x8D, 0x0C, 0x60, 0xA9, 0x7F, 0x8D, 0x0E, 0x60];

/**
 * A cartridge that draws only when Left and Right are both held at power-on:
 * tile 1 (columns of colors 2 and 1) at cells 0,0 and 21,24 (flipped), and at
 * 22,0, which is outside the label.
 */
function labelRom(flag: boolean): Uint8Array {
  const stream = [
    0x01, 1, ...new Array(32).fill(0x21),         // DEFTILE 1
    0x02, 0, 0, 1, 0x00,                          // SETBG 0,0
    0x02, 21, 24, 1, 0x05,                        // SETBG 21,24, palette 1, flipped left to right
    0x02, 22, 0, 1, 0x00,                         // SETBG 22,0
  ];
  const code = [
    ...INIT,
    0xAD, 0x01, 0x60,                             // $8014 LDA $6001
    0x29, 0x0C,                                   //       AND #$0C   Left and Right, pressed = 0
    0xD0, 0x0D,                                   //       BNE spin
    0xA2, 0x00,                                   //       LDX #0
    0xBD, 0x2B, 0x80,                             // $801D LDA stream,X
    0x8D, 0x00, 0x60,                             //       STA $6000
    0xE8,                                         //       INX
    0xE0, stream.length,                          //       CPX #n
    0xD0, 0xF5,                                   //       BNE $801D
    0x4C, 0x28, 0x80,                             // $8028 spin: JMP spin
    ...stream,                                    // $802B
  ];
  const rom = romOf(code);
  if (flag) rom[LABEL_FLAG_AT] = LABEL_FLAG;
  return rom;
}

test('a cartridge without the header byte has no label', () => {
  assert.equal(LABEL_FLAG_AT, 0x7F55);
  assert.equal(labelOf(labelRom(false)), null);
  assert.equal(coverOf(labelRom(false))!.label, undefined);
});

test('a cartridge with the header byte is asked for its label with Left and Right held', () => {
  const label = labelOf(labelRom(true))!;
  assert.equal(label.length, LABEL_W * LABEL_H);
  const at = (x: number, y: number): number => label[y * LABEL_W + x];
  assert.equal(at(0, 0), DEFAULT_PALETTE[2]);
  assert.equal(at(1, 0), DEFAULT_PALETTE[1]);
  assert.equal(at(8, 0), DEFAULT_PALETTE[0], 'an empty cell is color 0');
  assert.equal(at(168, 192), DEFAULT_PALETTE[1], 'the last cell, flipped');
  assert.equal(at(175, 199), DEFAULT_PALETTE[2]);
  assert.equal(at(160, 0), DEFAULT_PALETTE[0], 'columns 20 and 21 are in the label');
});

test('the cover carries the label, and ordinary play is not label mode', () => {
  const cover = coverOf(labelRom(true))!;
  assert.ok(cover.label);
  assert.deepEqual(Array.from(cover.label!), Array.from(labelOf(labelRom(true))!));
  assert.equal(cover.frame[0], DEFAULT_PALETTE[0], 'nothing is drawn without the two buttons');
});

test('a cartridge that sets the byte but draws nothing has no label', () => {
  const rom = romOf([0x4C, 0x00, 0x80]);
  rom[LABEL_FLAG_AT] = LABEL_FLAG;
  assert.equal(labelOf(rom), null);
});
