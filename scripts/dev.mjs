#!/usr/bin/env node
// 开发模式：Vite dev server + Electron。主进程改动需重启 npm run dev。

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')

const server = await createServer({ configFile: 'vite.config.ts', server: { port: 5173 } })
await server.listen()
server.printUrls()

const base = server.resolvedUrls?.local?.[0]
if (!base) throw new Error('vite dev server did not expose a local url')

const args = []
// 容器内 root 运行 Chromium 需要关闭 setuid sandbox；仅开发脚本，不进入产品。
if (typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox')
args.push('.')

const child = spawn(electronBinary, args, {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: `${base}control/index.html` },
})

const shutdown = async (code) => {
  await server.close().catch(() => {})
  process.exit(code ?? 0)
}

child.on('exit', (code) => void shutdown(code ?? 0))
process.on('SIGINT', () => {
  child.kill('SIGINT')
  void shutdown(0)
})
process.on('SIGTERM', () => {
  child.kill('SIGTERM')
  void shutdown(0)
})