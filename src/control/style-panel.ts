import {
  BG_COLOR_SWATCHES,
  DEFAULT_STYLE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  STYLE_PRESETS,
  TEXT_COLOR_SWATCHES,
  matchPreset,
  type FontChoice,
  type HymnAlign,
  type HymnStyle,
} from '../shared/style'

export interface StylePanelOptions {
  fonts: readonly FontChoice[]
  style: HymnStyle
  /** 父层负责合并、clamp、应用 CSS 变量与持久化；返回收敛后的完整样式。 */
  onChange(patch: Partial<HymnStyle>): HymnStyle
  onClose?(): void
}

function div(className: string): HTMLDivElement {
  const node = document.createElement('div')
  node.className = className
  return node
}

/** 右侧滑出样式面板：预设、字体、字号、颜色、行距、对齐、恢复默认。 */
export class StylePanel {
  private readonly root: HTMLDivElement
  private readonly panel: HTMLElement
  private readonly fontSelect: HTMLSelectElement
  private readonly fontSizeRange: HTMLInputElement
  private readonly fontSizeNumber: HTMLInputElement
  private readonly lineHeightRange: HTMLInputElement
  private readonly lineHeightValue: HTMLOutputElement
  private readonly textColorInput: HTMLInputElement
  private readonly bgColorInput: HTMLInputElement
  private readonly textSwatches: HTMLButtonElement[] = []
  private readonly bgSwatches: HTMLButtonElement[] = []
  private readonly alignButtons = new Map<HymnAlign, HTMLButtonElement>()
  private readonly presetButtons = new Map<string, HTMLButtonElement>()
  private readonly options: StylePanelOptions
  private fonts: FontChoice[]
  private style: HymnStyle
  private fontSignature = ''
  private lastFocus: HTMLElement | null = null

  constructor(options: StylePanelOptions) {
    this.options = options
    this.fonts = [...options.fonts]
    this.style = options.style

    this.root = div('style-overlay')
    this.root.hidden = true

    const mask = div('style-mask')
    mask.addEventListener('click', () => this.close())

    const panel = document.createElement('aside')
    panel.className = 'style-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    panel.setAttribute('aria-labelledby', 'style-panel-title')
    panel.tabIndex = -1
    this.panel = panel

    const head = div('style-panel-head')
    const title = document.createElement('h2')
    title.id = 'style-panel-title'
    title.className = 'style-panel-title'
    title.textContent = '样式设置'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'style-close'
    close.textContent = '×'
    close.setAttribute('aria-label', '关闭样式面板')
    close.addEventListener('click', () => this.close())
    head.append(title, close)

    const body = div('style-panel-body')

    this.fontSelect = document.createElement('select')
    this.fontSelect.className = 'style-select'
    this.fontSelect.addEventListener('change', () => {
      if (this.fontSelect.value) this.emit({ fontFamily: this.fontSelect.value })
    })

    this.fontSizeRange = document.createElement('input')
    this.fontSizeRange.type = 'range'
    this.fontSizeRange.className = 'style-range'
    this.fontSizeRange.min = String(FONT_SIZE_MIN)
    this.fontSizeRange.max = String(FONT_SIZE_MAX)
    this.fontSizeRange.step = '1'
    this.fontSizeRange.addEventListener('input', () =>
      this.emit({ fontSize: Number(this.fontSizeRange.value) }),
    )

    this.fontSizeNumber = document.createElement('input')
    this.fontSizeNumber.type = 'number'
    this.fontSizeNumber.className = 'style-number'
    this.fontSizeNumber.min = String(FONT_SIZE_MIN)
    this.fontSizeNumber.max = String(FONT_SIZE_MAX)
    this.fontSizeNumber.step = '1'
    this.fontSizeNumber.addEventListener('change', () => {
      const raw = this.fontSizeNumber.value.trim()
      this.emit({ fontSize: raw === '' ? this.style.fontSize : Number(raw) })
    })

    this.lineHeightRange = document.createElement('input')
    this.lineHeightRange.type = 'range'
    this.lineHeightRange.className = 'style-range'
    this.lineHeightRange.min = String(LINE_HEIGHT_MIN)
    this.lineHeightRange.max = String(LINE_HEIGHT_MAX)
    this.lineHeightRange.step = '0.1'
    this.lineHeightRange.addEventListener('input', () =>
      this.emit({ lineHeight: Number(this.lineHeightRange.value) }),
    )

    this.lineHeightValue = document.createElement('output')
    this.lineHeightValue.className = 'style-value'

    this.textColorInput = this.colorInput('文字取色器', (value) => this.emit({ textColor: value }))
    this.bgColorInput = this.colorInput('背景取色器', (value) => this.emit({ bgColor: value }))

    const sample = this.sample()
    const align = this.alignControl()

    body.append(
      this.section('预设', this.presetGrid()),
      sample,
      this.section(
        '排版',
        this.field('字体', this.fontSelect),
        this.rangeField('字号', this.fontSizeRange, this.fontSizeNumber, 'px'),
        this.rangeField('行距', this.lineHeightRange, this.lineHeightValue),
        align,
      ),
      this.colorSection('文字颜色', 'textColor', TEXT_COLOR_SWATCHES, this.textSwatches, this.textColorInput),
      this.colorSection('背景颜色', 'bgColor', BG_COLOR_SWATCHES, this.bgSwatches, this.bgColorInput),
      this.resetButton(),
    )

    panel.append(head, body)
    this.root.append(mask, panel)
    document.body.append(this.root)

    document.addEventListener('keydown', this.onKeyDown, true)

    this.refreshFontOptions()
    this.setStyle(options.style)
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  open(): void {
    if (!this.root.hidden) return
    this.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.root.hidden = false
    this.panel.focus({ preventScroll: true })
  }

  close(): void {
    if (this.root.hidden) return
    this.root.hidden = true
    this.options.onClose?.()
    const focus = this.lastFocus
    this.lastFocus = null
    if (focus?.isConnected) focus.focus({ preventScroll: true })
  }

  setFonts(fonts: readonly FontChoice[]): void {
    this.fonts = [...fonts]
    this.fontSignature = ''
    this.refreshFontOptions()
    this.setStyle(this.style)
  }

  setStyle(style: HymnStyle): void {
    this.style = style
    this.refreshFontOptions()

    this.fontSelect.value = style.fontFamily
    this.fontSizeRange.value = String(style.fontSize)
    this.fontSizeNumber.value = String(style.fontSize)
    this.lineHeightRange.value = String(style.lineHeight)
    this.lineHeightValue.textContent = style.lineHeight.toFixed(1)
    this.textColorInput.value = style.textColor
    this.bgColorInput.value = style.bgColor

    for (const button of this.textSwatches) {
      button.classList.toggle('active', button.dataset.color === style.textColor)
    }
    for (const button of this.bgSwatches) {
      button.classList.toggle('active', button.dataset.color === style.bgColor)
    }
    for (const [align, button] of this.alignButtons) {
      button.setAttribute('aria-pressed', String(style.align === align))
    }

    const preset = matchPreset(style)
    for (const [id, button] of this.presetButtons) {
      button.classList.toggle('active', preset?.id === id)
    }
  }

  private emit(patch: Partial<HymnStyle>): void {
    this.setStyle(this.options.onChange(patch))
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.root.hidden || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    this.close()
  }

  private refreshFontOptions(): void {
    const signature = `${this.fonts.map((font) => font.value).join('\u0000')}\u0001${this.style.fontFamily}`
    if (signature === this.fontSignature) return
    this.fontSignature = signature

    const choices: FontChoice[] = []
    const seen = new Set<string>()
    for (const font of this.fonts) {
      const key = font.value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      choices.push(font)
    }
    if (!seen.has(this.style.fontFamily.toLowerCase())) {
      choices.push({ value: this.style.fontFamily, label: this.style.fontFamily })
    }

    this.fontSelect.replaceChildren(
      ...choices.map((font) => {
        const option = document.createElement('option')
        option.value = font.value
        option.textContent = font.label
        return option
      }),
    )
  }

  private section(title: string, ...children: HTMLElement[]): HTMLElement {
    const section = document.createElement('section')
    section.className = 'style-section'
    const heading = document.createElement('h3')
    heading.className = 'style-section-title'
    heading.textContent = title
    section.append(heading, ...children)
    return section
  }

  private field(labelText: string, ...controls: HTMLElement[]): HTMLElement {
    const wrap = div('style-field')
    const label = document.createElement('span')
    label.className = 'style-label'
    label.textContent = labelText
    wrap.append(label, ...controls)
    return wrap
  }

  private rangeField(
    labelText: string,
    range: HTMLInputElement,
    extra: HTMLElement,
    unit?: string,
  ): HTMLElement {
    const wrap = div('style-field style-field-stack')
    const label = document.createElement('span')
    label.className = 'style-label'
    label.textContent = labelText
    const row = div('style-range-row')
    row.append(range, extra)
    if (unit) {
      const suffix = document.createElement('span')
      suffix.className = 'style-unit'
      suffix.textContent = unit
      row.append(suffix)
    }
    wrap.append(label, row)
    return wrap
  }

  private presetGrid(): HTMLElement {
    const grid = div('style-preset-grid')
    for (const preset of STYLE_PRESETS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'style-preset'
      button.dataset.preset = preset.id
      button.style.setProperty('--preset-bg', preset.bgColor)
      button.style.setProperty('--preset-ink', preset.textColor)

      const preview = div('style-preset-preview')
      preview.setAttribute('aria-hidden', 'true')
      const sample = document.createElement('span')
      sample.textContent = '圣'
      preview.append(sample)

      const label = document.createElement('span')
      label.className = 'style-preset-label'
      label.textContent = preset.label

      button.append(preview, label)
      button.addEventListener('click', () =>
        this.emit({ textColor: preset.textColor, bgColor: preset.bgColor }),
      )
      this.presetButtons.set(preset.id, button)
      grid.append(button)
    }
    return grid
  }

  private sample(): HTMLElement {
    const box = div('style-sample')
    const label = document.createElement('span')
    label.className = 'style-sample-label'
    label.textContent = '实时样张'
    const text = document.createElement('p')
    text.className = 'style-sample-text'
    text.textContent = '圣哉，圣哉，圣哉！'
    box.append(label, text)
    return box
  }

  private alignControl(): HTMLElement {
    const wrap = div('style-field')
    const label = document.createElement('span')
    label.className = 'style-label'
    label.textContent = '对齐'
    const group = div('style-segmented')

    for (const [align, text] of [
      ['center', '居中'],
      ['left', '左对齐'],
    ] as const) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = text
      button.addEventListener('click', () => this.emit({ align }))
      this.alignButtons.set(align, button)
      group.append(button)
    }

    wrap.append(label, group)
    return wrap
  }

  private colorInput(label: string, onChange: (value: string) => void): HTMLInputElement {
    const input = document.createElement('input')
    input.type = 'color'
    input.className = 'style-color-input'
    input.setAttribute('aria-label', label)
    input.addEventListener('input', () => onChange(input.value))
    return input
  }

  private colorSection(
    title: string,
    field: 'textColor' | 'bgColor',
    colors: readonly string[],
    store: HTMLButtonElement[],
    input: HTMLInputElement,
  ): HTMLElement {
    const grid = div('style-color-grid')
    for (const color of colors) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'style-swatch'
      button.dataset.color = color
      button.style.backgroundColor = color
      button.title = color
      button.setAttribute('aria-label', `${title} ${color}`)
      button.addEventListener('click', () =>
        this.emit(field === 'textColor' ? { textColor: color } : { bgColor: color }),
      )
      store.push(button)
      grid.append(button)
    }

    const custom = div('style-color-custom')
    const customLabel = document.createElement('span')
    customLabel.className = 'style-label'
    customLabel.textContent = '自定义'
    custom.append(customLabel, input)
    return this.section(title, grid, custom)
  }

  private resetButton(): HTMLElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'style-reset'
    button.textContent = '恢复默认'
    button.addEventListener('click', () => this.emit({ ...DEFAULT_STYLE }))
    return button
  }
}