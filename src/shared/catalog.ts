import type { BookMeta, HymnItem } from './types'

export interface CatalogEntry {
  number: number
  title: string
}

/**
 * 目录列表：只保留数据包里真实存在的条目，按编号升序。
 * 编号不连续（缺号）时直接跳过，不补空行。
 */
export function buildCatalog(items: readonly HymnItem[]): CatalogEntry[] {
  return items
    .filter((item) => Number.isInteger(item.number) && item.number >= 0)
    .map((item) => ({ number: item.number, title: item.title }))
    .sort((a, b) => a.number - b.number)
}

/** 下拉框显示名：别名取第一个（「千首本/黑皮」→「千首本」）+ 真名。 */
export function formatBookLabel(book: Pick<BookMeta, 'alias' | 'name'>): string {
  const alias = (book.alias.split('/')[0] ?? '').trim()
  const name = book.name.trim()
  if (alias && name) return `${alias}《${name}》`
  return name || alias
}