// Runs a cartridge without a browser and writes one frame as a PPM.
//   node scripts/frame.ts game.rpl out.ppm [frames] [FROM-TO:MASK ...]
// A button argument holds buttons for a range of frames, mask in hex:
// 10-12:40 holds Start (bit 6) on frames 10 to 12.
import { readFileSync, writeFileSync } from 'node:fs';
import { createMachine, insertCart, makeCart, powerOn, runFrame, setButtons } from '../src/engine/machine.ts';
import { renderFrame, SCREEN_H, SCREEN_W } from '../src/video/rpl.ts';

const [rom, out, framesArg = '30', ...presses] = process.argv.slice(2);
if (!rom || !out) {
  console.error('usage: node scripts/frame.ts game.rpl out.ppm [frames] [FROM-TO:MASK ...]');
  process.exit(2);
}
const made = makeCart(readFileSync(rom), rom);
if (!made.ok) { console.error(made.error); process.exit(1); }
const m = createMachine();
insertCart(m, made.cart);
powerOn(m);
const plan = presses.map((p) => {
  const [range, mask] = p.split(':');
  const [a, b] = range.split('-').map(Number);
  return { a, b: b ?? a, mask: parseInt(mask, 16) };
});
for (let f = 0; f < Number(framesArg); f++) {
  setButtons(m, plan.reduce((acc, p) => (f >= p.a && f <= p.b ? acc | p.mask : acc), 0));
  runFrame(m);
}
const px = new Uint16Array(SCREEN_W * SCREEN_H);
renderFrame(m.picture, px);
const body = new Uint8Array(px.length * 3);
px.forEach((p, i) => {
  const r = p >> 11, g = (p >> 5) & 63, b = p & 31;
  body.set([(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)], i * 3);
});
writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${SCREEN_W} ${SCREEN_H}\n255\n`), body]));
console.log(`${out}: frame ${m.frame}, ${m.bytesSent} bytes sent, PC $${m.cpu.pc.toString(16).toUpperCase().padStart(4, '0')}`);
