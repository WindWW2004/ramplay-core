; catch.s  -  catch the falling item. The game of NES v1 and v2, on RamPlay.
; SPDX-License-Identifier: MIT
;
; The rules are the v2 rules (Farmingdale-115-lab, public/115/nes/v2/rom/catch.asm):
; Start begins. Left and Right move the bowl. The item falls; Down makes it
; fall faster. Catch it and the score goes up. Miss one and the game is over.
;
; What changed from v2:
;   screen   20 x 16 cells of 8 x 8 pixels instead of 16 x 16 dots. The item
;            and the bowl are sprites, so the game sends positions, not cells.
;   CPU      a real W65C02S: X and Y registers, a stack, JSR and RTS.
;   timing   30 frames a second instead of 60, so every count is halved: the
;            bowl moves every 2 frames, the item falls every 8 (every 2 with Down).
;   score    kept in decimal (BCD) with SED, and printed as text.
;   best     the cartridge has no SRAM. BEST is in console RAM, so it lives
;            through Reset but not through power off. VALID marks it, as in v2.

        .include "ramplay.inc"
        RPL_HEADER "CATCH"

T_ITEM   = 1
T_BOWL   = 2            ; the left end; the right end is the same tile flipped
T_BOWL_M = 3
T_STAR   = 4

COLS     = 20
BOWL_MAX = COLS - 3     ; the bowl covers BOWL to BOWL+2
BOWL_Y   = 120          ; row 15
LAST_ROW = 15
VIS      = RPL_ATTR_VISIBLE

        .segment "ZEROPAGE"
bowl:   .res 1          ; bowl column, 0 to 17
tick:   .res 1          ; frame counter
score:  .res 1          ; BCD, 00 to 99
rand:   .res 1          ; random byte (LFSR)
itemx:  .res 1          ; item column, 0 to 19
itemy:  .res 1          ; item row, 1 to 15
px:     .res 1          ; scratch: a position in pixels
py:     .res 1

        .segment "BSS"
best:   .res 1          ; best score, BCD
valid:  .res 1          ; $A5 once BEST holds a real score

        .segment "CODE"
reset:  ldx #$FF
        txs
        cld
        jsr rpl_init
        jsr rpl_clear

        rpl_point tile_item
        lda #T_ITEM
        jsr rpl_deftile
        rpl_point tile_bowl
        lda #T_BOWL
        jsr rpl_deftile
        rpl_point tile_bowl_m
        lda #T_BOWL_M
        jsr rpl_deftile
        rpl_point tile_star
        lda #T_STAR
        jsr rpl_deftile

; ---- the sky: rows 1 to 15 of the map, one BGROW command per row
        ldx #1
@row:   rpl_cmd #RPL_BGROW, #0
        stx RPL_VIA_ORB
        rpl_cmd #COLS
        ldy #COLS
        lda #T_STAR
@cell:  sta RPL_VIA_ORB
        dey
        bne @cell
        inx
        cpx #LAST_ROW + 1
        bne @row

; ---- RAM is not cleared by Reset, so a best score may still be there
        lda valid
        cmp #$A5
        beq @kept
        stz best
        lda #$A5
        sta valid
@kept:
        stz score
        stz tick
        lda #8
        sta bowl
        sta itemx
        lda #6
        sta itemy

; ---- title
        jsr show_score
        rpl_print 7, 4, 0, s_title
        rpl_print 4, 9, 0, s_start
        jsr draw

; ---- wait for Start. How long the player waits mixes the random byte.
wait_start:
        jsr rpl_wait_vblank
        inc rand
        lda rpl_buttons
        and #RPL_BTN_START
        beq wait_start

        jsr rpl_clrtxt
        stz score
        stz tick
        lda #8
        sta bowl
        jsr show_score
        rpl_cmd #RPL_SOUND, #<440, #>440, #5

; ---- a new item at the top, in a random column
spawn:  lda rand                ; 8-bit Galois LFSR
        asl a                   ; C = old bit 7
        bcc @mix
        eor #$1D
@mix:   eor tick                ; the frame counter adds the player's timing
        sta rand
        and #$1F                ; 0 to 31
        cmp #COLS
        bcc @col
        sbc #COLS               ; 20 to 31 become 0 to 11
@col:   sta itemx
        lda #1
        sta itemy

show:   jsr draw

; ---- the bowl moves every 2 frames; the item falls every 8, or every 2 while Down is held
loop:   jsr rpl_wait_vblank
        inc tick
        lda tick
        and #$01
        bne loop

        lda rpl_buttons
        and #RPL_BTN_LEFT
        beq @noleft
        lda bowl
        beq @noleft             ; already at column 0
        dec bowl
@noleft:
        lda rpl_buttons
        and #RPL_BTN_RIGHT
        beq @noright
        lda bowl
        cmp #BOWL_MAX
        bcs @noright            ; already at the last column
        inc bowl
@noright:
        lda rpl_buttons
        and #RPL_BTN_DOWN       ; Down held: fall now
        bne fall
        lda tick
        and #$07                ; otherwise only every 8th frame
        bne show

; ---- the item falls one row
fall:   inc itemy
        lda itemy
        cmp #LAST_ROW
        bcc show                ; still above the bowl's row

        lda itemx               ; row 15: is the bowl under it?
        sec
        sbc bowl                ; 0, 1 or 2 when it is
        cmp #3
        bcs over

; ---- caught
        lda score
        cmp #$99
        beq @full
        sed                     ; decimal mode: $09 + 1 = $10
        clc
        adc #1
        cld
        sta score
@full:  jsr show_score
        rpl_cmd #RPL_SOUND, #<880, #>880, #4
        jmp spawn

; ---- missed: game over. Keep the best score.
over:   lda score
        cmp best
        bcc @done               ; SCORE < BEST
        sta best
@done:  jsr draw
        jsr show_score
        rpl_print 5, 6, 0, s_over
        rpl_print 4, 9, 0, s_start
        rpl_cmd #RPL_SOUND, #<110, #>110, #40
        jmp wait_start

; ---- the item is sprite 0, the bowl is sprites 1 to 3
draw:   lda itemx
        asl a
        asl a
        asl a                   ; column * 8
        sta px
        lda itemy
        asl a
        asl a
        asl a
        sta py
        rpl_cmd #RPL_SETSPR, #0, px, py, #T_ITEM, #VIS
        lda bowl
        asl a
        asl a
        asl a
        sta px
        rpl_cmd #RPL_SETSPR, #1, px, #BOWL_Y, #T_BOWL, #VIS
        jsr @next
        rpl_cmd #RPL_SETSPR, #2, px, #BOWL_Y, #T_BOWL_M, #VIS
        jsr @next
        rpl_cmd #RPL_SETSPR, #3, px, #BOWL_Y, #T_BOWL, #(VIS | RPL_ATTR_HFLIP)
        rts
@next:  clc
        lda px
        adc #8
        sta px
        rts

; ---- row 0: SCORE nn   BEST nn
show_score:
        rpl_print 0, 0, 0, s_score
        rpl_cmd #RPL_TEXT, #6, #0, #0
        lda score
        jsr send_bcd
        rpl_cmd #0
        rpl_print 11, 0, 0, s_best
        rpl_cmd #RPL_TEXT, #16, #0, #0
        lda best
        jsr send_bcd
        rpl_cmd #0
        rts

; Send the BCD byte in A as two characters.
send_bcd:
        pha
        lsr a
        lsr a
        lsr a
        lsr a
        ora #'0'
        sta RPL_VIA_ORB
        pla
        and #$0F
        ora #'0'
        sta RPL_VIA_ORB
        rts

        .segment "RODATA"
s_title: .byte "CATCH", 0
s_start: .byte "PRESS START", 0
s_over:  .byte "GAME OVER", 0
s_score: .byte "SCORE", 0
s_best:  .byte "BEST", 0

; Tiles: 8 rows of 4 bytes, two pixels a byte, the high nibble on the left.
; Colors are indexes into the default palette: 7 yellow, 8 orange, F white,
; 3 sky, 2 blue, 1 deep blue.
tile_item:
        .byte $00,$77,$77,$00
        .byte $07,$77,$77,$70
        .byte $77,$F7,$77,$77
        .byte $77,$77,$77,$77
        .byte $77,$77,$77,$88
        .byte $77,$77,$78,$88
        .byte $07,$78,$88,$80
        .byte $00,$88,$88,$00
tile_bowl:
        .byte $33,$00,$00,$00
        .byte $33,$00,$00,$00
        .byte $23,$30,$00,$00
        .byte $22,$33,$00,$00
        .byte $02,$23,$33,$33
        .byte $00,$22,$33,$33
        .byte $00,$02,$22,$22
        .byte $00,$00,$00,$00
tile_bowl_m:
        .byte $00,$00,$00,$00
        .byte $00,$00,$00,$00
        .byte $00,$00,$00,$00
        .byte $00,$00,$00,$00
        .byte $33,$33,$33,$33
        .byte $33,$33,$33,$33
        .byte $22,$22,$22,$22
        .byte $00,$00,$00,$00
tile_star:
        .byte $00,$00,$00,$00
        .byte $00,$00,$00,$00
        .byte $00,$01,$00,$00
        .byte $00,$00,$00,$00
        .byte $00,$00,$00,$00
        .byte $00,$00,$00,$00
        .byte $00,$00,$00,$10
        .byte $00,$00,$00,$00

        .segment "VECTORS"
        .word reset, reset, reset
