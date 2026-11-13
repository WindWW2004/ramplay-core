; rpl_rt.s  -  the RamPlay runtime. RAMPLAY_SPEC.md sections 3.2, 5 and 10.
; SPDX-License-Identifier: MIT

        .include "ramplay.inc"

        .segment "ZEROPAGE"
rpl_ptr:        .res 2          ; pointer argument of the helpers below
rpl_buttons:    .res 1          ; the buttons at the last rpl_wait_vblank, pressed = 1

        .segment "CODE"

; Set up the VIA. Call once after reset. Changes A.
rpl_init:
        lda #$FF
        sta RPL_VIA_DDRB        ; port B: all outputs, the display stream
        lda #$00
        sta RPL_VIA_DDRA        ; port A: all inputs, the buttons
        lda #$A0
        sta RPL_VIA_PCR         ; CB2 pulses on every write to ORB; CA1 on the falling edge
        lda #$7F
        sta RPL_VIA_IER         ; no VIA interrupts: games poll
        rts

; Send A to the display. Changes nothing, not even the flags.
rpl_send:
        sta RPL_VIA_ORB
        rts

; Wait for the next frame. Returns the buttons in A and rpl_buttons, pressed = 1.
rpl_wait_vblank:
        lda RPL_VIA_IFR
        and #RPL_IFR_VBLANK
        beq rpl_wait_vblank
        ; falls through: reading port A clears the VBLANK flag

; The buttons right now, in A and rpl_buttons, pressed = 1.
rpl_read_buttons:
        lda RPL_VIA_ORA
        eor #$FF
        and #$7F                ; bit 7 has no button
        sta rpl_buttons
        rts

; CLEAR and CLRTXT. Change A.
rpl_clear:
        lda #RPL_CLEAR
        sta RPL_VIA_ORB
        rts
rpl_clrtxt:
        lda #RPL_CLRTXT
        sta RPL_VIA_ORB
        rts

; Send the zero-terminated string at (rpl_ptr), with its zero. 255 characters
; at most. Changes A and Y.
rpl_send_str:
        ldy #0
@next:  lda (rpl_ptr),y
        sta RPL_VIA_ORB
        beq @done
        iny
        bne @next
        lda #0                  ; no zero in 256 bytes: end the TEXT command anyway
        sta RPL_VIA_ORB
@done:  rts

; Send X bytes from (rpl_ptr). X = 0 sends 256. Changes A, X and Y.
rpl_send_n:
        ldy #0
@next:  lda (rpl_ptr),y
        sta RPL_VIA_ORB
        iny
        dex
        bne @next
        rts

; DEFTILE: tile id in A, 32 bytes at (rpl_ptr). Changes A, X and Y.
rpl_deftile:
        pha
        lda #RPL_DEFTILE
        sta RPL_VIA_ORB
        pla
        sta RPL_VIA_ORB
        ldx #32
        bra rpl_send_n

; SETPAL: palette in A, 16 colors (32 bytes, low byte first) at (rpl_ptr). Changes A, X and Y.
rpl_setpal:
        pha
        lda #RPL_SETPAL
        sta RPL_VIA_ORB
        pla
        sta RPL_VIA_ORB
        ldx #32
        bra rpl_send_n
