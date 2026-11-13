; pong.s  -  one player against the console. First to 5.
; SPDX-License-Identifier: MIT
;
; Up and Down move the left paddle. The ball leaves a paddle faster up or down
; when it hits near the paddle's end. Start begins a game.

        .include "ramplay.inc"
        RPL_HEADER "PONG"

T_PAD  = 1
T_BALL = 2
T_NET  = 3
VIS    = RPL_ATTR_VISIBLE

PAD_MIN = 8             ; a paddle's top edge stays in 8 to 104
PAD_MAX = 104           ; (24 pixels tall, row 0 is the score)
P1_X    = 8
P2_X    = 144
BALL_TOP = 8
BALL_BOT = 120
WIN     = 5

        .segment "ZEROPAGE"
p1y:    .res 1          ; the two paddles, top edge. p2y must follow p1y.
p2y:    .res 1
bx:     .res 1          ; the ball, top left
by:     .res 1
vx:     .res 1          ; 0 left, 1 right. The ball moves 2 pixels a frame sideways
vy:     .res 1          ; 0 up, 1 down
vspd:   .res 1          ; 1 or 2 pixels a frame up or down
s1:     .res 1          ; scores
s2:     .res 1
tick:   .res 1
hold:   .res 1          ; frames the ball waits before a serve
tmp:    .res 1
cnt:    .res 1

        .segment "CODE"
reset:  ldx #$FF
        txs
        cld
        jsr rpl_init
        jsr rpl_clear

        rpl_point tile_pad
        lda #T_PAD
        jsr rpl_deftile
        rpl_point tile_ball
        lda #T_BALL
        jsr rpl_deftile
        rpl_point tile_net
        lda #T_NET
        jsr rpl_deftile

        ldx #1                  ; the net: column 9, rows 1 to 15
@net:   rpl_cmd #RPL_SETBG, #9
        stx RPL_VIA_ORB
        rpl_cmd #T_NET, #0
        inx
        cpx #16
        bne @net

        stz s1
        stz s2
        jsr center
        jsr draw
        jsr show_score
        rpl_print 4, 6, 0, s_start

wait_start:
        jsr rpl_wait_vblank
        inc tick
        and #RPL_BTN_START
        beq wait_start

        jsr rpl_clrtxt
        stz s1
        stz s2
        jsr show_score
        jsr center
        lda #1
        sta vx

; ---- one frame
loop:   jsr rpl_wait_vblank
        inc tick

        ; the player
        lda rpl_buttons
        and #RPL_BTN_UP
        beq @noup
        lda p1y
        cmp #PAD_MIN + 2
        bcc @noup
        sbc #2                  ; carry is set
        sta p1y
@noup:  lda rpl_buttons
        and #RPL_BTN_DOWN
        beq @nodown
        lda p1y
        cmp #PAD_MAX - 1
        bcs @nodown
        adc #2                  ; carry is clear
        sta p1y
@nodown:

        ; the console: follows the ball when it comes its way, 3 frames out of 4
        lda vx
        beq @noai
        lda tick
        and #$03
        beq @noai
        lda p2y
        clc
        adc #8                  ; the paddle's middle, against the ball's
        cmp by
        beq @noai
        bcc @aidown
        lda p2y
        cmp #PAD_MIN + 1
        bcc @noai
        dec p2y
        bra @noai
@aidown:
        lda p2y
        cmp #PAD_MAX
        bcs @noai
        inc p2y
@noai:

        lda hold                ; the ball waits a second before a serve
        beq move
        dec hold
        jmp show

; ---- the ball, sideways
move:   lda vx
        beq @left

        lda bx
        clc
        adc #2
        sta bx
        cmp #P2_X - 8           ; its right edge has reached the paddle's face
        bcc vert
        cmp #P2_X
        bcs @rout
        ldx #1
        jsr hit
        bcc vert
        stz vx
        jsr beep_pad
        bra vert
@rout:  cmp #152
        bcc vert
        inc s1                  ; past the right paddle
        lda #0
        jmp point

@left:  lda bx
        sec
        sbc #2
        sta bx
        cmp #P1_X + 9
        bcs vert
        cmp #P1_X + 1
        bcc @lout
        ldx #0
        jsr hit
        bcc vert
        lda #1
        sta vx
        jsr beep_pad
        bra vert
@lout:  cmp #2
        bcs vert
        inc s2                  ; past the left paddle
        lda #1
        jmp point

; ---- the ball, up and down
vert:   lda vy
        beq @up
        lda by
        clc
        adc vspd
        cmp #BALL_BOT
        bcc @set
        lda #BALL_BOT
        stz vy
        jsr beep_wall
        lda #BALL_BOT
        bra @set
@up:    lda by
        sec
        sbc vspd
        cmp #BALL_TOP
        bcs @set
        lda #1
        sta vy
        jsr beep_wall
        lda #BALL_TOP
@set:   sta by

show:   jsr draw
        jmp loop

; ---- a point. A = the direction of the next serve (toward whoever lost it).
point:  sta vx
        jsr show_score
        rpl_cmd #RPL_SOUND, #<165, #>165, #25
        lda s1
        cmp #WIN
        beq @won
        lda s2
        cmp #WIN
        beq @lost
        jsr center
        jmp show
@won:   rpl_print 6, 5, 0, s_win
        bra @end
@lost:  rpl_print 5, 5, 0, s_lose
@end:   rpl_print 4, 8, 0, s_start
        jsr center
        lda #160                ; the ball leaves the screen
        sta bx
        jsr draw
        jmp wait_start

; ---- ball and paddles back to the middle
center: lda #56
        sta p1y
        sta p2y
        lda #76
        sta bx
        lda #60
        sta by
        lda #1
        sta vspd
        lda tick                ; up or down: whatever the frame counter says
        and #$01
        sta vy
        lda #30
        sta hold
        rts

; ---- is the ball on paddle X (0 left, 1 right)? C set if so, and the ball's
; up and down speed is set from where it hit.
hit:    lda by
        clc
        adc #7
        cmp p1y,x
        bcc @miss               ; the ball's bottom is above the paddle
        lda p1y,x
        clc
        adc #23
        cmp by
        bcc @miss               ; the paddle's bottom is above the ball
        lda by
        clc
        adc #4
        sec
        sbc p1y,x               ; where the ball's middle is on the paddle, 0 to 23
        bcc @top
        cmp #8
        bcc @top
        cmp #16
        bcc @mid
        lda #1                  ; the bottom third: down, fast
        sta vy
        lda #2
        sta vspd
        sec
        rts
@top:   stz vy                  ; the top third: up, fast
        lda #2
        sta vspd
        sec
        rts
@mid:   lda #1                  ; the middle: same way, slow
        sta vspd
        sec
        rts
@miss:  clc
        rts

beep_pad:
        rpl_cmd #RPL_SOUND, #<660, #>660, #3
        rts
beep_wall:
        rpl_cmd #RPL_SOUND, #<330, #>330, #2
        rts

; ---- sprites 0-2 left paddle, 3-5 right paddle, 6 the ball
draw:   ldx #0
        ldy #P1_X
        lda p1y
        jsr @pad
        ldy #P2_X
        lda p2y
        jsr @pad
        rpl_cmd #RPL_SETSPR, #6, bx, by, #T_BALL, #VIS
        rts
@pad:   sta tmp                 ; A = top edge, Y = x, X = first sprite
        lda #3
        sta cnt
@part:  lda #RPL_SETSPR
        sta RPL_VIA_ORB
        stx RPL_VIA_ORB
        sty RPL_VIA_ORB
        rpl_cmd tmp, #T_PAD, #VIS
        lda tmp
        clc
        adc #8
        sta tmp
        inx
        dec cnt
        bne @part
        rts

; ---- the two scores on row 0
show_score:
        rpl_cmd #RPL_TEXT, #6, #0, #0
        lda s1
        ora #'0'
        sta RPL_VIA_ORB
        rpl_cmd #0, #RPL_TEXT, #13, #0, #0
        lda s2
        ora #'0'
        sta RPL_VIA_ORB
        rpl_cmd #0
        rts

        .segment "RODATA"
s_start: .byte "PRESS START", 0
s_win:   .byte "YOU WIN", 0
s_lose:  .byte "YOU LOSE", 0

tile_pad:
        .byte $EF,$FF,$FF,$FE
        .byte $EF,$FF,$FF,$FE
        .byte $EF,$FF,$FF,$FE
        .byte $EF,$FF,$FF,$FE
        .byte $EF,$FF,$FF,$FE
        .byte $EF,$FF,$FF,$FE
        .byte $EF,$FF,$FF,$FE
        .byte $EF,$FF,$FF,$FE
tile_ball:
        .byte $00,$77,$77,$00
        .byte $07,$77,$77,$70
        .byte $77,$77,$77,$77
        .byte $77,$77,$77,$77
        .byte $77,$77,$77,$77
        .byte $77,$77,$77,$77
        .byte $07,$77,$77,$70
        .byte $00,$77,$77,$00
tile_net:
        .byte $00,$00,$00,$0E
        .byte $00,$00,$00,$0E
        .byte $00,$00,$00,$0E
        .byte $00,$00,$00,$0E
        .byte $00,$00,$00,$00
        .byte $00,$00,$00,$00
        .byte $00,$00,$00,$00
        .byte $00,$00,$00,$00

        .segment "VECTORS"
        .word reset, reset, reset
