# From NES v1 and v2 to RamPlay

RamPlay is the third machine of the SST 115 NES Build series. The first two
are in the lab repository (`Farmingdale-115-lab`, `public/115/nes/` and
`public/115/nes/v2/`). They are drawings that behave like a console. RamPlay
is the same idea with real parts, and RamPlay, a web page that matches the parts.

## What each machine is

| | v1 (Lab 8) | v2 (Labs 9, 10) | RamPlay |
|---|---|---|---|
| Address bus | 8 bits, 256 cells | 16 bits | 16 bits |
| CPU | teaching CPU, one register (ACC) | same CPU, 16-bit PC | W65C02S: A, X, Y, stack |
| Instruction | 2 bytes | 3 bytes, always | 1 to 3 bytes |
| Chip select | fixed ranges | `addr >> 13`, eight regions | A15, A14, A13 through a 74HC00 |
| RAM | part of the 256 cells | 2 KB, mirrored to `$1FFF` | 16 KB at `$0000-$3FFF` |
| Screen | 8x8 cells in memory | 16x16 cells at `$2000` | 160x128, tiles and sprites, on a Pico |
| How the CPU draws | writes a cell | writes a cell | sends command bytes through the VIA |
| Controller | a memory cell | `$4016` | VIA port A at `$6001`, pressed = 0 |
| Frame | `WAIT` | `WAIT` | poll the VBLANK flag at `$600D` |
| Cartridge | a `.cart` file with a header and a checksum | a board: PRG-ROM, SRAM, A14 jumper, battery | one 32 KB ROM chip, 30-pin header |
| Start | the header gives the entry | reset vector at `$FFFC` | reset vector at `$FFFC` |
| Save | battery bytes | SRAM at `$6000` with a battery | none in v1 of the cartridge |
| Assembler | `engine/assembler.js` | the same, then the student's Python | cc65 (ca65, ld65) |
| Game | catch, pong | catch | catch, pong, hello |

## What carries over

- **The reset vector.** Lab 9 stage 3 has the student read `$FFFC`, `$FFFD`
  and jump. A RamPlay cartridge starts the same way. Its header at `$FF40`
  is for tools; the CPU never reads it.
- **Little endian.** The pointer at `$0010`/`$0011` in v2 catch is the
  `(zp),Y` addressing mode here. `rpl_ptr` in the SDK is that pointer.
- **Decoding by the top address lines.** v2 used `addr >> 13`. RamPlay uses
  three lines and three NAND gates, and leaves `$4000-$5FFF` as open bus,
  which v2 also had.
- **Mirrors.** v2 mirrored RAM every 2 KB. Here the VIA has 16 registers in
  an 8 KB region, so `$6000` is also `$6010`, `$7FF0` and 509 more.
- **Carry between bytes.** v2 added `ADC` and `SBC` for 16-bit pointers.
  The 6502 has only `ADC` and `SBC`; `CLC` and `SEC` do the rest.
- **The game.** `examples/catch/catch.s` is v2's `catch.asm` rule for rule.
  Its header comment lists the five changes.
- **The engine layout.** `core/src/engine/` has `cart`, `bus`, `cpu`,
  `machine`, as v2 does, and adds `via`. It has no drawing in it, so a lab
  page or a Worker can grade with it. The engine is RamPlay Core; RamPlay
  is a platform built on it, in a repository of its own.
- **The bench API.** RamPlay answers to `window.ramplay` the way
  the Lab 9 bench answers to `window.nes`, and takes `?embed=1`.

## What is new for the student

1. **Registers and a stack.** `JSR`, `RTS`, `PHA`, `PLA`, indexed addressing.
2. **A peripheral chip.** The screen is a chip on the bus. A write to
   `$6000` is a byte on eight wires and a pulse on CB2.
3. **A protocol.** Opcode, arguments, no framing. `tests/protocol/` is 12
   byte streams and the picture each must give.
4. **Two machines talking.** The 6502 and the Pico share only eight data
   lines, a strobe and VBLANK. The frame rule (commands show in the next
   frame) comes from that.
5. **Real limits.** 33333 cycles a frame. A `DEFTILE` through `rpl_deftile` costs about 550.

## Notes for lab pages

- The v2 game ran at 60 frames a second. RamPlay runs at 30, so catch halves
  its counts: the bowl moves every 2 frames, the item falls every 8.
- BEST is in console RAM. It survives Reset; power off clears it. That is a
  stage by itself.
- Without `rpl_init` nothing reaches the screen. RamPlay counts those
  bytes in `via.dropped`.
