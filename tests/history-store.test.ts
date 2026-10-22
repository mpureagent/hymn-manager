import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HistoryStore } from '../src/main/store'
import type { HistoryData } from '../src/shared/history'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hymn-history-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const historyFile = (): string => join(dir, 'history.json')
const now = (): Date => new Date('2026-10-22T10:00:00.000Z')

function readHistory(): HistoryData {
  return JSON.parse(readFileSync(historyFile(), 'utf-8')) as HistoryData
}

describe('HistoryStore', () => {
  it('首次使用返回空历史，写入后生成 { searches, opened } 结构', () => {
    const store = new HistoryStore(dir, { now })
    expect(store.get()).toEqual({ searches: [], opened: [] })

    const afterSearch = store.addSearch('圣哉')
    expect(afterSearch).toEqual({
      searches: [{ q: '圣哉', at: '2026-10-22T10:00:00.000Z' }],
      opened: [],
    })

    const afterOpen = store.addOpened({ book: 'red_book', number: 1, title: '圣哉三一歌' })
    expect(afterOpen.opened).toEqual([
      { book: 'red_book', number: 1, title: '圣哉三一歌', at: '2026-10-22T10:00:00.000Z' },
    ])
    expect(readHistory()).toEqual(afterOpen)
    expect(existsSync(`${historyFile()}.tmp`)).toBe(false)
  })

  it('重新构造时从磁盘恢复，并把同一首去重置顶', () => {
    const store = new HistoryStore(dir, { now })
    store.addOpened({ book: 'red_book', number: 1, title: '圣哉三一歌' })
    store.addOpened({ book: 'black_book_1218', number: 1, title: '圣哉三一' })
    store.addOpened({ book: 'red_book', number: 1, title: '圣哉三一歌' })

    const reloaded = new HistoryStore(dir, { now })
    expect(reloaded.get().opened).toHaveLength(2)
    expect(reloaded.get().opened[0]).toMatchObject({ book: 'red_book', number: 1 })
  })

  it('非法 JSON：备份为 history.json.bad，从空历史继续且不崩溃', () => {
    writeFileSync(historyFile(), '{{{', 'utf-8')
    const logs: string[] = []
    const store = new HistoryStore(dir, { now, log: (message) => logs.push(message) })

    expect(store.get()).toEqual({ searches: [], opened: [] })
    expect(existsSync(`${historyFile()}.bad`)).toBe(true)
    expect(readFileSync(`${historyFile()}.bad`, 'utf-8')).toBe('{{{')
    expect(logs.join('\n')).toContain('history.json.bad')

    const after = store.addSearch('圣哉')
    expect(readHistory()).toEqual(after)
  })

  it('合法 JSON 但结构不对：按空历史处理，不生成 .bad', () => {
    writeFileSync(historyFile(), JSON.stringify({ searches: 'oops', opened: null }), 'utf-8')
    const store = new HistoryStore(dir, { now })
    expect(store.get()).toEqual({ searches: [], opened: [] })
    expect(existsSync(`${historyFile()}.bad`)).toBe(false)
  })

  it('清空历史后落盘为空数组', () => {
    const store = new HistoryStore(dir, { now })
    store.addSearch('圣哉')
    store.addOpened({ book: 'red_book', number: 1, title: '圣哉三一歌' })

    expect(store.clear()).toEqual({ searches: [], opened: [] })
    expect(readHistory()).toEqual({ searches: [], opened: [] })
  })

  it('写盘失败只记录警告，不抛异常', () => {
    const blocker = join(dir, 'blocked')
    writeFileSync(blocker, 'not a directory', 'utf-8')
    const logs: string[] = []
    const store = new HistoryStore(blocker, { now, log: (message) => logs.push(message) })

    expect(() => store.addSearch('圣哉')).not.toThrow()
    expect(store.get().searches).toHaveLength(1)
    expect(logs.join('\n')).toContain('写入 history.json 失败')
  })
})