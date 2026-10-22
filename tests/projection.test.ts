import { describe, expect, it } from 'vitest'
import {
  CONTINUATION_MARK,
  SINGLE_SCREEN_HINT,
  chooseProjectionDisplay,
  computeProjectionCapacity,
  formatProjectionPage,
  normalizeProjectionContent,
  paginateVerses,
  type DisplayLike,
} from '../src/shared/projection'
import { DEFAULT_STYLE } from '../src/shared/style'

function display(id: number, x = 0): DisplayLike {
  return { id, bounds: { x, y: 0, width: 1920, height: 1080 } }
}

describe('normalizeProjectionContent', () => {
  it('收敛样式、去空行，得到可直接投屏的内容', () => {
    const content = normalizeProjectionContent({
      book: ' red_book ',
      number: 1,
      title: ' 圣哉三一歌 ',
      verses: [
        { label: ' 1 ', lines: [' 圣哉，圣哉 ', '', '全权的神明'] },
        { label: '2', lines: [] },
      ],
      style: { fontSize: 9999, bgColor: '0f1115', lineHeight: -3 },
    })

    expect(content).not.toBeNull()
    expect(content?.book).toBe('red_book')
    expect(content?.title).toBe('圣哉三一歌')
    expect(content?.verses).toEqual([{ label: '1', lines: ['圣哉，圣哉', '全权的神明'] }])
    expect(content?.style.fontSize).toBe(120)
    expect(content?.style.bgColor).toBe('#0F1115')
    expect(content?.style.lineHeight).toBe(1.2)
  })

  it('缺少书、编号非法或输入不是对象时返回 null', () => {
    expect(normalizeProjectionContent(null)).toBeNull()
    expect(normalizeProjectionContent(undefined)).toBeNull()
    expect(normalizeProjectionContent('red_book')).toBeNull()
    expect(normalizeProjectionContent({ number: 1 })).toBeNull()
    expect(normalizeProjectionContent({ book: '  ', number: 1 })).toBeNull()
    expect(normalizeProjectionContent({ book: 'red_book' })).toBeNull()
    expect(normalizeProjectionContent({ book: 'red_book', number: 1.5 })).toBeNull()
    expect(normalizeProjectionContent({ book: 'red_book', number: -1 })).toBeNull()
  })

  it('缺标题时回落到「第N首」，缺 verses 时给空数组与默认样式', () => {
    const content = normalizeProjectionContent({ book: 'red_book', number: 1 })
    expect(content?.title).toBe('第1首')
    expect(content?.verses).toEqual([])
    expect(content?.style).toEqual(DEFAULT_STYLE)
  })
})

function lines(count: number, prefix = 'line'): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`)
}

describe('paginateVerses', () => {
  it('每段从新页开始：4 段歌词得到 4 页，即使一页能放下多段', () => {
    const pages = paginateVerses(
      [
        { label: '1', lines: ['a1', 'a2'] },
        { label: '2', lines: ['b1', 'b2'] },
        { label: '3', lines: ['c1'] },
        { label: '4', lines: ['d1'] },
      ],
      100,
    )
    expect(pages).toHaveLength(4)
    expect(pages.map((page) => page.label)).toEqual(['1', '2', '3', '4'])
    expect(pages.every((page) => page.continued === undefined)).toBe(true)
  })

  it('过滤空段与空行；没有可用歌词时给一页空页', () => {
    expect(
      paginateVerses(
        [
          { label: '1', lines: ['  ', ''] },
          { label: '2', lines: [' 仍有一行 ', ''] },
        ],
        2,
      ),
    ).toEqual([{ label: '2', lines: ['仍有一行'] }])

    expect(paginateVerses([], 2)).toEqual([{ label: '', lines: [] }])
  })

  it('红本第 96 首形态：单段 51 行、capacity 11 → 5 页（11/11/11/11/7）', () => {
    const pages = paginateVerses([{ label: '1', lines: lines(51) }], 11)

    expect(pages).toHaveLength(5)
    expect(pages.map((page) => page.lines.length)).toEqual([11, 11, 11, 11, 7])
    expect(pages.map((page) => page.label)).toEqual([
      '1',
      `1${CONTINUATION_MARK}`,
      `1${CONTINUATION_MARK}`,
      `1${CONTINUATION_MARK}`,
      `1${CONTINUATION_MARK}`,
    ])
    expect(pages.map((page) => page.continued ?? false)).toEqual([
      false,
      true,
      true,
      true,
      true,
    ])
    expect(pages[0]?.lines[0]).toBe('line1')
    expect(pages.slice(1).every((page) => page.lines[0]?.startsWith(CONTINUATION_MARK))).toBe(
      true,
    )

    const all = pages.flatMap((page) =>
      page.lines.map((line, index) =>
        index === 0 && page.continued ? line.slice(CONTINUATION_MARK.length) : line,
      ),
    )
    expect(all).toEqual(lines(51))
  })

  it('单段恰好等于 capacity 时不分页', () => {
    const pages = paginateVerses([{ label: '1', lines: lines(11) }], 11)
    expect(pages).toHaveLength(1)
    expect(pages[0]?.lines).toHaveLength(11)
    expect(pages[0]?.continued).toBeUndefined()
  })

  it('单段为 capacity + 1 时切出 1 行的续页', () => {
    const pages = paginateVerses([{ label: '2', lines: lines(12) }], 11)
    expect(pages.map((page) => page.lines.length)).toEqual([11, 1])
    expect(pages[1]?.label).toBe(`2${CONTINUATION_MARK}`)
    expect(pages[1]?.lines).toEqual([`${CONTINUATION_MARK}line12`])
  })

  it('长段切页后，后续段仍从新页开始', () => {
    const pages = paginateVerses(
      [
        { label: '1', lines: lines(13, 'a') },
        { label: '2', lines: ['b1', 'b2'] },
      ],
      10,
    )
    expect(pages.map((page) => page.label)).toEqual(['1', `1${CONTINUATION_MARK}`, '2'])
    expect(pages.map((page) => page.lines.length)).toEqual([10, 3, 2])
  })

  it('红本第 1 首形态：4 段 × 4 行在 capacity 11 下仍是 4 页、每页一段', () => {
    const pages = paginateVerses(
      [1, 2, 3, 4].map((label) => ({ label: String(label), lines: lines(4, `v${label}-`) })),
      11,
    )
    expect(pages).toHaveLength(4)
    expect(pages.map((page) => page.label)).toEqual(['1', '2', '3', '4'])
    expect(pages.every((page) => page.lines.length === 4)).toBe(true)
  })

  it('千首本第 77 首形态：1/54/13 行单曲，capacity 11 下共 8 页且行数守恒', () => {
    const verses = [
      { label: '1', lines: lines(1, 'a') },
      { label: '2', lines: lines(54, 'b') },
      { label: '3', lines: lines(13, 'c') },
    ]
    const pages = paginateVerses(verses, 11)

    expect(pages).toHaveLength(1 + 5 + 2)
    expect(pages.every((page) => page.lines.length <= 11)).toBe(true)
    expect(pages.reduce((sum, page) => sum + page.lines.length, 0)).toBe(68)

    const restored = pages.flatMap((page) =>
      page.lines.map((line, index) =>
        index === 0 && page.continued ? line.slice(CONTINUATION_MARK.length) : line,
      ),
    )
    expect(restored).toEqual([...lines(1, 'a'), ...lines(54, 'b'), ...lines(13, 'c')])
  })

  it('capacity 非法值收敛到 1，Infinity 表示不切段', () => {
    const verse = { label: '1', lines: ['a', 'b', 'c'] }
    expect(paginateVerses([verse], 0).map((page) => page.lines.length)).toEqual([1, 1, 1])
    expect(paginateVerses([verse], -5).map((page) => page.lines.length)).toEqual([1, 1, 1])
    expect(paginateVerses([verse], Number.NaN).map((page) => page.lines.length)).toEqual([1, 1, 1])
    expect(paginateVerses([verse], Number.POSITIVE_INFINITY)).toHaveLength(1)
  })
})

describe('computeProjectionCapacity', () => {
  it('扣除内边距与控制条安全区后再留 1 行余量', () => {
    expect(
      computeProjectionCapacity({
        viewportHeight: 1000,
        paddingTop: 60,
        safeBottom: 132,
        lineHeightPx: 76.8,
      }),
    ).toBe(9)
  })

  it('可用高度恰好是行高整数倍时也留 1 行', () => {
    expect(
      computeProjectionCapacity({
        viewportHeight: 1000,
        paddingTop: 100,
        safeBottom: 100,
        lineHeightPx: 80,
      }),
    ).toBe(9)
  })

  it('reserveLines 可调；可用高度不足一行时至少给 1 行', () => {
    expect(
      computeProjectionCapacity({
        viewportHeight: 1000,
        paddingTop: 100,
        safeBottom: 100,
        lineHeightPx: 80,
        reserveLines: 0,
      }),
    ).toBe(10)
    expect(
      computeProjectionCapacity({
        viewportHeight: 100,
        paddingTop: 60,
        safeBottom: 132,
        lineHeightPx: 76.8,
      }),
    ).toBe(1)
  })

  it('行高非法时返回 1，避免除零', () => {
    expect(
      computeProjectionCapacity({
        viewportHeight: 1000,
        paddingTop: 0,
        safeBottom: 0,
        lineHeightPx: 0,
      }),
    ).toBe(1)
    expect(
      computeProjectionCapacity({
        viewportHeight: 1000,
        paddingTop: 0,
        safeBottom: 0,
        lineHeightPx: Number.NaN,
      }),
    ).toBe(1)
  })
})

describe('formatProjectionPage', () => {
  it('0 基下标显示为 1/4 形式，并对越界下标收敛', () => {
    expect(formatProjectionPage(0, 4)).toBe('1/4')
    expect(formatProjectionPage(1, 4)).toBe('2/4')
    expect(formatProjectionPage(3, 4)).toBe('4/4')
    expect(formatProjectionPage(9, 4)).toBe('4/4')
    expect(formatProjectionPage(-2, 4)).toBe('1/4')
    expect(formatProjectionPage(0, 0)).toBe('1/1')
  })
})

describe('chooseProjectionDisplay', () => {
  it('有第二块屏时优先非主显示器，且不提示覆盖主屏', () => {
    const choice = chooseProjectionDisplay([display(1), display(2, 1920)], 1)
    expect(choice?.display.id).toBe(2)
    expect(choice?.multiScreen).toBe(true)
    expect(choice?.hint).toBeUndefined()
  })

  it('记住的上次显示器仍在线时优先复用它', () => {
    const choice = chooseProjectionDisplay([display(1), display(2, 1920), display(3, 3840)], 1, 3)
    expect(choice?.display.id).toBe(3)
  })

  it('记住的是主屏或已拔掉时回退到第一块非主屏', () => {
    expect(chooseProjectionDisplay([display(1), display(2, 1920)], 1, 1)?.display.id).toBe(2)
    expect(chooseProjectionDisplay([display(1), display(2, 1920)], 1, 99)?.display.id).toBe(2)
  })

  it('单屏时在主屏全屏并给出提示', () => {
    const choice = chooseProjectionDisplay([display(1)], 1)
    expect(choice?.display.id).toBe(1)
    expect(choice?.multiScreen).toBe(false)
    expect(choice?.hint).toBe(SINGLE_SCREEN_HINT)
  })

  it('没有任何显示器返回 null', () => {
    expect(chooseProjectionDisplay([], 1)).toBeNull()
  })
})