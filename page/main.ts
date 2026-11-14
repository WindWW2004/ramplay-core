/*
 * The core page's bare console: RamPlay Core with a canvas, a keyboard and a
 * square wave. It is the smallest platform there can be, and it shows what a
 * platform has to bring: where cartridges come from, where the picture goes,
 * what the buttons are, how the sound is made.
 *
 * SPDX-License-Identifier: MIT
 */
import {
  BTN, FPS, SCREEN_H, SCREEN_W, createMachine, extractCart, insertCart, isPng, makeCart, powerOn, removeCart,
  renderFrame, reset, runFrame, setButtons, toRGBA,
} from '../src/index.ts';

declare const RAMPLAYER: string, VERSION: string;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-ramplayer]')) a.href = RAMPLAYER;
$('version').textContent = 'v' + VERSION;
$('btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('install-cmd').textContent ?? ''); $('btn-copy').textContent = 'Copied'; }
  catch { $('btn-copy').textContent = 'Select it'; }
  setTimeout(() => { $('btn-copy').textContent = 'Copy'; }, 1600);
});

const m = createMachine();
const canvas = $<HTMLCanvasElement>('screen'), ctx = canvas.getContext('2d')!;
const px = new Uint16Array(SCREEN_W * SCREEN_H), image = new ImageData(SCREEN_W, SCREEN_H);
let paused = false;

// ---- cartridges: a sample, a .rpl file, or a cartridge PNG
function load(bytes: Uint8Array, name: string): void {
  let rom = bytes;
  if (isPng(bytes)) {
    const got = extractCart(bytes);
    if (!got.ok) { $('note').textContent = got.error; return; }
    rom = got.rom;
  }
  const made = makeCart(rom, name);
  if (!made.ok) { $('note').textContent = made.error; return; }
  removeCart(m);
  insertCart(m, made.cart);
  powerOn(m);
  paused = false;
  $('empty').hidden = true;
  $('r-title').textContent = made.cart.title || name;
  $('note').textContent = 'Arrows or WASD move. Z or O is A, X or P is B, Enter is Start.';
  $<HTMLButtonElement>('btn-reset').disabled = $<HTMLButtonElement>('btn-pause').disabled = false;
  $('btn-pause').textContent = 'Pause';
  canvas.focus({ preventScroll: true });
}
for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-sample]')) {
  b.addEventListener('click', async () => {
    const name = b.dataset.sample!;
    try {
      const r = await fetch(`./samples/${name}.rpl`);
      if (!r.ok) throw new Error();
      load(new Uint8Array(await r.arrayBuffer()), name);
    } catch { $('note').textContent = 'The sample is not built. Run make examples.'; }
  });
}
// ?sample=catch starts with that cartridge in, so a link can show a running console.
const first = new URLSearchParams(location.search).get('sample');
if (first) document.querySelector<HTMLButtonElement>(`button[data-sample="${CSS.escape(first)}"]`)?.click();
$<HTMLInputElement>('rom-file').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) load(new Uint8Array(await f.arrayBuffer()), f.name);
});
$('btn-reset').addEventListener('click', () => { reset(m); canvas.focus({ preventScroll: true }); });
$('btn-pause').addEventListener('click', () => { paused = !paused; $('btn-pause').textContent = paused ? 'Run' : 'Pause'; });

// ---- buttons: the keyboard
const KEYS: Record<string, number> = {
  ArrowUp: BTN.UP, ArrowDown: BTN.DOWN, ArrowLeft: BTN.LEFT, ArrowRight: BTN.RIGHT,
  z: BTN.A, Z: BTN.A, x: BTN.B, X: BTN.B, Enter: BTN.START,
  w: BTN.UP, W: BTN.UP, s: BTN.DOWN, S: BTN.DOWN, a: BTN.LEFT, A: BTN.LEFT, d: BTN.RIGHT, D: BTN.RIGHT,
  o: BTN.A, O: BTN.A, p: BTN.B, P: BTN.B,
};
let held = 0;
window.addEventListener('keydown', (e) => {
  const bit = KEYS[e.key];
  if (!bit || !m.cart || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
  held |= bit;
  e.preventDefault();
});
window.addEventListener('keyup', (e) => { const bit = KEYS[e.key]; if (bit) held &= ~bit; });
window.addEventListener('blur', () => { held = 0; });

// ---- sound: the last SOUND command of the frame, as a square wave
let audio: AudioContext | null = null, osc: OscillatorNode | null = null;
function play(): void {
  if (!m.sounds.length) return;
  const s = m.sounds[m.sounds.length - 1];
  m.sounds.length = 0;
  if (!audio) { try { audio = new AudioContext(); } catch { return; } }
  osc?.stop(); osc = null;
  if (!s.freq || !s.dur) return;
  const gain = audio.createGain();
  gain.gain.value = 0.05;
  osc = audio.createOscillator();
  osc.type = 'square'; osc.frequency.value = s.freq;
  osc.connect(gain).connect(audio.destination);
  osc.start(); osc.stop(audio.currentTime + s.dur / 100);
}

// ---- the loop: 30 frames a second
setInterval(() => {
  if (!m.cart || paused) return;
  setButtons(m, held);
  runFrame(m);
  renderFrame(m.picture, px);
  toRGBA(px, image.data);
  ctx.putImageData(image, 0, 0);
  play();
  $('r-frame').textContent = String(m.frame);
  $('r-pc').textContent = '$' + m.cpu.pc.toString(16).toUpperCase().padStart(4, '0');
  $('r-bytes').textContent = String(m.bytesSent);
}, 1000 / FPS);
