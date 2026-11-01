import type { HymnApi, PackViewError, PackViewOk } from '../shared/ipc'
import type { PackBook, HymnItem } from '../shared/types'
import { buildCatalog, formatBookLabel } from '../shared/catalog'
import { createEffectiveSearchRecorder } from '../shared/effective-search'
import {
  emptyHistory,
  formatRelativeTime,
  RECENT_OPENED_COUNT,
  type HistoryData,
  type OpenEntry,
} from '../shared/history'
import { normalizeQuery } from '../shared/normalize'
import type { ProjectionContent, ProjectionView } from '../shared/projection'
import { search } from '../shared/search'
import {
  DEFAULT_STYLE,
  FALLBACK_FONTS,
  clampStyle,
  styleToCssVars,
  type HymnStyle,
} from '../shared/style'
import { ListView, type ListEntry } from './list-view'
import { LyricsView } from './lyrics-view'
import { ScoreView } from './score-view'
import { StylePanel } from './style-panel'

const SEARCH_DEBOUNCE_MS = 120

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

const api: HymnApi | undefined = window.hymn

const app = el<HTMLElement>('app')
const guide = el<HTMLElement>('guide')
const guideTitle = el<HTMLElement>('guide-title')
const guideDesc = el<HTMLElement>('guide-desc')
const guidePaths = el<HTMLOListElement>('guide-paths')
const guideError = el<HTMLElement>('guide-error')
const guideRetry = el<HTMLButtonElement>('guide-retry')
const bookSelect = el<HTMLSelectElement>('book-select')
const searchInput = el<HTMLInputElement>('search-input')
const styleButton = el<HTMLButtonElement>('btn-style')
const projectButton = el<HTMLButtonElement>('btn-project')
const toast = el<HTMLElement>('toast')
const listHeading = el<HTMLElement>('list-heading')
const catalogCount = el<HTMLElement>('catalog-count')
const listEmpty = el<HTMLElement>('list-empty')
const listEmptyTitle = el<HTMLElement>('list-empty-title')
const historyToggle = el<HTMLButtonElement>('history-toggle')
const historyBody = el<HTMLElement>('history-body')
const historyClear = el<HTMLButtonElement>('history-clear')
const searchChips = el<HTMLElement>('search-chips')
const searchChipsEmpty = el<HTMLElement>('search-chips-empty')
const openedList = el<HTMLUListElement>('opened-list')
const openedEmpty = el<HTMLElement>('opened-empty')
const openedCount = el<HTMLElement>('opened-count')
const historyMore = el<HTMLButtonElement>('history-more')
const tabLyrics = el<HTMLButtonElement>('tab-lyrics')
const tabScore = el<HTMLButtonElement>('tab-score')
const lyricsView = el<HTMLElement>('lyrics-view')
const scorePanel = el<HTMLElement>('score-view')
const listPane = el<HTMLElement>('list-pane')
const previewPane = el<HTMLElement>('preview-pane')
const listViewport = el<HTMLElement>('hymn-list')
const backButton = el<HTMLButtonElement>('btn-back')
const topbarTitle = el<HTMLElement>('topbar-title')

let books: PackBook[] = []
let current: PackBook | null = null
let searchTimer: number | null = null
let composing = false
let currentEntries: ListEntry[] = []
let appliedSearch: { query: string; count: number } | null = null
let historyData: HistoryData = emptyHistory()
let showAllOpened = false
let confirmingClear = false
let clearConfirmTimer: number | null = null
let currentStyle: HymnStyle = { ...DEFAULT_STYLE }
let stylePersistTimer: number | null = null
let currentItem: HymnItem | null = null
let previewView: ProjectionView = 'lyrics'
let projectionActive = false
let toastTimer: number | null = null
let narrowView: 'list' | 'detail' = 'list'
let narrowListScrollTop = 0
const narrowMedia = window.matchMedia('(max-width: 900px)')

const searchRecorder = createEffectiveSearchRecorder((query) => {
  void persistSearch(query)
})

const stylePanel = new StylePanel({
  fonts: FALLBACK_FONTS,
  style: currentStyle,
  onChange: changeStyle,
  onClose: flushStylePersistence,
})

applyStyle(currentStyle)

const lyrics = new LyricsView(
  {
    empty: el<HTMLElement>('preview-empty'),
    panel: el<HTMLElement>('preview-panel'),
    eyebrow: el<HTMLElement>('preview-eyebrow'),
    title: el<HTMLElement>('preview-title'),
    alt: el<HTMLElement>('preview-alt'),
    body: el<HTMLElement>('lyrics-body'),
  },
  { onShowScore: () => setPreviewView('score') },
)

const score = new ScoreView(
  {
    viewport: el<HTMLElement>('score-viewport'),
    image: el<HTMLImageElement>('score-image'),
    zoomValue: el<HTMLElement>('score-zoom-value'),
    zoomIn: el<HTMLButtonElement>('score-zoom-in'),
    zoomOut: el<HTMLButtonElement>('score-zoom-out'),
    message: el<HTMLElement>('score-message'),
    messageTitle: el<HTMLElement>('score-message-title'),
    messagePath: el<HTMLElement>('score-message-path'),
  },
  {
    resolvePath: (book, number) =>
      api ? api.getScorePath(book, number) : Promise.resolve(null),
  },
)

const list = new ListView(el<HTMLElement>('hymn-list'), {
  overscan: 6,
  onOpen: (entry) => openFromList(entry),
})

function isNarrowScreen(): boolean {
  return narrowMedia.matches
}

/** 窄屏同一时刻只显示一个 pane；宽屏两栏都可见，视口控件保持原样。 */
function renderChrome(): void {
  const detail = isNarrowScreen() && narrowView === 'detail'
  listPane.hidden = detail
  previewPane.hidden = isNarrowScreen() && !detail
  backButton.hidden = !detail
  topbarTitle.hidden = !detail
  bookSelect.hidden = detail
  searchInput.hidden = detail
}

function setTopbarTitle(item: HymnItem): void {
  topbarTitle.textContent = `第${item.number}首 ${item.title}`
  topbarTitle.title = topbarTitle.textContent
}

function enterNarrowDetail(): void {
  if (!isNarrowScreen() || narrowView === 'detail' || !currentItem) return
  narrowListScrollTop = listViewport.scrollTop
  narrowView = 'detail'
  renderChrome()
}

function backToNarrowList(): void {
  if (!isNarrowScreen() || narrowView === 'list') return
  narrowView = 'list'
  renderChrome()

  const number = currentItem?.number
  window.requestAnimationFrame(() => {
    listViewport.scrollTop = narrowListScrollTop
    const index =
      number === undefined
        ? -1
        : currentEntries.findIndex((entry) => entry.number === number)
    if (index >= 0) {
      list.selectIndex(index, true)
    } else {
      listViewport.focus()
    }
  })
}

narrowMedia.addEventListener('change', renderChrome)

function showPreview(entry: ListEntry): void {
  const item = current?.items.find((candidate) => candidate.number === entry.number)
  currentItem = item ?? null
  if (item) {
    lyrics.show(item)
    score.setItem(item, current?.id ?? null)
    setTopbarTitle(item)
  }
}

function openFromList(entry: ListEntry): void {
  if (
    appliedSearch &&
    appliedSearch.count > 0 &&
    normalizeQuery(searchInput.value) === appliedSearch.query
  ) {
    searchRecorder.commit(searchInput.value, appliedSearch.count)
  }
  showPreview(entry)
  enterNarrowDetail()
  pushProjection()
  void persistOpened(entry.number, entry.title)
}

function resetPreview(): void {
  currentItem = null
  lyrics.clear()
  score.clear()
}

function cancelScheduledSearch(): void {
  if (searchTimer === null) return
  window.clearTimeout(searchTimer)
  searchTimer = null
}

function scheduleSearch(): void {
  cancelScheduledSearch()
  searchTimer = window.setTimeout(() => {
    searchTimer = null
    runSearch()
  }, SEARCH_DEBOUNCE_MS)
}

function showCatalog(): void {
  if (!current) return
  searchRecorder.reset()
  appliedSearch = null
  const entries = buildCatalog(current.items)
  currentEntries = entries
  list.setEntries(entries)
  listHeading.textContent = '全目录'
  catalogCount.textContent = `共 ${entries.length} 首`
  listEmpty.hidden = true
  resetPreview()
}

function runSearch(): void {
  if (!current) return
  const raw = searchInput.value
  const normalized = normalizeQuery(raw)
  if (!normalized) {
    showCatalog()
    return
  }

  const results = search(current.items, raw)
  const entries: ListEntry[] = results.map((result) => ({
    number: result.item.number,
    title: result.item.title,
    excerpt: result.excerpt,
    kind: result.kind,
  }))

  currentEntries = entries
  list.setEntries(entries, { query: raw, autoSelect: entries.length > 0 })
  listHeading.textContent = '检索结果'
  catalogCount.textContent = `找到 ${entries.length} 首`

  const empty = entries.length === 0
  listEmpty.hidden = !empty
  if (empty) listEmptyTitle.textContent = `没有找到「${raw.trim() || raw}」`
  resetPreview()

  appliedSearch = { query: normalized, count: entries.length }
  searchRecorder.update(raw, entries.length)
}

function clearSearch(): void {
  cancelScheduledSearch()
  searchInput.value = ''
  showCatalog()
  if (!app.hidden) searchInput.focus()
}

function applyHistory(next: HistoryData): void {
  historyData = next
  renderHistory()
}

async function loadHistory(): Promise<void> {
  if (!api) return
  try {
    applyHistory(await api.getHistory())
  } catch (error) {
    console.warn('[history] 读取历史失败', error)
  }
}

async function persistSearch(query: string): Promise<void> {
  if (!api) return
  try {
    applyHistory(await api.addSearch(query))
  } catch (error) {
    console.warn('[history] 记录搜索失败', error)
  }
}

async function persistOpened(number: number, title: string): Promise<void> {
  if (!api || !current) return
  try {
    applyHistory(await api.addOpened({ book: current.id, number, title }))
  } catch (error) {
    console.warn('[history] 记录打开失败', error)
  }
}

/** 只改根元素上的 CSS 变量，不触碰预览 DOM，因此改样式不会重排歌词节点。 */
function applyStyle(style: HymnStyle): void {
  for (const [name, value] of Object.entries(styleToCssVars(style))) {
    document.documentElement.style.setProperty(name, value)
  }
}

function changeStyle(patch: Partial<HymnStyle>): HymnStyle {
  currentStyle = clampStyle({ ...currentStyle, ...patch })
  applyStyle(currentStyle)
  scheduleStylePersist(currentStyle)
  pushProjectionStyle()
  return currentStyle
}

function scheduleStylePersist(style: HymnStyle): void {
  if (!api) return
  if (stylePersistTimer !== null) window.clearTimeout(stylePersistTimer)
  stylePersistTimer = window.setTimeout(() => {
    stylePersistTimer = null
    void persistStyle(style)
  }, 200)
}

async function persistStyle(style: HymnStyle): Promise<void> {
  if (!api) return
  try {
    await api.setStyle(style)
  } catch (error) {
    console.warn('[style] 保存样式失败', error)
  }
}

function flushStylePersistence(): void {
  if (stylePersistTimer === null) return
  window.clearTimeout(stylePersistTimer)
  stylePersistTimer = null
  void persistStyle(currentStyle)
}

function currentProjectionContent(): ProjectionContent | null {
  if (!current || !currentItem) return null
  return {
    book: current.id,
    number: currentItem.number,
    title: currentItem.title,
    verses: currentItem.verses ?? [],
    style: currentStyle,
    view: previewView,
  }
}

/** 歌词/曲谱 tab 是唯一切换入口；投屏窗口内不提供切换控件。 */
function setPreviewView(view: ProjectionView): void {
  if (previewView === view) return
  previewView = view
  const showLyrics = view === 'lyrics'
  tabLyrics.setAttribute('aria-selected', String(showLyrics))
  tabLyrics.tabIndex = showLyrics ? 0 : -1
  tabScore.setAttribute('aria-selected', String(!showLyrics))
  tabScore.tabIndex = showLyrics ? -1 : 0
  lyricsView.hidden = !showLyrics
  scorePanel.hidden = showLyrics
  score.setActive(!showLyrics)
  pushProjection()
}

function pushProjection(): void {
  if (!api || !projectionActive) return
  const content = currentProjectionContent()
  if (content) api.updateProjection(content)
}

function pushProjectionStyle(): void {
  if (!api || !projectionActive) return
  api.setProjectionStyle(currentStyle)
}

function setProjectionActive(active: boolean): void {
  projectionActive = active
  projectButton.textContent = active ? '投屏中' : '投屏'
  projectButton.classList.toggle('active', active)
  projectButton.setAttribute('aria-pressed', String(active))
  projectButton.title = active ? '关闭投屏（F5 / Ctrl+P）' : '投屏当前诗歌（F5 / Ctrl+P）'
}

async function toggleProjection(): Promise<void> {
  if (!api || app.hidden || projectButton.disabled) return
  try {
    const result = await api.toggleProjection(currentProjectionContent())
    if (result.needSelection) {
      showToast('请先选择一首诗')
      return
    }
    if (result.hint) showToast(result.hint)
    setProjectionActive(result.active)
  } catch (error) {
    console.warn('[projection] 切换投屏失败', error)
    showToast('投屏窗口打开失败')
  }
}

/** 投屏窗口里「上一首/下一首」由主进程改内容，这里让主窗口预览跟随。 */
function followProjection(content: ProjectionContent): void {
  const book = books.find((candidate) => candidate.id === content.book)
  if (!book) return
  const item = book.items.find((candidate) => candidate.number === content.number)
  if (!item) return

  if (!current || current.id !== book.id) selectBook(book, true)
  revealNumber(item.number)
  lyrics.show(item)
  score.setItem(item, book.id)
  currentItem = item
  setTopbarTitle(item)
  enterNarrowDetail()
}

function showToast(message: string): void {
  toast.textContent = message
  toast.hidden = false
  if (toastTimer !== null) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastTimer = null
    toast.hidden = true
  }, 2800)
}

function bindProjectionEvents(): void {
  if (!api) return
  api.onProjectionState((state) => setProjectionActive(state.active))
  api.onProjectionChanged((content) => followProjection(content))
}

async function loadFonts(): Promise<void> {
  if (!api) return
  try {
    const fonts = await api.listFonts()
    if (fonts.length > 0) stylePanel.setFonts(fonts)
  } catch (error) {
    console.warn('[fonts] 读取系统字体失败，保持固定候选', error)
  }
}

function revealNumber(number: number): void {
  const index = currentEntries.findIndex((entry) => entry.number === number)
  if (index >= 0) list.selectIndex(index)
}

function openHistory(entry: OpenEntry): void {
  const book = books.find((candidate) => candidate.id === entry.book)
  if (!book) return

  if (!current || current.id !== book.id) {
    selectBook(book, true)
  } else if (appliedSearch) {
    cancelScheduledSearch()
    searchInput.value = ''
    showCatalog()
  }

  const item = book.items.find((candidate) => candidate.number === entry.number)
  if (!item) {
    console.warn('[history] 历史记录对应的诗歌不在当前数据包中', entry)
    return
  }

  revealNumber(item.number)
  lyrics.show(item)
  score.setItem(item, book.id)
  currentItem = item
  setTopbarTitle(item)
  enterNarrowDetail()
  pushProjection()
  void persistOpened(item.number, item.title)
}

function renderHistory(): void {
  renderSearchChips()
  renderOpened()
  renderClearButton()
}

function renderSearchChips(): void {
  const chips = historyData.searches.map((entry) => {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'history-chip'
    chip.textContent = entry.q
    chip.title = `回填搜索「${entry.q}」`
    chip.addEventListener('click', () => fillSearch(entry.q))
    return chip
  })

  searchChips.replaceChildren(...chips)
  searchChips.hidden = chips.length === 0
  searchChipsEmpty.hidden = chips.length > 0
}

function fillSearch(query: string): void {
  if (app.hidden) return
  cancelScheduledSearch()
  searchInput.value = query
  runSearch()
  searchInput.focus()
  searchInput.setSelectionRange(query.length, query.length)
}

function renderOpened(): void {
  const now = new Date()
  const total = historyData.opened.length
  const visible = showAllOpened
    ? historyData.opened
    : historyData.opened.slice(0, RECENT_OPENED_COUNT)

  openedList.replaceChildren(...visible.map((entry) => renderOpenedEntry(entry, now)))
  openedList.hidden = total === 0
  openedEmpty.hidden = total > 0
  openedCount.textContent = total > 0 ? `${total} 条` : ''
  historyMore.hidden = total <= RECENT_OPENED_COUNT
  historyMore.textContent = showAllOpened ? '收起' : `展开全部（${total} 条）`
  historyMore.setAttribute('aria-expanded', String(showAllOpened))
}

function renderOpenedEntry(entry: OpenEntry, now: Date): HTMLLIElement {
  const item = document.createElement('li')

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'history-item'
  button.title = `打开第${entry.number}首 ${entry.title}`

  const number = document.createElement('span')
  number.className = 'history-item-num'
  number.textContent = `第${entry.number}首`

  const main = document.createElement('span')
  main.className = 'history-item-main'

  const title = document.createElement('span')
  title.className = 'history-item-title'
  title.textContent = entry.title || `第${entry.number}首`

  const meta = document.createElement('span')
  meta.className = 'history-item-meta'
  const relative = formatRelativeTime(entry.at, now)
  // 编号只在各自本内唯一：红本第1首与千首本第1首是两首不同的诗，
  // 因此来源必须始终显示，不能因「就是当前本」而省略，否则两条同名记录无法区分。
  meta.textContent = `${bookShortLabel(entry.book)} · ${relative}`
  meta.dataset.book = entry.book

  main.append(title, meta)
  button.append(number, main)
  button.addEventListener('click', () => openHistory(entry))
  item.append(button)
  return item
}

function bookShortLabel(id: string): string {
  const book = books.find((candidate) => candidate.id === id)
  if (!book) return id
  return (book.alias.split('/')[0] ?? '').trim() || book.name
}

function renderClearButton(): void {
  const empty = historyData.searches.length === 0 && historyData.opened.length === 0
  historyClear.disabled = empty
  historyClear.textContent = confirmingClear ? '确认清空？' : '清空历史'
  historyClear.classList.toggle('danger', confirmingClear)
}

function resetClearConfirm(): void {
  if (clearConfirmTimer !== null) {
    window.clearTimeout(clearConfirmTimer)
    clearConfirmTimer = null
  }
  confirmingClear = false
  renderClearButton()
}

async function clearHistoryNow(): Promise<void> {
  if (!api) return
  try {
    showAllOpened = false
    applyHistory(await api.clearHistory())
  } catch (error) {
    console.warn('[history] 清空历史失败', error)
  }
}

function showApp(pack: PackViewOk, currentBookId: string | null): void {
  guide.hidden = true
  app.hidden = false
  searchInput.disabled = false
  bookSelect.disabled = false
  styleButton.disabled = false
  projectButton.disabled = false

  books = pack.books
  bookSelect.replaceChildren(
    ...books.map((book) => {
      const option = document.createElement('option')
      option.value = book.id
      option.textContent = formatBookLabel(book)
      return option
    }),
  )

  const preferred = books.find((book) => book.id === currentBookId) ?? books[0]
  if (preferred) selectBook(preferred, false)
}

function selectBook(book: PackBook, persist: boolean): void {
  cancelScheduledSearch()
  composing = false
  current = book
  bookSelect.value = book.id
  searchInput.value = ''
  showCatalog()
  if (persist) {
    void api?.setCurrentBook(book.id).catch((error: unknown) => {
      console.warn('[settings] 保存选本失败', error)
    })
  }
}

function showGuide(pack: PackViewError): void {
  cancelScheduledSearch()
  app.hidden = true
  guide.hidden = false
  searchInput.disabled = true
  bookSelect.disabled = true
  styleButton.disabled = true
  projectButton.disabled = true

  const missing = pack.reason === 'missing'
  guideTitle.textContent = missing ? '未找到数据包' : '数据包无法读取'
  guideDesc.textContent = missing
    ? '应用没有在以下位置找到 hymns-data 数据包。放置后点击「重新检测」，无需重启。'
    : '找到了数据包，但内容校验未通过。请检查文件是否完整，修正后点击「重新检测」。'

  guidePaths.replaceChildren(
    ...pack.searchedPaths.map((path, index) => {
      const item = document.createElement('li')

      const order = document.createElement('span')
      order.className = 'path-index'
      order.textContent = `${index + 1}.`

      const code = document.createElement('code')
      code.textContent = path
      code.title = path

      item.append(order, code)

      const recommended = pack.recommendedPath ?? pack.searchedPaths[0]
      if (path === recommended) {
        const tag = document.createElement('span')
        tag.className = 'path-tag'
        tag.textContent = '推荐'
        item.append(tag)
      }

      return item
    }),
  )

  const detail = pack.reason === 'corrupt' ? pack.error : undefined
  guideError.hidden = !detail
  guideError.textContent = detail ?? ''
}

function applyBootstrap(bootstrap: Awaited<ReturnType<HymnApi['bootstrap']>>): void {
  currentStyle = clampStyle(bootstrap.style)
  applyStyle(currentStyle)
  stylePanel.setStyle(currentStyle)

  if (!bootstrap.pack.ok) {
    showGuide(bootstrap.pack)
    return
  }
  showApp(bootstrap.pack, bootstrap.currentBook)
}

bookSelect.addEventListener('change', () => {
  const book = books.find((candidate) => candidate.id === bookSelect.value)
  if (book) selectBook(book, true)
})

styleButton.addEventListener('click', () => {
  if (styleButton.disabled) return
  if (stylePanel.isOpen) {
    stylePanel.close()
    return
  }
  stylePanel.setStyle(currentStyle)
  stylePanel.open()
})

projectButton.addEventListener('click', () => {
  void toggleProjection()
})

backButton.addEventListener('click', backToNarrowList)

tabLyrics.addEventListener('click', () => setPreviewView('lyrics'))
tabScore.addEventListener('click', () => setPreviewView('score'))

searchInput.addEventListener('compositionstart', () => {
  composing = true
  cancelScheduledSearch()
})

searchInput.addEventListener('compositionend', () => {
  composing = false
  scheduleSearch()
})

searchInput.addEventListener('input', (event) => {
  if (composing || (event instanceof InputEvent && event.isComposing)) return
  scheduleSearch()
})

searchInput.addEventListener('keydown', (event) => {
  if (event.isComposing || composing) return

  if (event.key === 'Escape') {
    event.preventDefault()
    clearSearch()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    list.moveSelection(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    list.moveSelection(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    list.openSelected()
  }
})

document.addEventListener('keydown', (event) => {
  if (event.isComposing || composing) return

  const target = event.target
  const typing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement

  if (!app.hidden && event.key === 'Escape' && searchInput.value !== '') {
    event.preventDefault()
    clearSearch()
    return
  }

  if (!app.hidden && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    searchInput.focus()
    searchInput.select()
    return
  }

  if (
    !app.hidden &&
    (event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p'))
  ) {
    event.preventDefault()
    void toggleProjection()
    return
  }

  if (
    !app.hidden &&
    event.key === '/' &&
    !typing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault()
    searchInput.focus()
    searchInput.select()
    return
  }

  if (app.hidden || typing) return

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    list.moveSelection(event.key === 'ArrowDown' ? 1 : -1)
    return
  }

  if (event.key === 'Enter') {
    if (target instanceof Element && target.closest('.hymn-row')) return
    event.preventDefault()
    list.openSelected()
  }
})

historyToggle.addEventListener('click', () => {
  const nextExpanded = historyBody.hidden
  historyBody.hidden = !nextExpanded
  historyToggle.setAttribute('aria-expanded', String(nextExpanded))
})

historyClear.addEventListener('click', () => {
  if (historyClear.disabled) return

  if (!confirmingClear) {
    confirmingClear = true
    if (clearConfirmTimer !== null) window.clearTimeout(clearConfirmTimer)
    clearConfirmTimer = window.setTimeout(() => {
      clearConfirmTimer = null
      confirmingClear = false
      renderClearButton()
    }, 4000)
    renderClearButton()
    return
  }

  resetClearConfirm()
  void clearHistoryNow()
})

historyMore.addEventListener('click', () => {
  showAllOpened = !showAllOpened
  renderOpened()
})

window.setInterval(() => {
  if (!app.hidden) renderOpened()
}, 60_000)

guideRetry.addEventListener('click', () => {
  void recheck()
})

async function recheck(): Promise<void> {
  if (!api) return
  const label = guideRetry.textContent
  guideRetry.disabled = true
  guideRetry.textContent = '检测中…'
  try {
    applyBootstrap(await api.recheck())
  } catch (error) {
    guideError.hidden = false
    guideError.textContent = `重新检测失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    guideRetry.disabled = false
    guideRetry.textContent = label
  }
}

async function init(): Promise<void> {
  if (!api) {
    showGuide({
      ok: false,
      reason: 'corrupt',
      searchedPaths: [],
      error: '无法连接主进程（preload 未加载）。',
    })
    return
  }
  bindProjectionEvents()
  try {
    applyBootstrap(await api.bootstrap())
  } catch (error) {
    showGuide({
      ok: false,
      reason: 'corrupt',
      searchedPaths: [],
      error: `启动读取失败：${error instanceof Error ? error.message : String(error)}`,
    })
  }
  void loadHistory()
  void loadFonts()
}

renderChrome()
renderHistory()
void init()