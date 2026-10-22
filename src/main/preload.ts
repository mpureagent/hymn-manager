import { contextBridge, ipcRenderer } from 'electron'
import type { HistoryData, OpenedInput } from '../shared/history'
import type { Bootstrap, HymnApi } from '../shared/ipc'
import type { FontChoice, HymnStyle } from '../shared/style'

// 沙箱化 preload 只能 require('electron')，通道常量在此内联（与 shared/ipc.ts 保持一致）。
const CH = {
  bootstrap: 'app:bootstrap',
  recheck: 'app:recheck',
  setCurrentBook: 'app:set-current-book',
  historyGet: 'history:get',
  historyAddSearch: 'history:add-search',
  historyAddOpened: 'history:add-opened',
  historyClear: 'history:clear',
  fontsList: 'fonts:list',
  styleSet: 'style:set',
} as const

const api: HymnApi = {
  bootstrap: () => ipcRenderer.invoke(CH.bootstrap) as Promise<Bootstrap>,
  recheck: () => ipcRenderer.invoke(CH.recheck) as Promise<Bootstrap>,
  setCurrentBook: (id: string) =>
    ipcRenderer.invoke(CH.setCurrentBook, id) as Promise<{ currentBook: string | null }>,
  getHistory: () => ipcRenderer.invoke(CH.historyGet) as Promise<HistoryData>,
  addSearch: (q: string) => ipcRenderer.invoke(CH.historyAddSearch, q) as Promise<HistoryData>,
  addOpened: (entry: OpenedInput) =>
    ipcRenderer.invoke(CH.historyAddOpened, entry) as Promise<HistoryData>,
  clearHistory: () => ipcRenderer.invoke(CH.historyClear) as Promise<HistoryData>,
  listFonts: () => ipcRenderer.invoke(CH.fontsList) as Promise<FontChoice[]>,
  setStyle: (style: HymnStyle) => ipcRenderer.invoke(CH.styleSet, style) as Promise<HymnStyle>,
}

contextBridge.exposeInMainWorld('hymn', api)