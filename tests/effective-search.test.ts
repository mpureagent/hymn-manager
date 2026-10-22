import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEffectiveSearchRecorder,
  EFFECTIVE_SEARCH_IDLE_MS,
} from '../src/shared/effective-search'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(idleMs?: number): { recorded: string[]; recorder: ReturnType<typeof createEffectiveSearchRecorder> } {
  const recorded: string[] = []
  const recorder = createEffectiveSearchRecorder(
    (query) => recorded.push(query),
    idleMs === undefined ? {} : { idleMs },
  )
  return { recorded, recorder }
}

describe('createEffectiveSearchRecorder', () => {
  it('连续输入「圣」「圣哉」「圣哉三一」只记录最终那条', () => {
    const { recorded, recorder } = setup()

    recorder.update('圣', 4)
    vi.advanceTimersByTime(500)
    recorder.update('圣哉', 2)
    vi.advanceTimersByTime(800)
    recorder.update('圣哉三一', 1)

    vi.advanceTimersByTime(EFFECTIVE_SEARCH_IDLE_MS - 1)
    expect(recorded).toEqual([])

    vi.advanceTimersByTime(1)
    expect(recorded).toEqual(['圣哉三一'])

    vi.advanceTimersByTime(10_000)
    expect(recorded).toEqual(['圣哉三一'])
  })

  it('无结果或空白查询不记录', () => {
    const { recorded, recorder } = setup()

    recorder.update('圣哉', 0)
    vi.advanceTimersByTime(5000)
    expect(recorded).toEqual([])

    recorder.update('   ', 5)
    recorder.update('，。', 5)
    vi.advanceTimersByTime(5000)
    expect(recorded).toEqual([])

    recorder.update('圣', 1)
    vi.advanceTimersByTime(EFFECTIVE_SEARCH_IDLE_MS)
    expect(recorded).toEqual(['圣'])
  })

  it('Enter/点击立即记录，并取消空闲计时避免重复', () => {
    const { recorded, recorder } = setup()

    recorder.update('圣哉', 2)
    vi.advanceTimersByTime(1000)
    recorder.commit('圣哉', 2)
    expect(recorded).toEqual(['圣哉'])

    vi.advanceTimersByTime(10_000)
    expect(recorded).toEqual(['圣哉'])
  })

  it('结果为空时的 Enter/点击不算有效搜索', () => {
    const { recorded, recorder } = setup()
    recorder.commit('不存在', 0)
    vi.advanceTimersByTime(5000)
    expect(recorded).toEqual([])
  })

  it('reset 取消尚未触发的记录（切本/清空搜索）', () => {
    const { recorded, recorder } = setup()

    recorder.update('圣哉', 3)
    vi.advanceTimersByTime(1000)
    recorder.reset()
    vi.advanceTimersByTime(5000)
    expect(recorded).toEqual([])
  })

  it('空闲阈值可配置，记录前会去掉首尾空白', () => {
    const { recorded, recorder } = setup(300)
    recorder.update('  圣哉  ', 1)
    vi.advanceTimersByTime(299)
    expect(recorded).toEqual([])
    vi.advanceTimersByTime(1)
    expect(recorded).toEqual(['圣哉'])
  })
})