import { normalizeQuery } from './normalize'

export const EFFECTIVE_SEARCH_IDLE_MS = 1500

export interface EffectiveSearchOptions {
  idleMs?: number
  /** 是否算一次「有效搜索」；默认要求归一化后非空且至少一条结果。 */
  isEligible?: (query: string, resultCount: number) => boolean
}

export interface EffectiveSearchRecorder {
  /** 每次检索结果更新后调用。连续输入会不断重置 1.5s 计时。 */
  update(query: string, resultCount: number): void
  /** Enter 打开 / 点击结果时调用：立即记录并取消待触发的空闲计时。 */
  commit(query: string, resultCount: number): void
  /** 清空检索、切本或离开搜索态时调用。 */
  reset(): void
}

/**
 * 有效搜索判定：不记录每次按键。
 * 输入停在有结果的查询上达到 idleMs，或用户明确打开结果时，才记录一次。
 */
export function createEffectiveSearchRecorder(
  record: (query: string) => void,
  options: EffectiveSearchOptions = {},
): EffectiveSearchRecorder {
  const idleMs = options.idleMs ?? EFFECTIVE_SEARCH_IDLE_MS
  const isEligible = options.isEligible ?? defaultEligible
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: string | null = null

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    pending = null
  }

  return {
    update(query, resultCount) {
      cancel()
      if (!isEligible(query, resultCount)) return

      const value = query.trim()
      pending = value
      timer = setTimeout(() => {
        timer = null
        pending = null
        record(value)
      }, idleMs)
    },

    commit(query, resultCount) {
      cancel()
      if (!isEligible(query, resultCount)) return
      record(query.trim())
    },

    reset() {
      cancel()
    },
  }
}

function defaultEligible(query: string, resultCount: number): boolean {
  return resultCount > 0 && normalizeQuery(query) !== ''
}