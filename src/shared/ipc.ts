import type { HistoryData, OpenedInput } from './history'
import type { ProjectionContent } from './projection'
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
  projectionToggle: 'projection:toggle',
  projectionUpdate: 'projection:update',
  projectionSetStyle: 'projection:set-style',
  projectionPull: 'projection:pull',
  projectionClose: 'projection:close',
  projectionNav: 'projection:nav',
  projectionContent: 'projection:content',
  projectionStyle: 'projection:style',
  projectionState: 'projection:state',
  projectionChanged: 'projection:changed',
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

export interface ProjectionToggleResult {
  active: boolean
  /** 没有当前诗歌：主窗口应提示「请先选择一首诗」 */
  needSelection?: boolean
  /** 单屏环境下投屏会覆盖主屏 */
  hint?: string
}

export interface ProjectionState {
  active: boolean
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
  toggleProjection(content: ProjectionContent | null): Promise<ProjectionToggleResult>
  updateProjection(content: ProjectionContent): void
  setProjectionStyle(style: HymnStyle): void
  onProjectionState(cb: (state: ProjectionState) => void): () => void
  onProjectionChanged(cb: (content: ProjectionContent) => void): () => void
}

/** 投屏窗口专用 API（由 projection-preload 注入）。 */
export interface ProjectionApi {
  pull(): Promise<ProjectionContent | null>
  onContent(cb: (content: ProjectionContent | null) => void): () => void
  onStyle(cb: (style: HymnStyle) => void): () => void
  close(): void
  navigate(direction: -1 | 1): void
}