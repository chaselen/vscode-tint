import { defineConfig } from 'vite'

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: { outDir: '../demo-dist', emptyOutDir: true, chunkSizeWarningLimit: 1000 }
})
