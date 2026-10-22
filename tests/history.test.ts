import { describe, expect, it } from 'vitest'
import {
  addOpened,
  addSearch,
  emptyHistory,
  formatRelativeTime,
  sanitizeHistory,
  type OpenEntry,
  type SearchEntry,
} from '../src/shared/history'

const T0 = new Date('2026-10-22T10:00:00.000Z')
const T1 = new Date('2026-10-22T10:05:00.000Z')

describe('addSearch', () => {
  it('新搜索置顶并写入 ISO 时间', () => {
    const list = addSearch([], ' 圣哉 ', T0)
    expect(list).toEqual([{ q: '圣哉', at: T0.toISOString() }])
  })

  it('同一查询去重置顶并更新时间，不产生重复', () => {
    const list = addSearch(
      [
        { q: '圣哉', at: T0.toISOString() },
        { q: '主', at: T0.toISOString() },
      ],
      '圣哉',
      T1,
    )
    expect(list).toHaveLength(2)
    expect(list[0]).toEqual({ q: '圣哉', at: T1.toISOString() })
    expect(list[1]?.q).toBe('主')
  })

  it('空白查询不记录', () => {
    const existing: SearchEntry[] = [{ q: '圣哉', at: T0.toISOString() }]
    expect(addSearch(existing, '   ', T1)).toEqual(existing)
    const empty = addSearch([], '', T1)
    expect(empty).toEqual([])
    expect(empty).not.toBe(existing)
  })

  it('默认截断到 20 条', () => {
    let list: SearchEntry[] = []
    for (let index = 0; index < 25; index += 1) {
      list = addSearch(list, `词${index}`, T0)
    }
    expect(list).toHaveLength(20)
    expect(list[0]?.q).toBe('词24')
    expect(list.some((entry) => entry.q === '词4')).toBe(false)
  })

  it('可自定义上限，且不修改传入数组', () => {
    const original: SearchEntry[] = [{ q: 'a', at: T0.toISOString() }]
    const list = addSearch(original, 'b', T1, 1)
    expect(list).toEqual([{ q: 'b', at: T1.toISOString() }])
    expect(original).toEqual([{ q: 'a', at: T0.toISOString() }])
  })
})

describe('addOpened', () => {
  it('同一本同一编号去重置顶并更新时间与标题', () => {
    const list = addOpened(
      [
        { book: 'red_book', number: 1, title: '旧标题', at: T0.toISOString() },
        { book: 'red_book', number: 2, title: '第二首', at: T0.toISOString() },
      ],
      { book: 'red_book', number: 1, title: '圣哉三一歌' },
      T1,
    )
    expect(list).toHaveLength(2)
    expect(list[0]).toEqual({
      book: 'red_book',
      number: 1,
      title: '圣哉三一歌',
      at: T1.toISOString(),
    })
  })

  it('不同本的同编号视为两条不同记录', () => {
    const list = addOpened(
      [{ book: 'black_book_1218', number: 1, title: '圣哉三一', at: T0.toISOString() }],
      { book: 'red_book', number: 1, title: '圣哉三一歌' },
      T1,
    )
    expect(list).toHaveLength(2)
    expect(list.map((entry) => entry.book)).toEqual(['red_book', 'black_book_1218'])
  })

  it('默认截断到 50 条', () => {
    let list: OpenEntry[] = []
    for (let number = 1; number <= 55; number += 1) {
      list = addOpened(list, { book: 'red_book', number, title: `第${number}首` }, T0)
    }
    expect(list).toHaveLength(50)
    expect(list[0]?.number).toBe(55)
    expect(list.some((entry) => entry.number === 5)).toBe(false)
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-22T12:00:00.000Z')

  it('按分钟/小时/天显示相对时间', () => {
    expect(formatRelativeTime('2026-10-22T11:59:30.000Z', now)).toBe('刚刚')
    expect(formatRelativeTime('2026-10-22T11:57:00.000Z', now)).toBe('3 分钟前')
    expect(formatRelativeTime('2026-10-22T10:00:00.000Z', now)).toBe('2 小时前')
    expect(formatRelativeTime('2026-10-20T12:00:00.000Z', now)).toBe('2 天前')
  })

  it('超过 7 天显示月日，跨年补年份', () => {
    expect(formatRelativeTime('2026-10-01T12:00:00.000Z', now)).toContain('10月1日')
    expect(formatRelativeTime('2025-12-31T12:00:00.000Z', now)).toBe('2025年12月31日')
  })

  it('时钟偏移导致的未来时间按「刚刚」处理，非法时间返回空串', () => {
    expect(formatRelativeTime('2026-10-22T12:05:00.000Z', now)).toBe('刚刚')
    expect(formatRelativeTime('not-a-time', now)).toBe('')
  })
})

describe('sanitizeHistory', () => {
  it('非对象或字段缺失时返回空历史', () => {
    expect(sanitizeHistory(null)).toEqual(emptyHistory())
    expect(sanitizeHistory([])).toEqual(emptyHistory())
    expect(sanitizeHistory({})).toEqual(emptyHistory())
  })

  it('丢弃损坏条目并去重，保留合法记录', () => {
    const data = sanitizeHistory({
      searches: [
        { q: '圣哉', at: T0.toISOString() },
        { q: '圣哉', at: T1.toISOString() },
        { q: '', at: T0.toISOString() },
        { q: '坏时间', at: 'oops' },
        { q: 42, at: T0.toISOString() },
      ],
      opened: [
        { book: 'red_book', number: 1, title: '圣哉三一歌', at: T0.toISOString() },
        { book: 'red_book', number: 1, title: '重复', at: T1.toISOString() },
        { book: '', number: 2, title: '坏书', at: T0.toISOString() },
        { book: 'red_book', number: -1, title: '坏编号', at: T0.toISOString() },
      ],
    })

    expect(data.searches).toEqual([{ q: '圣哉', at: T0.toISOString() }])
    expect(data.opened).toEqual([
      { book: 'red_book', number: 1, title: '圣哉三一歌', at: T0.toISOString() },
    ])
  })

  it('超过上限的文件在读取时截断', () => {
    const searches = Array.from({ length: 30 }, (_, index) => ({
      q: `词${index}`,
      at: T0.toISOString(),
    }))
    const opened = Array.from({ length: 60 }, (_, index) => ({
      book: 'red_book',
      number: index,
      title: `第${index}首`,
      at: T0.toISOString(),
    }))
    const data = sanitizeHistory({ searches, opened })
    expect(data.searches).toHaveLength(20)
    expect(data.opened).toHaveLength(50)
  })
})