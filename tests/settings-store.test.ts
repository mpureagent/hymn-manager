import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore, type SettingsData } from '../src/main/settings'
import { DEFAULT_STYLE } from '../src/shared/style'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hymn-settings-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const settingsFile = (): string => join(dir, 'settings.json')

function readSettings(): SettingsData {
  return JSON.parse(readFileSync(settingsFile(), 'utf-8')) as SettingsData
}

describe('SettingsStore', () => {
  it('首次使用返回默认样式，并保留旧的 currentBook 字段', () => {
    const store = new SettingsStore(dir)
    expect(store.get()).toEqual({ currentBook: null, style: DEFAULT_STYLE })
    expect(store.patch({ currentBook: 'red_book' }).currentBook).toBe('red_book')
  })

  it('样式写入 settings.json 的 style 字段，重新构造后恢复', () => {
    const store = new SettingsStore(dir)
    const style = { ...DEFAULT_STYLE, fontSize: 72, bgColor: '#0F1115', textColor: '#F2EDE3', align: 'left' as const }
    store.patch({ style })

    expect(readSettings().style).toEqual(style)
    expect(new SettingsStore(dir).get().style).toEqual(style)
    expect(existsSync(`${settingsFile()}.${process.pid}.tmp`)).toBe(false)
  })

  it('加载时收敛手改越界值：fontSize 9999 → 120，非法颜色/对齐回落', () => {
    writeFileSync(
      settingsFile(),
      JSON.stringify({
        currentBook: 'black_book_1218',
        style: { fontFamily: '', fontSize: 9999, lineHeight: 9, textColor: 'red', bgColor: '#12', align: 'right' },
      }),
      'utf-8',
    )

    const style = new SettingsStore(dir).get().style
    expect(style.fontSize).toBe(120)
    expect(style.lineHeight).toBe(2.2)
    expect(style.textColor).toBe(DEFAULT_STYLE.textColor)
    expect(style.bgColor).toBe(DEFAULT_STYLE.bgColor)
    expect(style.align).toBe('center')
    expect(style.fontFamily).toBe(DEFAULT_STYLE.fontFamily)
  })

  it('旧版 settings.json 没有 style 字段时补默认样式', () => {
    writeFileSync(settingsFile(), JSON.stringify({ currentBook: 'red_book' }), 'utf-8')
    expect(new SettingsStore(dir).get()).toEqual({ currentBook: 'red_book', style: DEFAULT_STYLE })
  })

  it('非法 JSON 回落默认，不崩溃', () => {
    writeFileSync(settingsFile(), '{{{ broken', 'utf-8')
    expect(new SettingsStore(dir).get()).toEqual({ currentBook: null, style: DEFAULT_STYLE })
  })

  it('写盘失败只告警，不抛异常且内存中的样式仍生效', () => {
    const blocker = join(dir, 'blocked')
    writeFileSync(blocker, 'not a directory', 'utf-8')
    const logs: string[] = []
    const store = new SettingsStore(blocker, { log: (message) => logs.push(message) })
    const style = { ...DEFAULT_STYLE, fontSize: 64 }

    expect(() => store.patch({ currentBook: 'red_book', style })).not.toThrow()
    expect(store.get().currentBook).toBe('red_book')
    expect(store.get().style.fontSize).toBe(64)
    expect(logs.join('\n')).toContain('写入 settings.json 失败')
  })

  it('patch 时不传 style 不会重置已有样式', () => {
    const store = new SettingsStore(dir)
    store.patch({ style: { ...DEFAULT_STYLE, fontSize: 88 } })
    store.patch({ currentBook: 'red_book' })
    expect(store.get().style.fontSize).toBe(88)
  })
})