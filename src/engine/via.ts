/*
 * The W65C22S VIA, the subset RamPlay uses (RAMPLAY_SPEC.md section 3.1).
 *
 *   port B  out: one byte of the display stream. In CB2 pulse mode
 *           (PCR bits 7-5 = 101) every write to ORB strobes it to the Pico.
 *   port A  in: the buttons, pressed = 0, bit 7 reads 1.
 *   CA1     in: VBLANK from the Pico. It sets IFR bit 1; reading ORA clears it.
 *
 * Not modeled: the timers, the shift register, the latches. Their registers
 * keep what is written to them.
 *
 * SPDX-License-Identifier: MIT
 */

export const REG = { ORB: 0, ORA: 1, DDRB: 2, DDRA: 3, ACR: 11, PCR: 12, IFR: 13, IER: 14, ORA_NH: 15 } as const;
export const IFR_CA2 = 0x01, IFR_CA1 = 0x02, IFR_CB1 = 0x10, IFR_CB2 = 0x08;

export interface Via {
  reg: Uint8Array;        // the 16 registers as written
  ifr: number;            // interrupt flags, bits 0-6
  ier: number;            // interrupt enables, bits 0-6
  portA: number;          // the levels on the PA pins: buttons, pressed = 0
  strobes: number;        // bytes strobed out on CB2 since reset
  dropped: number;        // writes to ORB that did not strobe (PCR or DDRB not set up)
}

export function createVia(): Via {
  return { reg: new Uint8Array(16), ifr: 0, ier: 0, portA: 0xFF, strobes: 0, dropped: 0 };
}

/** RESB clears every register: all pins inputs, no interrupts. */
export function resetVia(v: Via): void {
  v.reg.fill(0); v.ifr = 0; v.ier = 0; v.strobes = 0; v.dropped = 0;
}

/** The IRQB output: low (true) while an enabled flag is set. */
export const viaIrq = (v: Via): boolean => (v.ifr & v.ier & 0x7F) !== 0;

/** The falling edge on CA1: the VBLANK pulse. */
export function viaVblank(v: Via): void {
  v.ifr |= IFR_CA1;
}

/** What is on port A: output bits from ORA, input bits from the pins. */
const pinsA = (v: Via): number => (v.reg[REG.ORA] & v.reg[REG.DDRA]) | (v.portA & ~v.reg[REG.DDRA] & 0xFF);

/** A read with no side effects, for the memory viewer. */
export function viaPeek(v: Via, r: number): number {
  switch (r & 15) {
    case REG.ORA: case REG.ORA_NH: return pinsA(v);
    case REG.IFR: return v.ifr | (viaIrq(v) ? 0x80 : 0);
    case REG.IER: return v.ier | 0x80;
    default: return v.reg[r & 15];
  }
}

export function viaRead(v: Via, r: number): number {
  const value = viaPeek(v, r);
  if ((r & 15) === REG.ORA) v.ifr &= ~(IFR_CA1 | IFR_CA2);
  if ((r & 15) === REG.ORB) v.ifr &= ~(IFR_CB1 | IFR_CB2);
  return value;
}

/** Returns the byte strobed to the display, or -1 if this write sent none. */
export function viaWrite(v: Via, r: number, value: number): number {
  r &= 15; value &= 0xFF;
  switch (r) {
    case REG.IFR: v.ifr &= ~value & 0x7F; return -1;                  // writing 1 clears a flag
    case REG.IER:
      if (value & 0x80) v.ier |= value & 0x7F; else v.ier &= ~value & 0x7F;
      return -1;
    case REG.ORA: v.reg[r] = value; v.ifr &= ~(IFR_CA1 | IFR_CA2); return -1;
    case REG.ORB: {
      v.reg[r] = value;
      v.ifr &= ~(IFR_CB1 | IFR_CB2);
      // CB2 pulses only in pulse output mode. Pins left as inputs float; the Pico sees them high.
      if ((v.reg[REG.PCR] & 0xE0) !== 0xA0) { v.dropped++; return -1; }
      v.strobes++;
      return (value & v.reg[REG.DDRB]) | (~v.reg[REG.DDRB] & 0xFF);
    }
    default: v.reg[r] = value; return -1;
  }
}
