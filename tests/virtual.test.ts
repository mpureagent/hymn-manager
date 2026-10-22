import { describe, expect, it } from 'vitest'
import { computeRange } from '../src/shared/virtual'

const ROW = 44

describe('computeRange', () => {
  it('顶部时只渲染可视区 + overscan', () => {
    const range = computeRange(0, 800, ROW, 1217, 6)
    expect(range.totalHeight).toBe(1217 * ROW)
    expect(range.start).toBe(0)
    expect(range.end).toBe(Math.ceil(800 / ROW) + 6)
  })

  it('滚动到中部时窗口跟随', () => {
    const range = computeRange(44000, 800, ROW, 1217, 6)
    expect(range.start).toBe(Math.floor(44000 / ROW) - 6)
    expect(range.end).toBe(Math.ceil((44000 + 800) / ROW) + 6)
  })

  it('滚动到底部时不越界', () => {
    const range = computeRange(1217 * ROW, 800, ROW, 1217, 6)
    expect(range.end).toBe(1217)
    expect(range.start).toBeLessThan(1217)
  })

  it('空列表与零行高安全返回', () => {
    expect(computeRange(0, 800, ROW, 0, 6)).toEqual({ start: 0, end: 0, totalHeight: 0 })
    expect(computeRange(0, 800, 0, 10, 6)).toEqual({ start: 0, end: 0, totalHeight: 0 })
  })
})