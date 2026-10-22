import { normalizeQuery, normalizeText } from './normalize'
import type { HymnItem } from './types'

export type SearchKind = 'number' | 'title-prefix' | 'title-contains' | 'firstline' | 'alias'
/** 空查询时返回完整目录，没有命中层级。 */
export type SearchResultKind = SearchKind | 'all'

export interface SearchResult {
  item: HymnItem
  score: number
  kind: SearchResultKind
  /** 命中首句时为该行原文；其余情况不带。 */
  excerpt?: string
}

export interface SearchOptions {
  stripTrailingGe?: boolean
}

const SCORE: Readonly<Record<SearchKind, number>> = {
  number: 1000,
  'title-prefix': 800,
  'title-contains': 600,
  firstline: 400,
  alias: 200,
}

function firstLine(item: HymnItem): string {
  return item.verses?.[0]?.lines?.[0] ?? ''
}

function aliasTexts(item: HymnItem, normalizedTitle: string, options: SearchOptions): string[] {
  const texts: string[] = []
  for (const candidate of [item.title_alt, item.title_official]) {
    if (!candidate) continue
    const normalized = normalizeText(candidate, options)
    if (!normalized || normalized === normalizedTitle || texts.includes(normalized)) continue
    texts.push(normalized)
  }
  return texts
}

/**
 * 只在传入的 items（调用方负责限定为当前选本）内检索。
 * 不解析书名、不跨本合并、不做任何隐式切本。
 */
export function search(
  items: readonly HymnItem[],
  rawQuery: string,
  options: SearchOptions = {},
): SearchResult[] {
  const query = normalizeQuery(rawQuery, options)
  if (!query) {
    return items.map((item) => ({ item, score: 0, kind: 'all' }))
  }

  const numeric = /^\d+$/.test(query) ? Number(query) : null
  const results: SearchResult[] = []

  for (const item of items) {
    if (numeric !== null && item.number === numeric) {
      results.push({ item, score: SCORE.number, kind: 'number' })
      continue
    }

    const title = normalizeText(item.title, options)
    if (title.startsWith(query)) {
      results.push({ item, score: SCORE['title-prefix'], kind: 'title-prefix' })
      continue
    }
    if (title.includes(query)) {
      results.push({ item, score: SCORE['title-contains'], kind: 'title-contains' })
      continue
    }

    const line = firstLine(item)
    if (line && normalizeText(line, options).includes(query)) {
      results.push({ item, score: SCORE.firstline, kind: 'firstline', excerpt: line })
      continue
    }

    if (aliasTexts(item, title, options).some((alias) => alias.includes(query))) {
      results.push({ item, score: SCORE.alias, kind: 'alias' })
    }
  }

  return results.sort((a, b) => b.score - a.score || a.item.number - b.item.number)
}