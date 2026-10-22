import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    target: 'chrome108',
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        control: resolve(__dirname, 'src/control/index.html'),
        projection: resolve(__dirname, 'src/projection/index.html'),
      },
    },
  },
})