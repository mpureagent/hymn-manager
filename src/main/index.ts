import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { dirname, join } from 'node:path'
import type { OpenedInput } from '../shared/history'
import { IPC, type Bootstrap, type PackView, type ProjectionToggleResult } from '../shared/ipc'
import {
  chooseProjectionDisplay,
  normalizeProjectionContent,
  type ProjectionContent,
} from '../shared/projection'
import { filePathToUrl } from '../shared/score'
import { clampStyle } from '../shared/style'
import { dataPackSearchPaths, loadDataPack, type DataPackResult } from './data-pack'
import { listChineseFonts } from './fonts'
import { ProjectionWindow } from './projection-window'
import { resolveScorePath } from './scores'
import { SettingsStore, type WindowBounds } from './settings'
import { HistoryStore } from './store'

const MIN_WIDTH = 1024
const MIN_HEIGHT = 640
const DEV_URL = process.env.VITE_DEV_SERVER_URL
const CONTROL_TITLE = '赞美诗歌本'
const PROJECTING_TITLE = '赞美诗歌本 · 投屏中'

let control: BrowserWindow | null = null
let projection: ProjectionWindow | null = null
let projectionContent: ProjectionContent | null = null
let settings: SettingsStore
let history: HistoryStore
let searchPaths: string[] = []
let packResult: DataPackResult = { ok: false, reason: 'missing', searchedPaths: [] }

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!control || control.isDestroyed()) return
    if (control.isMinimized()) control.restore()
    control.focus()
  })

  void app.whenReady().then(() => start())
  app.on('window-all-closed', () => app.quit())
}

function start(): void {
  settings = new SettingsStore(app.getPath('userData'))
  history = new HistoryStore(app.getPath('userData'))
  searchPaths = computeSearchPaths()
  packResult = resolvePack()
  projection = createProjectionWindow()
  registerIpc()
  control = createControlWindow()
  control.on('closed', () => {
    control = null
    projection?.close()
  })
}

function computeSearchPaths(): string[] {
  return dataPackSearchPaths({
    exeDir: dirname(app.getPath('exe')),
    userDataDir: app.getPath('userData'),
    cwd: process.cwd(),
    includeDev: !app.isPackaged,
  })
}

function resolvePack(): DataPackResult {
  try {
    return loadDataPack(searchPaths)
  } catch (error) {
    return {
      ok: false,
      reason: 'corrupt',
      searchedPaths: searchPaths,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function toPackView(result: DataPackResult): PackView {
  if (result.ok) return { ok: true, root: result.root, books: result.books }
  const recommendedPath = app.isPackaged
    ? searchPaths[0]
    : searchPaths[searchPaths.length - 1]
  if (result.reason === 'corrupt') {
    return {
      ok: false,
      reason: 'corrupt',
      searchedPaths: result.searchedPaths,
      recommendedPath,
      error: result.error,
    }
  }
  return { ok: false, reason: 'missing', searchedPaths: result.searchedPaths, recommendedPath }
}

function currentBookFor(result: DataPackResult): string | null {
  if (!result.ok) return null
  const saved = settings.get().currentBook
  if (saved && result.books.some((book) => book.id === saved)) return saved
  return result.books[0]?.id ?? null
}

function bootstrap(): Bootstrap {
  return {
    pack: toPackView(packResult),
    currentBook: currentBookFor(packResult),
    style: settings.get().style,
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.bootstrap, () => bootstrap())

  ipcMain.handle(IPC.recheck, () => {
    searchPaths = computeSearchPaths()
    packResult = resolvePack()
    return bootstrap()
  })

  ipcMain.handle(IPC.setCurrentBook, (_event, id: unknown) => {
    if (
      typeof id === 'string' &&
      packResult.ok &&
      packResult.books.some((book) => book.id === id)
    ) {
      settings.patch({ currentBook: id })
      return { currentBook: id }
    }
    return { currentBook: settings.get().currentBook }
  })

  ipcMain.handle(IPC.historyGet, () => history.get())

  ipcMain.handle(IPC.historyAddSearch, (_event, q: unknown) => {
    if (typeof q !== 'string') return history.get()
    return history.addSearch(q)
  })

  ipcMain.handle(IPC.historyAddOpened, (_event, raw: unknown) => {
    const entry = parseOpenedInput(raw)
    if (!entry) return history.get()

    const book = packResult.ok
      ? packResult.books.find((candidate) => candidate.id === entry.book)
      : undefined
    const item = book?.items.find((candidate) => candidate.number === entry.number)
    if (!book || !item) return history.get()

    return history.addOpened({ book: book.id, number: item.number, title: item.title })
  })

  ipcMain.handle(IPC.historyClear, () => history.clear())

  ipcMain.handle(IPC.fontsList, () => listChineseFonts())

  ipcMain.handle(IPC.styleSet, (_event, raw: unknown) => {
    // 渲染层与手改 settings.json 一样不可信：统一由 clampStyle 收敛后再落盘。
    const style = clampStyle(raw)
    settings.patch({ style })
    return settings.get().style
  })

  ipcMain.handle(IPC.scorePath, (_event, book: unknown, number: unknown) => {
    if (!packResult.ok || typeof book !== 'string' || typeof number !== 'number') return null
    if (!packResult.books.some((candidate) => candidate.id === book)) return null
    return resolveScorePath(packResult.root, book, number)
  })

  ipcMain.handle(IPC.projectionToggle, (_event, raw: unknown): ProjectionToggleResult => {
    if (projection?.active) {
      projection.close()
      return { active: false }
    }

    const normalized = normalizeProjectionContent(raw)
    if (!normalized) return { active: false, needSelection: true }
    const content = withScoreUrl(normalized)

    const choice = chooseProjectionDisplay(
      screen.getAllDisplays().map((display) => ({ id: display.id, bounds: display.bounds })),
      screen.getPrimaryDisplay().id,
      settings.get().projectionDisplayId,
    )
    if (!choice) return { active: false }

    projectionContent = content
    settings.patch({ projectionDisplayId: choice.display.id })
    projection?.open(choice.display, content.style.bgColor)
    setControlTitle(true)
    sendToControl(IPC.projectionState, { active: true })
    projection?.sendContent(content)
    return choice.hint ? { active: true, hint: choice.hint } : { active: true }
  })

  ipcMain.on(IPC.projectionUpdate, (_event, raw: unknown) => {
    if (!projection?.active) return
    const normalized = normalizeProjectionContent(raw)
    if (!normalized) return
    const content = withScoreUrl(normalized)
    projectionContent = content
    projection.sendContent(content)
  })

  ipcMain.on(IPC.projectionSetStyle, (_event, raw: unknown) => {
    if (!projection?.active) return
    const style = clampStyle(raw)
    if (projectionContent) projectionContent = { ...projectionContent, style }
    projection.sendStyle(style)
  })

  ipcMain.handle(IPC.projectionPull, () => (projection?.active ? projectionContent : null))

  ipcMain.on(IPC.projectionClose, () => projection?.close())

  ipcMain.on(IPC.projectionNav, (_event, direction: unknown) => {
    if (direction !== -1 && direction !== 1) return
    const next = adjacentProjectionContent(direction)
    if (!next) return
    projectionContent = next
    projection?.sendContent(next)
    sendToControl(IPC.projectionChanged, next)
  })
}

function adjacentProjectionContent(direction: -1 | 1): ProjectionContent | null {
  const current = projectionContent
  if (!current || !packResult.ok) return null

  const book = packResult.books.find((candidate) => candidate.id === current.book)
  if (!book) return null

  const items = book.items
    .filter((item) => Number.isInteger(item.number) && item.number >= 0)
    .slice()
    .sort((a, b) => a.number - b.number)
  const index = items.findIndex((item) => item.number === current.number)
  if (index < 0) return null

  const target = items[Math.min(items.length - 1, Math.max(0, index + direction))]
  if (!target || target.number === current.number) return null

  return withScoreUrl({
    book: book.id,
    number: target.number,
    title: target.title,
    verses: target.verses ?? [],
    style: current.style,
    view: current.view,
  })
}

/** 曲谱 URL 只由主进程按数据包解析，渲染层无法借投屏内容读取任意文件。 */
function withScoreUrl(content: ProjectionContent): ProjectionContent {
  if (content.view !== 'score') return { ...content, scoreUrl: null }
  if (!packResult.ok) return { ...content, scoreUrl: null }
  const path = resolveScorePath(packResult.root, content.book, content.number)
  return { ...content, scoreUrl: path ? filePathToUrl(path) : null }
}

function parseOpenedInput(raw: unknown): OpenedInput | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const { book, number, title } = raw as Record<string, unknown>
  if (typeof book !== 'string' || book === '') return null
  if (!Number.isInteger(number) || (number as number) < 0) return null
  return { book, number: number as number, title: typeof title === 'string' ? title : '' }
}

function createProjectionWindow(): ProjectionWindow {
  const devUrl = devProjectionUrl()
  return new ProjectionWindow({
    preload: join(__dirname, 'projection-preload.js'),
    loadFile: join(__dirname, '..', 'renderer', 'projection', 'index.html'),
    ...(devUrl ? { loadUrl: devUrl } : {}),
    onReady: () => {
      if (projectionContent) projection?.sendContent(projectionContent)
    },
    onClosed: () => {
      projectionContent = null
      setControlTitle(false)
      sendToControl(IPC.projectionState, { active: false })
    },
  })
}

function devProjectionUrl(): string | undefined {
  if (!DEV_URL) return undefined
  try {
    const url = new URL(DEV_URL)
    url.pathname = url.pathname.replace(/\/control\/index\.html$/, '/projection/index.html')
    return url.toString()
  } catch {
    return undefined
  }
}

function setControlTitle(projecting: boolean): void {
  if (!control || control.isDestroyed()) return
  control.setTitle(projecting ? PROJECTING_TITLE : CONTROL_TITLE)
}

function sendToControl(channel: string, payload: unknown): void {
  if (!control || control.isDestroyed()) return
  control.webContents.send(channel, payload)
}

function createControlWindow(): BrowserWindow {
  const saved = restoreBounds(settings.get().windowBounds)
  const win = new BrowserWindow({
    width: saved?.width ?? 1180,
    height: saved?.height ?? 760,
    ...(saved?.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: CONTROL_TITLE,
    backgroundColor: '#f4f1e9',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 投屏窗口可能全屏盖住主窗，主窗仍要正常跑搜索防抖与历史刷新。
      backgroundThrottling: false,
    },
  })

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })

  let boundsTimer: NodeJS.Timeout | null = null
  const saveBoundsSoon = (): void => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      boundsTimer = null
      if (!win.isDestroyed()) settings.patch({ windowBounds: normalBounds(win) })
    }, 500)
  }
  win.on('resize', saveBoundsSoon)
  win.on('move', saveBoundsSoon)

  win.on('close', () => {
    if (boundsTimer) {
      clearTimeout(boundsTimer)
      boundsTimer = null
    }
    settings.patch({ windowBounds: normalBounds(win) })
  })

  if (DEV_URL) {
    void win.loadURL(DEV_URL)
  } else {
    void win.loadFile(join(__dirname, '..', 'renderer', 'control', 'index.html'))
  }

  return win
}

function normalBounds(win: BrowserWindow): WindowBounds {
  const bounds = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds()
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
}

function restoreBounds(saved: WindowBounds | undefined): Partial<WindowBounds> | undefined {
  if (!saved) return undefined
  const width = Math.max(MIN_WIDTH, Math.round(saved.width))
  const height = Math.max(MIN_HEIGHT, Math.round(saved.height))
  const x = Math.round(saved.x)
  const y = Math.round(saved.y)
  const visible = screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y
  })
  return visible ? { x, y, width, height } : { width, height }
}