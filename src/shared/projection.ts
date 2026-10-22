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
}

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

/** 一段一页：页码与段号一一对应，4 段歌就是 1/4–4/4。没有歌词时给一页空页。 */
export function buildProjectionPages(verses: readonly HymnVerse[]): ProjectionPage[] {
  const pages = verses
    .map((verse) => ({
      label: verse.label.trim(),
      lines: verse.lines.map((line) => line.trim()).filter((line) => line !== ''),
    }))
    .filter((page) => page.lines.length > 0)

  return pages.length > 0 ? pages : [{ label: '', lines: [] }]
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