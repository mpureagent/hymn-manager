import { createReadStream, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { dataPackSearchPaths, loadDataPack, type DataPackResult } from '../main/data-pack'
import { listChineseFonts } from '../main/fonts'
import { resolveScorePath } from '../main/scores'
import { SettingsStore } from '../main/settings'
import { HistoryStore } from '../main/store'
import type { Bootstrap, PackView } from '../shared/ipc'
import { clampStyle } from '../shared/style'

const DEFAULT_PORT = 8787
const DEFAULT_HOST = '127.0.0.1'
const MAX_BODY_BYTES = 1024 * 1024

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

export interface WebServerConfig {
  /** 仓库根目录；dataPackSearchPaths 的开发态查找路径 */
  repoRoot: string
  /** 数据包父目录（其下找 hymns-data） */
  dataRoot: string
  /** 等价 Electron userData 目录 */
  userDir: string
  /** 静态资源目录 */
  staticDir: string
  port: number
  host: string
  log: (message: string) => void
}

export interface WebServerHandle {
  readonly server: Server
  readonly config: WebServerConfig
  listen(port?: number): Promise<number>
  close(): Promise<void>
}

export function resolveWebConfig(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): WebServerConfig {
  return {
    repoRoot,
    dataRoot: env.HYMN_DATA_ROOT ? resolve(env.HYMN_DATA_ROOT) : repoRoot,
    userDir: env.HYMN_USER_DIR ? resolve(env.HYMN_USER_DIR) : join(repoRoot, '.web-user'),
    staticDir: env.HYMN_STATIC ? resolve(env.HYMN_STATIC) : join(repoRoot, 'dist', 'web'),
    port: parsePort(env.PORT),
    host: DEFAULT_HOST,
    log: (message) => console.log(message),
  }
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return DEFAULT_PORT
  return port
}

export function createHymnServer(config: WebServerConfig): WebServerHandle {
  const userDir = resolve(config.userDir)
  const staticDir = resolve(config.staticDir)
  const settings = new SettingsStore(userDir, { log: config.log })
  const history = new HistoryStore(userDir, { log: config.log })

  let searchPaths = computeSearchPaths()
  let packResult = resolvePack()

  function computeSearchPaths(): string[] {
    return dataPackSearchPaths({
      exeDir: config.dataRoot,
      userDataDir: userDir,
      cwd: config.repoRoot,
      includeDev: true,
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
        error: errorMessage(error),
      }
    }
  }

  function toPackView(result: DataPackResult): PackView {
    if (result.ok) return { ok: true, root: result.root, books: result.books }
    const recommendedPath = searchPaths[searchPaths.length - 1]
    if (result.reason === 'corrupt') {
      return {
        ok: false,
        reason: 'corrupt',
        searchedPaths: result.searchedPaths,
        ...(recommendedPath ? { recommendedPath } : {}),
        error: result.error,
      }
    }
    return {
      ok: false,
      reason: 'missing',
      searchedPaths: result.searchedPaths,
      ...(recommendedPath ? { recommendedPath } : {}),
    }
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

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET'
    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
    } catch {
      sendJson(res, 400, { error: 'invalid url' })
      return
    }

    if (pathname === '/api/bootstrap') {
      if (method !== 'GET') return notFound(res)
      return sendJson(res, 200, bootstrap())
    }

    if (pathname === '/api/recheck') {
      if (method !== 'POST') return notFound(res)
      searchPaths = computeSearchPaths()
      packResult = resolvePack()
      return sendJson(res, 200, bootstrap())
    }

    if (pathname === '/api/book') {
      if (method !== 'POST') return notFound(res)
      const body = await readJsonBody(req)
      if (!body.ok) return sendBodyError(res, body.status)
      const id = isRecord(body.value) ? body.value.id : undefined
      if (typeof id === 'string' && packResult.ok && packResult.books.some((book) => book.id === id)) {
        settings.patch({ currentBook: id })
        return sendJson(res, 200, { currentBook: id })
      }
      return sendJson(res, 200, { currentBook: settings.get().currentBook })
    }

    if (pathname === '/api/history') {
      if (method === 'GET') return sendJson(res, 200, history.get())
      if (method === 'DELETE') return sendJson(res, 200, history.clear())
      return notFound(res)
    }

    if (pathname === '/api/history/search') {
      if (method !== 'POST') return notFound(res)
      const body = await readJsonBody(req)
      if (!body.ok) return sendBodyError(res, body.status)
      const q = isRecord(body.value) ? body.value.q : undefined
      return sendJson(res, 200, typeof q === 'string' ? history.addSearch(q) : history.get())
    }

    if (pathname === '/api/history/opened') {
      if (method !== 'POST') return notFound(res)
      const body = await readJsonBody(req)
      if (!body.ok) return sendBodyError(res, body.status)
      const entry = parseOpenedInput(body.value)
      if (!entry) return sendJson(res, 200, history.get())

      const book = packResult.ok
        ? packResult.books.find((candidate) => candidate.id === entry.book)
        : undefined
      const item = book?.items.find((candidate) => candidate.number === entry.number)
      if (!book || !item) return sendJson(res, 200, history.get())

      return sendJson(
        res,
        200,
        history.addOpened({ book: book.id, number: item.number, title: item.title }),
      )
    }

    if (pathname === '/api/fonts') {
      if (method !== 'GET') return notFound(res)
      return sendJson(res, 200, listChineseFonts())
    }

    if (pathname === '/api/style') {
      if (method !== 'POST') return notFound(res)
      const body = await readJsonBody(req)
      if (!body.ok) return sendBodyError(res, body.status)
      // 与 Electron 主进程一致：外部输入统一由 clampStyle 收敛后再落盘。
      settings.patch({ style: clampStyle(body.value) })
      return sendJson(res, 200, settings.get().style)
    }

    const scoreMatch = /^\/api\/score\/([^/]+)\/([^/]+)$/.exec(pathname)
    if (scoreMatch) {
      if (method !== 'GET') return notFound(res)
      const book = scoreMatch[1]!
      const numberText = scoreMatch[2]!
      if (!/^\d+$/.test(numberText)) return notFound(res)
      if (!packResult.ok || !packResult.books.some((candidate) => candidate.id === book)) {
        return notFound(res)
      }
      const scorePath = resolveScorePath(packResult.root, book, Number(numberText))
      if (!scorePath) return notFound(res)
      return serveFile(res, scorePath)
    }

    if (method === 'GET' || method === 'HEAD') {
      return serveStatic(res, pathname, method === 'HEAD')
    }
    return notFound(res)
  }

  function serveStatic(res: ServerResponse, pathname: string, headOnly: boolean): void {
    const target = resolveStatic(pathname)
    if (!target) return notFound(res)
    serveFile(res, target, headOnly)
  }

  function resolveStatic(pathname: string): string | null {
    if (pathname === '/') {
      return firstFile([join(staticDir, 'index.html'), join(staticDir, 'control', 'index.html')])
    }
    if (pathname === '/projection' || pathname === '/projection/') {
      return firstFile([join(staticDir, 'projection', 'index.html')])
    }

    const relative = pathname.replace(/^\/+/, '')
    const candidate = resolve(staticDir, relative)
    const rootWithSep = staticDir.endsWith(sep) ? staticDir : `${staticDir}${sep}`
    if (candidate !== staticDir && !candidate.startsWith(rootWithSep)) return null
    if (isFile(candidate)) return candidate
    if (extname(candidate) === '') {
      const index = join(candidate, 'index.html')
      if (isFile(index)) return index
    }
    return null
  }

  function serveFile(res: ServerResponse, filePath: string, headOnly = false): void {
    let size: number
    try {
      size = statSync(filePath).size
    } catch {
      return notFound(res)
    }
    const type = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, {
      'content-type': type,
      'content-length': size,
      'cache-control': 'no-cache',
    })
    if (headOnly) {
      res.end()
      return
    }
    const stream = createReadStream(filePath)
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  }

  const server = createServer((req, res) => {
    void route(req, res).catch((error) => {
      config.log(
        `[web] 请求处理失败 ${req.method ?? ''} ${req.url ?? ''}：${errorMessage(error)}`,
      )
      if (res.headersSent) {
        res.destroy()
        return
      }
      sendJson(res, 500, { error: 'internal error' })
    })
  })

  // 畸形请求行/头只影响当前连接，回应 400 而不是让异常冒到进程。
  server.on('clientError', (error, socket) => {
    config.log(`[web] 客户端请求错误：${errorMessage(error)}`)
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
  })

  return {
    server,
    config,
    listen: (port = config.port) => listen(server, port, config.host),
    close: () => close(server),
  }
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const onError = (error: Error): void => {
      server.removeListener('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.removeListener('error', onError)
      const address = server.address()
      resolvePromise(typeof address === 'object' && address !== null ? address.port : port)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (!server.listening) {
      resolvePromise()
      return
    }
    server.close((error) => (error ? reject(error) : resolvePromise()))
  })
}

type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 }

async function readJsonBody(req: IncomingMessage): Promise<BodyResult> {
  const chunks: Buffer[] = []
  let size = 0
  let tooLarge = false
  try {
    for await (const chunk of req) {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer)
      if (tooLarge) continue
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        chunks.length = 0
        continue
      }
      chunks.push(buffer)
    }
  } catch {
    return { ok: false, status: 400 }
  }
  if (tooLarge) return { ok: false, status: 413 }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown }
  } catch {
    return { ok: false, status: 400 }
  }
}

function sendBodyError(res: ServerResponse, status: 400 | 413): void {
  sendJson(res, status, { error: status === 413 ? 'body too large' : 'invalid json' })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) {
    res.end()
    return
  }
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
  })
  res.end(data)
}

function notFound(res: ServerResponse): void {
  sendJson(res, 404, { error: 'not found' })
}

function parseOpenedInput(raw: unknown): { book: string; number: number; title: string } | null {
  if (!isRecord(raw)) return null
  const { book, number, title } = raw
  if (typeof book !== 'string' || book === '') return null
  if (!Number.isInteger(number) || (number as number) < 0) return null
  return { book, number: number as number, title: typeof title === 'string' ? title : '' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function firstFile(candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate
  }
  return null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface StartedWebServer extends WebServerHandle {
  readonly port: number
}

/** 供 src/web/server.mjs 调用：读环境变量、启动并注册退出信号。 */
export async function startFromEnv(repoRoot: string): Promise<StartedWebServer> {
  const config = resolveWebConfig(repoRoot)
  const handle = createHymnServer(config)
  const port = await handle.listen()
  console.log(`[web] 赞美诗歌本 Web 已启动：http://${config.host}:${port}`)
  console.log(`[web] 数据包父目录：${config.dataRoot}`)
  console.log(`[web] 用户数据目录：${config.userDir}`)
  console.log(`[web] 静态资源目录：${config.staticDir}`)

  const shutdown = (): void => {
    void handle.close().finally(() => process.exit(0))
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  return { ...handle, port }
}