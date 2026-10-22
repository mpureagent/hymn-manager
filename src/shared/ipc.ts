import type { HistoryData, OpenedInput } from './history'
import type { FontChoice, HymnStyle } from './style'
import type { PackBook } from './types'

export const IPC = {
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

export interface PackViewOk {
  ok: true
  root: string
  books: PackBook[]
}

export interface PackViewError {
  ok: false
  reason: 'missing' | 'corrupt'
  searchedPaths: string[]
  /** 开发态指向仓库根目录，打包态指向 exe 同目录 */
  recommendedPath?: string
  error?: string
}

export type PackView = PackViewOk | PackViewError

export interface Bootstrap {
  pack: PackView
  currentBook: string | null
  style: HymnStyle
}

export interface HymnApi {
  bootstrap(): Promise<Bootstrap>
  recheck(): Promise<Bootstrap>
  setCurrentBook(id: string): Promise<{ currentBook: string | null }>
  getHistory(): Promise<HistoryData>
  addSearch(q: string): Promise<HistoryData>
  addOpened(entry: OpenedInput): Promise<HistoryData>
  clearHistory(): Promise<HistoryData>
  listFonts(): Promise<FontChoice[]>
  setStyle(style: HymnStyle): Promise<HymnStyle>
}