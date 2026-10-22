import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dataPackSearchPaths, loadDataPack } from '../src/main/data-pack'

function fixtureRoot(name: string): string {
  return fileURLToPath(new URL(`./fixtures/data-pack/${name}/hymns-data`, import.meta.url))
}

describe('dataPackSearchPaths', () => {
  it('按 exe → userData → 开发态顺序返回绝对路径', () => {
    const paths = dataPackSearchPaths({
      exeDir: '/opt/hymn-manager',
      userDataDir: '/data/user-data',
      cwd: '/data/workspace/hymn-manager',
      includeDev: true,
    })
    expect(paths).toEqual([
      '/opt/hymn-manager/hymns-data',
      '/data/user-data/hymns-data',
      '/data/workspace/hymn-manager/hymns-data',
    ])
  })

  it('打包态不追加开发态路径', () => {
    const paths = dataPackSearchPaths({
      exeDir: '/opt/hymn-manager',
      userDataDir: '/data/user-data',
      cwd: '/data/workspace/hymn-manager',
      includeDev: false,
    })
    expect(paths).toHaveLength(2)
    expect(paths[1]).toBe('/data/user-data/hymns-data')
  })
})

describe('loadDataPack', () => {
  it('正常数据包：返回 manifest 与全部诗歌本', () => {
    const root = fixtureRoot('valid')
    const result = loadDataPack([root])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.root).toBe(root)
    expect(result.manifest.version).toBe(1)
    expect(result.books.map((book) => book.id)).toEqual(['red_book', 'black_book_1218'])
    expect(result.books[0]?.items).toHaveLength(3)
    expect(result.books[1]?.items).toHaveLength(2)
    expect(result.books[0]?.name).toBe('赞美诗（新编）')
  })

  it('缺 manifest：返回 missing 与实际查找路径', () => {
    const root = fixtureRoot('missing')
    const result = loadDataPack([root])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('missing')
    expect(result.searchedPaths).toEqual([root])
  })

  it('count 与实际条目数不符：返回 corrupt，错误信息含具体数字', () => {
    const root = fixtureRoot('bad-count')
    const result = loadDataPack([root])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('corrupt')
    if (result.reason !== 'corrupt') return
    expect(result.error).toContain('条目数不一致')
    expect(result.error).toContain('manifest 声明 2 条')
    expect(result.error).toContain('实际 1 条')
  })
})