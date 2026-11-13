# Third-party code

No third-party code is copied into this repository, and the npm package has no
dependencies.

Build and test tools, not distributed with RamPlay Core:

| Tool | Used for | License |
|------|----------|---------|
| cc65 (ca65, ld65) | assembling the SDK and the examples | zlib |
| Vite | dev server and bundle of the core page | MIT |
| TypeScript | type check, and building `lib/` | Apache-2.0 |

The 65C02 core, the VIA model, the protocol parser, the renderer and the font
are original to this repository.
