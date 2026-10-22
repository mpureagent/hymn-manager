import { contextBridge, ipcRenderer } from 'electron'
import type { Bootstrap, HymnApi } from '../shared/ipc'

// 沙箱化 preload 只能 require('electron')，通道常量在此内联（与 shared/ipc.ts 保持一致）。
const CH = {
  bootstrap: 'app:bootstrap',
  recheck: 'app:recheck',
  setCurrentBook: 'app:set-current-book',
} as const

const api: HymnApi = {
  bootstrap: () => ipcRenderer.invoke(CH.bootstrap) as Promise<Bootstrap>,
  recheck: () => ipcRenderer.invoke(CH.recheck) as Promise<Bootstrap>,
  setCurrentBook: (id: string) =>
    ipcRenderer.invoke(CH.setCurrentBook, id) as Promise<{ currentBook: string | null }>,
}

contextBridge.exposeInMainWorld('hymn', api)