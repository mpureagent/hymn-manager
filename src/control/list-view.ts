import { findMatchRange } from '../shared/normalize'
import type { SearchResultKind } from '../shared/search'
import { computeRange } from '../shared/virtual'

export interface ListEntry {
  number: number
  title: string
  excerpt?: string
  kind?: SearchResultKind
}

export interface SetEntriesOptions {
  /** 原始查询词，用于 <mark> 高亮（不做二次归一化） */
  query?: string
  /** 检索结果默认选中首条，便于直接 Enter 打开；目录不选中 */
  autoSelect?: boolean
}

export interface ListViewOptions {
  overscan?: number
  onOpen?: (entry: ListEntry, index: number) => void
}

const ROW_HEIGHT = 44
const EXCERPT_ROW_HEIGHT = 60

const KIND_LABEL: Partial<Record<SearchResultKind, string>> = {
  number: '编号',
  firstline: '首句',
  alias: '别名',
}

/** 固定行高虚拟列表：目录与检索结果共用，只保留可视区附近的行节点。 */
export class ListView {
  private readonly viewport: HTMLElement
  private readonly spacer: HTMLDivElement
  private readonly layer: HTMLDivElement
  private readonly overscan: number
  private readonly onOpen?: (entry: ListEntry, index: number) => void
  private readonly resizeObserver: ResizeObserver
  private entries: ListEntry[] = []
  private readonly rows = new Map<number, HTMLButtonElement>()
  private rowHeight = ROW_HEIGHT
  private query = ''
  private selected: number | null = null
  private frame = 0

  constructor(viewport: HTMLElement, options: ListViewOptions = {}) {
    this.viewport = viewport
    this.overscan = options.overscan ?? 6
    this.onOpen = options.onOpen

    this.spacer = document.createElement('div')
    this.spacer.className = 'vl-spacer'
    this.layer = document.createElement('div')
    this.layer.className = 'vl-layer'
    viewport.replaceChildren(this.spacer, this.layer)

    viewport.addEventListener('scroll', () => this.schedule(), { passive: true })
    this.resizeObserver = new ResizeObserver(() => this.schedule())
    this.resizeObserver.observe(viewport)
  }

  setEntries(entries: ListEntry[], options: SetEntriesOptions = {}): void {
    this.entries = entries
    this.query = options.query ?? ''
    this.rowHeight = entries.some((entry) => entry.excerpt) ? EXCERPT_ROW_HEIGHT : ROW_HEIGHT
    this.selected = options.autoSelect && entries.length > 0 ? 0 : null

    for (const row of this.rows.values()) row.remove()
    this.rows.clear()
    this.spacer.style.height = `${entries.length * this.rowHeight}px`
    this.viewport.scrollTop = 0
    this.render()
  }

  moveSelection(delta: number): void {
    if (this.entries.length === 0) return
    const focusRow = this.viewport.contains(document.activeElement)
    const next =
      this.selected === null
        ? delta > 0
          ? 0
          : this.entries.length - 1
        : Math.min(this.entries.length - 1, Math.max(0, this.selected + delta))
    this.selectIndex(next, focusRow)
  }

  selectIndex(index: number, focusRow = false): void {
    if (index < 0 || index >= this.entries.length) return
    this.selected = index
    this.applySelection()
    this.ensureVisible(index)
    this.render()
    if (focusRow) this.rows.get(index)?.focus()
  }

  openSelected(): void {
    if (this.selected === null) return
    const entry = this.entries[this.selected]
    if (entry) this.onOpen?.(entry, this.selected)
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.rows.clear()
  }

  private applySelection(): void {
    for (const [index, row] of this.rows) {
      const active = index === this.selected
      row.classList.toggle('selected', active)
      row.setAttribute('aria-selected', String(active))
    }
  }

  private ensureVisible(index: number): void {
    const top = index * this.rowHeight
    const bottom = top + this.rowHeight
    const viewTop = this.viewport.scrollTop
    const viewBottom = viewTop + this.viewport.clientHeight

    if (top < viewTop) {
      this.viewport.scrollTop = top
    } else if (bottom > viewBottom) {
      this.viewport.scrollTop = bottom - this.viewport.clientHeight
    }
  }

  private schedule(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  private render(): void {
    const { start, end, totalHeight } = computeRange(
      this.viewport.scrollTop,
      this.viewport.clientHeight,
      this.rowHeight,
      this.entries.length,
      this.overscan,
    )

    this.spacer.style.height = `${totalHeight}px`

    for (const [index, row] of this.rows) {
      if (index < start || index >= end) {
        row.remove()
        this.rows.delete(index)
      }
    }

    for (let index = start; index < end; index += 1) {
      if (this.rows.has(index)) continue
      const entry = this.entries[index]
      if (!entry) continue
      const row = this.createRow(entry, index)
      this.layer.appendChild(row)
      this.rows.set(index, row)
    }
  }

  private createRow(entry: ListEntry, index: number): HTMLButtonElement {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'hymn-row'
    row.style.top = `${index * this.rowHeight}px`
    row.style.height = `${this.rowHeight}px`
    row.dataset.number = String(entry.number)
    row.dataset.index = String(index)
    row.dataset.kind = entry.kind ?? ''
    row.setAttribute('role', 'option')
    row.setAttribute('aria-selected', String(index === this.selected))
    if (index === this.selected) row.classList.add('selected')

    const number = document.createElement('span')
    number.className = 'hymn-row-num'
    this.fillHighlighted(number, `第${entry.number}首`)

    const main = document.createElement('span')
    main.className = 'hymn-row-main'

    const titleLine = document.createElement('span')
    titleLine.className = 'hymn-row-title-line'

    const title = document.createElement('span')
    title.className = 'hymn-row-title'
    this.fillHighlighted(title, entry.title)

    const label = entry.kind ? KIND_LABEL[entry.kind] : undefined
    if (label) {
      const tag = document.createElement('span')
      tag.className = 'hymn-row-tag'
      tag.textContent = label
      titleLine.append(title, tag)
    } else {
      titleLine.append(title)
    }
    main.append(titleLine)

    if (entry.excerpt) {
      const excerpt = document.createElement('span')
      excerpt.className = 'hymn-row-excerpt'
      this.fillHighlighted(excerpt, entry.excerpt)
      main.append(excerpt)
    }

    row.append(number, main)
    row.addEventListener('click', () => {
      this.selectIndex(index)
      this.onOpen?.(entry, index)
    })

    return row
  }

  private fillHighlighted(target: HTMLElement, text: string): void {
    const range = this.query ? findMatchRange(text, this.query) : null
    if (!range) {
      target.textContent = text
      return
    }

    if (range.start > 0) {
      target.append(document.createTextNode(text.slice(0, range.start)))
    }
    const mark = document.createElement('mark')
    mark.textContent = text.slice(range.start, range.end)
    target.append(mark)
    if (range.end < text.length) {
      target.append(document.createTextNode(text.slice(range.end)))
    }
  }
}