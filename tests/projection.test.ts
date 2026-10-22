import { describe, expect, it } from 'vitest'
import {
  SINGLE_SCREEN_HINT,
  buildProjectionPages,
  chooseProjectionDisplay,
  formatProjectionPage,
  normalizeProjectionContent,
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

describe('buildProjectionPages', () => {
  it('一段一页：4 段歌词得到 4 页', () => {
    const pages = buildProjectionPages([
      { label: '1', lines: ['a1', 'a2'] },
      { label: '2', lines: ['b1', 'b2'] },
      { label: '3', lines: ['c1'] },
      { label: '4', lines: ['d1'] },
    ])
    expect(pages).toHaveLength(4)
    expect(pages.map((page) => page.label)).toEqual(['1', '2', '3', '4'])
  })

  it('过滤空段与空行；没有可用歌词时给一页空页', () => {
    expect(
      buildProjectionPages([
        { label: '1', lines: ['  ', ''] },
        { label: '2', lines: [' 仍有一行 ', ''] },
      ]),
    ).toEqual([{ label: '2', lines: ['仍有一行'] }])

    expect(buildProjectionPages([])).toEqual([{ label: '', lines: [] }])
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