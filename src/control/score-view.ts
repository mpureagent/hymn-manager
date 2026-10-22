import { SCORE_MAX_ZOOM, SCORE_MIN_ZOOM, filePathToUrl, stepScoreZoom } from '../shared/score'
import type { HymnItem } from '../shared/types'

const STAGE_PADDING = 24

export interface ScoreViewRefs {
  viewport: HTMLElement
  image: HTMLImageElement
  zoomValue: HTMLElement
  zoomIn: HTMLButtonElement
  zoomOut: HTMLButtonElement
  message: HTMLElement
  messageTitle: HTMLElement
  messagePath: HTMLElement
}

export interface ScoreViewOptions {
  resolvePath(book: string, number: number): Promise<string | null>
}

/** 曲谱视图：按需加载一张扫描图，支持适应高度、50–300% 缩放与拖拽平移。 */
export class ScoreView {
  private readonly refs: ScoreViewRefs
  private readonly options: ScoreViewOptions
  private readonly resizeObserver: ResizeObserver
  private item: HymnItem | null = null
  private bookId: string | null = null
  private active = false
  private loaded = false
  private mode: 'fit' | 'zoom' = 'fit'
  private percent = 100
  private naturalWidth = 0
  private naturalHeight = 0
  private loadToken = 0
  private resizeFrame = 0

  constructor(refs: ScoreViewRefs, options: ScoreViewOptions) {
    this.refs = refs
    this.options = options

    refs.zoomIn.addEventListener('click', () => this.zoomBy(1))
    refs.zoomOut.addEventListener('click', () => this.zoomBy(-1))
    refs.viewport.addEventListener('wheel', this.onWheel, { passive: false })
    refs.viewport.addEventListener('dblclick', this.onDoubleClick)
    refs.viewport.addEventListener('mousedown', this.onMouseDown)
    refs.image.addEventListener('load', this.onImageLoad)
    refs.image.addEventListener('error', this.onImageError)

    document.addEventListener('keydown', this.onKeyDown)
    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(refs.viewport)
    this.renderControls()
  }

  setItem(item: HymnItem | null, bookId: string | null): void {
    const same =
      item !== null &&
      this.item !== null &&
      this.bookId === bookId &&
      this.item.number === item.number
    if (same) return

    this.item = item
    this.bookId = bookId
    this.resetToFit()
    this.unload()
    if (this.active && item) void this.load(item)
  }

  setActive(active: boolean): void {
    this.active = active
    if (!active) return
    if (!this.item) return
    if (!this.loaded) {
      void this.load(this.item)
      return
    }
    if (this.mode === 'fit') {
      this.applyFit()
      return
    }
    this.updatePanState()
    this.renderControls()
  }

  clear(): void {
    this.item = null
    this.bookId = null
    this.loadToken += 1
    this.unload()
    this.resetToFit()
  }

  private async load(item: HymnItem): Promise<void> {
    const bookId = this.bookId
    if (!bookId) return

    const token = ++this.loadToken
    this.loaded = false
    this.refs.image.hidden = true
    this.refs.image.removeAttribute('src')
    this.refs.message.hidden = true
    this.refs.messagePath.hidden = true
    this.renderControls()

    let path: string | null = null
    try {
      path = await this.options.resolvePath(bookId, item.number)
    } catch (error) {
      console.warn('[score] 解析曲谱路径失败', error)
    }
    if (token !== this.loadToken) return

    if (!path) {
      this.showMessage('本首暂无曲谱', '')
      return
    }

    this.refs.image.alt = `${item.title} 曲谱`
    this.refs.image.src = filePathToUrl(path)
    this.refs.image.dataset.path = path
  }

  private readonly onImageLoad = (): void => {
    if (!this.active) return
    const image = this.refs.image
    this.naturalWidth = image.naturalWidth
    this.naturalHeight = image.naturalHeight
    if (this.naturalWidth <= 0 || this.naturalHeight <= 0) {
      this.onImageError()
      return
    }

    this.loaded = true
    this.refs.message.hidden = true
    this.resetToFit()
    // 先按自然尺寸计算再显示，避免原图瞬间撑出滚动条、把可用高度量小。
    this.applyFit()
    image.hidden = false
    this.updatePanState()
  }

  private readonly onImageError = (): void => {
    if (!this.active) return
    this.loaded = false
    const path = this.refs.image.dataset.path ?? ''
    this.showMessage('曲谱加载失败', path)
  }

  private showMessage(title: string, path: string): void {
    this.refs.image.hidden = true
    this.refs.message.hidden = false
    this.refs.messageTitle.textContent = title
    this.refs.messagePath.textContent = path
    this.refs.messagePath.hidden = path === ''
    this.percent = 100
    this.mode = 'fit'
    this.renderControls(true)
  }

  private unload(): void {
    this.loaded = false
    this.naturalWidth = 0
    this.naturalHeight = 0
    this.refs.image.hidden = true
    this.refs.image.removeAttribute('src')
    delete this.refs.image.dataset.path
    this.refs.image.style.width = ''
    this.refs.image.style.height = ''
    this.refs.message.hidden = true
    this.refs.viewport.scrollLeft = 0
    this.refs.viewport.scrollTop = 0
    this.renderControls(true)
  }

  private resetToFit(): void {
    this.mode = 'fit'
    this.percent = 100
  }

  /** 等比放入容器（同时受宽高限制），居中显示。 */
  private applyFit(): void {
    if (!this.loaded) return
    const viewport = this.refs.viewport
    const width = viewport.clientWidth - STAGE_PADDING
    const height = viewport.clientHeight - STAGE_PADDING
    if (width <= 0 || height <= 0) {
      this.scheduleResize()
      return
    }

    const scale = Math.min(width / this.naturalWidth, height / this.naturalHeight)
    this.mode = 'fit'
    this.percent = Math.max(1, scale * 100)
    this.applySize(scale, false)
  }

  private zoomBy(direction: -1 | 1): void {
    if (!this.loaded) return
    const next = stepScoreZoom(this.percent, direction)
    if (Math.round(next) === Math.round(this.percent)) return
    this.mode = 'zoom'
    this.percent = next
    this.applySize(next / 100, true)
  }

  private applySize(scale: number, keepCenter: boolean): void {
    const viewport = this.refs.viewport
    const image = this.refs.image

    const previousWidth = viewport.scrollWidth
    const previousHeight = viewport.scrollHeight
    const centerX = previousWidth > 0 ? (viewport.scrollLeft + viewport.clientWidth / 2) / previousWidth : 0.5
    const centerY =
      previousHeight > 0 ? (viewport.scrollTop + viewport.clientHeight / 2) / previousHeight : 0.5

    image.style.width = `${Math.round(this.naturalWidth * scale)}px`
    image.style.height = `${Math.round(this.naturalHeight * scale)}px`

    if (!keepCenter) {
      viewport.scrollLeft = 0
      viewport.scrollTop = 0
    } else {
      viewport.scrollLeft = Math.max(0, centerX * viewport.scrollWidth - viewport.clientWidth / 2)
      viewport.scrollTop = Math.max(0, centerY * viewport.scrollHeight - viewport.clientHeight / 2)
    }

    this.updatePanState()
    this.renderControls()
  }

  private updatePanState(): void {
    const viewport = this.refs.viewport
    const pannable =
      viewport.scrollWidth > viewport.clientWidth + 1 ||
      viewport.scrollHeight > viewport.clientHeight + 1
    viewport.classList.toggle('pannable', pannable && this.loaded)
  }

  private renderControls(message = false): void {
    if (message || !this.loaded) {
      this.refs.zoomValue.textContent = '—'
      this.refs.zoomIn.disabled = true
      this.refs.zoomOut.disabled = true
      this.refs.viewport.dataset.zoom = ''
      return
    }

    const percent = Math.round(this.percent)
    this.refs.zoomValue.textContent = `${percent}%`
    this.refs.zoomValue.title = this.mode === 'fit' ? '适应高度（双击切换 100%）' : '双击回到适应高度'
    this.refs.zoomOut.disabled = percent <= SCORE_MIN_ZOOM
    this.refs.zoomIn.disabled = percent >= SCORE_MAX_ZOOM
    this.refs.viewport.dataset.zoom = String(percent)
    this.refs.viewport.dataset.mode = this.mode
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.active || !this.loaded) return
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    this.zoomBy(event.deltaY < 0 ? 1 : -1)
  }

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (!this.active || !this.loaded) return
    if (event.button !== 0) return
    event.preventDefault()
    if (this.mode === 'fit') {
      this.mode = 'zoom'
      this.percent = 100
      this.applySize(1, true)
    } else {
      this.applyFit()
    }
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.active || !this.loaded || event.button !== 0) return
    const viewport = this.refs.viewport
    if (
      viewport.scrollWidth <= viewport.clientWidth + 1 &&
      viewport.scrollHeight <= viewport.clientHeight + 1
    ) {
      return
    }

    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const startLeft = viewport.scrollLeft
    const startTop = viewport.scrollTop
    viewport.classList.add('dragging')

    const move = (moveEvent: MouseEvent): void => {
      viewport.scrollLeft = startLeft - (moveEvent.clientX - startX)
      viewport.scrollTop = startTop - (moveEvent.clientY - startY)
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      viewport.classList.remove('dragging')
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.active || !this.loaded) return
    if (!(event.ctrlKey || event.metaKey) || event.key !== '0') return
    event.preventDefault()
    this.applyFit()
  }

  private onResize(): void {
    if (!this.active || !this.loaded) return
    if (this.mode !== 'fit') {
      this.updatePanState()
      return
    }
    this.scheduleResize()
  }

  private scheduleResize(): void {
    if (this.resizeFrame) return
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0
      if (this.mode === 'fit') this.applyFit()
    })
  }
}