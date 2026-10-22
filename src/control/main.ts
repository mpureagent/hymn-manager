import type { HymnApi, PackViewError, PackViewOk } from '../shared/ipc'
import type { PackBook } from '../shared/types'
import { buildCatalog, formatBookLabel } from '../shared/catalog'
import { normalizeQuery } from '../shared/normalize'
import { search } from '../shared/search'
import { ListView, type ListEntry } from './list-view'
import { LyricsView } from './lyrics-view'

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
const listHeading = el<HTMLElement>('list-heading')
const catalogCount = el<HTMLElement>('catalog-count')
const listEmpty = el<HTMLElement>('list-empty')
const listEmptyTitle = el<HTMLElement>('list-empty-title')

let books: PackBook[] = []
let current: PackBook | null = null
let searchTimer: number | null = null
let composing = false

const lyrics = new LyricsView({
  empty: el<HTMLElement>('preview-empty'),
  panel: el<HTMLElement>('preview-panel'),
  eyebrow: el<HTMLElement>('preview-eyebrow'),
  title: el<HTMLElement>('preview-title'),
  alt: el<HTMLElement>('preview-alt'),
  body: el<HTMLElement>('lyrics-body'),
})

const list = new ListView(el<HTMLElement>('hymn-list'), {
  overscan: 6,
  onOpen: (entry) => showPreview(entry),
})

function showPreview(entry: ListEntry): void {
  const item = current?.items.find((candidate) => candidate.number === entry.number)
  if (item) lyrics.show(item)
}

function resetPreview(): void {
  lyrics.clear()
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
  const entries = buildCatalog(current.items)
  list.setEntries(entries)
  listHeading.textContent = '全目录'
  catalogCount.textContent = `共 ${entries.length} 首`
  listEmpty.hidden = true
  resetPreview()
}

function runSearch(): void {
  if (!current) return
  const raw = searchInput.value
  if (!normalizeQuery(raw)) {
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

  list.setEntries(entries, { query: raw, autoSelect: entries.length > 0 })
  listHeading.textContent = '检索结果'
  catalogCount.textContent = `找到 ${entries.length} 首`

  const empty = entries.length === 0
  listEmpty.hidden = !empty
  if (empty) listEmptyTitle.textContent = `没有找到「${raw.trim() || raw}」`
  resetPreview()
}

function clearSearch(): void {
  cancelScheduledSearch()
  searchInput.value = ''
  showCatalog()
  if (!app.hidden) searchInput.focus()
}

function showApp(pack: PackViewOk, currentBookId: string | null): void {
  guide.hidden = true
  app.hidden = false
  searchInput.disabled = false
  bookSelect.disabled = false

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
}

void init()