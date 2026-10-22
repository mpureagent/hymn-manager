import type { ProjectionApi } from '../shared/ipc'
import {
  computeProjectionCapacity,
  formatProjectionPage,
  paginateVerses,
  type ProjectionContent,
  type ProjectionPage,
} from '../shared/projection'
import { styleToCssVars, type HymnStyle } from '../shared/style'

const api: ProjectionApi | undefined = window.projection

const CONTROL_HIDE_MS = 3000
/** 兜底降字号的下限，与 FONT_SIZE_MIN 保持一致。 */
const FIT_MIN_FONT_SIZE = 24
const FIT_SCALE_STEP = 0.9
const CONTROL_SAFE_GAP = 12
/** 舞台原本的下边距，控制条安全区更大时在 JS 里取 max。 */
const STAGE_BOTTOM_PADDING = '10vh'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

const stage = el<HTMLElement>('stage')

const pageNode = el<HTMLElement>('page')
const linesNode = el<HTMLElement>('lines')
const emptyNode = el<HTMLElement>('empty')
const indicator = el<HTMLElement>('indicator')
const controls = el<HTMLElement>('controls')
const controlPage = el<HTMLElement>('control-page')
const fitHint = el<HTMLElement>('fit-hint')
const prevPage = controls.querySelector<HTMLButtonElement>('[data-action="prev-page"]')
const nextPage = controls.querySelector<HTMLButtonElement>('[data-action="next-page"]')
const prevHymn = controls.querySelector<HTMLButtonElement>('[data-action="prev-hymn"]')
const nextHymn = controls.querySelector<HTMLButtonElement>('[data-action="next-hymn"]')
const exitButton = controls.querySelector<HTMLButtonElement>('[data-action="exit"]')

let content: ProjectionContent | null = null
let pages: ProjectionPage[] = []
let pageIndex = 0
let effectiveFontSize = 0
let hideTimer: number | null = null
let resizeFrame: number | null = null

/** 与主窗口预览共用同一份 styleToCssVars()，保证所见即所投。 */
function applyStyle(style: HymnStyle, fontSize = style.fontSize): void {
  const vars = styleToCssVars(style)
  if (fontSize !== style.fontSize) vars['--hymn-font-size'] = `${fontSize}px`
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value)
  }
}

/**
 * 舞台下边距至少 10vh；控制条/页码更高时把安全区顶上去，
 * 这样 flex 居中后的歌词块天然避开控制条，容量计算也只需读实际 padding。
 */
function updateStagePadding(): void {
  const controlsStyle = getComputedStyle(controls)
  const controlsBottom = Number.parseFloat(controlsStyle.bottom) || 0
  let safeBottom = controlsBottom + controls.offsetHeight + CONTROL_SAFE_GAP

  if (!indicator.hidden) {
    const indicatorStyle = getComputedStyle(indicator)
    const indicatorBottom = Number.parseFloat(indicatorStyle.bottom) || 0
    safeBottom = Math.max(safeBottom, indicatorBottom + indicator.offsetHeight + CONTROL_SAFE_GAP)
  }

  stage.style.paddingBottom = `max(${STAGE_BOTTOM_PADDING}, ${Math.round(safeBottom)}px)`
}

function measureMetrics(fontSize: number, lineHeight: number) {
  const stageStyle = getComputedStyle(stage)
  return {
    viewportHeight: window.innerHeight,
    paddingTop: Number.parseFloat(stageStyle.paddingTop) || 0,
    safeBottom: Number.parseFloat(stageStyle.paddingBottom) || 0,
    lineHeightPx: fontSize * lineHeight,
  }
}

/** 渲染后的运行时断言：歌词块高出可用区域（或压到控制条）即视为溢出。 */
function pageOverflows(available: number): boolean {
  if (pageNode.hidden) return false

  const stageStyle = getComputedStyle(stage)
  const paddingTop = Number.parseFloat(stageStyle.paddingTop) || 0
  const paddingBottom = Number.parseFloat(stageStyle.paddingBottom) || 0
  const rect = linesNode.getBoundingClientRect()

  return (
    rect.height > available + 1 ||
    rect.top < paddingTop - 1 ||
    rect.bottom > window.innerHeight - paddingBottom + 1
  )
}

/**
 * 按当前字号/视口重新算容量并分页。
 * 逐页做溢出断言：只要任何一页溢出（多为大字号长行换行），
 * 就按 90% 递减字号重排，最低到 24px。
 */
function relayout(): void {
  if (!content) {
    pages = []
    render()
    updateFitHint()
    return
  }

  updateStagePadding()

  const style = content.style
  let fontSize = style.fontSize

  for (;;) {
    applyStyle(style, fontSize)

    const metrics = measureMetrics(fontSize, style.lineHeight)
    const capacity = computeProjectionCapacity(metrics)
    const candidate = paginateVerses(content.verses, capacity)
    const available = metrics.viewportHeight - metrics.paddingTop - metrics.safeBottom

    let overflow = false
    for (let index = 0; index < candidate.length; index += 1) {
      renderPageAt(candidate, index)
      if (pageOverflows(available)) {
        overflow = true
        break
      }
    }

    const next = Math.max(FIT_MIN_FONT_SIZE, Math.round(fontSize * FIT_SCALE_STEP))
    if (!overflow || fontSize <= FIT_MIN_FONT_SIZE || next >= fontSize) {
      pages = candidate
      pageIndex = Math.min(Math.max(0, pageIndex), Math.max(0, pages.length - 1))
      render()
      break
    }
    fontSize = next
  }

  effectiveFontSize = fontSize
  updateFitHint()
}

/** 只换歌词节点，供逐页溢出测量使用；页码等状态由最终 render() 统一更新。 */
function renderPageAt(candidate: ProjectionPage[], index: number): void {
  const page = candidate[index]
  const hasLines = page !== undefined && page.lines.length > 0
  pageNode.hidden = !hasLines
  emptyNode.hidden = hasLines
  linesNode.replaceChildren(...(hasLines && page ? page.lines.map(toLine) : []))
}

function updateFitHint(): void {
  const shrunk = content !== null && effectiveFontSize < content.style.fontSize
  fitHint.hidden = !shrunk
  fitHint.textContent = shrunk ? `字号已自动缩至 ${effectiveFontSize}px 防裁切` : ''
}

function setContent(next: ProjectionContent | null): void {
  const sameSong =
    content !== null &&
    next !== null &&
    content.book === next.book &&
    content.number === next.number

  content = next
  if (!sameSong) pageIndex = 0

  if (content) {
    relayout()
  } else {
    pages = []
    render()
    updateFitHint()
  }
}

function render(): void {
  const page = pages[pageIndex]
  const hasLines = page !== undefined && page.lines.length > 0

  pageNode.hidden = !hasLines
  emptyNode.hidden = hasLines

  if (!content) {
    emptyNode.textContent = '等待主窗口投屏'
    indicator.hidden = true
    controlPage.textContent = '1/1'
    setEnabled(prevPage, false)
    setEnabled(nextPage, false)
    setEnabled(prevHymn, false)
    setEnabled(nextHymn, false)
    return
  }

  setEnabled(prevHymn, true)
  setEnabled(nextHymn, true)

  if (!hasLines || !page) {
    emptyNode.textContent = `${content.title} · 本首歌词暂缺`
    indicator.hidden = true
    controlPage.textContent = formatProjectionPage(0, pages.length)
    setEnabled(prevPage, false)
    setEnabled(nextPage, false)
    return
  }

  linesNode.replaceChildren(...page.lines.map(toLine))

  const label = formatProjectionPage(pageIndex, pages.length)
  indicator.textContent = label
  indicator.hidden = false
  controlPage.textContent = label
  setEnabled(prevPage, pageIndex > 0)
  setEnabled(nextPage, pageIndex < pages.length - 1)
}

function toLine(text: string): HTMLParagraphElement {
  const line = document.createElement('p')
  line.className = 'lyric-line'
  line.textContent = text
  return line
}

function setEnabled(button: HTMLButtonElement | null, enabled: boolean): void {
  if (button) button.disabled = !enabled
}

function turnPage(delta: number): void {
  if (!content || pages.length === 0) return
  const next = Math.min(pages.length - 1, Math.max(0, pageIndex + delta))
  if (next === pageIndex) return
  pageIndex = next
  render()
}

function navigateHymn(direction: -1 | 1): void {
  api?.navigate(direction)
}

function closeWindow(): void {
  if (api) api.close()
  else window.close()
}

function showControls(): void {
  controls.classList.add('visible')
  controls.setAttribute('aria-hidden', 'false')
  if (hideTimer !== null) window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(hideControls, CONTROL_HIDE_MS)
}

function hideControls(): void {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
  controls.classList.remove('visible')
  controls.setAttribute('aria-hidden', 'true')
}

window.addEventListener('mousemove', showControls, { passive: true })

window.addEventListener('resize', () => {
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null
    relayout()
  })
})

controls.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLButtonElement>('button[data-action]')
  if (!button) return

  switch (button.dataset.action) {
    case 'prev-hymn':
      navigateHymn(-1)
      break
    case 'next-hymn':
      navigateHymn(1)
      break
    case 'prev-page':
      turnPage(-1)
      break
    case 'next-page':
      turnPage(1)
      break
    case 'exit':
      closeWindow()
      break
    default:
      break
  }
})

document.addEventListener('keydown', (event) => {
  if (event.isComposing) return

  switch (event.key) {
    case 'PageDown':
    case 'ArrowDown':
      event.preventDefault()
      turnPage(1)
      break
    case 'PageUp':
    case 'ArrowUp':
      event.preventDefault()
      turnPage(-1)
      break
    case 'Escape':
      event.preventDefault()
      closeWindow()
      break
    default:
      break
  }
})

async function init(): Promise<void> {
  if (!api) {
    emptyNode.hidden = false
    emptyNode.textContent = '投屏接口未连接'
    return
  }

  api.onContent(setContent)
  api.onStyle((style) => {
    if (content) {
      content = { ...content, style }
      relayout()
    } else {
      applyStyle(style)
    }
  })

  try {
    setContent(await api.pull())
  } catch (error) {
    console.warn('[projection] 拉取投屏内容失败', error)
    setContent(null)
  }

  // 字体懒加载完成后行宽可能变化，重新量一次。
  void document.fonts.ready.then(() => {
    if (content) relayout()
  })
}

void init()