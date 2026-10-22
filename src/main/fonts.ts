import { execFileSync } from 'node:child_process'
import { FALLBACK_FONTS, type FontChoice } from '../shared/style'

const FC_LIST_TIMEOUT_MS = 2500
const REG_QUERY_TIMEOUT_MS = 3000

/** fc-list 的 family 字段可能带字重后缀，过滤掉这些变体只留下家族名。 */
const WEIGHT_SUFFIX = /\s+(?:Black|Bold|Book|DemiLight|ExtraLight|Light|Medium|Regular|SemiBold|Thin)$/i

const CJK_FONT_HINT =
  /(?:yahei|simsun|nsimsun|simhei|kaiti|fangsong|dengxian|jhenghei|mingliu|heiti|source han|noto (?:sans|serif|mono) cjk|st(?:song|kaiti|heiti|fangsong)|lisu|youyuan|msjh|msyi|雅黑|宋|黑|楷|仿宋|等线|隶书|幼圆|华文|明體|正黑體)/i

const WINDOWS_ALIASES: Record<string, string> = {
  微软雅黑: 'Microsoft YaHei',
  宋体: 'SimSun',
  新宋体: 'NSimSun',
  黑体: 'SimHei',
  楷体: 'KaiTi',
  仿宋: 'FangSong',
  等线: 'DengXian',
  华文宋体: 'STSong',
  华文楷体: 'STKaiti',
  华文黑体: 'STHeiti',
  华文仿宋: 'STFangsong',
  幼圆: 'YouYuan',
  隶书: 'LiSu',
}

export function parseFcList(output: string): string[] {
  const families = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    for (const part of line.split(',')) {
      const name = part.trim()
      if (!name || WEIGHT_SUFFIX.test(name)) continue
      families.add(name)
    }
  }
  return [...families]
}

/** reg query 输出：`    Microsoft YaHei & ... (TrueType)    REG_SZ    msyh.ttc` */
export function parseWindowsFontRegistry(output: string): string[] {
  const names = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(.+?)\s+REG_\w+\s+/i.exec(line)
    if (!match) continue
    const display = match[1]!
      .replace(/\s*\((?:TrueType|OpenType|All Res|PostScript)[^)]*\)\s*$/i, '')
      .trim()
    for (const part of display.split('&')) {
      const name = part.trim().replace(/^@/, '')
      if (name !== '') names.add(name)
    }
  }
  return [...names]
}

export function isLikelyChineseFont(name: string): boolean {
  return CJK_FONT_HINT.test(name)
}

export function mapWindowsFontName(name: string): string {
  return WINDOWS_ALIASES[name] ?? name
}

function runCommand(command: string, args: string[], timeout: number): string {
  return execFileSync(command, args, {
    encoding: 'utf-8',
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  })
}

function readFcList(): string[] {
  return parseFcList(runCommand('fc-list', [':lang=zh', '--format=%{family[0]}\n'], FC_LIST_TIMEOUT_MS))
    .filter((name) => name !== '')
}

function readWindowsRegistry(): string[] {
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
    'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
  ]
  const names: string[] = []
  for (const key of keys) {
    try {
      const output = runCommand('reg', ['query', key], REG_QUERY_TIMEOUT_MS)
      names.push(...parseWindowsFontRegistry(output).filter(isLikelyChineseFont).map(mapWindowsFontName))
    } catch {
      // 单个注册表位置不可读时继续尝试下一个
    }
  }
  return names
}

function dedupeSorted(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const name of names) {
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(name)
  }
  return unique.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

/** 枚举本机中文字体；命令不可用或结果为空时回落固定候选，绝不抛异常。 */
export function listChineseFonts(): FontChoice[] {
  try {
    const names = process.platform === 'win32' ? readWindowsRegistry() : readFcList()
    if (names.length > 0) {
      return dedupeSorted(names).map((name) => ({ value: name, label: name }))
    }
  } catch (error) {
    console.warn('[fonts] 枚举系统字体失败，使用固定候选', error)
  }
  return FALLBACK_FONTS.map((font) => ({ ...font }))
}