import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `vite build --mode pages` (npm run build:pages): the read-only static demo for GitHub Pages, served from
// https://<user>.github.io/examlens/. No server: the API layer reads client/public/static-demo/ (src/static/).
const PAGES_BASE = '/examlens/';

// GitHub Pages has no SPA fallback: a deep link (/examlens/spaces/…) would 404. Its 404.html is served for
// any unknown path, so make it the app itself; React Router then shows the right page.
const spaFallback = {
  name: 'spa-404-fallback',
  apply: 'build',
  closeBundle() {
    const dist = path.resolve(import.meta.dirname, 'dist');
    fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
  },
};

export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  return {
    base: pages ? PAGES_BASE : '/',
    plugins: [react(), tailwindcss(), ...(pages ? [spaFallback] : [])],
    define: pages ? { 'import.meta.env.VITE_STATIC_DEMO': JSON.stringify('true') } : {},
    // The API's CORS allows exactly http://localhost:5173, so don't silently move to another port.
    server: { port: 5173, strictPort: true },
  };
});
