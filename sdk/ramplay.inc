; ramplay.inc  -  RamPlay SDK for ca65. RAMPLAY_SPEC.md sections 3 to 6 and 10.
; SPDX-License-Identifier: MIT
;
;       .include "ramplay.inc"
;       RPL_HEADER "MY GAME"
;
; Link with sdk/rpl_rt.s and sdk/ramplay.cfg.

.ifndef RPL_INC
RPL_INC = 1

; ---- VIA (W65C22S) at $6000
RPL_VIA_ORB  = $6000    ; write: one byte to the display/sound stream
RPL_VIA_ORA  = $6001    ; read: buttons, pressed = 0. Reading clears the VBLANK flag
RPL_VIA_DDRB = $6002
RPL_VIA_DDRA = $6003
RPL_VIA_PCR  = $600C
RPL_VIA_IFR  = $600D
RPL_VIA_IER  = $600E
RPL_IFR_VBLANK = $02    ; IFR bit 1 = CA1

; ---- buttons, after the SDK inverts them (pressed = 1)
RPL_BTN_UP    = $01
RPL_BTN_DOWN  = $02
RPL_BTN_LEFT  = $04
RPL_BTN_RIGHT = $08
RPL_BTN_A     = $10
RPL_BTN_B     = $20
RPL_BTN_START = $40

; ---- display/sound opcodes
RPL_NOP     = $00
RPL_DEFTILE = $01       ; id, 32 bytes
RPL_SETBG   = $02       ; x, y, tile, attr
RPL_SETSPR  = $03       ; id, x, y, tile, attr
RPL_SETPAL  = $04       ; pal, 16 colors RGB565 low byte first
RPL_SCROLL  = $05       ; sx, sy
RPL_SOUND   = $06       ; freq low, freq high, duration in 10 ms
RPL_TEXT    = $07       ; x, y, pal, characters, 0
RPL_CLEAR   = $08
RPL_BGROW   = $09       ; x, y, n, n tiles
RPL_CLRTXT  = $0A
RPL_RESYNC  = $FF

; ---- attribute byte
RPL_ATTR_HFLIP   = $04
RPL_ATTR_VFLIP   = $08
RPL_ATTR_VISIBLE = $80  ; sprites only

RPL_SCREEN_W = 160
RPL_SCREEN_H = 128

; ---- the runtime, sdk/rpl_rt.s
.global rpl_init, rpl_send, rpl_wait_vblank, rpl_read_buttons
.global rpl_clear, rpl_clrtxt, rpl_send_str, rpl_send_n, rpl_deftile, rpl_setpal
.globalzp rpl_ptr, rpl_buttons

; ---- the cartridge header at $FF00: zero signature, "RPL1", version 1, title
.macro RPL_HEADER title
        .assert .strlen(title) <= 16, error, "RPL_HEADER: the title is 16 characters at most"
        .pushseg
        .segment "HEADER"
        .res 64, $00
        .byte "RPL1", 1
        .byte title
        .res 16 - .strlen(title), $20
        .popseg
.endmacro

; ---- the cartridge draws its own label: header byte $FF55 = $01 (spec sections
; 8.2 and 11). Use it right after RPL_HEADER. The game must then, when Left and
; Right are both held at power-on, draw the label into background cells
; x 0..21, y 0..24 with scroll 0,0, no sprites and no text, and idle.
.macro RPL_LABEL
        .pushseg
        .segment "HEADER"
        .byte $01
        .popseg
.endmacro

; ---- send up to 8 bytes. Each argument is an lda operand: #constant or a variable.
;       rpl_cmd #RPL_SETSPR, #0, ball_x, ball_y, #2, #RPL_ATTR_VISIBLE
; Changes A.
.macro rpl_cmd b0, b1, b2, b3, b4, b5, b6, b7
    .ifnblank b0
        lda b0
        sta RPL_VIA_ORB
        rpl_cmd b1, b2, b3, b4, b5, b6, b7
    .endif
.endmacro

; ---- TEXT at column col, row row, palette pal, from a zero-terminated string.
; Changes A, Y and rpl_ptr.
.macro rpl_print col, row, pal, string
        rpl_cmd #RPL_TEXT, #(col), #(row), #(pal)
        lda #<(string)
        sta rpl_ptr
        lda #>(string)
        sta rpl_ptr+1
        jsr rpl_send_str
.endmacro

; ---- point rpl_ptr at a label. Changes A.
.macro rpl_point label
        lda #<(label)
        sta rpl_ptr
        lda #>(label)
        sta rpl_ptr+1
.endmacro

.endif
