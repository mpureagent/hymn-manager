import type { CatalogEntry } from '../shared/catalog'
import { computeRange } from '../shared/virtual'

export interface VirtualListOptions {
  rowHeight?: number
  overscan?: number
  onSelect?: (entry: CatalogEntry) => void
}

/** 固定行高虚拟列表：1200+ 条只保留可视区附近的行节点。 */
export class VirtualList {
  private readonly viewport: HTMLElement
  private readonly spacer: HTMLDivElement
  private readonly layer: HTMLDivElement
  private readonly rowHeight: number
  private readonly overscan: number
  private readonly onSelect?: (entry: CatalogEntry) => void
  private readonly resizeObserver: ResizeObserver
  private entries: CatalogEntry[] = []
  private readonly rows = new Map<number, HTMLButtonElement>()
  private selected: number | null = null
  private frame = 0

  constructor(viewport: HTMLElement, options: VirtualListOptions = {}) {
    this.viewport = viewport
    this.rowHeight = options.rowHeight ?? 44
    this.overscan = options.overscan ?? 6
    this.onSelect = options.onSelect

    this.spacer = document.createElement('div')
    this.spacer.className = 'vl-spacer'
    this.layer = document.createElement('div')
    this.layer.className = 'vl-layer'
    viewport.replaceChildren(this.spacer, this.layer)

    viewport.addEventListener('scroll', () => this.schedule(), { passive: true })
    this.resizeObserver = new ResizeObserver(() => this.schedule())
    this.resizeObserver.observe(viewport)
  }

  setItems(entries: CatalogEntry[]): void {
    this.entries = entries
    this.selected = null
    for (const row of this.rows.values()) row.remove()
    this.rows.clear()
    this.spacer.style.height = `${entries.length * this.rowHeight}px`
    this.viewport.scrollTop = 0
    this.render()
  }

  setSelected(number: number | null): void {
    this.selected = number
    for (const [index, row] of this.rows) {
      const entry = this.entries[index]
      const active = entry?.number === number
      row.classList.toggle('selected', active)
      row.setAttribute('aria-selected', String(active))
    }
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.rows.clear()
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

  private createRow(entry: CatalogEntry, index: number): HTMLButtonElement {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'hymn-row'
    row.style.top = `${index * this.rowHeight}px`
    row.style.height = `${this.rowHeight}px`
    row.dataset.number = String(entry.number)
    row.setAttribute('role', 'option')
    row.setAttribute('aria-selected', String(entry.number === this.selected))

    const number = document.createElement('span')
    number.className = 'hymn-row-num'
    number.textContent = `第${entry.number}首`

    const title = document.createElement('span')
    title.className = 'hymn-row-title'
    title.textContent = entry.title

    row.append(number, title)
    if (entry.number === this.selected) row.classList.add('selected')

    row.addEventListener('click', () => {
      this.setSelected(entry.number)
      this.onSelect?.(entry)
    })

    return row
  }
}