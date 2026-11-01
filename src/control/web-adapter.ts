import type { HistoryData, OpenedInput } from '../shared/history'
import type {
  Bootstrap,
  HymnApi,
  ProjectionState,
  ProjectionToggleResult,
} from '../shared/ipc'
import type { ProjectionContent } from '../shared/projection'
import type { FontChoice, HymnStyle } from '../shared/style'

const PROJECTION_CHANNEL = 'hymn-projection'

type ProjectionMessage =
  | { type: 'ready' }
  | { type: 'close' }
  | { type: 'closed' }
  | { type: 'content'; content: ProjectionContent | null }
  | { type: 'style'; style: HymnStyle }
  | { type: 'nav'; direction: -1 | 1 }

interface RequestOptions {
  method?: string
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const init: RequestInit = { method: options.method ?? 'GET' }
  if (options.body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(options.body)
  }

  const response = await fetch(path, init)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText || '请求失败'}：${path}`)
  }
  return (await response.json()) as T
}

export function createWebApi(): HymnApi {
  let bootstrapCache: Bootstrap | null = null
  let latestContent: ProjectionContent | null = null
  let popup: Window | null = null
  let active = false
  let closedWatcher: number | null = null

  const stateListeners = new Set<(state: ProjectionState) => void>()
  const changedListeners = new Set<(content: ProjectionContent) => void>()

  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(PROJECTION_CHANNEL)

  function setActive(next: boolean): void {
    if (active === next) return
    active = next
    for (const listener of stateListeners) listener({ active })
  }

  function stopClosedWatcher(): void {
    if (closedWatcher === null) return
    window.clearInterval(closedWatcher)
    closedWatcher = null
  }

  function forgetPopup(): void {
    stopClosedWatcher()
    popup = null
    latestContent = null
    setActive(false)
  }

  function startClosedWatcher(): void {
    stopClosedWatcher()
    closedWatcher = window.setInterval(() => {
      if (!popup || popup.closed) forgetPopup()
    }, 500)
  }

  function withScoreUrl(content: ProjectionContent): ProjectionContent {
    if (content.view !== 'score') return { ...content, scoreUrl: null }
    return {
      ...content,
      scoreUrl: `/api/score/${encodeURIComponent(content.book)}/${content.number}`,
    }
  }

  function broadcastContent(content: ProjectionContent): void {
    channel?.postMessage({ type: 'content', content } satisfies ProjectionMessage)
  }

  async function adjacentContent(direction: -1 | 1): Promise<ProjectionContent | null> {
    if (!latestContent) return null
    const data = bootstrapCache ?? (await request<Bootstrap>('/api/bootstrap'))
    bootstrapCache = data
    if (!data.pack.ok) return null

    const book = data.pack.books.find((candidate) => candidate.id === latestContent?.book)
    if (!book) return null

    const items = book.items
      .filter((item) => Number.isInteger(item.number) && item.number >= 0)
      .slice()
      .sort((a, b) => a.number - b.number)
    const index = items.findIndex((item) => item.number === latestContent?.number)
    if (index < 0) return null

    const target = items[Math.min(items.length - 1, Math.max(0, index + direction))]
    if (!target || target.number === latestContent.number) return null

    return withScoreUrl({
      book: book.id,
      number: target.number,
      title: target.title,
      verses: target.verses ?? [],
      style: latestContent.style,
      view: latestContent.view,
    })
  }

  function navigate(direction: -1 | 1): void {
    void (async () => {
      if (!active || !latestContent) return
      const next = await adjacentContent(direction)
      if (!next || !active) return
      latestContent = next
      broadcastContent(next)
      for (const listener of changedListeners) listener(next)
    })().catch((error: unknown) => {
      console.warn('[projection] 切换投屏诗歌失败', error)
    })
  }

  if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data
      if (typeof message !== 'object' || message === null) return
      const type = (message as { type?: unknown }).type

      if (type === 'ready') {
        if (active && latestContent) broadcastContent(latestContent)
        return
      }
      if (type === 'closed' || type === 'close') {
        if (type === 'close') popup?.close()
        forgetPopup()
        return
      }
      if (type === 'nav') {
        const direction = (message as { direction?: unknown }).direction
        if (direction === -1 || direction === 1) navigate(direction)
      }
    }
  }

  return {
    bootstrap: async () => {
      const data = await request<Bootstrap>('/api/bootstrap')
      bootstrapCache = data
      return data
    },
    recheck: async () => {
      const data = await request<Bootstrap>('/api/recheck', { method: 'POST' })
      bootstrapCache = data
      return data
    },
    setCurrentBook: (id: string) =>
      request<{ currentBook: string | null }>('/api/book', {
        method: 'POST',
        body: { id },
      }),
    getHistory: () => request<HistoryData>('/api/history'),
    addSearch: (q: string) =>
      request<HistoryData>('/api/history/search', { method: 'POST', body: { q } }),
    addOpened: (entry: OpenedInput) =>
      request<HistoryData>('/api/history/opened', { method: 'POST', body: entry }),
    clearHistory: () => request<HistoryData>('/api/history', { method: 'DELETE' }),
    listFonts: () => request<FontChoice[]>('/api/fonts'),
    setStyle: (style: HymnStyle) =>
      request<HymnStyle>('/api/style', { method: 'POST', body: style }),
    getScorePath: async (book: string, number: number) =>
      `/api/score/${encodeURIComponent(book)}/${number}`,
    toggleProjection: async (content: ProjectionContent | null): Promise<ProjectionToggleResult> => {
      if (active) {
        channel?.postMessage({ type: 'close' } satisfies ProjectionMessage)
        popup?.close()
        forgetPopup()
        return { active: false }
      }

      if (!content) return { active: false, needSelection: true }

      const opened = window.open(
        '/projection',
        'hymn-projection-window',
        'popup,width=1280,height=800',
      )
      if (!opened) {
        return { active: false, hint: '浏览器拦截了弹窗，请允许本页弹出窗口' }
      }

      popup = opened
      latestContent = withScoreUrl(content)
      setActive(true)
      startClosedWatcher()
      broadcastContent(latestContent)
      return { active: true }
    },
    updateProjection: (content: ProjectionContent) => {
      if (!active) return
      latestContent = withScoreUrl(content)
      broadcastContent(latestContent)
    },
    setProjectionStyle: (style: HymnStyle) => {
      if (!active) return
      if (latestContent) latestContent = { ...latestContent, style }
      channel?.postMessage({ type: 'style', style } satisfies ProjectionMessage)
    },
    onProjectionState: (callback: (state: ProjectionState) => void) => {
      stateListeners.add(callback)
      return () => {
        stateListeners.delete(callback)
      }
    },
    onProjectionChanged: (callback: (content: ProjectionContent) => void) => {
      changedListeners.add(callback)
      return () => {
        changedListeners.delete(callback)
      }
    },
  }
}

const globalScope = window as unknown as { hymn?: HymnApi }
if (!globalScope.hymn) {
  globalScope.hymn = createWebApi()
}