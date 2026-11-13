/*
 * A cartridge as a picture. RAMPLAY_SPEC.md section 8.3.
 *
 * A cartridge PNG is an ordinary PNG of the cartridge with one extra chunk,
 * `rpLc`, that holds the game. PNG lets a file carry private chunks; viewers
 * skip the ones they do not know. So the picture opens anywhere, and RamPlayer
 * finds the game in it.
 *
 *   rpLc data:  byte 0        format version, 1
 *               bytes 1-2     n, the length of the information, little endian
 *               n bytes       information: JSON, UTF-8 (id, title, author, year, tags, description)
 *               32768 bytes   the .rpl image, as it is
 *
 * The ROM is not compressed or hidden: it can be cut out of the file with any
 * hex editor, which is what the dumping lab does. The chunk's CRC (every PNG
 * chunk has one) catches a damaged file.
 *
 * SPDX-License-Identifier: MIT
 */
export const CHUNK = 'rpLc';
export const CART_VERSION = 1;
const ROM_SIZE = 32768;
const SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

export interface CartMeta {
  id?: string;
  title?: string;
  author?: string;
  year?: number;
  tags?: string[];
  description?: string;
}

let table: Uint32Array | null = null;
/** The CRC-32 of PNG, zip and Ethernet. */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = start; i < end; i++) c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export const isPng = (b: Uint8Array): boolean => b.length > 8 && SIGNATURE.every((v, i) => b[i] === v);

const u32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const typeAt = (b: Uint8Array, at: number): string => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

/** The chunks of a PNG: where each starts, its type, where its data is. Null if the file is not a whole PNG. */
function chunks(png: Uint8Array): Array<{ at: number; type: string; data: number; length: number }> | null {
  if (!isPng(png)) return null;
  const out = [];
  let at = 8;
  while (at + 12 <= png.length) {
    const length = u32(png, at), type = typeAt(png, at + 4);
    if (at + 12 + length > png.length) return null;
    out.push({ at, type, data: at + 8, length });
    at += 12 + length;
    if (type === 'IEND') return out;
  }
  return null;
}

/** Put the game into a PNG, just before IEND. A cartridge already in it is replaced. */
export function embedCart(png: Uint8Array, rom: Uint8Array, meta: CartMeta = {}): Uint8Array {
  const list = chunks(png);
  if (!list) throw new Error('not a PNG');
  if (rom.length !== ROM_SIZE) throw new Error(`a .rpl image is ${ROM_SIZE} bytes`);
  const info = new TextEncoder().encode(JSON.stringify(meta));
  if (info.length > 0xFFFF) throw new Error('the information is too long');

  const body = new Uint8Array(4 + 3 + info.length + ROM_SIZE);        // type + data, what the CRC covers
  body.set([...CHUNK].map((ch) => ch.charCodeAt(0)), 0);
  body.set([CART_VERSION, info.length & 0xFF, info.length >> 8], 4);
  body.set(info, 7);
  body.set(rom, 7 + info.length);
  const chunk = new Uint8Array(body.length + 8);
  new DataView(chunk.buffer).setUint32(0, body.length - 4);
  chunk.set(body, 4);
  new DataView(chunk.buffer).setUint32(chunk.length - 4, crc32(body));

  const parts: Uint8Array[] = [png.subarray(0, 8)];
  for (const c of list) {
    if (c.type === CHUNK) continue;
    if (c.type === 'IEND') parts.push(chunk);
    parts.push(png.subarray(c.at, c.at + 12 + c.length));
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export type Extracted = { ok: true; rom: Uint8Array; meta: CartMeta } | { ok: false; error: string };

/** Take the game out of a cartridge PNG. */
export function extractCart(png: Uint8Array): Extracted {
  const list = chunks(png);
  if (!list) return { ok: false, error: 'this is not a whole PNG file' };
  const c = list.find((x) => x.type === CHUNK);
  if (!c) return { ok: false, error: 'there is no cartridge in this picture. An app may have re-saved it; send the file itself' };
  if (crc32(png, c.at + 4, c.data + c.length) !== u32(png, c.data + c.length)) return { ok: false, error: 'the cartridge in this picture is damaged' };
  if (png[c.data] !== CART_VERSION) return { ok: false, error: `cartridge format ${png[c.data]} is newer than this page` };
  const n = png[c.data + 1] | (png[c.data + 2] << 8);
  if (c.length !== 3 + n + ROM_SIZE) return { ok: false, error: 'the cartridge in this picture has the wrong size' };
  let meta: CartMeta = {};
  try {
    const raw = JSON.parse(new TextDecoder().decode(png.subarray(c.data + 3, c.data + 3 + n)));
    const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);
    meta = {
      id: text(raw.id, 40), title: text(raw.title, 40), author: text(raw.author, 60), description: text(raw.description, 140),
      year: Number.isFinite(raw.year) ? Number(raw.year) : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 5).map((t: unknown) => String(t).slice(0, 20)) : undefined,
    };
  } catch { /* unreadable information: the game is still good */ }
  return { ok: true, rom: png.slice(c.data + 3 + n, c.data + 3 + n + ROM_SIZE), meta };
}
