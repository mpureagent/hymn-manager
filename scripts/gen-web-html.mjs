#!/usr/bin/env node
/**
 * Web 宿主的 HTML 入口在构建时由 Electron 入口派生，避免两份 1769 行 HTML 各自漂移。
 *
 * 唯一差异是脚本入口：Electron 用 ./main.ts（顶层读 window.hymn，由 preload 注入），
 * Web 用 ./web-boot.ts（先挂 adapter 再 import main）。
 *
 * 产物 web.html 已 gitignore，不要手改——改 src/control/index.html 即可。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** [源 HTML, 输出 HTML, 源脚本, 目标脚本] */
const TARGETS = [
  ['src/control/index.html', 'src/control/web.html', './main.ts', './web-boot.ts'],
  ['src/projection/index.html', 'src/projection/web.html', './main.ts', './web-boot.ts'],
]

let failed = false

for (const [from, to, srcScript, webScript] of TARGETS) {
  const fromPath = join(repoRoot, from)
  const toPath = join(repoRoot, to)

  let html
  try {
    html = readFileSync(fromPath, 'utf8')
  } catch {
    console.error(`[gen-web-html] 读取失败：${from}`)
    failed = true
    continue
  }

  const needle = `src="${srcScript}"`
  if (!html.includes(needle)) {
    console.error(`[gen-web-html] ${from} 里找不到 ${needle}，入口结构变了，请更新本脚本`)
    failed = true
    continue
  }

  const output = html.replace(needle, `src="${webScript}"`)
  writeFileSync(toPath, output, 'utf8')
  console.log(`[gen-web-html] ${from} → ${to}`)
}

if (failed) process.exit(1)
