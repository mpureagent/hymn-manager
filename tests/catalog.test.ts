import { describe, expect, it } from 'vitest'
import { buildCatalog, formatBookLabel } from '../src/shared/catalog'
import type { HymnItem } from '../src/shared/types'

const item = (number: number, title = `第${number}首`): HymnItem => ({ number, title })

describe('buildCatalog', () => {
  it('按编号升序排序，不依赖数据包原始顺序', () => {
    const entries = buildCatalog([item(5), item(1, '圣哉三一歌'), item(3)])
    expect(entries.map((entry) => entry.number)).toEqual([1, 3, 5])
    expect(entries[0]?.title).toBe('圣哉三一歌')
  })

  it('缺号不补空行：只保留真实存在的编号', () => {
    const entries = buildCatalog([item(1), item(4), item(9)])
    expect(entries).toHaveLength(3)
    expect(entries.map((entry) => entry.number)).toEqual([1, 4, 9])
    expect(entries.some((entry) => entry.number === 2)).toBe(false)
  })

  it('忽略编号非法的条目', () => {
    const entries = buildCatalog([
      item(2),
      { number: Number.NaN, title: '坏数据' },
      { number: -1, title: '负编号' },
      item(1),
    ])
    expect(entries.map((entry) => entry.number)).toEqual([1, 2])
  })
})

describe('formatBookLabel', () => {
  it('红本显示为「别名《真名》」', () => {
    expect(formatBookLabel({ alias: '红本', name: '赞美诗（新编）' })).toBe('红本《赞美诗（新编）》')
  })

  it('多别名取第一个', () => {
    expect(formatBookLabel({ alias: '千首本/黑皮', name: '赞美诗歌（1218首）' })).toBe(
      '千首本《赞美诗歌（1218首）》',
    )
  })
})