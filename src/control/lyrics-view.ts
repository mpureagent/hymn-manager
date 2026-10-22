import type { HymnItem } from '../shared/types'

export interface LyricsViewRefs {
  empty: HTMLElement
  panel: HTMLElement
  eyebrow: HTMLElement
  title: HTMLElement
  alt: HTMLElement
  body: HTMLElement
}

interface RenderedVerse {
  label: string
  lines: string[]
}

function meaningfulVerses(item: HymnItem): RenderedVerse[] {
  return (item.verses ?? [])
    .map((verse) => ({
      label: verse.label.trim(),
      lines: verse.lines.filter((line) => line.trim() !== ''),
    }))
    .filter((verse) => verse.lines.length > 0)
}

/** 右侧歌词预览：头部「第N首 标题」，正文按段渲染，长歌词在预览区独立滚动。 */
export class LyricsView {
  private readonly refs: LyricsViewRefs

  constructor(refs: LyricsViewRefs) {
    this.refs = refs
  }

  clear(): void {
    this.refs.panel.hidden = true
    this.refs.empty.hidden = false
  }

  show(item: HymnItem): void {
    this.refs.empty.hidden = true
    this.refs.panel.hidden = false

    this.refs.eyebrow.textContent = `第${item.number}首`
    this.refs.title.textContent = item.title

    const alt = item.title_alt?.trim() ?? ''
    if (alt && alt !== item.title.trim()) {
      this.refs.alt.textContent = `（${alt}）`
      this.refs.alt.hidden = false
    } else {
      this.refs.alt.textContent = ''
      this.refs.alt.hidden = true
    }

    const verses = meaningfulVerses(item)
    if (verses.length === 0) {
      this.refs.body.replaceChildren(missingLyrics())
    } else {
      this.refs.body.replaceChildren(...verses.map(renderVerse))
    }

    // 切歌后滚动位置归零，不能把上一首的阅读位置带过来。
    this.refs.body.scrollTop = 0
  }
}

function renderVerse(verse: RenderedVerse, index: number): HTMLElement {
  const container = document.createElement('div')
  container.className = 'lyric-verse'
  container.dataset.verse = String(index + 1)

  const label = verse.label.trim()
  if (label) {
    const labelEl = document.createElement('span')
    labelEl.className = 'verse-label'
    labelEl.textContent = label
    container.append(labelEl)
  }

  for (const line of verse.lines) {
    const lineEl = document.createElement('p')
    lineEl.className = 'lyric-line'
    lineEl.textContent = line
    container.append(lineEl)
  }

  return container
}

function missingLyrics(): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'lyrics-missing'

  const title = document.createElement('p')
  title.className = 'lyrics-missing-title'
  title.textContent = '本首歌词暂缺'

  const hint = document.createElement('p')
  hint.className = 'lyrics-missing-hint'
  hint.textContent = '可在曲谱视图查看原书简谱'

  const action = document.createElement('button')
  action.type = 'button'
  action.className = 'lyrics-missing-action'
  action.disabled = true
  action.title = '曲谱视图将在后续版本提供'
  action.textContent = '查看曲谱'

  wrapper.append(title, hint, action)
  return wrapper
}