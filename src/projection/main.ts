import type { ProjectionApi } from '../shared/ipc'
import {
  buildProjectionPages,
  formatProjectionPage,
  type ProjectionContent,
  type ProjectionPage,
} from '../shared/projection'
import { styleToCssVars, type HymnStyle } from '../shared/style'

const api: ProjectionApi | undefined = window.projection

const CONTROL_HIDE_MS = 3000

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

const pageNode = el<HTMLElement>('page')
const linesNode = el<HTMLElement>('lines')
const emptyNode = el<HTMLElement>('empty')
const indicator = el<HTMLElement>('indicator')
const controls = el<HTMLElement>('controls')
const controlPage = el<HTMLElement>('control-page')
const prevPage = controls.querySelector<HTMLButtonElement>('[data-action="prev-page"]')
const nextPage = controls.querySelector<HTMLButtonElement>('[data-action="next-page"]')
const prevHymn = controls.querySelector<HTMLButtonElement>('[data-action="prev-hymn"]')
const nextHymn = controls.querySelector<HTMLButtonElement>('[data-action="next-hymn"]')
const exitButton = controls.querySelector<HTMLButtonElement>('[data-action="exit"]')

let content: ProjectionContent | null = null
let pages: ProjectionPage[] = []
let pageIndex = 0
let hideTimer: number | null = null

/** 与主窗口预览共用同一份 styleToCssVars()，保证所见即所投。 */
function applyStyle(style: HymnStyle): void {
  for (const [name, value] of Object.entries(styleToCssVars(style))) {
    document.documentElement.style.setProperty(name, value)
  }
}

function setContent(next: ProjectionContent | null): void {
  const sameSong =
    content !== null &&
    next !== null &&
    content.book === next.book &&
    content.number === next.number

  content = next
  if (content) applyStyle(content.style)
  if (!sameSong) pageIndex = 0
  pages = content ? buildProjectionPages(content.verses) : []
  render()
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
    if (content) content = { ...content, style }
    applyStyle(style)
  })

  try {
    setContent(await api.pull())
  } catch (error) {
    console.warn('[projection] 拉取投屏内容失败', error)
    setContent(null)
  }
}

void init()