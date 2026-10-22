import { BrowserWindow } from 'electron'
import type { ProjectionContent, DisplayLike } from '../shared/projection'
import { IPC } from '../shared/ipc'
import type { HymnStyle } from '../shared/style'

export interface ProjectionWindowOptions {
  preload: string
  loadFile: string
  /** 开发态走 Vite dev server */
  loadUrl?: string
  /** 页面脚本已就绪：主进程此时补推一次当前内容，配合渲染层 pull 双保险。 */
  onReady(): void
  onClosed(): void
  log?: (message: string) => void
}

/** 独立全屏投屏窗口：无边框、无菜单，优先落在指定显示器。 */
export class ProjectionWindow {
  private readonly options: ProjectionWindowOptions
  private win: BrowserWindow | null = null

  constructor(options: ProjectionWindowOptions) {
    this.options = options
  }

  get active(): boolean {
    return this.win !== null && !this.win.isDestroyed()
  }

  open(display: DisplayLike, background: string): BrowserWindow {
    const current = this.win
    if (current && !current.isDestroyed()) {
      current.focus()
      return current
    }

    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      autoHideMenuBar: true,
      fullscreen: true,
      show: false,
      backgroundColor: background,
      title: '赞美诗歌本 · 投屏',
      webPreferences: {
        preload: this.options.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    })
    this.win = win

    win.setMenuBarVisibility(false)
    win.setFullScreen(true)
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      win.show()
      win.focus()
    })
    win.webContents.on('did-finish-load', () => {
      if (!win.isDestroyed()) this.options.onReady()
    })
    win.on('closed', () => {
      if (this.win === win) this.win = null
      this.options.onClosed()
    })

    if (this.options.loadUrl) {
      void win.loadURL(this.options.loadUrl).catch((error: unknown) => {
        this.log(`投屏页加载失败：${error instanceof Error ? error.message : String(error)}`)
      })
    } else {
      void win.loadFile(this.options.loadFile).catch((error: unknown) => {
        this.log(`投屏页加载失败：${error instanceof Error ? error.message : String(error)}`)
      })
    }

    return win
  }

  sendContent(content: ProjectionContent): void {
    this.send(IPC.projectionContent, content)
  }

  sendStyle(style: HymnStyle): void {
    this.send(IPC.projectionStyle, style)
  }

  focus(): void {
    if (this.active && this.win) this.win.focus()
  }

  close(): void {
    if (this.active && this.win) this.win.close()
  }

  private send(channel: string, payload: unknown): void {
    if (!this.active || !this.win) return
    this.win.webContents.send(channel, payload)
  }

  private log(message: string): void {
    ;(this.options.log ?? ((text) => console.warn(`[projection] ${text}`)))(message)
  }
}