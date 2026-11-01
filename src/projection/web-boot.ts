import type { ProjectionApi } from '../shared/ipc'
import type { ProjectionContent } from '../shared/projection'
import type { HymnStyle } from '../shared/style'

const PROJECTION_CHANNEL = 'hymn-projection'
const PULL_TIMEOUT_MS = 1500

type ProjectionMessage =
  | { type: 'ready' }
  | { type: 'close' }
  | { type: 'closed' }
  | { type: 'content'; content: ProjectionContent | null }
  | { type: 'style'; style: HymnStyle }
  | { type: 'nav'; direction: -1 | 1 }

type ContentListener = (content: ProjectionContent | null) => void
type StyleListener = (style: HymnStyle) => void

function createWebProjectionApi(): ProjectionApi {
  const channel = new BroadcastChannel(PROJECTION_CHANNEL)
  const contentListeners = new Set<ContentListener>()
  const styleListeners = new Set<StyleListener>()
  let latestContent: ProjectionContent | null | undefined
  let pendingPull: ((content: ProjectionContent | null) => void) | null = null

  function settlePull(content: ProjectionContent | null): void {
    const resolve = pendingPull
    pendingPull = null
    resolve?.(content)
  }

  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data
    if (typeof message !== 'object' || message === null) return
    const type = (message as { type?: unknown }).type

    if (type === 'content') {
      const content = (message as { content?: ProjectionContent | null }).content ?? null
      latestContent = content
      settlePull(content)
      for (const listener of contentListeners) listener(content)
      return
    }
    if (type === 'style') {
      const style = (message as { style: HymnStyle }).style
      for (const listener of styleListeners) listener(style)
      return
    }
    if (type === 'close') {
      window.close()
    }
  }

  window.addEventListener('pagehide', () => {
    channel.postMessage({ type: 'closed' } satisfies ProjectionMessage)
  })

  function announceReady(): void {
    channel.postMessage({ type: 'ready' } satisfies ProjectionMessage)
  }

  announceReady()

  return {
    pull: () => {
      if (latestContent !== undefined) return Promise.resolve(latestContent)
      return new Promise<ProjectionContent | null>((resolve) => {
        pendingPull = resolve
        announceReady()
        window.setTimeout(() => {
          if (pendingPull === resolve) settlePull(null)
        }, PULL_TIMEOUT_MS)
      })
    },
    onContent: (callback: ContentListener) => {
      contentListeners.add(callback)
      return () => {
        contentListeners.delete(callback)
      }
    },
    onStyle: (callback: StyleListener) => {
      styleListeners.add(callback)
      return () => {
        styleListeners.delete(callback)
      }
    },
    close: () => {
      channel.postMessage({ type: 'close' } satisfies ProjectionMessage)
      window.close()
    },
    navigate: (direction: -1 | 1) => {
      if (direction !== -1 && direction !== 1) return
      channel.postMessage({ type: 'nav', direction } satisfies ProjectionMessage)
    },
  }
}

function showFullscreenHint(): void {
  const hint = document.createElement('button')
  hint.type = 'button'
  hint.textContent = '全屏（F11）'
  Object.assign(hint.style, {
    position: 'fixed',
    top: '10px',
    left: '50%',
    zIndex: '50',
    padding: '4px 12px',
    transform: 'translateX(-50%)',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    borderRadius: '999px',
    background: 'rgba(18, 20, 24, 0.55)',
    color: '#f5f0e6',
    font: 'inherit',
    fontSize: '12px',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    opacity: '0.55',
    transition: 'opacity 0.6s ease',
  })

  let removed = false
  const dismiss = (): void => {
    if (removed) return
    removed = true
    hint.style.opacity = '0'
    window.setTimeout(() => hint.remove(), 700)
  }

  hint.addEventListener('click', () => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
    dismiss()
  })

  document.body.append(hint)
  window.setTimeout(dismiss, 3000)
}

const globalScope = window as unknown as { projection?: ProjectionApi }
if (!globalScope.projection) {
  globalScope.projection = createWebProjectionApi()
}
showFullscreenHint()

// 顺序关键：main.ts 顶层读取 window.projection，必须等 API 挂载后再加载。
void import('./main').catch((error: unknown) => {
  console.error('[web] 投屏页启动失败', error)
})