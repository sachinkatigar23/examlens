import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The API's CORS allows exactly http://localhost:5173, so don't silently move to another port.
  server: { port: 5173, strictPort: true },
});
