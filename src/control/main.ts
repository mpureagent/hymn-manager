import type { HymnApi, PackViewError, PackViewOk } from '../shared/ipc'
import type { PackBook } from '../shared/types'
import { buildCatalog, formatBookLabel, type CatalogEntry } from '../shared/catalog'
import { VirtualList } from './virtual-list'

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
const catalogCount = el<HTMLElement>('catalog-count')
const previewEmpty = el<HTMLElement>('preview-empty')
const previewSelected = el<HTMLElement>('preview-selected')
const previewEyebrow = el<HTMLElement>('preview-eyebrow')
const previewTitle = el<HTMLElement>('preview-title')

let books: PackBook[] = []
let current: PackBook | null = null

const list = new VirtualList(el<HTMLElement>('hymn-list'), {
  rowHeight: 44,
  overscan: 6,
  onSelect: showPreview,
})

function showPreview(entry: CatalogEntry): void {
  previewEmpty.hidden = true
  previewSelected.hidden = false
  previewEyebrow.textContent = `第 ${entry.number} 首`
  previewTitle.textContent = entry.title
}

function resetPreview(): void {
  previewSelected.hidden = true
  previewEmpty.hidden = false
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
  current = book
  bookSelect.value = book.id
  searchInput.value = ''
  const entries = buildCatalog(book.items)
  list.setItems(entries)
  catalogCount.textContent = `共 ${entries.length} 首`
  resetPreview()
  if (persist) {
    void api?.setCurrentBook(book.id).catch((error: unknown) => {
      console.warn('[settings] 保存选本失败', error)
    })
  }
}

function showGuide(pack: PackViewError): void {
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

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    searchInput.value = ''
  }
})

document.addEventListener('keydown', (event) => {
  const target = event.target
  const typing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement

  if (event.key === 'Escape' && searchInput.value !== '') {
    event.preventDefault()
    searchInput.value = ''
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    searchInput.focus()
    searchInput.select()
    return
  }

  if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    searchInput.focus()
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