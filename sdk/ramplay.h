/*
 * ramplay.h  -  RamPlay SDK for cc65 C. The C side of sdk/ramplay.inc.
 *
 * The constants are complete. The functions are the runtime routines of
 * sdk/rpl_rt.s that take at most one byte. A C startup file (crt0) is not
 * written yet (RAMPLAY_SPEC.md section 14), so today this header is for
 * C modules linked into an assembly game.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef RAMPLAY_H
#define RAMPLAY_H

#define RPL_VIA_ORB  (*(volatile unsigned char *)0x6000)
#define RPL_VIA_ORA  (*(volatile unsigned char *)0x6001)
#define RPL_VIA_DDRB (*(volatile unsigned char *)0x6002)
#define RPL_VIA_DDRA (*(volatile unsigned char *)0x6003)
#define RPL_VIA_PCR  (*(volatile unsigned char *)0x600C)
#define RPL_VIA_IFR  (*(volatile unsigned char *)0x600D)
#define RPL_VIA_IER  (*(volatile unsigned char *)0x600E)
#define RPL_IFR_VBLANK 0x02

#define RPL_BTN_UP    0x01
#define RPL_BTN_DOWN  0x02
#define RPL_BTN_LEFT  0x04
#define RPL_BTN_RIGHT 0x08
#define RPL_BTN_A     0x10
#define RPL_BTN_B     0x20
#define RPL_BTN_START 0x40

#define RPL_NOP     0x00
#define RPL_DEFTILE 0x01
#define RPL_SETBG   0x02
#define RPL_SETSPR  0x03
#define RPL_SETPAL  0x04
#define RPL_SCROLL  0x05
#define RPL_SOUND   0x06
#define RPL_TEXT    0x07
#define RPL_CLEAR   0x08
#define RPL_BGROW   0x09
#define RPL_CLRTXT  0x0A
#define RPL_RESYNC  0xFF

#define RPL_ATTR_HFLIP   0x04
#define RPL_ATTR_VFLIP   0x08
#define RPL_ATTR_VISIBLE 0x80

#define RPL_SCREEN_W 160
#define RPL_SCREEN_H 128

void rpl_init(void);
void __fastcall__ rpl_send(unsigned char b);
unsigned char rpl_wait_vblank(void);   /* returns the buttons, pressed = 1 */
unsigned char rpl_read_buttons(void);
void rpl_clear(void);
void rpl_clrtxt(void);

/* Inline, for the commands with several arguments. */
#define rpl_setbg(x, y, tile, attr) \
    (RPL_VIA_ORB = RPL_SETBG, RPL_VIA_ORB = (x), RPL_VIA_ORB = (y), RPL_VIA_ORB = (tile), RPL_VIA_ORB = (attr))
#define rpl_setspr(id, x, y, tile, attr) \
    (RPL_VIA_ORB = RPL_SETSPR, RPL_VIA_ORB = (id), RPL_VIA_ORB = (x), RPL_VIA_ORB = (y), \
     RPL_VIA_ORB = (tile), RPL_VIA_ORB = (attr))
#define rpl_scroll(sx, sy) (RPL_VIA_ORB = RPL_SCROLL, RPL_VIA_ORB = (sx), RPL_VIA_ORB = (sy))
#define rpl_sound(hz, dur) \
    (RPL_VIA_ORB = RPL_SOUND, RPL_VIA_ORB = (hz) & 0xFF, RPL_VIA_ORB = (hz) >> 8, RPL_VIA_ORB = (dur))

#endif
