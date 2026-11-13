# RamPlay Core

The system under every RamPlay platform, the way the Linux kernel is under
every Linux distribution. It is the console itself: a W65C02S, 16 KB of RAM,
a W65C22S VIA, a cartridge slot and the display protocol. Every cartridge
runs on it. It has no drawing, no sound and no file access in it, so it runs
the same in a browser and in Node.

A platform is built on core the way a distribution is built on the kernel.
It can be a web page, a lab bench, a grader, a kiosk or a desktop app. Core is
public and MIT licensed, so anyone can build a platform on it. RamPlayer is
the RamPlay project's own platform.

## Install

```
npm install ramplay-core
```

It is plain ES modules with type declarations, and has no dependencies. It
needs a browser or Node 20 or later.

## Use

```ts
import { createMachine, makeCart, insertCart, powerOn,
  setButtons, runFrame, renderFrame, BTN } from 'ramplay-core';

const m = createMachine();
const made = makeCart(bytes);                 // 32768 bytes of a .rpl file
if (!made.ok) throw new Error(made.error);
insertCart(m, made.cart);
powerOn(m);

const px = new Uint16Array(160 * 128);        // RGB565
setButtons(m, BTN.START);
runFrame(m);                                  // 33333 CPU cycles, to the next VBLANK
renderFrame(m.picture, px);
```

## Interface

All of it is exported from the package root. Import from `ramplay-core` and
from nowhere inside it; files under `lib/` and `src/` may move between
versions. The version follows semver: a change that breaks a name in the
table below is a new major version.

| Group | Names | What for |
|---|---|---|
| Cartridge | `makeCart`, `Cart`, `ROM_SIZE`, `ROM_BASE` | check an image, read its header |
| Machine | `createMachine`, `insertCart`, `removeCart`, `powerOn`, `powerOff`, `reset` | the console and its switches |
| Time | `runFrame`, `runFrames`, `stepInstruction`, `FPS`, `CPU_HZ`, `CYCLES_PER_FRAME` | one frame, or one instruction |
| Buttons | `setButtons`, `BTN` | pressed = 1, as the SDK reports them |
| Picture | `renderFrame`, `toRGBA`, `SCREEN_W`, `SCREEN_H`, `m.picture` | the frame as pixels |
| Sound | `m.sounds` | SOUND commands not yet played; the platform drains the list |
| Bus | `read`, `write`, `peek`, `chipAt`, `cellOf` | for a debugger or a grader |
| CPU | `disassemble`, `flagsText`, `m.cpu` | registers and listings |
| Stream | `createState`, `parseByte`, `parserBusy`, `OP_NAMES`, `m.log` | the display protocol on its own |
| Tables | `FONT`, `DEFAULT_PALETTE` | the console font and the power-on colors |
| Cartridge PNG | `embedCart`, `extractCart`, `isPng` | a game as a picture, spec section 8.3 |
| Snapshot | `coverOf`, `labelOf` | a cartridge's own picture, for a shelf |

`RAMPLAY_SPEC.md` is the contract behind all of this: sections 3 to 6 for the
machine, 8 for the cartridge.

## What a platform brings

Core leaves these to the platform:

- Where cartridges come from: files, a catalog, a server.
- Where the picture goes: a canvas, a PNG, a terminal, nowhere.
- What the buttons are: a keyboard, a gamepad, a script.
- How sound is made.
- When frames run: a timer at 30 a second, or as fast as possible in a test.

`page/main.ts` in the repository is a small example platform: core, a canvas,
a keyboard and a square wave, in about a hundred lines.

## Cartridges

A cartridge is a 32768-byte `.rpl` image. Games are written in 65C02 assembly
with the SDK in the repository (`sdk/`, `examples/hello`). `RAMPLAY_SPEC.md`
section 8 has the format.

## In this repository

The npm package is only the TypeScript system. The repository has the rest of
what defines RamPlay:

```
RAMPLAY_SPEC.md     the specification: memory map, display protocol, cartridge format
sdk/                ramplay.inc, ramplay.cfg and the runtime, for ca65
examples/           hello, catch, pong; example.mk builds any cartridge
tools/              rplinfo.py (checks an image), gen_tables.py
firmware/common/    the display protocol in portable C, for the real hardware
tests/protocol/     command streams and the frames they must give
```

`make examples` builds the example cartridges (needs cc65). `make test` runs
the C tests and the protocol vectors. `make core-test` runs the TypeScript
tests.

## Working on core

```
npm test            # typecheck, then CPU, VIA, machine, protocol vectors, cartridge PNG, labels
npm run dev         # the core page at http://localhost:5174
npm run frame -- game.rpl out.ppm 100 40-43:40    # one frame of a cartridge, no browser

npm run lib         # src/ to lib/: JavaScript and type declarations, what the package ships
```

Run `make examples` first. The tests and the page use the built cartridges. `npm pack` builds `lib/` and makes the
package; the tests are not in it.

## Files

```
src/index.ts          the interface
src/engine/           cart, bus, cpu, via, machine
src/video/            rpl.ts (parser and renderer), tables.ts (font, palette; generated)
src/cartpng.ts        cartridge PNG
src/snapshot.ts       covers and labels
test/                 node:test files
scripts/frame.ts      a frame as a PPM
index.html, page/     the core page
lib/                  built by `npm run lib`, not committed
```

## License

MIT. See `LICENSE`.
