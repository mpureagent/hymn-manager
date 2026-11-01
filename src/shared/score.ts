export const SCORE_MIN_ZOOM = 50
export const SCORE_MAX_ZOOM = 300
export const SCORE_ZOOM_STEP = 10

const BOOK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const MAX_SCORE_NUMBER = 9999

export function isValidScoreBook(book: string): boolean {
  return BOOK_ID_PATTERN.test(book)
}

export function isValidScoreNumber(number: number): boolean {
  return Number.isInteger(number) && number >= 0 && number <= MAX_SCORE_NUMBER
}

/** 数据包内相对路径：scores/<book>/<NNNN>_<page>.<ext>。 */
export function scoreRelativePath(
  book: string,
  number: number,
  extension: string,
  page = 0,
): string | null {
  if (!isValidScoreBook(book) || !isValidScoreNumber(number)) return null
  if (!Number.isInteger(page) || page < 0) return null
  if (!/^[a-z0-9]+$/i.test(extension)) return null
  return `scores/${book}/${String(number).padStart(4, '0')}_${page}.${extension}`
}

/** 绝对路径 → 可由 <img src> 加载的 file:// URL（Windows/POSIX 均适用）；已是 http(s) URL 时原样返回。 */
export function filePathToUrl(filePath: string): string {
  if (/^https?:\/\//i.test(filePath)) return filePath
  let normalized = filePath.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) normalized = `/${normalized}`
  if (!normalized.startsWith('/')) normalized = `/${normalized}`
  const encoded = encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')
  return `file://${encoded}`
}

export function clampScoreZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return SCORE_MIN_ZOOM
  return Math.min(SCORE_MAX_ZOOM, Math.max(SCORE_MIN_ZOOM, Math.round(zoom)))
}

/** 按 10% 步进到下一个整十档位；低于下限/高于上限时收敛。 */
export function stepScoreZoom(current: number, direction: -1 | 1): number {
  const rounded = Number.isFinite(current) ? Math.round(current) : SCORE_MIN_ZOOM
  const stepped =
    direction > 0
      ? Math.ceil((rounded + 1) / SCORE_ZOOM_STEP) * SCORE_ZOOM_STEP
      : Math.floor((rounded - 1) / SCORE_ZOOM_STEP) * SCORE_ZOOM_STEP
  return clampScoreZoom(stepped)
}