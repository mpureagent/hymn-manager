import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveScorePath, scoreDirectories } from '../src/main/scores'
import {
  SCORE_MAX_ZOOM,
  SCORE_MIN_ZOOM,
  clampScoreZoom,
  filePathToUrl,
  isValidScoreBook,
  isValidScoreNumber,
  scoreRelativePath,
  stepScoreZoom,
} from '../src/shared/score'

const roots: string[] = []

function tempPack(): string {
  const root = mkdtempSync(join(tmpdir(), 'hymn-score-'))
  roots.push(root)
  mkdirSync(join(root, 'scores', 'red_book'), { recursive: true })
  mkdirSync(join(root, 'scores', 'black_book_1218'), { recursive: true })
  return root
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('scoreRelativePath', () => {
  it('按四位编号与张序号拼出数据包相对路径', () => {
    expect(scoreRelativePath('red_book', 1, 'jpg')).toBe('scores/red_book/0001_0.jpg')
    expect(scoreRelativePath('black_book_1218', 1218, 'png')).toBe(
      'scores/black_book_1218/1218_0.png',
    )
    expect(scoreRelativePath('red_book', 1001, 'jpg', 2)).toBe('scores/red_book/1001_2.jpg')
  })

  it('非法书名、编号、扩展名返回 null，避免路径穿越', () => {
    expect(scoreRelativePath('../etc', 1, 'jpg')).toBeNull()
    expect(scoreRelativePath('red/../black', 1, 'jpg')).toBeNull()
    expect(scoreRelativePath('red_book', -1, 'jpg')).toBeNull()
    expect(scoreRelativePath('red_book', 1.5, 'jpg')).toBeNull()
    expect(scoreRelativePath('red_book', 10000, 'jpg')).toBeNull()
    expect(scoreRelativePath('red_book', 1, 'jpg/../png')).toBeNull()
    expect(scoreRelativePath('red_book', 1, 'jpg', -1)).toBeNull()
  })

  it('书名/编号校验规则', () => {
    expect(isValidScoreBook('red_book')).toBe(true)
    expect(isValidScoreBook('black_book_1218')).toBe(true)
    expect(isValidScoreBook('')).toBe(false)
    expect(isValidScoreBook('红本')).toBe(false)
    expect(isValidScoreNumber(1)).toBe(true)
    expect(isValidScoreNumber(0)).toBe(true)
    expect(isValidScoreNumber(-1)).toBe(false)
    expect(isValidScoreNumber(Number.NaN)).toBe(false)
  })
})

describe('filePathToUrl', () => {
  it('POSIX 路径转 file:// 并编码空格与中文', () => {
    expect(filePathToUrl('/data/hymn scores/0001_0.jpg')).toBe(
      'file:///data/hymn%20scores/0001_0.jpg',
    )
    expect(filePathToUrl('/data/曲谱/0001.jpg')).toBe(
      'file:///data/%E6%9B%B2%E8%B0%B1/0001.jpg',
    )
  })

  it('Windows 盘符路径转 file:///C:/...', () => {
    expect(filePathToUrl('C:\\hymns-data\\scores\\a b.png')).toBe(
      'file:///C:/hymns-data/scores/a%20b.png',
    )
  })

  it('编码 # 与 ?，避免被当成 fragment/query', () => {
    expect(filePathToUrl('/data/a#b?.jpg')).toBe('file:///data/a%23b%3F.jpg')
  })
})

describe('resolveScorePath', () => {
  it('优先返回 jpg，没有 jpg 时回落到 png', () => {
    const root = tempPack()
    writeFileSync(join(root, 'scores', 'red_book', '0001_0.jpg'), 'x')
    expect(resolveScorePath(root, 'red_book', 1)).toBe(
      join(root, 'scores', 'red_book', '0001_0.jpg'),
    )

    writeFileSync(join(root, 'scores', 'black_book_1218', '0005_0.png'), 'x')
    expect(resolveScorePath(root, 'black_book_1218', 5)).toBe(
      join(root, 'scores', 'black_book_1218', '0005_0.png'),
    )
  })

  it('数据包用 red/black 目录时按书名前缀回落', () => {
    const root = tempPack()
    mkdirSync(join(root, 'scores', 'red'), { recursive: true })
    mkdirSync(join(root, 'scores', 'black'), { recursive: true })
    writeFileSync(join(root, 'scores', 'red', '0001_0.jpg'), 'x')
    writeFileSync(join(root, 'scores', 'black', '0005_0.png'), 'x')

    expect(scoreDirectories('red_book')).toEqual(['red_book', 'red'])
    expect(scoreDirectories('black_book_1218')).toEqual(['black_book_1218', 'black'])
    expect(scoreDirectories('../red')).toEqual([])
    expect(resolveScorePath(root, 'red_book', 1)).toBe(join(root, 'scores', 'red', '0001_0.jpg'))
    expect(resolveScorePath(root, 'black_book_1218', 5)).toBe(
      join(root, 'scores', 'black', '0005_0.png'),
    )
  })

  it('缺图、未知书名、非法编号都返回 null', () => {
    const root = tempPack()
    expect(resolveScorePath(root, 'red_book', 1001)).toBeNull()
    expect(resolveScorePath(root, 'no_such_book', 1)).toBeNull()
    expect(resolveScorePath(root, '../red_book', 1)).toBeNull()
    expect(resolveScorePath(root, 'red_book', -3)).toBeNull()
  })
})

describe('score zoom', () => {
  it('按 10% 步进到整十档位并收敛到 50–300', () => {
    expect(stepScoreZoom(50, 1)).toBe(60)
    expect(stepScoreZoom(62, 1)).toBe(70)
    expect(stepScoreZoom(62, -1)).toBe(60)
    expect(stepScoreZoom(33, 1)).toBe(50)
    expect(stepScoreZoom(300, 1)).toBe(SCORE_MAX_ZOOM)
    expect(stepScoreZoom(50, -1)).toBe(SCORE_MIN_ZOOM)
  })

  it('clampScoreZoom 收敛非法值', () => {
    expect(clampScoreZoom(10)).toBe(50)
    expect(clampScoreZoom(999)).toBe(300)
    expect(clampScoreZoom(Number.NaN)).toBe(50)
    expect(clampScoreZoom(123.4)).toBe(123)
  })
})