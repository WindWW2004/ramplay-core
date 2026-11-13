/*
 * A cartridge's own picture. The cartridge is run for a few seconds on a
 * machine of its own: the title, Start, a little play. What is kept is the
 * frame at that moment and the sprites on it, each as pixels. The label
 * (cartart.ts) makes its cover art from them, so every cartridge shows the
 * game that is really inside it.
 *
 * SPDX-License-Identifier: MIT
 */
import { BTN, createMachine, insertCart, makeCart, powerOn, runFrame, setButtons } from './engine/machine.ts';
import { ATTR_HFLIP, ATTR_PAL, ATTR_VFLIP, ATTR_VISIBLE, copyVideo, createVideo, MAP_W, renderFrame, SCREEN_H, SCREEN_W, SPRITES } from './video/rpl.ts';

/** One 8x8 sprite as it is on the screen: where, and its pixels as RGBA (index 0 is clear). */
export interface CoverSprite { x: number; y: number; rgba: Uint8ClampedArray; }
export interface Cover {
  frame: Uint16Array;         // 160 x 128, RGB565
  backdrop: number;           // the color most of the frame has
  sprites: CoverSprite[];     // back to front
  ground?: Uint16Array;       // the same frame with only the background layer: no sprites, no text
  label?: Uint16Array;        // the cartridge's own label, 176 x 200, RGB565 (labelOf), if it has one
}

/** The size of a label, and where the header says a cartridge draws its own. */
export const LABEL_W = 176, LABEL_H = 200;
export const LABEL_FLAG_AT = 0x7F55;      // CPU $FF55
export const LABEL_FLAG = 0x01;

const rgb = (p: number): [number, number, number] => {
  const r = p >> 11, g = (p >> 5) & 63, b = p & 31;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
};

/**
 * A cartridge's own label (RAMPLAY_SPEC.md section 11, label mode). A
 * cartridge whose header byte at $FF55 is $01 draws its label when Left and
 * Right are both held from power-on: into background cells x 0..21, y 0..24,
 * scroll 0,0, no sprites, no text. This powers a machine on with both held,
 * runs 40 frames and reads that part of the map: 176 x 200 pixels of RGB565.
 * Null if the cartridge has no label, or drew one flat color.
 */
export function labelOf(rom: Uint8Array): Uint16Array | null {
  if (rom.length <= LABEL_FLAG_AT || rom[LABEL_FLAG_AT] !== LABEL_FLAG) return null;
  const made = makeCart(rom);
  if (!made.ok) return null;
  const m = createMachine();
  insertCart(m, made.cart);
  setButtons(m, BTN.LEFT | BTN.RIGHT);
  powerOn(m);
  for (let f = 0; f < 40; f++) { setButtons(m, BTN.LEFT | BTN.RIGHT); runFrame(m); }
  const v = m.picture, out = new Uint16Array(LABEL_W * LABEL_H);
  let flat = true;
  for (let y = 0; y < LABEL_H; y++) for (let x = 0; x < LABEL_W; x++) {
    const cell = (y >> 3) * MAP_W + (x >> 3), attr = v.bgAttr[cell];
    const tx = attr & ATTR_HFLIP ? 7 - (x & 7) : x & 7, ty = attr & ATTR_VFLIP ? 7 - (y & 7) : y & 7;
    const b = v.tiles[v.bgTile[cell] * 32 + ty * 4 + (tx >> 1)], c = tx & 1 ? b & 0x0F : b >> 4;
    const p = v.pal[(attr & ATTR_PAL) * 16 + c];
    out[y * LABEL_W + x] = p;
    if (p !== out[0]) flat = false;
  }
  return flat ? null : out;
}

/**
 * Runs the cartridge: 40 frames of title, Start held for 4, then 56 frames of
 * play with the pad going right, left and up (never down, which in catch ends
 * the game). Null for an image that is not a cartridge.
 */
export function coverOf(rom: Uint8Array): Cover | null {
  const made = makeCart(rom);
  if (!made.ok) return null;
  const m = createMachine();
  insertCart(m, made.cart);
  powerOn(m);
  for (let f = 0; f < 100; f++) {
    let pad = 0;
    if (f >= 40 && f < 44) pad = BTN.START;
    else if (f >= 44) { const k = (f - 44) % 22; pad = k < 6 ? BTN.RIGHT : k < 10 ? 0 : k < 16 ? BTN.LEFT : BTN.UP; }
    setButtons(m, pad);
    runFrame(m);
  }
  const v = m.picture;
  const frame = new Uint16Array(SCREEN_W * SCREEN_H);
  renderFrame(v, frame);

  const counts = new Map<number, number>();
  let backdrop = 0, most = 0;
  for (const p of frame) { const n = (counts.get(p) ?? 0) + 1; counts.set(p, n); if (n > most) { most = n; backdrop = p; } }

  const sprites: CoverSprite[] = [];
  for (let i = SPRITES - 1; i >= 0; i--) {            // 31 first: the renderer's order, so 0 ends on top
    const x = v.spr[i * 4], y = v.spr[i * 4 + 1], tile = v.spr[i * 4 + 2], attr = v.spr[i * 4 + 3];
    if (!(attr & ATTR_VISIBLE) || x >= SCREEN_W || y >= SCREEN_H) continue;
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    let any = false;
    for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
      const tx = attr & ATTR_HFLIP ? 7 - px : px, ty = attr & ATTR_VFLIP ? 7 - py : py;
      const b = v.tiles[tile * 32 + ty * 4 + (tx >> 1)], c = tx & 1 ? b & 0x0F : b >> 4;
      if (!c) continue;
      rgba.set([...rgb(v.pal[(attr & ATTR_PAL) * 16 + c]), 255], (py * 8 + px) * 4);
      any = true;
    }
    if (any) sprites.push({ x, y, rgba });
  }
  // Sprites in the top row are a status bar (hearts, keys, counters), not the
  // cast. They stay off the cover unless they are all there is.
  const cast = sprites.filter((s) => s.y >= 8);

  // The background alone, for the label to use as the game's own scenery.
  const bare = createVideo();
  copyVideo(bare, v);
  bare.spr.fill(0); bare.textCh.fill(0x20);
  const ground = new Uint16Array(SCREEN_W * SCREEN_H);
  renderFrame(bare, ground);

  return { frame, backdrop, sprites: cast.length ? cast : sprites, ground, label: labelOf(rom) ?? undefined };
}
