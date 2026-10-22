import { clampStyle, type HymnStyle } from './style'
import type { HymnVerse } from './types'

export interface ProjectionContent {
  book: string
  number: number
  title: string
  verses: HymnVerse[]
  style: HymnStyle
}

export interface ProjectionPage {
  label: string
  lines: string[]
  /** 同一段被拆到后续页时为 true，首行带「（续）」。 */
  continued?: boolean
}

export interface ProjectionLayout {
  /** 投屏窗口可视高度（CSS px）。 */
  viewportHeight: number
  /** 舞台上内边距。 */
  paddingTop: number
  /** 已扣除页码区与控制条的安全下边距。 */
  safeBottom: number
  /** 当前字号下的一行高度：fontSize × lineHeight。 */
  lineHeightPx: number
  /** 额外保留的行数，默认 1 行，防止字体渲染误差切掉末行。 */
  reserveLines?: number
}

export const CONTINUATION_MARK = '（续）'

export interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayLike {
  id: number
  bounds: DisplayBounds
}

export interface ProjectionDisplayChoice {
  display: DisplayLike
  multiScreen: boolean
  hint?: string
}

export const SINGLE_SCREEN_HINT = '当前仅一块屏幕，投屏将覆盖主屏'

const MAX_VERSES = 200
const MAX_LINES = 400
const MAX_LINE_LENGTH = 500

/** 投屏内容来自渲染层 IPC，和 settings 一样先收敛：结构不对返回 null。 */
export function normalizeProjectionContent(raw: unknown): ProjectionContent | null {
  if (!isRecord(raw)) return null

  const book = typeof raw.book === 'string' ? raw.book.trim() : ''
  if (!book) return null

  const { number } = raw
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 0) return null

  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  return {
    book,
    number,
    title: title || `第${number}首`,
    verses: normalizeVerses(raw.verses),
    style: clampStyle(raw.style),
  }
}

/**
 * 按行分页：每段从新页开始（保持一段完整），段超过容量时在段内按行切页。
 * 续页 label 追加「（续）」，首行前也加标记，保证投屏上能看出是同一段的延续。
 */
export function paginateVerses(
  verses: readonly HymnVerse[],
  capacity: number,
): ProjectionPage[] {
  const cap =
    capacity === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Number.isFinite(capacity)
        ? Math.max(1, Math.floor(capacity))
        : 1

  const pages: ProjectionPage[] = []
  for (const verse of verses) {
    const lines = verse.lines.map((line) => line.trim()).filter((line) => line !== '')
    if (lines.length === 0) continue

    const label = verse.label.trim()
    if (lines.length <= cap) {
      pages.push({ label, lines })
      continue
    }

    for (let start = 0; start < lines.length; start += cap) {
      const chunk = lines.slice(start, start + cap)
      if (start === 0) {
        pages.push({ label, lines: chunk })
        continue
      }
      const first = chunk[0] ?? ''
      pages.push({
        label: label ? `${label}${CONTINUATION_MARK}` : CONTINUATION_MARK,
        lines: [first ? `${CONTINUATION_MARK}${first}` : CONTINUATION_MARK, ...chunk.slice(1)],
        continued: true,
      })
    }
  }

  return pages.length > 0 ? pages : [{ label: '', lines: [] }]
}

/**
 * 一页可容纳的歌词行数：可用高度扣除上下内边距与控制条安全区后，
 * 按行高取整，再留 reserveLines 行余量。
 */
export function computeProjectionCapacity(layout: ProjectionLayout): number {
  const { viewportHeight, paddingTop, safeBottom, lineHeightPx } = layout
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return 1

  const available = viewportHeight - paddingTop - safeBottom
  if (!Number.isFinite(available) || available <= 0) return 1

  const reserve = Math.max(0, Math.floor(layout.reserveLines ?? 1))
  return Math.max(1, Math.floor(available / lineHeightPx) - reserve)
}

/** 0 基下标 → 页面底部显示的「2/4」。 */
export function formatProjectionPage(index: number, total: number): string {
  const safeTotal = Math.max(1, Math.trunc(total))
  const safeIndex = Math.min(safeTotal, Math.max(1, Math.trunc(index) + 1))
  return `${safeIndex}/${safeTotal}`
}

/** 优先非主显示器；记住的上次显示器仍在线时优先复用它。单屏返回提示文案。 */
export function chooseProjectionDisplay(
  displays: readonly DisplayLike[],
  primaryId: number,
  preferredId?: number,
): ProjectionDisplayChoice | null {
  const secondary = displays.filter((display) => display.id !== primaryId)
  const pool = secondary.length > 0 ? secondary : displays
  const preferred =
    preferredId === undefined ? undefined : pool.find((display) => display.id === preferredId)
  const display = preferred ?? pool[0]
  if (!display) return null

  return secondary.length > 0
    ? { display, multiScreen: true }
    : { display, multiScreen: false, hint: SINGLE_SCREEN_HINT }
}

function normalizeVerses(raw: unknown): HymnVerse[] {
  if (!Array.isArray(raw)) return []

  const verses: HymnVerse[] = []
  for (const entry of raw.slice(0, MAX_VERSES)) {
    if (!isRecord(entry)) continue

    const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, 40) : ''
    const rawLines = Array.isArray(entry.lines) ? entry.lines : []
    const lines: string[] = []
    for (const line of rawLines.slice(0, MAX_LINES)) {
      if (typeof line !== 'string') continue
      const cleaned = line.trim().slice(0, MAX_LINE_LENGTH)
      if (cleaned) lines.push(cleaned)
    }

    if (lines.length > 0) verses.push({ label, lines })
  }
  return verses
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}