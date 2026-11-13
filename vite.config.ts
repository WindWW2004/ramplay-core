import { defineConfig } from 'vite';

// The core page: an introduction, a bare console and the interface. base './'
// so the built page works from any folder; the site puts it at /core/.
// RAMPLAYER is where the RamPlayer page is: beside this one on the site, on
// its own port in `npm run dev`.
export default defineConfig(({ command }) => ({
  base: './',
  build: { target: 'es2022' },
  server: { port: 5174, strictPort: true },
  define: { RAMPLAYER: JSON.stringify(command === 'serve' ? 'http://localhost:5173/' : '../') },
}));
