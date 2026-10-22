import { describe, expect, it } from 'vitest'
import {
  isLikelyChineseFont,
  mapWindowsFontName,
  parseFcList,
  parseWindowsFontRegistry,
} from '../src/main/fonts'

describe('字体枚举解析', () => {
  it('fc-list：拆分逗号、去字重变体并去重', () => {
    const output = [
      'Noto Sans CJK SC,Noto Sans CJK SC Black',
      'Noto Serif CJK SC',
      'Noto Serif CJK SC,Noto Serif CJK SC Light',
      'Noto Serif CJK SC',
    ].join('\n')

    expect(parseFcList(output)).toEqual(['Noto Sans CJK SC', 'Noto Serif CJK SC'])
  })

  it('Windows 注册表：剥离 (TrueType)、拆分 & 并忽略非字体行', () => {
    const output = [
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
      '    Microsoft YaHei & Microsoft YaHei UI (TrueType)    REG_SZ    msyh.ttc',
      '    SimSun & NSimSun (TrueType)    REG_SZ    simsun.ttc',
      '    Arial (TrueType)    REG_SZ    arial.ttf',
      '    Source Han Serif SC (OpenType)    REG_SZ    SourceHanSerif.otf',
    ].join('\n')

    expect(parseWindowsFontRegistry(output)).toEqual([
      'Microsoft YaHei',
      'Microsoft YaHei UI',
      'SimSun',
      'NSimSun',
      'Arial',
      'Source Han Serif SC',
    ])
  })

  it('中文字体识别与 Windows 中文名映射', () => {
    expect(isLikelyChineseFont('SimSun')).toBe(true)
    expect(isLikelyChineseFont('微软雅黑')).toBe(true)
    expect(isLikelyChineseFont('Noto Serif CJK SC')).toBe(true)
    expect(isLikelyChineseFont('Arial')).toBe(false)
    expect(mapWindowsFontName('微软雅黑')).toBe('Microsoft YaHei')
    expect(mapWindowsFontName('宋体')).toBe('SimSun')
    expect(mapWindowsFontName('SimSun')).toBe('SimSun')
  })
})