// RAMPLAY_SPEC.md section 11.1: the emulator's renderer against the same
// vectors and expected frames as the C build (tests/protocol/run.py).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createState, parseByte, parserBusy, renderFrame, SCREEN_H, SCREEN_W, toRGBA } from '../src/video/rpl.ts';
import { readPng, ROOT } from './helpers.ts';

const DIR = join(ROOT, 'tests', 'protocol');
const vectors = readdirSync(DIR).filter((n) => n.endsWith('.bin')).sort();

test('there are at least 10 vectors', () => {
  assert.ok(vectors.length >= 10, `${vectors.length} vectors`);
});

for (const name of vectors) {
  test(`vector ${name.replace('.bin', '')}`, () => {
    const s = createState();
    for (const b of readFileSync(join(DIR, name))) parseByte(s, b);
    assert.equal(parserBusy(s), false, 'the stream ends between commands');
    const frame = new Uint16Array(SCREEN_W * SCREEN_H);
    renderFrame(s.v, frame);
    const rgba = new Uint8Array(frame.length * 4);
    toRGBA(frame, rgba);
    const want = readPng(join(DIR, name.replace('.bin', '.png')));
    assert.deepEqual([want.width, want.height], [SCREEN_W, SCREEN_H]);
    let diff = 0, first = -1;
    for (let i = 0; i < frame.length; i++) {
      if (rgba[i * 4] !== want.rgb[i * 3] || rgba[i * 4 + 1] !== want.rgb[i * 3 + 1] || rgba[i * 4 + 2] !== want.rgb[i * 3 + 2]) {
        if (first < 0) first = i;
        diff++;
      }
    }
    assert.equal(diff, 0, `${diff} pixels differ, first at (${first % SCREEN_W},${Math.floor(first / SCREEN_W)})`);
  });
}

test('any byte stream is safe', () => {
  const s = createState();
  let r = 0x52504C31;
  for (let i = 0; i < 200000; i++) {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    parseByte(s, r >>> 24);
  }
  renderFrame(s.v, new Uint16Array(SCREEN_W * SCREEN_H));
});
