import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// The core page: what it is, a demo, quick start, the API and the docs. base './'
// so the built page works from any folder; the site puts it at /core/.
// RAMPLAYER is where the RamPlay page is: beside this one on the site, on
// its own port in `npm run dev`.
export default defineConfig(({ command }) => ({
  base: './',
  build: { target: 'es2022' },
  server: { port: 5174, strictPort: true },
  define: { VERSION: JSON.stringify(version), RAMPLAYER: JSON.stringify(command === 'serve' ? 'http://localhost:5173/' : '../') },
}));
