import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  addOpened,
  addSearch,
  emptyHistory,
  sanitizeHistory,
  OPENED_HISTORY_LIMIT,
  SEARCH_HISTORY_LIMIT,
  type HistoryData,
  type OpenEntry,
} from '../shared/history'

export interface HistoryStoreOptions {
  /** 测试注入时钟；默认 new Date() */
  now?: () => Date
  /** 默认 console.warn */
  log?: (message: string) => void
}

/**
 * <userData>/history.json。
 * 写入走「临时文件 + rename」；损坏 JSON 备份为 history.json.bad 后从空历史继续。
 */
export class HistoryStore {
  private readonly file: string
  private readonly badFile: string
  private readonly tmpFile: string
  private readonly now: () => Date
  private readonly log: (message: string) => void
  private data: HistoryData

  constructor(userDataDir: string, options: HistoryStoreOptions = {}) {
    this.file = join(userDataDir, 'history.json')
    this.badFile = `${this.file}.bad`
    this.tmpFile = `${this.file}.tmp`
    this.now = options.now ?? (() => new Date())
    this.log = options.log ?? ((message) => console.warn(`[history] ${message}`))
    this.data = this.load()
  }

  get(): HistoryData {
    return cloneHistory(this.data)
  }

  addSearch(q: string): HistoryData {
    this.data = {
      ...this.data,
      searches: addSearch(this.data.searches, q, this.now(), SEARCH_HISTORY_LIMIT),
    }
    this.write()
    return this.get()
  }

  addOpened(entry: Omit<OpenEntry, 'at'>): HistoryData {
    this.data = {
      ...this.data,
      opened: addOpened(this.data.opened, entry, this.now(), OPENED_HISTORY_LIMIT),
    }
    this.write()
    return this.get()
  }

  clear(): HistoryData {
    this.data = emptyHistory()
    this.write()
    return this.get()
  }

  private load(): HistoryData {
    if (!existsSync(this.file)) return emptyHistory()

    let text: string
    try {
      text = readFileSync(this.file, 'utf-8')
    } catch (error) {
      this.log(`读取 history.json 失败，按空历史继续：${errorMessage(error)}`)
      return emptyHistory()
    }

    try {
      return sanitizeHistory(JSON.parse(text) as unknown)
    } catch (error) {
      this.backupCorrupt(error)
      return emptyHistory()
    }
  }

  /** 非法 JSON：改名到 history.json.bad；改名失败则复制后删除原文件。 */
  private backupCorrupt(error: unknown): void {
    this.log(`history.json 不是合法 JSON，备份为 history.json.bad：${errorMessage(error)}`)
    try {
      try {
        unlinkSync(this.badFile)
      } catch {
        // 上一次的 .bad 不存在
      }
      renameSync(this.file, this.badFile)
      return
    } catch {
      // Windows 下目标被占用等情况，退回复制 + 删除
    }

    try {
      copyFileSync(this.file, this.badFile)
      unlinkSync(this.file)
    } catch (backupError) {
      this.log(`备份损坏文件失败：${errorMessage(backupError)}`)
    }
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.tmpFile, JSON.stringify(this.data, null, 2), 'utf-8')
      try {
        renameSync(this.tmpFile, this.file)
      } catch {
        // 个别 Windows 环境下目标存在时 rename 失败：删旧文件后重试。
        try {
          unlinkSync(this.file)
        } catch {
          // 目标本来就不存在
        }
        renameSync(this.tmpFile, this.file)
      }
    } catch (error) {
      this.log(`写入 history.json 失败：${errorMessage(error)}`)
      try {
        unlinkSync(this.tmpFile)
      } catch {
        // 临时文件可能没生成
      }
    }
  }
}

function cloneHistory(data: HistoryData): HistoryData {
  return {
    searches: data.searches.map((entry) => ({ ...entry })),
    opened: data.opened.map((entry) => ({ ...entry })),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}