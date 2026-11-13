/*
 * The display/sound parser and renderer: a line-by-line port of
 * firmware/common/rpl_parse.c and rpl_render.c (RAMPLAY_SPEC.md section 6).
 * Keep the two in step. test/conformance.test.ts holds this file to the same
 * PNGs as the C build.
 *
 * SPDX-License-Identifier: MIT
 */
import { DEFAULT_PALETTE, FONT, FONT_FIRST, FONT_LAST } from './tables.ts';

export const SCREEN_W = 160;
export const SCREEN_H = 128;
export const MAP_W = 32;
export const TEXT_W = 20;
export const TEXT_H = 16;
export const SPRITES = 32;
export const TEXT_COLOR = 15;

export const OP = {
  NOP: 0x00, DEFTILE: 0x01, SETBG: 0x02, SETSPR: 0x03, SETPAL: 0x04, SCROLL: 0x05,
  SOUND: 0x06, TEXT: 0x07, CLEAR: 0x08, BGROW: 0x09, CLRTXT: 0x0A, RESYNC: 0xFF,
} as const;
export const OP_NAMES: Record<number, string> = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]));

export const ATTR_PAL = 0x03, ATTR_HFLIP = 0x04, ATTR_VFLIP = 0x08, ATTR_VISIBLE = 0x80;

const PH_OPCODE = 0, PH_ARGS = 1, PH_TEXT = 2, PH_BGROW = 3;

/** Everything a frame is drawn from. copyVideo() takes the per-frame snapshot. */
export interface RplVideo {
  tiles: Uint8Array;      // 256 * 32
  pal: Uint16Array;       // 4 * 16, RGB565
  bgTile: Uint8Array;     // 32 * 32
  bgAttr: Uint8Array;
  spr: Uint8Array;        // 32 * 4: x, y, tile, attr
  textCh: Uint8Array;     // 20 * 16
  textPal: Uint8Array;
  scrollX: number;
  scrollY: number;
  soundFreq: number;
  soundDur: number;
  soundSeq: number;       // counts SOUND commands
}

export interface RplState {
  v: RplVideo;
  phase: number;
  op: number;
  need: number;
  have: number;
  args: Uint8Array;
  cx: number;
  cy: number;
  cpal: number;
  cok: boolean;
  left: number;
  stored: number;
}

export function createVideo(): RplVideo {
  return {
    tiles: new Uint8Array(256 * 32), pal: new Uint16Array(64),
    bgTile: new Uint8Array(1024), bgAttr: new Uint8Array(1024), spr: new Uint8Array(SPRITES * 4),
    textCh: new Uint8Array(TEXT_W * TEXT_H), textPal: new Uint8Array(TEXT_W * TEXT_H),
    scrollX: 0, scrollY: 0, soundFreq: 0, soundDur: 0, soundSeq: 0,
  };
}

export function copyVideo(dst: RplVideo, src: RplVideo): void {
  dst.tiles.set(src.tiles); dst.pal.set(src.pal);
  dst.bgTile.set(src.bgTile); dst.bgAttr.set(src.bgAttr); dst.spr.set(src.spr);
  dst.textCh.set(src.textCh); dst.textPal.set(src.textPal);
  dst.scrollX = src.scrollX; dst.scrollY = src.scrollY;
  dst.soundFreq = src.soundFreq; dst.soundDur = src.soundDur; dst.soundSeq = src.soundSeq;
}

function doClear(v: RplVideo): void {
  v.bgTile.fill(0); v.bgAttr.fill(0); v.spr.fill(0);
  v.textCh.fill(0x20); v.textPal.fill(0);
  v.scrollX = 0; v.scrollY = 0;
}

/** Power-on state: tiles zero, default palettes, CLEAR state, parser at "expect opcode". */
export function resetState(s: RplState): void {
  const v = s.v;
  v.tiles.fill(0);
  for (let p = 0; p < 4; p++) v.pal.set(DEFAULT_PALETTE, p * 16);
  doClear(v);
  v.soundFreq = 0; v.soundDur = 0; v.soundSeq = 0;
  s.phase = PH_OPCODE; s.op = 0; s.need = 0; s.have = 0; s.args.fill(0);
  s.cx = 0; s.cy = 0; s.cpal = 0; s.cok = false; s.left = 0; s.stored = 0;
}

export function createState(): RplState {
  const s: RplState = {
    v: createVideo(), phase: 0, op: 0, need: 0, have: 0, args: new Uint8Array(33),
    cx: 0, cy: 0, cpal: 0, cok: false, left: 0, stored: 0,
  };
  resetState(s);
  return s;
}

export const parserBusy = (s: RplState): boolean => s.phase !== PH_OPCODE;

function fixedArgs(op: number): number {
  switch (op) {
    case OP.DEFTILE: return 33;
    case OP.SETBG: return 4;
    case OP.SETSPR: return 5;
    case OP.SETPAL: return 33;
    case OP.SCROLL: return 2;
    case OP.SOUND: return 3;
    case OP.TEXT: return 3;
    case OP.BGROW: return 3;
    default: return 0;
  }
}

function run(s: RplState): void {
  const v = s.v, a = s.args;
  s.phase = PH_OPCODE;
  switch (s.op) {
    case OP.DEFTILE:
      v.tiles.set(a.subarray(1, 33), a[0] * 32);
      break;
    case OP.SETBG: {
      const i = (a[1] & 31) * MAP_W + (a[0] & 31);
      v.bgTile[i] = a[2];
      v.bgAttr[i] = a[3];
      break;
    }
    case OP.SETSPR:
      v.spr.set(a.subarray(1, 5), (a[0] & 31) * 4);
      break;
    case OP.SETPAL: {
      const base = (a[0] & 3) * 16;
      for (let i = 0; i < 16; i++) v.pal[base + i] = a[1 + 2 * i] | (a[2 + 2 * i] << 8);
      break;
    }
    case OP.SCROLL:
      v.scrollX = a[0];
      v.scrollY = a[1];
      break;
    case OP.SOUND:
      v.soundFreq = a[0] | (a[1] << 8);
      v.soundDur = a[2];
      v.soundSeq++;
      break;
    case OP.TEXT:
      s.cx = a[0];
      s.cy = a[1];
      s.cpal = a[2] & 3;
      s.cok = a[0] < TEXT_W && a[1] < TEXT_H;
      s.phase = PH_TEXT;
      break;
    case OP.BGROW:
      s.cx = a[0] & 31;
      s.cy = a[1] & 31;
      s.left = a[2];
      s.stored = 0;
      if (s.left) s.phase = PH_BGROW;
      break;
  }
}

/** Feed one byte of the stream. Never fails. */
export function parseByte(s: RplState, b: number): void {
  const v = s.v;
  b &= 0xFF;
  switch (s.phase) {
    case PH_OPCODE:
      if (b === OP.CLEAR) {
        doClear(v);
      } else if (b === OP.CLRTXT) {
        v.textCh.fill(0x20);
        v.textPal.fill(0);
      } else if (fixedArgs(b)) {
        s.op = b;
        s.need = fixedArgs(b);
        s.have = 0;
        s.phase = PH_ARGS;
      }
      break;

    case PH_ARGS:
      s.args[s.have++] = b;
      if (s.have === s.need) run(s);
      break;

    case PH_TEXT:
      if (b === 0) {
        s.phase = PH_OPCODE;
      } else if (s.cok && s.cx < TEXT_W) {
        const i = s.cy * TEXT_W + s.cx;
        v.textCh[i] = b >= 0x20 && b <= 0x7E ? b : 0x20;
        v.textPal[i] = s.cpal;
        s.cx++;
      }
      break;

    case PH_BGROW:
      if (s.stored < MAP_W) {
        const i = s.cy * MAP_W + s.cx;
        v.bgTile[i] = b;
        v.bgAttr[i] = 0;
        s.cx = (s.cx + 1) & 31;
        s.stored++;
      }
      if (--s.left === 0) s.phase = PH_OPCODE;
      break;

    default:
      s.phase = PH_OPCODE;
  }
}

function tilePixel(tiles: Uint8Array, tile: number, px: number, py: number, attr: number): number {
  if (attr & ATTR_HFLIP) px = 7 - px;
  if (attr & ATTR_VFLIP) py = 7 - py;
  const b = tiles[tile * 32 + py * 4 + (px >> 1)];
  return px & 1 ? b & 0x0F : b >> 4;
}

/** One scanline of RGB565 into out[at .. at + 159]. */
export function renderLine(v: RplVideo, y: number, out: Uint16Array, at = 0): void {
  // Background.
  const wy = (y + v.scrollY) & 0xFF;
  const row = (wy >> 3) * MAP_W;
  for (let x = 0; x < SCREEN_W; x++) {
    const wx = (x + v.scrollX) & 0xFF;
    const cell = row + (wx >> 3);
    const attr = v.bgAttr[cell];
    const c = tilePixel(v.tiles, v.bgTile[cell], wx & 7, wy & 7, attr);
    out[at + x] = v.pal[(attr & ATTR_PAL) * 16 + c];
  }

  // Sprites, 31 first so 0 ends on top.
  for (let i = SPRITES - 1; i >= 0; i--) {
    const sx = v.spr[i * 4], sy = v.spr[i * 4 + 1], tile = v.spr[i * 4 + 2], attr = v.spr[i * 4 + 3];
    if (!(attr & ATTR_VISIBLE)) continue;
    if (sx >= SCREEN_W || sy >= SCREEN_H) continue;
    const py = y - sy;
    if (py < 0 || py > 7) continue;
    const pal = (attr & ATTR_PAL) * 16;
    for (let px = 0; px < 8; px++) {
      const x = sx + px;
      if (x >= SCREEN_W) break;
      const c = tilePixel(v.tiles, tile, px, py, attr);
      if (c) out[at + x] = v.pal[pal + c];
    }
  }

  // Text.
  const trow = (y >> 3) * TEXT_W;
  for (let col = 0; col < TEXT_W; col++) {
    const ch = v.textCh[trow + col];
    if (ch <= FONT_FIRST || ch > FONT_LAST) continue;
    const bits = FONT[(ch - FONT_FIRST) * 8 + (y & 7)];
    if (!bits) continue;
    const color = v.pal[(v.textPal[trow + col] & 3) * 16 + TEXT_COLOR];
    for (let px = 0; px < 8; px++) if (bits & (0x80 >> px)) out[at + col * 8 + px] = color;
  }
}

/** The whole frame: 160 * 128 pixels of RGB565. */
export function renderFrame(v: RplVideo, out: Uint16Array): void {
  for (let y = 0; y < SCREEN_H; y++) renderLine(v, y, out, y * SCREEN_W);
}

/** RGB565 to RGBA8888, widening by repeating the top bits, as rplrender.c does. */
export function toRGBA(frame: Uint16Array, rgba: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0, o = 0; i < frame.length; i++, o += 4) {
    const p = frame[i], r = p >> 11, g = (p >> 5) & 63, b = p & 31;
    rgba[o] = (r << 3) | (r >> 2);
    rgba[o + 1] = (g << 2) | (g >> 4);
    rgba[o + 2] = (b << 3) | (b >> 2);
    rgba[o + 3] = 255;
  }
}
