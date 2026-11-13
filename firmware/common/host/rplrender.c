/*
 * Host tool: feed a command stream to the parser and write the frame.
 *
 *   rplrender in.bin out.ppm
 *
 * The output is a binary PPM (P6), 160x128, RGB888. RGB565 is widened by
 * repeating the top bits (r << 3 | r >> 2), the same way the emulator does.
 * tests/protocol/run.py compares it with the expected PNG.
 *
 * SPDX-License-Identifier: MIT
 */
#include <stdio.h>
#include <stdlib.h>

#include "../rpl.h"

static rpl_state state;
static uint16_t frame[RPL_SCREEN_W * RPL_SCREEN_H];

int main(int argc, char **argv)
{
    if (argc != 3) {
        fprintf(stderr, "usage: rplrender in.bin out.ppm\n");
        return 2;
    }
    FILE *in = fopen(argv[1], "rb");
    if (!in) { perror(argv[1]); return 1; }
    rpl_reset(&state);
    int c;
    while ((c = fgetc(in)) != EOF)
        rpl_parse_byte(&state, (uint8_t)c);
    fclose(in);

    rpl_render_frame(&state.v, frame);

    FILE *out = fopen(argv[2], "wb");
    if (!out) { perror(argv[2]); return 1; }
    fprintf(out, "P6\n%d %d\n255\n", RPL_SCREEN_W, RPL_SCREEN_H);
    for (int i = 0; i < RPL_SCREEN_W * RPL_SCREEN_H; i++) {
        uint16_t p = frame[i];
        int r = p >> 11, g = (p >> 5) & 63, b = p & 31;
        fputc(r << 3 | r >> 2, out);
        fputc(g << 2 | g >> 4, out);
        fputc(b << 3 | b >> 2, out);
    }
    return fclose(out) ? 1 : 0;
}
