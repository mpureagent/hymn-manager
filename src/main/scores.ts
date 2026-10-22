import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isValidScoreBook, isValidScoreNumber, scoreRelativePath } from '../shared/score'

const SCORE_EXTENSIONS = ['jpg', 'png', 'jpeg', 'webp'] as const

/**
 * 数据包曲谱目录：red_book → red、black_book_1218 → black。
 * 先按 book ID 原样找，兼容未来直接用 ID 命名的数据包。
 */
export function scoreDirectories(book: string): string[] {
  if (!isValidScoreBook(book)) return []
  const prefix = book.split('_')[0]
  if (!prefix || prefix === book || !isValidScoreBook(prefix)) return [book]
  return [book, prefix]
}

/**
 * 解析某首诗歌的曲谱绝对路径；只做路径拼装与 stat，不读图片内容。
 * 无效书名/编号或文件不存在返回 null。
 */
export function resolveScorePath(root: string, book: string, number: number): string | null {
  if (!isValidScoreBook(book) || !isValidScoreNumber(number)) return null

  for (const directory of scoreDirectories(book)) {
    for (const extension of SCORE_EXTENSIONS) {
      const relative = scoreRelativePath(directory, number, extension)
      if (!relative) continue
      const absolute = join(root, relative)
      if (existsSync(absolute)) return absolute
    }
  }
  return null
}