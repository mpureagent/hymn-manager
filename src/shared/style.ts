export type HymnAlign = 'center' | 'left'

export interface HymnStyle {
  fontFamily: string
  fontSize: number
  lineHeight: number
  textColor: string
  bgColor: string
  align: HymnAlign
}

export interface FontChoice {
  value: string
  label: string
}

export const FONT_SIZE_MIN = 24
export const FONT_SIZE_MAX = 120
export const LINE_HEIGHT_MIN = 1.2
export const LINE_HEIGHT_MAX = 2.2

/** 默认字体优先系统宋体，缺失时 fontStack() 会逐级回退到各平台中文字体。 */
export const DEFAULT_FONT_FAMILY = 'Noto Serif CJK SC'

export const DEFAULT_STYLE: Readonly<HymnStyle> = Object.freeze({
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: 48,
  lineHeight: 1.6,
  textColor: '#2B2118',
  bgColor: '#F5F0E6',
  align: 'center',
})

export interface StylePreset {
  id: 'light' | 'dark' | 'warm'
  label: string
  textColor: string
  bgColor: string
}

export const STYLE_PRESETS: readonly StylePreset[] = Object.freeze([
  { id: 'light', label: '浅底深字', textColor: '#2B2118', bgColor: '#F5F0E6' },
  { id: 'dark', label: '深底浅字', textColor: '#F2EDE3', bgColor: '#0F1115' },
  { id: 'warm', label: '暖纸', textColor: '#3A2A1A', bgColor: '#F3E7CF' },
])

export const TEXT_COLOR_SWATCHES: readonly string[] = Object.freeze([
  '#2B2118',
  '#1C1C1C',
  '#3A2A1A',
  '#5B4636',
  '#7D3B2F',
  '#1F3A5F',
  '#2F5D50',
  '#4A3B6B',
  '#7A5B1E',
  '#F2EDE3',
])

export const BG_COLOR_SWATCHES: readonly string[] = Object.freeze([
  '#F5F0E6',
  '#FFFDF8',
  '#F3E7CF',
  '#E8EEF5',
  '#E9F0E6',
  '#EFE6F5',
  '#F5E9E4',
  '#0F1115',
  '#1B2430',
  '#2A2119',
])

/** 主进程枚举字体失败时，渲染层也能用同一份固定候选。 */
export const FALLBACK_FONTS: readonly FontChoice[] = Object.freeze([
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'Source Han Serif SC', label: '思源宋体' },
  { value: 'SimSun', label: '宋体' },
  { value: 'KaiTi', label: '楷体' },
  { value: 'SimHei', label: '黑体' },
])

const FONT_STACK_TAIL = [
  'Source Han Serif SC',
  'Noto Serif CJK SC',
  'SimSun',
  'Microsoft YaHei',
  'PingFang SC',
  'Noto Sans CJK SC',
  'sans-serif',
] as const

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
])

/** 把字体名加引号并补中文字体回退链；值会直接进 CSS 变量，所以要转义引号。 */
export function fontStack(family: string): string {
  const normalized = family.trim() || DEFAULT_FONT_FAMILY
  const entries = [normalized, ...FONT_STACK_TAIL]
  const seen = new Set<string>()
  const stack: string[] = []

  for (const entry of entries) {
    const key = entry.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    stack.push(
      GENERIC_FAMILIES.has(key)
        ? entry
        : `"${entry.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    )
  }

  return stack.join(', ')
}

/** 合法颜色统一成大写 #RRGGBB；非法值返回 fallback。 */
export function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return fallback
  const hex = match[1]!.toUpperCase()
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  }
  return `#${hex}`
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeColor(hex, DEFAULT_STYLE.textColor)
  const r = Number.parseInt(normalized.slice(1, 3), 16)
  const g = Number.parseInt(normalized.slice(3, 5), 16)
  const b = Number.parseInt(normalized.slice(5, 7), 16)
  const a = Math.min(1, Math.max(0, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  integer = false,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const bounded = Math.min(max, Math.max(min, value))
  return integer ? Math.round(bounded) : bounded
}

function normalizeFontFamily(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_STYLE.fontFamily
  const cleaned = value.trim().replace(/^["']|["']$/g, '').trim()
  return cleaned === '' ? DEFAULT_STYLE.fontFamily : cleaned.slice(0, 120)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 所有外部输入（settings.json、IPC）都先经过这里：越界收敛、非法值回落默认。 */
export function clampStyle(input: unknown): HymnStyle {
  const raw = isRecord(input) ? input : {}
  const align: HymnAlign =
    raw.align === 'left' || raw.align === 'center' ? raw.align : DEFAULT_STYLE.align

  return {
    fontFamily: normalizeFontFamily(raw.fontFamily),
    fontSize: clampNumber(raw.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX, DEFAULT_STYLE.fontSize, true),
    lineHeight: clampNumber(
      raw.lineHeight,
      LINE_HEIGHT_MIN,
      LINE_HEIGHT_MAX,
      DEFAULT_STYLE.lineHeight,
    ),
    textColor: normalizeColor(raw.textColor, DEFAULT_STYLE.textColor),
    bgColor: normalizeColor(raw.bgColor, DEFAULT_STYLE.bgColor),
    align,
  }
}

/**
 * 样式 → CSS 变量。预览区只认这些变量，改样式时无需重建任何 DOM 节点。
 * 次级文字/分隔线由字色推导，深底浅字时也能保持可读。
 */
export function styleToCssVars(style: HymnStyle): Record<string, string> {
  return {
    '--hymn-font-family': fontStack(style.fontFamily),
    '--hymn-font-size': `${style.fontSize}px`,
    '--hymn-line-height': String(style.lineHeight),
    '--hymn-ink': style.textColor,
    '--hymn-bg': style.bgColor,
    '--hymn-ink-soft': hexToRgba(style.textColor, 0.58),
    '--hymn-rule': hexToRgba(style.textColor, 0.16),
    '--hymn-align': style.align,
  }
}

export function matchPreset(style: Pick<HymnStyle, 'textColor' | 'bgColor'>): StylePreset | null {
  return (
    STYLE_PRESETS.find(
      (preset) =>
        preset.textColor.toLowerCase() === style.textColor.toLowerCase() &&
        preset.bgColor.toLowerCase() === style.bgColor.toLowerCase(),
    ) ?? null
  )
}