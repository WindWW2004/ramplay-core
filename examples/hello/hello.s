; hello.s  -  the example of RAMPLAY_SPEC.md section 10.1
; SPDX-License-Identifier: MIT

        .include "ramplay.inc"
        RPL_HEADER "HELLO"

        .segment "CODE"
reset:  ldx #$FF
        txs
        jsr rpl_init
        lda #RPL_CLEAR
        jsr rpl_send
        ; TEXT at (4,7), palette 0, "HELLO RAMPLAY"
        lda #RPL_TEXT
        jsr rpl_send
        lda #4
        jsr rpl_send
        lda #7
        jsr rpl_send
        lda #0
        jsr rpl_send
        ldx #0
@loop:  lda msg,x
        jsr rpl_send
        beq @done          ; terminator $00 already sent
        inx
        bne @loop
@done:  jsr rpl_wait_vblank
        jmp @done
msg:    .byte "HELLO RAMPLAY", 0

        .segment "VECTORS"
        .word reset, reset, reset
