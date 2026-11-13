/*
 * The RamPlay machine, with no drawing in it. The RamPlayer page animates it;
 * a lab page or a grader can run it in Node. It follows the v2 machine of the
 * NES Build labs (Farmingdale-115-lab, public/115/nes/v2/engine), one step on:
 *
 *   cart.ts  the cartridge: a 32 KB ROM chip, vectors at its end
 *   bus.ts   the 16-bit bus: the top address lines pick the chip
 *   cpu.ts   a real W65C02S instead of the teaching CPU
 *   via.ts   the W65C22S: buttons in, display bytes out, VBLANK in
 *   ../video/rpl.ts  the Pico: parser and renderer of the display protocol
 *
 * Time: the CPU runs at 1 MHz and the Pico draws 30 frames a second, so a
 * frame is 33333 CPU cycles. At the start of each frame the Pico snapshots its
 * state (that snapshot is the picture) and pulses VBLANK.
 *
 * SPDX-License-Identifier: MIT
 */
import { read, write } from './bus.ts';
import type { Cart } from './cart.ts';
import { createCpu, resetCpu, step, type Cpu, type CpuBus } from './cpu.ts';
import { createVia, resetVia, viaIrq, viaVblank, type Via } from './via.ts';
import { copyVideo, createState, createVideo, parseByte, parserBusy, resetState, type RplState, type RplVideo } from '../video/rpl.ts';

export * from './bus.ts';
export * from './cart.ts';
export * from './cpu.ts';
export * from './via.ts';

export const CPU_HZ = 1_000_000;
export const FPS = 30;
export const CYCLES_PER_FRAME = Math.floor(CPU_HZ / FPS);
export const RAM_SIZE = 0x4000;
export const LOG_MAX = 2000;

/** Buttons as the SDK reports them: pressed = 1. The pins carry the inverse. */
export const BTN = { UP: 0x01, DOWN: 0x02, LEFT: 0x04, RIGHT: 0x08, A: 0x10, B: 0x20, START: 0x40 } as const;

/** One complete command of the display stream. */
export interface LogEntry { frame: number; bytes: number[]; }
export interface SoundEvent { freq: number; dur: number; }

export interface Machine {
  ram: Uint8Array;
  cart: Cart | null;
  cpu: Cpu;
  via: Via;
  gpu: RplState;          // the Pico: what the stream has built so far
  picture: RplVideo;      // the snapshot the current frame is drawn from
  power: boolean;
  buttons: number;        // pressed = 1
  frame: number;
  frameCycles: number;    // CPU cycles into the current frame
  lastBus: number;
  romWrites: number;
  log: LogEntry[];        // the last LOG_MAX commands
  pending: number[];      // bytes of a command that is not complete yet
  sounds: SoundEvent[];   // SOUND commands not yet played; the page drains this
  bytesSent: number;
  send: (byte: number) => void;
  bus: CpuBus;
}

export function createMachine(): Machine {
  const m: Machine = {
    ram: new Uint8Array(RAM_SIZE), cart: null, cpu: createCpu(), via: createVia(),
    gpu: createState(), picture: createVideo(),
    power: false, buttons: 0, frame: 0, frameCycles: 0, lastBus: 0xFF, romWrites: 0,
    log: [], pending: [], sounds: [], bytesSent: 0,
    send: () => {}, bus: { read: () => 0, write: () => {} },
  };
  m.bus = { read: (a) => read(m, a), write: (a, v) => write(m, a, v) };
  m.send = (b) => {
    const seq = m.gpu.v.soundSeq;
    m.bytesSent++;
    m.pending.push(b);
    parseByte(m.gpu, b);
    if (m.gpu.v.soundSeq !== seq) m.sounds.push({ freq: m.gpu.v.soundFreq, dur: m.gpu.v.soundDur });
    if (!parserBusy(m.gpu)) {
      m.log.push({ frame: m.frame, bytes: m.pending });
      if (m.log.length > LOG_MAX) m.log.splice(0, m.log.length - LOG_MAX);
      m.pending = [];
    }
  };
  copyVideo(m.picture, m.gpu.v);
  return m;
}

/** The start of a frame: the Pico takes its snapshot and pulses VBLANK. */
function startFrame(m: Machine): void {
  copyVideo(m.picture, m.gpu.v);
  viaVblank(m.via);
  m.frame++;
}

/* /RESB reaches the CPU, the VIA and (RESB_SENSE) the Pico. RAM keeps its bytes. */
function resetLine(m: Machine): void {
  resetVia(m.via);
  resetState(m.gpu);
  m.pending = []; m.sounds = [{ freq: 0, dur: 0 }];
  m.cpu.irq = false;
  resetCpu(m.cpu, m.bus);
  m.frameCycles = 0;
  copyVideo(m.picture, m.gpu.v);
}

export function powerOn(m: Machine): void {
  m.power = true;
  m.ram.fill(0);
  m.cpu = createCpu();
  m.frame = 0; m.romWrites = 0; m.bytesSent = 0; m.lastBus = 0xFF; m.log = [];
  resetLine(m);
}

export function powerOff(m: Machine): void {
  m.power = false;
  m.ram.fill(0);
  resetVia(m.via);
  resetState(m.gpu);
  copyVideo(m.picture, m.gpu.v);
  m.pending = []; m.sounds = [{ freq: 0, dur: 0 }];
  m.cpu = createCpu();
  m.cpu.stopped = true;
}

/** The reset button. */
export function reset(m: Machine): void {
  if (m.power) resetLine(m);
}

/* Cartridges go in and out with the power off. */
export function insertCart(m: Machine, cart: Cart): void { m.cart = cart; }
export function removeCart(m: Machine): Cart | null { const c = m.cart; m.cart = null; return c; }

export function setButtons(m: Machine, pressed: number): void {
  m.buttons = pressed & 0x7F;
  m.via.portA = ~m.buttons & 0xFF;      // active low; bit 7 has no button and reads 1
}

/** One CPU instruction. Returns its cycles. Crossing the frame boundary starts the next frame. */
export function stepInstruction(m: Machine): number {
  if (!m.power) return 0;
  m.cpu.irq = viaIrq(m.via);
  const n = step(m.cpu, m.bus);
  m.frameCycles += n;
  if (m.frameCycles >= CYCLES_PER_FRAME) {
    m.frameCycles -= CYCLES_PER_FRAME;
    startFrame(m);
  }
  return n;
}

/** Run to the start of the next frame. m.picture is then the frame to show. */
export function runFrame(m: Machine): void {
  if (!m.power) return;
  const f = m.frame;
  while (m.frame === f) stepInstruction(m);
}

export function runFrames(m: Machine, n: number): void {
  for (let i = 0; i < n; i++) runFrame(m);
}
