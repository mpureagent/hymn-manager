import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { BookMeta, HymnItem, Manifest, PackBook } from '../shared/types'

export interface SearchPathOptions {
  exeDir: string
  userDataDir: string
  cwd: string
  /** 开发态才追加 ./hymns-data */
  includeDev?: boolean
}

/** ADR-0002：exe 同目录 → userData → 开发态 cwd。返回绝对路径，去重保序。 */
export function dataPackSearchPaths(options: SearchPathOptions): string[] {
  const candidates = [
    join(options.exeDir, 'hymns-data'),
    join(options.userDataDir, 'hymns-data'),
  ]
  if (options.includeDev !== false) candidates.push(join(options.cwd, 'hymns-data'))

  const seen = new Set<string>()
  const out: string[] = []
  for (const candidate of candidates) {
    const absolute = resolve(candidate)
    if (seen.has(absolute)) continue
    seen.add(absolute)
    out.push(absolute)
  }
  return out
}

export type DataPackResult =
  | { ok: true; root: string; manifest: Manifest; books: PackBook[] }
  | { ok: false; reason: 'missing'; searchedPaths: string[] }
  | { ok: false; reason: 'corrupt'; searchedPaths: string[]; error: string }

/**
 * 按顺序查找数据包。第一个存在 manifest.json 的目录即视为数据包；
 * 它若损坏则返回 corrupt（不继续往后找，避免用户误以为数据已更新）。
 */
export function loadDataPack(searchPaths: readonly string[]): DataPackResult {
  const searchedPaths = searchPaths.map((path) => resolve(path))

  for (const root of searchedPaths) {
    const manifestPath = join(root, 'manifest.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = parseManifest(readJson(manifestPath), manifestPath)
      const books = manifest.books.map((meta) => readBook(root, meta))
      return { ok: true, root, manifest, books }
    } catch (error) {
      return {
        ok: false,
        reason: 'corrupt',
        searchedPaths,
        error: `${errorMessage(error)}（数据包：${root}）`,
      }
    }
  }

  return { ok: false, reason: 'missing', searchedPaths }
}

function readJson(path: string): unknown {
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch (error) {
    throw new Error(`无法读取 ${path}：${errorMessage(error)}`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(`JSON 解析失败 ${path}：${errorMessage(error)}`)
  }
}

function parseManifest(raw: unknown, path: string): Manifest {
  if (!isRecord(raw)) throw new Error(`manifest 不是 JSON 对象：${path}`)
  if (!Array.isArray(raw.books) || raw.books.length === 0) {
    throw new Error(`manifest.books 缺失或为空：${path}`)
  }
  const books = raw.books.map((entry, index) => parseBookMeta(entry, index, path))
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    books,
  }
}

function parseBookMeta(raw: unknown, index: number, manifestPath: string): BookMeta {
  if (!isRecord(raw)) {
    throw new Error(`manifest.books[${index}] 不是对象：${manifestPath}`)
  }
  const { id, name, alias, count } = raw
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
    throw new Error(`manifest.books[${index}].id 非法：${String(id)}`)
  }
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error(`manifest.books[${index}].name 缺失（书 ${id}）`)
  }
  if (typeof alias !== 'string') {
    throw new Error(`manifest.books[${index}].alias 缺失（书 ${id}）`)
  }
  if (!Number.isInteger(count) || (count as number) < 0) {
    throw new Error(`manifest.books[${index}].count 非法（书 ${id}）：${String(count)}`)
  }
  return { id, name, alias, count: count as number }
}

function readBook(root: string, meta: BookMeta): PackBook {
  const bookPath = join(root, 'books', `${meta.id}.json`)
  if (!existsSync(bookPath)) throw new Error(`缺少诗歌本文件：${bookPath}`)

  const raw = readJson(bookPath)
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    throw new Error(`诗歌本格式错误（items 不是数组）：${bookPath}`)
  }

  const items = raw.items.map((item, index) => parseItem(item, index, meta.id))
  if (items.length !== meta.count) {
    throw new Error(
      `「${meta.name}」条目数不一致：manifest 声明 ${meta.count} 条，` +
        `books/${meta.id}.json 实际 ${items.length} 条`,
    )
  }

  return { ...meta, items }
}

function parseItem(raw: unknown, index: number, bookId: string): HymnItem {
  if (!isRecord(raw)) {
    throw new Error(`books/${bookId}.json items[${index}] 不是对象`)
  }
  if (!Number.isInteger(raw.number) || (raw.number as number) < 0) {
    throw new Error(`books/${bookId}.json items[${index}].number 非法`)
  }
  if (typeof raw.title !== 'string') {
    throw new Error(`books/${bookId}.json items[${index}].title 缺失`)
  }
  return raw as unknown as HymnItem
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}