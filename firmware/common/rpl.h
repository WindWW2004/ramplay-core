/*
 * RamPlay display/sound protocol: the parser and the renderer.
 * RAMPLAY_SPEC.md section 6 is the contract. Portable C11, no Pico SDK.
 *
 * The Pico firmware and the host test build use this file. The web emulator
 * uses a line-by-line port (core/src/video/rpl.ts); tests/protocol
 * holds both to the same pixels.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef RPL_H
#define RPL_H

#include <stdint.h>

#define RPL_SCREEN_W 160
#define RPL_SCREEN_H 128
#define RPL_TILES 256
#define RPL_TILE_BYTES 32
#define RPL_PALETTES 4
#define RPL_MAP_W 32
#define RPL_MAP_H 32
#define RPL_SPRITES 32
#define RPL_TEXT_W 20
#define RPL_TEXT_H 16
#define RPL_TEXT_COLOR 15

/* Opcodes (section 6.3). */
#define RPL_NOP 0x00
#define RPL_DEFTILE 0x01
#define RPL_SETBG 0x02
#define RPL_SETSPR 0x03
#define RPL_SETPAL 0x04
#define RPL_SCROLL 0x05
#define RPL_SOUND 0x06
#define RPL_TEXT 0x07
#define RPL_CLEAR 0x08
#define RPL_BGROW 0x09
#define RPL_CLRTXT 0x0A
#define RPL_RESYNC 0xFF

/* Attribute byte. */
#define RPL_ATTR_PAL 0x03
#define RPL_ATTR_HFLIP 0x04
#define RPL_ATTR_VFLIP 0x08
#define RPL_ATTR_VISIBLE 0x80

typedef struct {
    uint8_t x, y, tile, attr;
} rpl_sprite;

/* Everything a frame is drawn from. Copy it to take the per-frame snapshot. */
typedef struct {
    uint8_t tiles[RPL_TILES][RPL_TILE_BYTES];
    uint16_t pal[RPL_PALETTES][16];
    uint8_t bg_tile[RPL_MAP_W * RPL_MAP_H];
    uint8_t bg_attr[RPL_MAP_W * RPL_MAP_H];
    rpl_sprite spr[RPL_SPRITES];
    uint8_t text_ch[RPL_TEXT_W * RPL_TEXT_H];
    uint8_t text_pal[RPL_TEXT_W * RPL_TEXT_H];
    uint8_t scroll_x, scroll_y;
    /* The last SOUND command. sound_seq counts them, so a host sees a new one. */
    uint16_t sound_freq;
    uint8_t sound_dur;
    uint32_t sound_seq;
} rpl_video;

enum { RPL_PH_OPCODE = 0, RPL_PH_ARGS, RPL_PH_TEXT, RPL_PH_BGROW };

typedef struct {
    rpl_video v;
    /* Parser. */
    uint8_t phase;
    uint8_t op;
    uint8_t need;     /* fixed argument bytes this opcode takes */
    uint8_t have;     /* argument bytes collected so far */
    uint8_t args[33];
    uint8_t cx, cy;   /* TEXT and BGROW: where the next byte goes */
    uint8_t cpal;     /* TEXT: palette */
    uint8_t cok;      /* TEXT: the start position was on the layer */
    uint16_t left;    /* BGROW: tile bytes still to come */
    uint16_t stored;  /* BGROW: cells stored so far */
} rpl_state;

/* Power-on state: tiles zero, default palettes, CLEAR state, parser at "expect opcode". */
void rpl_reset(rpl_state *s);

/* Feed one byte of the stream. Never fails. */
void rpl_parse_byte(rpl_state *s, uint8_t b);

/* 1 while the parser is inside a command, 0 when it expects an opcode. */
int rpl_parser_busy(const rpl_state *s);

/* One scanline, y in 0..127, RPL_SCREEN_W pixels of RGB565. */
void rpl_render_line(const rpl_video *v, int y, uint16_t *out);

/* The whole frame, RPL_SCREEN_W * RPL_SCREEN_H pixels of RGB565. */
void rpl_render_frame(const rpl_video *v, uint16_t *out);

#endif
