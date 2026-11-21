import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el build funciona servido desde cualquier subcarpeta
  // (GitHub Pages, IPFS, file:// con un servidor estático, etc.).
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
