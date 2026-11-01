import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** 入口 HTML 保留在 src/control、src/projection 下，产物统一落到 dist/web 根目录。 */
function renameEntryHtml(): Plugin {
  const renamed: Record<string, string> = {
    'control/web.html': 'index.html',
    'projection/web.html': 'projection.html',
  }
  return {
    name: 'hymn-web-entry-html',
    // Vite 的 build-html 插件在用户插件之后发射 HTML，必须等它完成再改名。
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const target = renamed[fileName]
        if (!target) continue
        const output = bundle[fileName]
        if (!output) continue
        delete bundle[fileName]
        output.fileName = target
        bundle[target] = output
      }
    },
  }
}

/**
 * score-view 会把 /api/score/... 交给 filePathToUrl() 转 file://；
 * Web 构建换成直通版本，Electron 构建不受影响。
 */
function webScoreUrl(): Plugin {
  const shim = resolve(__dirname, 'src/control/web-score-url.ts')
  return {
    name: 'hymn-web-score-url',
    enforce: 'pre',
    resolveId(source, importer) {
      const from = importer?.replace(/\\/g, '/') ?? ''
      if (source === '../shared/score' && from.endsWith('/control/score-view.ts')) return shim
      return null
    },
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src'),
  // 经 HTTP 服务访问，资源用根路径；Electron 构建仍走 vite.config.ts 的相对路径。
  base: '/',
  plugins: [webScoreUrl(), renameEntryHtml()],
  build: {
    target: 'chrome108',
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        control: resolve(__dirname, 'src/control/web.html'),
        projection: resolve(__dirname, 'src/projection/web.html'),
      },
    },
  },
})