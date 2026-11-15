/*
 * The core page: the version, the link to RamPlay, and the Copy button of the
 * install command. The page runs no machine of its own.
 *
 * SPDX-License-Identifier: MIT
 */
declare const RAMPLAYER: string, VERSION: string;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-ramplayer]')) a.href = RAMPLAYER;
$('version').textContent = 'v' + VERSION;
$('btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('install-cmd').textContent ?? ''); $('btn-copy').textContent = 'Copied'; }
  catch { $('btn-copy').textContent = 'Select it'; }
  setTimeout(() => { $('btn-copy').textContent = 'Copy'; }, 1600);
});
