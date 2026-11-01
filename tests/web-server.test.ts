import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { HistoryData } from '../src/shared/history'
import type { Bootstrap } from '../src/shared/ipc'
import type { FontChoice, HymnStyle } from '../src/shared/style'
import { createHymnServer, type WebServerConfig, type WebServerHandle } from '../src/web/server-core'

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const roots: string[] = []
const handles: WebServerHandle[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'hymn-web-'))
  roots.push(root)
  return root
}

function serverConfig(root: string, overrides: Partial<WebServerConfig> = {}): WebServerConfig {
  return {
    repoRoot: root,
    dataRoot: root,
    userDir: join(root, '.web-user'),
    staticDir: join(root, 'static'),
    port: 0,
    host: '127.0.0.1',
    log: () => {},
    ...overrides,
  }
}

function writePack(root: string): void {
  const pack = join(root, 'hymns-data')
  mkdirSync(join(pack, 'books'), { recursive: true })
  mkdirSync(join(pack, 'scores', 'red'), { recursive: true })
  writeFileSync(
    join(pack, 'manifest.json'),
    JSON.stringify({
      version: 1,
      books: [
        { id: 'red_book', name: '赞美诗（新编）', alias: '红本', count: 2 },
        { id: 'black_book_1218', name: '赞美诗歌（1218首）', alias: '千首本/黑皮', count: 1 },
      ],
    }),
  )
  writeFileSync(
    join(pack, 'books', 'red_book.json'),
    JSON.stringify({
      items: [
        { number: 1, title: '圣哉三一歌', verses: [] },
        { number: 3, title: '第三首', verses: [] },
      ],
    }),
  )
  writeFileSync(
    join(pack, 'books', 'black_book_1218.json'),
    JSON.stringify({ items: [{ number: 1, title: '圣哉三一', verses: [] }] }),
  )
  writeFileSync(join(pack, 'scores', 'red', '0001_0.png'), PNG_BYTES)
}

async function start(
  root: string,
  overrides: Partial<WebServerConfig> = {},
): Promise<{ handle: WebServerHandle; base: string }> {
  const handle = createHymnServer(serverConfig(root, overrides))
  handles.push(handle)
  const port = await handle.listen(0)
  return { handle, base: `http://127.0.0.1:${port}` }
}

function postJson(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

afterEach(async () => {
  while (handles.length > 0) {
    await handles.pop()?.close()
  }
  while (roots.length > 0) {
    const root = roots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('web server: bootstrap', () => {
  it('返回数据包、当前本与样式', async () => {
    const root = tempRoot()
    writePack(root)
    const { base } = await start(root)

    const response = await fetch(`${base}/api/bootstrap`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = (await response.json()) as Bootstrap
    expect(body.pack.ok).toBe(true)
    if (!body.pack.ok) return
    expect(body.pack.root).toBe(join(root, 'hymns-data'))
    expect(body.pack.books.map((book) => book.id)).toEqual(['red_book', 'black_book_1218'])
    expect(body.currentBook).toBe('red_book')
    expect(body.style.fontSize).toBe(48)
  })

  it('数据包缺失返回 ok:false，recheck 能重新检测到新数据包', async () => {
    const root = tempRoot()
    const { base } = await start(root)

    const missing = (await (await fetch(`${base}/api/bootstrap`)).json()) as Bootstrap
    expect(missing.pack.ok).toBe(false)
    if (missing.pack.ok) return
    expect(missing.pack.reason).toBe('missing')
    expect(missing.pack.searchedPaths.length).toBeGreaterThan(0)
    expect(missing.currentBook).toBeNull()

    writePack(root)
    const rechecked = (await (await fetch(`${base}/api/recheck`, { method: 'POST' })).json()) as Bootstrap
    expect(rechecked.pack.ok).toBe(true)
    expect(rechecked.currentBook).toBe('red_book')
  })
})

describe('web server: book and style', () => {
  it('POST /api/book 只接受数据包内存在的本', async () => {
    const root = tempRoot()
    writePack(root)
    const { base } = await start(root)

    const changed = await postJson(base, '/api/book', { id: 'black_book_1218' })
    expect(changed.status).toBe(200)
    expect(await changed.json()).toEqual({ currentBook: 'black_book_1218' })

    const rejected = await postJson(base, '/api/book', { id: 'no_such_book' })
    expect(await rejected.json()).toEqual({ currentBook: 'black_book_1218' })

    const bootstrap = (await (await fetch(`${base}/api/bootstrap`)).json()) as Bootstrap
    expect(bootstrap.currentBook).toBe('black_book_1218')
  })

  it('POST /api/style 收敛越界样式并持久化', async () => {
    const root = tempRoot()
    writePack(root)
    const { base } = await start(root)

    const response = await postJson(base, '/api/style', { fontSize: 9999, align: 'left' })
    expect(response.status).toBe(200)
    const style = (await response.json()) as HymnStyle
    expect(style.fontSize).toBe(120)
    expect(style.align).toBe('left')

    const bootstrap = (await (await fetch(`${base}/api/bootstrap`)).json()) as Bootstrap
    expect(bootstrap.style).toEqual(style)
  })
})

describe('web server: history', () => {
  it('搜索/打开/读取/清空', async () => {
    const root = tempRoot()
    writePack(root)
    const { base } = await start(root)

    const searched = (await (await postJson(base, '/api/history/search', { q: '圣哉' })).json()) as HistoryData
    expect(searched.searches.map((entry) => entry.q)).toEqual(['圣哉'])

    const opened = (await (
      await postJson(base, '/api/history/opened', { book: 'red_book', number: 1, title: '旧标题' })
    ).json()) as HistoryData
    expect(opened.opened).toEqual([
      expect.objectContaining({ book: 'red_book', number: 1, title: '圣哉三一歌' }),
    ])

    const read = (await (await fetch(`${base}/api/history`)).json()) as HistoryData
    expect(read).toEqual(opened)

    const cleared = (await (
      await fetch(`${base}/api/history`, { method: 'DELETE' })
    ).json()) as HistoryData
    expect(cleared).toEqual({ searches: [], opened: [] })
  })

  it('数据包中不存在的诗歌不写入打开记录', async () => {
    const root = tempRoot()
    writePack(root)
    const { base } = await start(root)

    const response = await postJson(base, '/api/history/opened', {
      book: 'red_book',
      number: 9999,
      title: '不存在',
    })
    const body = (await response.json()) as HistoryData
    expect(body).toEqual({ searches: [], opened: [] })
  })
})

describe('web server: errors', () => {
  it('非法 JSON body 返回 400 且服务继续可用', async () => {
    const root = tempRoot()
    writePack(root)
    const { base } = await start(root)

    const bad = await fetch(`${base}/api/book`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid json' })

    expect((await fetch(`${base}/api/bootstrap`)).status).toBe(200)
  })

  it('未知路径返回 404', async () => {
    const root = tempRoot()
    writePack(root)
    const { base } = await start(root)
    expect((await fetch(`${base}/api/nope`)).status).toBe(404)
    expect((await fetch(`${base}/missing.js`)).status).toBe(404)
  })

  it('拒绝目录穿越', async () => {
    const root = tempRoot()
    writePack(root)
    const { base } = await start(root)
    expect((await fetch(`${base}/%2e%2e/package.json`)).status).toBe(404)
  })
})

describe('web server: score', () => {
  it('返回图片二进制；缺图、非法编号、未知本均 404', async () => {
    const root = tempRoot()
    writePack(root)
    const { base } = await start(root)

    const found = await fetch(`${base}/api/score/red_book/1`)
    expect(found.status).toBe(200)
    expect(found.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await found.arrayBuffer()).equals(PNG_BYTES)).toBe(true)

    expect((await fetch(`${base}/api/score/red_book/9999`)).status).toBe(404)
    expect((await fetch(`${base}/api/score/red_book/abc`)).status).toBe(404)
    expect((await fetch(`${base}/api/score/no_such_book/1`)).status).toBe(404)
  })
})

describe('web server: static and fonts', () => {
  it('GET / 与 /projection 返回静态页面', async () => {
    const root = tempRoot()
    writePack(root)
    mkdirSync(join(root, 'static', 'control'), { recursive: true })
    mkdirSync(join(root, 'static', 'projection'), { recursive: true })
    writeFileSync(join(root, 'static', 'control', 'index.html'), '<!doctype html><title>control</title>')
    writeFileSync(join(root, 'static', 'projection', 'index.html'), '<!doctype html><title>projection</title>')
    const { base } = await start(root)

    const home = await fetch(`${base}/`)
    expect(home.status).toBe(200)
    expect(home.headers.get('content-type')).toContain('text/html')
    expect(await home.text()).toContain('<title>control</title>')

    const projection = await fetch(`${base}/projection`)
    expect(projection.status).toBe(200)
    expect(await projection.text()).toContain('<title>projection</title>')
  })

  it('GET /api/fonts 返回字体候选', async () => {
    const root = tempRoot()
    writePack(root)
    const { base } = await start(root)

    const response = await fetch(`${base}/api/fonts`)
    expect(response.status).toBe(200)
    const fonts = (await response.json()) as FontChoice[]
    expect(Array.isArray(fonts)).toBe(true)
    expect(fonts.length).toBeGreaterThan(0)
    expect(typeof fonts[0]?.value).toBe('string')
    expect(typeof fonts[0]?.label).toBe('string')
  })
})