/*
 * The renderer. RAMPLAY_SPEC.md section 6.2. Back to front: background,
 * sprites (31 first, so 0 ends on top), text.
 * SPDX-License-Identifier: MIT
 */
#include "rpl.h"

#include "rpl_font.h"

/* Color index 0..15 of one pixel of a tile, after the flips of attr. */
static inline uint8_t tile_pixel(const uint8_t *tile, int px, int py, uint8_t attr)
{
    if (attr & RPL_ATTR_HFLIP) px = 7 - px;
    if (attr & RPL_ATTR_VFLIP) py = 7 - py;
    uint8_t b = tile[py * 4 + (px >> 1)];
    return (px & 1) ? (b & 0x0F) : (b >> 4);
}

void rpl_render_line(const rpl_video *v, int y, uint16_t *out)
{
    /* Background. The map is 256 px each way, so the scroll wraps in a byte. */
    int wy = (y + v->scroll_y) & 0xFF;
    int row = (wy >> 3) * RPL_MAP_W;
    for (int x = 0; x < RPL_SCREEN_W; x++) {
        int wx = (x + v->scroll_x) & 0xFF;
        int cell = row + (wx >> 3);
        uint8_t attr = v->bg_attr[cell];
        uint8_t c = tile_pixel(v->tiles[v->bg_tile[cell]], wx & 7, wy & 7, attr);
        out[x] = v->pal[attr & RPL_ATTR_PAL][c];
    }

    /* Sprites. */
    for (int i = RPL_SPRITES - 1; i >= 0; i--) {
        const rpl_sprite *sp = &v->spr[i];
        if (!(sp->attr & RPL_ATTR_VISIBLE)) continue;
        if (sp->x >= RPL_SCREEN_W || sp->y >= RPL_SCREEN_H) continue;
        int py = y - sp->y;
        if (py < 0 || py > 7) continue;
        const uint8_t *tile = v->tiles[sp->tile];
        const uint16_t *pal = v->pal[sp->attr & RPL_ATTR_PAL];
        for (int px = 0; px < 8; px++) {
            int x = sp->x + px;
            if (x >= RPL_SCREEN_W) break;
            uint8_t c = tile_pixel(tile, px, py, sp->attr);
            if (c) out[x] = pal[c];
        }
    }

    /* Text. */
    int trow = (y >> 3) * RPL_TEXT_W;
    for (int col = 0; col < RPL_TEXT_W; col++) {
        uint8_t ch = v->text_ch[trow + col];
        if (ch <= RPL_FONT_FIRST || ch > RPL_FONT_LAST) continue;
        uint8_t bits = rpl_font[ch - RPL_FONT_FIRST][y & 7];
        if (!bits) continue;
        uint16_t color = v->pal[v->text_pal[trow + col] & 3][RPL_TEXT_COLOR];
        for (int px = 0; px < 8; px++)
            if (bits & (0x80 >> px)) out[col * 8 + px] = color;
    }
}

void rpl_render_frame(const rpl_video *v, uint16_t *out)
{
    for (int y = 0; y < RPL_SCREEN_H; y++)
        rpl_render_line(v, y, out + y * RPL_SCREEN_W);
}
