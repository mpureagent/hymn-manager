import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  // Web 宿主由 node:http 静态服务承载，资源用根路径；Electron 打包页仍用相对路径。
  const web = mode === 'web'
  return {
    root: 'src',
    base: web ? '/' : './',
    build: {
      target: 'chrome108',
      outDir: resolve(__dirname, web ? 'dist/web' : 'dist/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          control: resolve(__dirname, 'src/control/index.html'),
          projection: resolve(__dirname, 'src/projection/index.html'),
        },
      },
    },
  }
})
