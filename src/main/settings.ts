import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_STYLE, clampStyle, type HymnStyle } from '../shared/style'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface SettingsData {
  currentBook: string | null
  windowBounds?: WindowBounds
  style: HymnStyle
}

export interface SettingsStoreOptions {
  /** 默认 console.warn */
  log?: (message: string) => void
}

const DEFAULTS: SettingsData = { currentBook: null, style: { ...DEFAULT_STYLE } }

/** <userData>/settings.json，写临时文件再 rename；写盘失败只告警，不影响运行。 */
export class SettingsStore {
  private readonly file: string
  private readonly log: (message: string) => void
  private data: SettingsData

  constructor(userDataDir: string, options: SettingsStoreOptions = {}) {
    this.file = join(userDataDir, 'settings.json')
    this.log = options.log ?? ((message) => console.warn(`[settings] ${message}`))
    this.data = this.load()
  }

  get(): SettingsData {
    return cloneSettings(this.data)
  }

  patch(patch: Partial<SettingsData>): SettingsData {
    this.data = sanitize({ ...this.data, ...patch })
    this.write()
    return this.get()
  }

  private load(): SettingsData {
    try {
      return sanitize(JSON.parse(readFileSync(this.file, 'utf-8')) as unknown)
    } catch {
      return cloneSettings(DEFAULTS)
    }
  }

  private write(): void {
    const tmp = `${this.file}.${process.pid}.tmp`
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
      try {
        renameSync(tmp, this.file)
      } catch {
        // 个别 Windows 环境下目标存在时 rename 失败：删旧文件后重试。
        try {
          unlinkSync(this.file)
        } catch {
          // 目标本来就不存在
        }
        renameSync(tmp, this.file)
      }
    } catch (error) {
      this.log(`写入 settings.json 失败：${errorMessage(error)}`)
      try {
        unlinkSync(tmp)
      } catch {
        // 临时文件可能没生成
      }
    }
  }
}

function cloneSettings(data: SettingsData): SettingsData {
  return {
    currentBook: data.currentBook,
    ...(data.windowBounds ? { windowBounds: { ...data.windowBounds } } : {}),
    style: { ...data.style },
  }
}

function sanitize(raw: unknown): SettingsData {
  if (!isRecord(raw)) return cloneSettings(DEFAULTS)
  const currentBook = typeof raw.currentBook === 'string' && raw.currentBook !== '' ? raw.currentBook : null
  const bounds = parseBounds(raw.windowBounds)
  // 手工改坏或越界的 style（如 fontSize 9999）在加载时就收敛，不带到渲染层。
  const style = clampStyle(raw.style)
  return bounds ? { currentBook, windowBounds: bounds, style } : { currentBook, style }
}

function parseBounds(raw: unknown): WindowBounds | undefined {
  if (!isRecord(raw)) return undefined
  const { x, y, width, height } = raw
  if (![x, y, width, height].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return undefined
  }
  const bounds = { x, y, width, height } as WindowBounds
  if (bounds.width <= 0 || bounds.height <= 0) return undefined
  return bounds
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}