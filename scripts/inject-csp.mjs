#!/usr/bin/env node
// 构建期向 dist/renderer 的两个入口 HTML 注入 CSP meta。
// 本地文件应用：不加载任何远程资源；曲谱图走 file:。

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const TARGETS = [
  resolve(here, '../dist/renderer/control/index.html'),
  resolve(here, '../dist/renderer/projection/index.html'),
]

export const CSP_DIRECTIVE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: file:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

export function injectCsp(html, directive = CSP_DIRECTIVE) {
  if (html.includes('http-equiv="Content-Security-Policy"')) return { html, injected: false }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${directive}">`
  const out = html.replace(/(<meta\s+charset=["'][^"']+["'][^>]*>)/i, `$1\n    ${meta}`)
  if (out === html) throw new Error('charset meta not found; cannot anchor CSP injection')
  return { html: out, injected: true }
}

for (const file of TARGETS) {
  const html = readFileSync(file, 'utf-8')
  const { html: out, injected } = injectCsp(html)
  if (injected) writeFileSync(file, out)
  console.log(`csp: ${file} ${injected ? 'injected' : 'already-present'}`)
}