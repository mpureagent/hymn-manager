import { contextBridge, ipcRenderer } from 'electron'
import type { ProjectionApi } from '../shared/ipc'
import type { ProjectionContent } from '../shared/projection'
import type { HymnStyle } from '../shared/style'

// 与 shared/ipc.ts 的通道常量保持一致（沙箱 preload 不能 import 共享模块）。
const CH = {
  pull: 'projection:pull',
  close: 'projection:close',
  nav: 'projection:nav',
  content: 'projection:content',
  style: 'projection:style',
} as const

const api: ProjectionApi = {
  pull: () => ipcRenderer.invoke(CH.pull) as Promise<ProjectionContent | null>,
  onContent: (cb: (content: ProjectionContent | null) => void) => {
    const listener = (_event: unknown, content: ProjectionContent | null): void => cb(content)
    ipcRenderer.on(CH.content, listener)
    return () => ipcRenderer.removeListener(CH.content, listener)
  },
  onStyle: (cb: (style: HymnStyle) => void) => {
    const listener = (_event: unknown, style: HymnStyle): void => cb(style)
    ipcRenderer.on(CH.style, listener)
    return () => ipcRenderer.removeListener(CH.style, listener)
  },
  close: () => ipcRenderer.send(CH.close),
  navigate: (direction: -1 | 1) => {
    if (direction === -1 || direction === 1) ipcRenderer.send(CH.nav, direction)
  },
}

contextBridge.exposeInMainWorld('projection', api)