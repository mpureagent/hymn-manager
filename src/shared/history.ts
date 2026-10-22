export interface SearchEntry {
  q: string
  /** ISO 8601 时间戳 */
  at: string
}

export interface OpenEntry {
  book: string
  number: number
  title: string
  /** ISO 8601 时间戳 */
  at: string
}

export interface HistoryData {
  searches: SearchEntry[]
  opened: OpenEntry[]
}

export interface OpenedInput {
  book: string
  number: number
  title: string
}

export const SEARCH_HISTORY_LIMIT = 20
export const OPENED_HISTORY_LIMIT = 50
/** 侧栏默认展示的打开记录条数 */
export const RECENT_OPENED_COUNT = 10

export function emptyHistory(): HistoryData {
  return { searches: [], opened: [] }
}

export function toHistoryTime(now: Date | number | string): string {
  const date = now instanceof Date ? now : new Date(now)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

/**
 * 新的搜索词置顶；同一个 q 只保留一条并更新时间。
 * 空白查询不产生记录，返回原列表的浅拷贝。
 */
export function addSearch(
  list: readonly SearchEntry[],
  q: string,
  now: Date | number | string,
  limit = SEARCH_HISTORY_LIMIT,
): SearchEntry[] {
  const query = q.trim()
  if (!query) return [...list]

  const entry: SearchEntry = { q: query, at: toHistoryTime(now) }
  const rest = list.filter((item) => item.q !== query)
  return [entry, ...rest].slice(0, Math.max(0, limit))
}

/**
 * 打开记录按 book+number 去重：重复打开只更新时间并置顶，
 * 标题也采用本次打开时的标题（数据包更新后随之更新）。
 */
export function addOpened(
  list: readonly OpenEntry[],
  entry: OpenedInput,
  now: Date | number | string,
  limit = OPENED_HISTORY_LIMIT,
): OpenEntry[] {
  const next: OpenEntry = {
    book: entry.book,
    number: entry.number,
    title: entry.title,
    at: toHistoryTime(now),
  }
  const rest = list.filter((item) => !(item.book === next.book && item.number === next.number))
  return [next, ...rest].slice(0, Math.max(0, limit))
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 月日。 */
export function formatRelativeTime(at: string, now: Date | number | string = new Date()): string {
  const then = new Date(at)
  if (Number.isNaN(then.getTime())) return ''

  const nowDate = now instanceof Date ? now : new Date(now)
  const nowTime = nowDate.getTime()
  if (Number.isNaN(nowTime)) return ''

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const diff = Math.max(0, nowTime - then.getTime())

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`

  const monthDay = `${then.getMonth() + 1}月${then.getDate()}日`
  return then.getFullYear() === nowDate.getFullYear()
    ? monthDay
    : `${then.getFullYear()}年${monthDay}`
}

/**
 * 容错读取：结构不对或单条记录损坏时丢弃坏记录，不让 UI 拿到脏数据。
 * 注意这里只处理「合法 JSON 但内容不合规」，非法 JSON 由 store 备份后丢弃。
 */
export function sanitizeHistory(raw: unknown): HistoryData {
  if (!isRecord(raw)) return emptyHistory()

  return {
    searches: dedupeSearches(parseSearches(raw.searches)).slice(0, SEARCH_HISTORY_LIMIT),
    opened: dedupeOpened(parseOpened(raw.opened)).slice(0, OPENED_HISTORY_LIMIT),
  }
}

function parseSearches(raw: unknown): SearchEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: SearchEntry[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    if (typeof item.q !== 'string' || typeof item.at !== 'string') continue
    const q = item.q.trim()
    if (!q || !isValidTime(item.at)) continue
    entries.push({ q, at: item.at })
  }
  return entries
}

function parseOpened(raw: unknown): OpenEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: OpenEntry[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    if (typeof item.book !== 'string' || item.book === '') continue
    if (!Number.isInteger(item.number) || (item.number as number) < 0) continue
    if (typeof item.title !== 'string' || typeof item.at !== 'string') continue
    if (!isValidTime(item.at)) continue
    entries.push({
      book: item.book,
      number: item.number as number,
      title: item.title,
      at: item.at,
    })
  }
  return entries
}

function dedupeSearches(entries: readonly SearchEntry[]): SearchEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(entry.q)) return false
    seen.add(entry.q)
    return true
  })
}

function dedupeOpened(entries: readonly OpenEntry[]): OpenEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${entry.book}\u0000${entry.number}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isValidTime(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}