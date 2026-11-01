import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(import.meta.url)

let core
try {
  core = require('../../dist/web-core/web/server-core.js')
} catch (error) {
  if (error && error.code === 'MODULE_NOT_FOUND') {
    console.error('[web] 未找到编译产物，请先运行 npm run build:web')
  } else {
    console.error('[web] 加载服务端失败：', error)
  }
  process.exit(1)
}

core.startFromEnv(repoRoot).catch((error) => {
  console.error('[web] 启动失败：', error)
  process.exit(1)
})