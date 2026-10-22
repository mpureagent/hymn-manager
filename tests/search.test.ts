import { describe, expect, it } from 'vitest'
import { search } from '../src/shared/search'
import type { HymnItem } from '../src/shared/types'

const RED: HymnItem[] = [
  {
    number: 1,
    title: '圣哉三一歌',
    title_official: '圣哉三一歌',
    verses: [{ label: '', lines: ['清晨我众歌声，穿云上达至尊', '圣哉，圣哉，圣哉！慈悲与全能'] }],
  },
  {
    number: 35,
    title: '荣耀归主歌',
    verses: [{ label: '', lines: ['圣哉，圣哉，圣哉！全权的神明'] }],
  },
  {
    number: 36,
    title: '贺祂为王歌',
    title_official: '贺他为王歌',
    verses: [{ label: '', lines: ['齐来拥戴至尊君王'] }],
  },
  {
    number: 391,
    title: '清晨歌',
    verses: [{ label: '', lines: ['圣哉羔羊，圣哉羔羊'] }],
  },
]

const BLACK: HymnItem[] = [
  {
    number: 1,
    title: '圣哉三一',
    title_alt: '圣哉三一',
    verses: [
      {
        label: '',
        lines: [
          '圣哉圣哉圣哉全能大主宰',
          '清晨欢悦歌诵高声颂主圣恩',
        ],
      },
    ],
  },
  {
    number: 25,
    title: '他名是耶和华',
    title_alt: '祂名是耶和华',
    verses: [{ label: '', lines: ['祂名是耶和华'] }],
  },
  {
    number: 96,
    title: '有一位神',
    title_alt: '有一位神（现场版）',
    verses: [{ label: '', lines: ['有一位神，有权能创造宇宙万物'] }],
  },
]

describe('search：T2 指定用例', () => {
  it('红本输入 1：第 1 首置顶且 kind=number', () => {
    const results = search(RED, '1')
    expect(results[0]?.item.number).toBe(1)
    expect(results[0]?.kind).toBe('number')
  })

  it('红本输入「圣哉」：命中第 1 首（标题前缀）', () => {
    const results = search(RED, '圣哉')
    expect(results[0]?.item.number).toBe(1)
    expect(results[0]?.kind).toBe('title-prefix')
    const firstlineHits = results.filter((result) => result.kind === 'firstline')
    expect(firstlineHits.map((result) => result.item.number)).toEqual([35, 391])
  })

  it('红本搜「全能大主宰」：不命中红本第 1 首，也不串入别本内容', () => {
    const results = search(RED, '全能大主宰')
    expect(results.some((result) => result.item.number === 1)).toBe(false)
    expect(results).toHaveLength(0)
  })

  it('1218 搜「全能大主宰」：命中第 1 首且 kind=firstline，返回首句原文', () => {
    const results = search(BLACK, '全能大主宰')
    expect(results[0]?.item.number).toBe(1)
    expect(results[0]?.kind).toBe('firstline')
    expect(results[0]?.excerpt).toBe('圣哉圣哉圣哉全能大主宰')
  })

  it('「祢」与「你」互搜都能命中', () => {
    const withNi: HymnItem[] = [
      { number: 1, title: '祢真伟大', verses: [{ label: '', lines: ['祢真伟大'] }] },
      { number: 2, title: '你真伟大', verses: [{ label: '', lines: ['你真伟大'] }] },
    ]
    expect(search(withNi, '你真').map((result) => result.item.number)).toEqual([1, 2])
    expect(search(withNi, '祢真').map((result) => result.item.number)).toEqual([1, 2])
  })

  it('不存在的编号 99999 返回空结果且不报错', () => {
    expect(() => search(RED, '99999')).not.toThrow()
    expect(search(RED, '99999')).toEqual([])
  })
})

describe('search：优先级与归一化', () => {
  it('5 级优先级：编号 > 标题前缀 > 标题包含 > 首句 > 别名', () => {
    const items: HymnItem[] = [
      {
        number: 7,
        title: '其他',
        title_alt: '晨光',
      },
      {
        number: 6,
        title: '其他',
        verses: [{ label: '', lines: ['晨光'] }],
      },
      { number: 5, title: '真晨光' },
      { number: 4, title: '晨光曲' },
      { number: 3, title: '无关' },
    ]

    const results = search(items, '晨光')
    expect(results.map((result) => [result.item.number, result.kind])).toEqual([
      [4, 'title-prefix'],
      [5, 'title-contains'],
      [6, 'firstline'],
      [7, 'alias'],
    ])

    const numbered = search(items, '7')
    expect(numbered[0]?.item.number).toBe(7)
    expect(numbered[0]?.kind).toBe('number')
  })

  it('空查询按原顺序返回全部条目', () => {
    const results = search(RED, '   ')
    expect(results.map((result) => result.item.number)).toEqual([1, 35, 36, 391])
    expect(results.every((result) => result.kind === 'all')).toBe(true)
  })

  it('标点、空格与全角输入不影响命中', () => {
    const results = search(RED, ' 圣 哉， ')
    expect(results[0]?.item.number).toBe(1)
    expect(search(RED, '圣哉三一歌')[0]?.item.number).toBe(1)
    expect(search(BLACK, '圣哉三一')[0]?.item.number).toBe(1)
  })

  it('查询中的尾部「歌」可省略或保留', () => {
    expect(search(BLACK, '圣哉三一歌')[0]?.item.number).toBe(1)
    expect(search(RED, '圣哉三一')[0]?.item.number).toBe(1)
  })

  it('别名命中：title_alt 与正则化后的标题不同也能搜到', () => {
    const results = search(BLACK, '现场版')
    expect(results[0]?.item.number).toBe(96)
    expect(results[0]?.kind).toBe('alias')
    expect(results[0]?.excerpt).toBeUndefined()
  })

  it('不识别书名、不跨本：查询词只在该数组内匹配', () => {
    expect(search(RED, '千首本')).toEqual([])
    expect(search(BLACK, '全能大主宰').map((result) => result.item.number)).toEqual([1])
    expect(search(RED, '全能大主宰')).toEqual([])
  })

  it('不修改传入的条目', () => {
    const snapshot = JSON.stringify(RED)
    search(RED, '圣哉')
    search(RED, '全能大主宰')
    expect(JSON.stringify(RED)).toBe(snapshot)
  })
})