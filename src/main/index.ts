import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { dirname, join } from 'node:path'
import type { OpenedInput } from '../shared/history'
import { IPC, type Bootstrap, type PackView } from '../shared/ipc'
import { dataPackSearchPaths, loadDataPack, type DataPackResult } from './data-pack'
import { SettingsStore, type WindowBounds } from './settings'
import { HistoryStore } from './store'

const MIN_WIDTH = 1024
const MIN_HEIGHT = 640
const DEV_URL = process.env.VITE_DEV_SERVER_URL

let control: BrowserWindow | null = null
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
  registerIpc()
  control = createControlWindow()
  control.on('closed', () => {
    control = null
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
  return { pack: toPackView(packResult), currentBook: currentBookFor(packResult) }
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
}

function parseOpenedInput(raw: unknown): OpenedInput | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const { book, number, title } = raw as Record<string, unknown>
  if (typeof book !== 'string' || book === '') return null
  if (!Number.isInteger(number) || (number as number) < 0) return null
  return { book, number: number as number, title: typeof title === 'string' ? title : '' }
}

function createControlWindow(): BrowserWindow {
  const saved = restoreBounds(settings.get().windowBounds)
  const win = new BrowserWindow({
    width: saved?.width ?? 1180,
    height: saved?.height ?? 760,
    ...(saved?.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: '赞美诗歌本',
    backgroundColor: '#f4f1e9',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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