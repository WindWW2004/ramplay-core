/*
 * Unit tests for the parser and the renderer. Built and run by `make test`.
 * SPDX-License-Identifier: MIT
 */
#include <stdio.h>
#include <string.h>

#include "../default_palette.h"
#include "../rpl.h"

static int failed, checks;
static rpl_state s;
static uint16_t frame[RPL_SCREEN_W * RPL_SCREEN_H];

#define CHECK(cond) \
    do { \
        checks++; \
        if (!(cond)) { failed++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } \
    } while (0)

static void feed(const uint8_t *p, int n)
{
    for (int i = 0; i < n; i++) rpl_parse_byte(&s, p[i]);
}
#define FEED(...) \
    do { const uint8_t b_[] = {__VA_ARGS__}; feed(b_, (int)sizeof b_); } while (0)

static uint16_t px(int x, int y)
{
    rpl_render_frame(&s.v, frame);
    return frame[y * RPL_SCREEN_W + x];
}

/* Tile `id` filled with one color index. */
static void solid(uint8_t id, uint8_t c)
{
    FEED(RPL_DEFTILE, id);
    for (int i = 0; i < 32; i++) rpl_parse_byte(&s, (uint8_t)(c << 4 | c));
}

static void test_reset(void)
{
    rpl_reset(&s);
    CHECK(!rpl_parser_busy(&s));
    CHECK(s.v.pal[0][15] == rpl_default_palette[15]);
    CHECK(memcmp(s.v.pal[3], rpl_default_palette, sizeof rpl_default_palette) == 0);
    CHECK(s.v.text_ch[0] == 0x20 && s.v.text_ch[319] == 0x20);
    CHECK(px(0, 0) == rpl_default_palette[0]);
    CHECK(px(159, 127) == rpl_default_palette[0]);
}

static void test_deftile_setbg(void)
{
    rpl_reset(&s);
    FEED(RPL_DEFTILE, 7);
    CHECK(rpl_parser_busy(&s));
    for (int i = 0; i < 32; i++) rpl_parse_byte(&s, (uint8_t)i);
    CHECK(!rpl_parser_busy(&s));
    CHECK(s.v.tiles[7][0] == 0 && s.v.tiles[7][31] == 31);

    /* High nibble is the left pixel. */
    FEED(RPL_DEFTILE, 1, 0x12);
    for (int i = 0; i < 31; i++) rpl_parse_byte(&s, 0);
    FEED(RPL_SETBG, 2, 3, 1, 0);
    CHECK(px(16, 24) == rpl_default_palette[1]);
    CHECK(px(17, 24) == rpl_default_palette[2]);
    CHECK(px(18, 24) == rpl_default_palette[0]);
    /* hflip, vflip. */
    FEED(RPL_SETBG, 2, 3, 1, RPL_ATTR_HFLIP);
    CHECK(px(23, 24) == rpl_default_palette[1] && px(22, 24) == rpl_default_palette[2]);
    FEED(RPL_SETBG, 2, 3, 1, RPL_ATTR_VFLIP);
    CHECK(px(16, 31) == rpl_default_palette[1] && px(16, 24) == rpl_default_palette[0]);
    /* x and y are masked with 31. */
    FEED(RPL_SETBG, 32 + 5, 64 + 6, 9, 2);
    CHECK(s.v.bg_tile[6 * 32 + 5] == 9 && s.v.bg_attr[6 * 32 + 5] == 2);
}

static void test_palette(void)
{
    rpl_reset(&s);
    FEED(RPL_SETPAL, 4 + 1); /* masked to palette 1 */
    for (int i = 0; i < 16; i++) FEED((uint8_t)(i * 3), (uint8_t)(0x80 | i));
    CHECK(s.v.pal[1][0] == 0x8000);
    CHECK(s.v.pal[1][5] == (uint16_t)(0x8500 | 15));
    CHECK(s.v.pal[0][5] == rpl_default_palette[5]);
    solid(1, 5);
    FEED(RPL_SETBG, 0, 0, 1, 1);
    CHECK(px(0, 0) == (uint16_t)(0x8500 | 15));
}

static void test_sprites(void)
{
    rpl_reset(&s);
    solid(1, 9);
    solid(2, 6);
    /* Hidden until bit 7 is set. */
    FEED(RPL_SETSPR, 3, 10, 10, 1, 0);
    CHECK(px(10, 10) == rpl_default_palette[0]);
    FEED(RPL_SETSPR, 3, 10, 10, 1, RPL_ATTR_VISIBLE);
    CHECK(px(10, 10) == rpl_default_palette[9]);
    CHECK(px(17, 17) == rpl_default_palette[9]);
    CHECK(px(18, 17) == rpl_default_palette[0]);
    /* The lower index is on top. */
    FEED(RPL_SETSPR, 2, 14, 10, 2, RPL_ATTR_VISIBLE);
    CHECK(px(14, 10) == rpl_default_palette[6]);
    FEED(RPL_SETSPR, 4, 6, 10, 2, RPL_ATTR_VISIBLE);
    CHECK(px(10, 10) == rpl_default_palette[9]);
    CHECK(px(6, 10) == rpl_default_palette[6]);
    /* Index 0 is transparent: tile 0 is all zero. */
    FEED(RPL_SETSPR, 0, 10, 10, 0, RPL_ATTR_VISIBLE);
    CHECK(px(10, 10) == rpl_default_palette[9]);
    /* Clipped at the right edge, off-screen from 160 and 128. */
    FEED(RPL_SETSPR, 5, 156, 124, 1, RPL_ATTR_VISIBLE);
    CHECK(px(159, 127) == rpl_default_palette[9]);
    FEED(RPL_SETSPR, 5, 160, 0, 1, RPL_ATTR_VISIBLE);
    CHECK(px(159, 127) == rpl_default_palette[0] && px(0, 0) == rpl_default_palette[0]);
    FEED(RPL_SETSPR, 5, 0, 128, 1, RPL_ATTR_VISIBLE);
    CHECK(px(0, 0) == rpl_default_palette[0]);
    /* id is masked with 31. */
    FEED(RPL_SETSPR, 32 + 6, 1, 2, 3, 4);
    CHECK(s.v.spr[6].x == 1 && s.v.spr[6].y == 2 && s.v.spr[6].tile == 3 && s.v.spr[6].attr == 4);
}

static void test_scroll(void)
{
    rpl_reset(&s);
    solid(1, 7);
    FEED(RPL_SETBG, 31, 31, 1, 0); /* the last cell of the map */
    CHECK(px(0, 0) == rpl_default_palette[0]);
    FEED(RPL_SCROLL, 248, 248);
    CHECK(px(0, 0) == rpl_default_palette[7]);
    CHECK(px(7, 7) == rpl_default_palette[7]);
    CHECK(px(8, 8) == rpl_default_palette[0]);
    FEED(RPL_SCROLL, 252, 252); /* wraps: the cell is cut in half, map cell 0,0 follows */
    CHECK(px(3, 3) == rpl_default_palette[7]);
    CHECK(px(4, 4) == rpl_default_palette[0]);
}

static void test_text(void)
{
    rpl_reset(&s);
    FEED(RPL_TEXT, 18, 2, 5, 'A', 'B', 'C', 'D', 0); /* pal 5 -> 1; C and D fall off the row */
    CHECK(!rpl_parser_busy(&s));
    CHECK(s.v.text_ch[2 * 20 + 18] == 'A' && s.v.text_ch[2 * 20 + 19] == 'B');
    CHECK(s.v.text_pal[2 * 20 + 18] == 1);
    CHECK(s.v.text_ch[3 * 20] == 0x20);
    /* Off the layer: consumed, nothing stored. */
    FEED(RPL_TEXT, 20, 0, 0, 'X', 0, RPL_TEXT, 0, 16, 0, 'Y', 0);
    CHECK(!rpl_parser_busy(&s));
    for (int i = 0; i < 320; i++) CHECK(s.v.text_ch[i] != 'X' && s.v.text_ch[i] != 'Y');
    /* Outside $20-$7E is stored as a space. */
    FEED(RPL_TEXT, 0, 0, 0, 'Q', 0x7F, 0x08, 'R', 0);
    CHECK(s.v.text_ch[0] == 'Q' && s.v.text_ch[1] == 0x20 && s.v.text_ch[2] == 0x20 && s.v.text_ch[3] == 'R');
    /* Text is on top of sprites, in color 15, and does not scroll. */
    solid(1, 9);
    FEED(RPL_SETSPR, 0, 0, 8, 1, RPL_ATTR_VISIBLE, RPL_SCROLL, 3, 3);
    FEED(RPL_TEXT, 0, 1, 0, 'I', 0); /* I: row 0 is .###. in columns 1..5 */
    CHECK(px(2, 8) == rpl_default_palette[15]);
    CHECK(px(0, 8) == rpl_default_palette[9]);
    FEED(RPL_CLRTXT);
    CHECK(px(2, 8) == rpl_default_palette[9]);
    CHECK(s.v.text_ch[0] == 0x20);
}

static void test_bgrow(void)
{
    rpl_reset(&s);
    FEED(RPL_SETBG, 30, 4, 0, 3);
    FEED(RPL_BGROW, 30, 4, 4, 11, 12, 13, 14);
    CHECK(!rpl_parser_busy(&s));
    CHECK(s.v.bg_tile[4 * 32 + 30] == 11 && s.v.bg_tile[4 * 32 + 31] == 12);
    CHECK(s.v.bg_tile[4 * 32 + 0] == 13 && s.v.bg_tile[4 * 32 + 1] == 14); /* wraps in the row */
    CHECK(s.v.bg_attr[4 * 32 + 30] == 0);
    /* n = 0 takes nothing. */
    FEED(RPL_BGROW, 0, 0, 0);
    CHECK(!rpl_parser_busy(&s));
    /* n = 40: 40 bytes are consumed, 32 stored. */
    FEED(RPL_BGROW, 0, 9, 40);
    for (int i = 0; i < 40; i++) rpl_parse_byte(&s, (uint8_t)(100 + i));
    CHECK(!rpl_parser_busy(&s));
    CHECK(s.v.bg_tile[9 * 32] == 100 && s.v.bg_tile[9 * 32 + 31] == 131);
}

static void test_clear_and_misc(void)
{
    rpl_reset(&s);
    solid(1, 4);
    FEED(RPL_SETBG, 1, 1, 1, 1, RPL_SETSPR, 0, 5, 5, 1, RPL_ATTR_VISIBLE, RPL_SCROLL, 9, 9);
    FEED(RPL_TEXT, 0, 0, 0, 'Z', 0);
    FEED(RPL_CLEAR);
    CHECK(s.v.bg_tile[33] == 0 && s.v.bg_attr[33] == 0);
    CHECK(s.v.spr[0].attr == 0 && s.v.spr[0].x == 0);
    CHECK(s.v.text_ch[0] == 0x20 && s.v.scroll_x == 0 && s.v.scroll_y == 0);
    CHECK(s.v.tiles[1][0] == 0x44); /* CLEAR keeps tiles and palettes */

    /* NOP, RESYNC and unknown opcodes leave the parser idle and the state alone. */
    rpl_video before = s.v;
    FEED(RPL_NOP, RPL_RESYNC, 0x0B, 0x7E, 0xFE, RPL_NOP);
    CHECK(!rpl_parser_busy(&s));
    CHECK(memcmp(&before, &s.v, sizeof before) == 0);
    /* $FF inside an argument list is data. */
    FEED(RPL_SCROLL, 0xFF, 0xFF);
    CHECK(s.v.scroll_x == 0xFF && s.v.scroll_y == 0xFF && !rpl_parser_busy(&s));

    /* SOUND. */
    FEED(RPL_SOUND, 0xB8, 0x01, 20);
    CHECK(s.v.sound_freq == 440 && s.v.sound_dur == 20 && s.v.sound_seq == 1);
    FEED(RPL_SOUND, 0, 0, 0);
    CHECK(s.v.sound_dur == 0 && s.v.sound_seq == 2);
}

/* Any byte stream is safe: run a fixed pseudo-random one through the parser. */
static void test_garbage(void)
{
    rpl_reset(&s);
    uint32_t r = 0x52504C31u;
    for (int i = 0; i < 200000; i++) {
        r = r * 1664525u + 1013904223u;
        rpl_parse_byte(&s, (uint8_t)(r >> 24));
    }
    rpl_render_frame(&s.v, frame);
    CHECK(1);
}

int main(void)
{
    test_reset();
    test_deftile_setbg();
    test_palette();
    test_sprites();
    test_scroll();
    test_text();
    test_bgrow();
    test_clear_and_misc();
    test_garbage();
    printf("test_rpl: %d checks, %d failed\n", checks, failed);
    return failed ? 1 : 0;
}
