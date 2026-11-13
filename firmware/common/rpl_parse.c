/*
 * The command parser. RAMPLAY_SPEC.md section 6.3.
 * SPDX-License-Identifier: MIT
 */
#include "rpl.h"

#include <string.h>

#include "default_palette.h"

static void do_clear(rpl_video *v)
{
    memset(v->bg_tile, 0, sizeof v->bg_tile);
    memset(v->bg_attr, 0, sizeof v->bg_attr);
    memset(v->spr, 0, sizeof v->spr);
    memset(v->text_ch, 0x20, sizeof v->text_ch);
    memset(v->text_pal, 0, sizeof v->text_pal);
    v->scroll_x = 0;
    v->scroll_y = 0;
}

void rpl_reset(rpl_state *s)
{
    memset(s, 0, sizeof *s);
    for (int p = 0; p < RPL_PALETTES; p++)
        memcpy(s->v.pal[p], rpl_default_palette, sizeof rpl_default_palette);
    do_clear(&s->v);
}

int rpl_parser_busy(const rpl_state *s)
{
    return s->phase != RPL_PH_OPCODE;
}

/* How many fixed argument bytes follow each opcode. */
static uint8_t fixed_args(uint8_t op)
{
    switch (op) {
    case RPL_DEFTILE: return 33;
    case RPL_SETBG:   return 4;
    case RPL_SETSPR:  return 5;
    case RPL_SETPAL:  return 33;
    case RPL_SCROLL:  return 2;
    case RPL_SOUND:   return 3;
    case RPL_TEXT:    return 3;
    case RPL_BGROW:   return 3;
    default:          return 0;
    }
}

/* All fixed arguments are in s->args. */
static void run(rpl_state *s)
{
    rpl_video *v = &s->v;
    const uint8_t *a = s->args;

    s->phase = RPL_PH_OPCODE;
    switch (s->op) {
    case RPL_DEFTILE:
        memcpy(v->tiles[a[0]], a + 1, RPL_TILE_BYTES);
        break;
    case RPL_SETBG: {
        int i = (a[1] & 31) * RPL_MAP_W + (a[0] & 31);
        v->bg_tile[i] = a[2];
        v->bg_attr[i] = a[3];
        break;
    }
    case RPL_SETSPR: {
        rpl_sprite *sp = &v->spr[a[0] & 31];
        sp->x = a[1];
        sp->y = a[2];
        sp->tile = a[3];
        sp->attr = a[4];
        break;
    }
    case RPL_SETPAL: {
        uint16_t *p = v->pal[a[0] & 3];
        for (int i = 0; i < 16; i++)
            p[i] = (uint16_t)(a[1 + 2 * i] | (a[2 + 2 * i] << 8));
        break;
    }
    case RPL_SCROLL:
        v->scroll_x = a[0];
        v->scroll_y = a[1];
        break;
    case RPL_SOUND:
        v->sound_freq = (uint16_t)(a[0] | (a[1] << 8));
        v->sound_dur = a[2];
        v->sound_seq++;
        break;
    case RPL_TEXT:
        s->cx = a[0];
        s->cy = a[1];
        s->cpal = a[2] & 3;
        s->cok = a[0] < RPL_TEXT_W && a[1] < RPL_TEXT_H;
        s->phase = RPL_PH_TEXT;
        break;
    case RPL_BGROW:
        s->cx = a[0] & 31;
        s->cy = a[1] & 31;
        s->left = a[2];
        s->stored = 0;
        if (s->left)
            s->phase = RPL_PH_BGROW;
        break;
    default:
        break;
    }
}

void rpl_parse_byte(rpl_state *s, uint8_t b)
{
    rpl_video *v = &s->v;

    switch (s->phase) {
    case RPL_PH_OPCODE:
        if (b == RPL_CLEAR) {
            do_clear(v);
        } else if (b == RPL_CLRTXT) {
            memset(v->text_ch, 0x20, sizeof v->text_ch);
            memset(v->text_pal, 0, sizeof v->text_pal);
        } else if (fixed_args(b)) {
            s->op = b;
            s->need = fixed_args(b);
            s->have = 0;
            s->phase = RPL_PH_ARGS;
        }
        /* NOP, RESYNC and unknown opcodes: nothing, still expecting an opcode. */
        break;

    case RPL_PH_ARGS:
        s->args[s->have++] = b;
        if (s->have == s->need)
            run(s);
        break;

    case RPL_PH_TEXT:
        if (b == 0) {
            s->phase = RPL_PH_OPCODE;
        } else if (s->cok && s->cx < RPL_TEXT_W) {
            int i = s->cy * RPL_TEXT_W + s->cx;
            v->text_ch[i] = (b >= 0x20 && b <= 0x7E) ? b : 0x20;
            v->text_pal[i] = s->cpal;
            s->cx++;
        }
        break;

    case RPL_PH_BGROW:
        if (s->stored < RPL_MAP_W) {
            int i = s->cy * RPL_MAP_W + s->cx;
            v->bg_tile[i] = b;
            v->bg_attr[i] = 0;
            s->cx = (s->cx + 1) & 31;
            s->stored++;
        }
        if (--s->left == 0)
            s->phase = RPL_PH_OPCODE;
        break;

    default:
        s->phase = RPL_PH_OPCODE;
        break;
    }
}
