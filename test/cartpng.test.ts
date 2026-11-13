// The cartridge PNG: the game goes into a picture and comes back out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { CHUNK, crc32, embedCart, extractCart, isPng } from '../src/cartpng.ts';
import { coverOf } from '../src/snapshot.ts';
import { example, romOf } from './helpers.ts';

/** A 2x2 RGB PNG, built here. */
function tinyPng(): Uint8Array {
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const body = new Uint8Array(4 + data.length);
    body.set([...type].map((c) => c.charCodeAt(0)), 0); body.set(data, 4);
    const out = new Uint8Array(body.length + 8), view = new DataView(out.buffer);
    view.setUint32(0, data.length); out.set(body, 4); view.setUint32(out.length - 4, crc32(body));
    return out;
  };
  const ihdr = new Uint8Array(13); new DataView(ihdr.buffer).setUint32(0, 2); new DataView(ihdr.buffer).setUint32(4, 2);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const idat = deflateSync(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 0, 7, 8, 9, 10, 11, 12]));
  return Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...chunk('IHDR', ihdr), ...chunk('IDAT', idat), ...chunk('IEND', new Uint8Array(0))]);
}

test('CRC-32', () => {
  assert.equal(crc32(new TextEncoder().encode('IEND')), 0xAE426082);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('the chunk name is ancillary, private and safe to copy', () => {
  assert.equal(CHUNK.length, 4);
  assert.match(CHUNK, /^[a-z][a-z][A-Z][a-z]$/);
});

test('a game goes in and comes out the same', () => {
  const png = tinyPng(), rom = romOf([0x4C, 0x00, 0x80]);
  const meta = { id: 'maze-run', title: 'Maze Run', author: 'J. Rivera', year: 2027, tags: ['puzzle'], description: 'Find the way out.' };
  const card = embedCart(png, rom, meta);
  assert.ok(isPng(card));
  assert.equal(card.length, png.length + 12 + 3 + JSON.stringify(meta).length + 32768);
  assert.deepEqual(Array.from(card.subarray(card.length - 12)), Array.from(png.subarray(png.length - 12)), 'IEND is still last');
  const got = extractCart(card);
  assert.ok(got.ok);
  if (got.ok) { assert.deepEqual(got.meta, meta); assert.deepEqual(got.rom, rom); }
  // Putting another game in replaces the first.
  const again = embedCart(card, romOf([0xEA]), { title: 'Other' });
  const second = extractCart(again);
  assert.ok(second.ok && second.meta.title === 'Other' && second.rom[0] === 0xEA);
  assert.equal(again.length, png.length + 12 + 3 + JSON.stringify({ title: 'Other' }).length + 32768);
});

test('what is not a cartridge is refused with a reason', () => {
  const png = tinyPng(), card = embedCart(png, romOf([0xEA]), { title: 'T' });
  const fails = (b: Uint8Array): string => { const r = extractCart(b); return r.ok ? '' : r.error; };
  assert.match(fails(png), /no cartridge/);
  assert.match(fails(new Uint8Array([1, 2, 3])), /not a whole PNG/);
  assert.match(fails(card.subarray(0, card.length - 20)), /not a whole PNG/);
  const flipped = card.slice(); flipped[png.length + 5000] ^= 0x01;
  assert.match(fails(flipped), /damaged/);
  assert.throws(() => embedCart(png, new Uint8Array(100)), /32768/);
  assert.throws(() => embedCart(new Uint8Array(40), romOf([0xEA])), /not a PNG/);
});

test('odd information does not lose the game', () => {
  const card = embedCart(tinyPng(), romOf([0xEA]), { title: 'x'.repeat(500), tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
  const got = extractCart(card);
  assert.ok(got.ok);
  if (got.ok) { assert.equal(got.meta.title?.length, 40); assert.equal(got.meta.tags?.length, 5); }
});

test('a cartridge is run to get its own cover: the frame, the backdrop, the sprites', (t) => {
  assert.equal(coverOf(new Uint8Array(10)), null);
  const hello = example('hello'), game = example('catch'), pong = example('pong');
  if (!hello || !game || !pong) return t.skip('run `make examples` first');
  const h = coverOf(hello)!;
  assert.equal(h.frame.length, 160 * 128);
  assert.equal(h.backdrop, 0x0000, 'mostly black');
  assert.ok(h.frame.some((p) => p === 0xFFFF), 'HELLO RAMPLAY is on it, in white');
  assert.equal(h.sprites.length, 0);
  // catch after Start: the item and the three parts of the bowl.
  const c = coverOf(game)!;
  assert.equal(c.sprites.length, 4);
  assert.ok(c.sprites.every((s) => s.rgba.length === 256 && s.rgba.some((v, i) => i % 4 === 3 && v === 255)));
  assert.deepEqual([...new Set(c.sprites.map((s) => s.y))].length, 2, 'the item above, the bowl on its row');
  // pong: two paddles of three and the ball.
  assert.equal(coverOf(pong)!.sprites.length, 7);
});
