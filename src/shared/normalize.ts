/**
 * 检索用归一化：只影响匹配，不修改任何用于显示的原文。
 * NFKC → 去空白/标点 → 可选去尾「歌」→ 同义字折叠。
 */

export interface NormalizeOptions {
  /** 去掉末尾的「歌」，默认开启（查询与正文同一套规则）。 */
  stripTrailingGe?: boolean
}

export interface MatchRange {
  /** 原文中的起始下标（含） */
  start: number
  /** 原文中的结束下标（不含） */
  end: number
}

/** 简体侧统一：只用于匹配。 */
const SYNONYMS: Readonly<Record<string, string>> = {
  祢: '你',
  祂: '他',
  裏: '里',
  著: '着',
}

const IGNORED = /[\p{P}\p{Z}\p{C}]/u

interface Normalized {
  text: string
  /** normalized 每个字符对应的原文起始下标 */
  starts: number[]
  /** normalized 每个字符对应的原文结束下标（不含） */
  ends: number[]
}

function fold(raw: string, options: NormalizeOptions): Normalized {
  const stripTrailingGe = options.stripTrailingGe ?? true
  let text = ''
  const starts: number[] = []
  const ends: number[] = []

  for (let index = 0; index < raw.length; ) {
    const codePoint = raw.codePointAt(index)
    if (codePoint === undefined) break
    const char = String.fromCodePoint(codePoint)
    const end = index + char.length
    const normalized = char.normalize('NFKC').toLowerCase()

    for (const piece of normalized) {
      if (IGNORED.test(piece)) continue
      const folded = SYNONYMS[piece] ?? piece
      for (const foldedChar of folded) {
        text += foldedChar
        starts.push(index)
        ends.push(end)
      }
    }

    index = end
  }

  // 单独输入「歌」时保留，避免归一化成空查询。
  if (stripTrailingGe && text.length > 1 && text.endsWith('歌')) {
    text = text.slice(0, -1)
    starts.pop()
    ends.pop()
  }

  return { text, starts, ends }
}

export function normalizeQuery(raw: string, options: NormalizeOptions = {}): string {
  return fold(raw, options).text
}

export function normalizeText(raw: string, options: NormalizeOptions = {}): string {
  return fold(raw, options).text
}

/**
 * 在原文中定位查询命中的片段，返回原文坐标，供 <mark> 高亮使用。
 * 标点/空白不参与匹配，但落在命中区间内的标点会随片段一起高亮。
 */
export function findMatchRange(
  rawText: string,
  rawQuery: string,
  options: NormalizeOptions = {},
): MatchRange | null {
  const query = normalizeQuery(rawQuery, options)
  if (!query) return null

  const { text, starts, ends } = fold(rawText, options)
  const index = text.indexOf(query)
  if (index < 0) return null

  const start = starts[index]
  const end = ends[index + query.length - 1]
  if (start === undefined || end === undefined) return null
  return { start, end }
}