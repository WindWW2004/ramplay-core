/*
 * RamPlay Core: the system under every RamPlay platform.
 * This file is its whole interface.
 * Core is public: anyone may build a platform on it. A platform imports from
 * here and from nowhere else in core. RamPlayer is the project's own platform.
 *
 *   machine   createMachine, makeCart, insertCart, powerOn, reset, runFrame,
 *             setButtons, read, write, peek, stepInstruction, BTN, ...
 *   picture   renderFrame, toRGBA, SCREEN_W, SCREEN_H: a frame as pixels
 *   stream    createState, parseByte: the display protocol on its own
 *   tables    FONT, DEFAULT_PALETTE
 *   cartpng   embedCart, extractCart: a cartridge as a PNG (spec section 8.3)
 *   snapshot  coverOf, labelOf: a cartridge's own picture
 *
 * Nothing in core draws on a page, plays a sound or reads a file. It runs in
 * a browser and in Node the same way.
 *
 * SPDX-License-Identifier: MIT
 */
export * from './engine/machine.ts';
export * from './video/rpl.ts';
export * from './video/tables.ts';
export * from './cartpng.ts';
export * from './snapshot.ts';
