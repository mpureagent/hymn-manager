import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STYLE,
  STYLE_PRESETS,
  clampStyle,
  fontStack,
  hexToRgba,
  matchPreset,
  normalizeColor,
  styleToCssVars,
} from '../src/shared/style'

describe('clampStyle', () => {
  it('完全非法输入回落默认样式', () => {
    expect(clampStyle(undefined)).toEqual(DEFAULT_STYLE)
    expect(clampStyle(null)).toEqual(DEFAULT_STYLE)
    expect(clampStyle('oops')).toEqual(DEFAULT_STYLE)
    expect(clampStyle([1, 2, 3])).toEqual(DEFAULT_STYLE)
  })

  it('字号越界收敛到 24–120', () => {
    expect(clampStyle({ fontSize: 9999 }).fontSize).toBe(120)
    expect(clampStyle({ fontSize: 121 }).fontSize).toBe(120)
    expect(clampStyle({ fontSize: 23 }).fontSize).toBe(24)
    expect(clampStyle({ fontSize: 0 }).fontSize).toBe(24)
  })

  it('负数字号收敛到下限，NaN / Infinity 回落默认', () => {
    expect(clampStyle({ fontSize: -40 }).fontSize).toBe(24)
    expect(clampStyle({ fontSize: Number.NaN }).fontSize).toBe(48)
    expect(clampStyle({ fontSize: Number.POSITIVE_INFINITY }).fontSize).toBe(48)
  })

  it('字号只接受数字，字符串与 null 回落默认', () => {
    expect(clampStyle({ fontSize: '9999' }).fontSize).toBe(48)
    expect(clampStyle({ fontSize: null }).fontSize).toBe(48)
    expect(clampStyle({ fontSize: 47.6 }).fontSize).toBe(48)
  })

  it('行距越界收敛到 1.2–2.2', () => {
    expect(clampStyle({ lineHeight: 0.1 }).lineHeight).toBe(1.2)
    expect(clampStyle({ lineHeight: 9 }).lineHeight).toBe(2.2)
    expect(clampStyle({ lineHeight: Number.NaN }).lineHeight).toBe(1.6)
    expect(clampStyle({ lineHeight: 1.2 }).lineHeight).toBe(1.2)
    expect(clampStyle({ lineHeight: 2.2 }).lineHeight).toBe(2.2)
  })

  it('非法颜色回落默认，合法颜色统一格式', () => {
    expect(clampStyle({ textColor: 'red' }).textColor).toBe(DEFAULT_STYLE.textColor)
    expect(clampStyle({ bgColor: '#GGGGGG' }).bgColor).toBe(DEFAULT_STYLE.bgColor)
    expect(clampStyle({ bgColor: '#12' }).bgColor).toBe(DEFAULT_STYLE.bgColor)
    expect(clampStyle({ textColor: 123 }).textColor).toBe(DEFAULT_STYLE.textColor)
    expect(clampStyle({ textColor: '#abc' }).textColor).toBe('#AABBCC')
    expect(clampStyle({ bgColor: '0f1115' }).bgColor).toBe('#0F1115')
  })

  it('对齐只接受 center / left，其余回落 center', () => {
    expect(clampStyle({ align: 'left' }).align).toBe('left')
    expect(clampStyle({ align: 'right' }).align).toBe('center')
    expect(clampStyle({ align: null }).align).toBe('center')
  })

  it('字体名去空白与引号，空串回落默认', () => {
    expect(clampStyle({ fontFamily: '  SimSun  ' }).fontFamily).toBe('SimSun')
    expect(clampStyle({ fontFamily: '"KaiTi"' }).fontFamily).toBe('KaiTi')
    expect(clampStyle({ fontFamily: '   ' }).fontFamily).toBe(DEFAULT_STYLE.fontFamily)
    expect(clampStyle({ fontFamily: 42 }).fontFamily).toBe(DEFAULT_STYLE.fontFamily)
  })

  it('只覆盖提供的字段，其余保持默认', () => {
    const style = clampStyle({ fontSize: 72, align: 'left' })
    expect(style).toEqual({
      ...DEFAULT_STYLE,
      fontSize: 72,
      align: 'left',
    })
  })

  it('边界值原样保留', () => {
    expect(clampStyle({ fontSize: 24 }).fontSize).toBe(24)
    expect(clampStyle({ fontSize: 120 }).fontSize).toBe(120)
  })
})

describe('颜色与字体栈', () => {
  it('normalizeColor 支持三位、六位与可选 #', () => {
    expect(normalizeColor('#fff', '#000000')).toBe('#FFFFFF')
    expect(normalizeColor('2b2118', '#000000')).toBe('#2B2118')
    expect(normalizeColor('#2B2118', '#000000')).toBe('#2B2118')
    expect(normalizeColor('rgb(1,2,3)', '#000000')).toBe('#000000')
  })

  it('hexToRgba 生成合法 rgba', () => {
    expect(hexToRgba('#2B2118', 0.5)).toBe('rgba(43, 33, 24, 0.5)')
    expect(hexToRgba('#FFFFFF', 2)).toBe('rgba(255, 255, 255, 1)')
  })

  it('fontStack 给字体名加引号并补齐中文字体回退', () => {
    const stack = fontStack('SimSun')
    expect(stack.startsWith('"SimSun", ')).toBe(true)
    expect(stack).toContain('"Noto Serif CJK SC"')
    expect(stack.endsWith(', sans-serif')).toBe(true)
    expect(stack.match(/"SimSun"/g)).toHaveLength(1)
  })

  it('styleToCssVars 输出预览区需要的全部变量', () => {
    const vars = styleToCssVars(clampStyle({ fontSize: 120, textColor: '#F2EDE3', bgColor: '#0F1115' }))
    expect(vars['--hymn-font-size']).toBe('120px')
    expect(vars['--hymn-ink']).toBe('#F2EDE3')
    expect(vars['--hymn-bg']).toBe('#0F1115')
    expect(vars['--hymn-line-height']).toBe('1.6')
    expect(vars['--hymn-align']).toBe('center')
    expect(vars['--hymn-ink-soft']).toBe('rgba(242, 237, 227, 0.58)')
    expect(vars['--hymn-rule']).toBe('rgba(242, 237, 227, 0.16)')
  })
})

describe('预设', () => {
  it('三个预设的颜色符合规格', () => {
    expect(STYLE_PRESETS.map((preset) => preset.id)).toEqual(['light', 'dark', 'warm'])
    expect(STYLE_PRESETS.find((preset) => preset.id === 'dark')).toMatchObject({
      bgColor: '#0F1115',
      textColor: '#F2EDE3',
    })
    expect(STYLE_PRESETS.find((preset) => preset.id === 'warm')).toMatchObject({
      bgColor: '#F3E7CF',
      textColor: '#3A2A1A',
    })
  })

  it('matchPreset 大小写无关，自定义配色返回 null', () => {
    expect(matchPreset({ ...DEFAULT_STYLE })?.id).toBe('light')
    expect(matchPreset({ textColor: '#f2ede3', bgColor: '#0f1115' })?.id).toBe('dark')
    expect(matchPreset({ textColor: '#123456', bgColor: '#F5F0E6' })).toBeNull()
  })
})