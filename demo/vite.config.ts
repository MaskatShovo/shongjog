import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { outDir: '../showcase-dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 4174 },
  preview: { host: '127.0.0.1', port: 4174 },
});
