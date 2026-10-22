import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface SettingsData {
  currentBook: string | null
  windowBounds?: WindowBounds
}

const DEFAULTS: SettingsData = { currentBook: null }

/** <userData>/settings.json，写临时文件再 rename，避免断电写坏。 */
export class SettingsStore {
  private readonly file: string
  private data: SettingsData

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'settings.json')
    this.data = this.load()
  }

  get(): SettingsData {
    return { ...this.data }
  }

  patch(patch: Partial<SettingsData>): SettingsData {
    this.data = { ...this.data, ...patch }
    this.write()
    return this.get()
  }

  private load(): SettingsData {
    try {
      return sanitize(JSON.parse(readFileSync(this.file, 'utf-8')) as unknown)
    } catch {
      return { ...DEFAULTS }
    }
  }

  private write(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
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
  }
}

function sanitize(raw: unknown): SettingsData {
  if (!isRecord(raw)) return { ...DEFAULTS }
  const currentBook = typeof raw.currentBook === 'string' && raw.currentBook !== '' ? raw.currentBook : null
  const bounds = parseBounds(raw.windowBounds)
  return bounds ? { currentBook, windowBounds: bounds } : { currentBook }
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