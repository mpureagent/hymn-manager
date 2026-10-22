#!/usr/bin/env node
// 启动已构建的应用；容器内 root 运行时 Chromium 需要 --no-sandbox（仅本机脚本）。

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')

const args = []
if (typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox')
args.push('.')

const child = spawn(electronBinary, args, { stdio: 'inherit', env: process.env })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})