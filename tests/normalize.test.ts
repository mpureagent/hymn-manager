import { describe, expect, it } from 'vitest'
import { findMatchRange, normalizeQuery, normalizeText } from '../src/shared/normalize'

describe('normalize', () => {
  it('NFKC 统一全角/半角并转小写', () => {
    expect(normalizeQuery('ＡＢＣ１２３')).toBe('abc123')
    expect(normalizeText('Ｈｅｌｌｏ　Ｗｏｒｌｄ！')).toBe('helloworld')
  })

  it('去掉中英文标点与空白', () => {
    expect(normalizeText('圣哉，圣哉！ 三一、真神。')).toBe('圣哉圣哉三一真神')
    expect(normalizeText('主, 我在这里... (Here I Am)')).toBe('主我在这里hereiam')
  })

  it('去掉尾部「歌」，查询与正文规则一致', () => {
    expect(normalizeText('圣哉三一歌')).toBe('圣哉三一')
    expect(normalizeQuery('圣哉三一歌')).toBe('圣哉三一')
    expect(normalizeText('圣哉三一歌。')).toBe('圣哉三一')
  })

  it('单独输入「歌」不会被归一化成空', () => {
    expect(normalizeQuery('歌')).toBe('歌')
  })

  it('同义字折叠：祢→你、祂→他、裏→里、著→着', () => {
    expect(normalizeText('祢 祂 裏 著')).toBe('你他里着')
    expect(normalizeQuery('祢真伟大')).toBe(normalizeText('你真伟大'))
    expect(normalizeQuery('祂是爱')).toBe(normalizeText('他是爱'))
  })

  it('可以关闭去尾「歌」', () => {
    expect(normalizeText('圣哉三一歌', { stripTrailingGe: false })).toBe('圣哉三一歌')
  })

  it('空输入与纯标点返回空串', () => {
    expect(normalizeQuery('')).toBe('')
    expect(normalizeQuery(' ，。！？ ')).toBe('')
  })
})

describe('findMatchRange', () => {
  it('标点不参与匹配，但命中区间内的标点一起高亮', () => {
    expect(findMatchRange('圣哉，圣哉！三一真神', '圣哉圣哉')).toEqual({ start: 0, end: 5 })
  })

  it('返回原文坐标，折叠字也能正确定位', () => {
    const text = '清晨我众歌唱，祢真伟大'
    expect(findMatchRange(text, '你真')).toEqual({ start: 7, end: 9 })
    expect(text.slice(7, 9)).toBe('祢真')
  })

  it('全角查询与半角原文互相命中', () => {
    expect(findMatchRange('ABC 123', 'ＡＢＣ１２３')).toEqual({ start: 0, end: 7 })
  })

  it('未命中返回 null，空查询返回 null', () => {
    expect(findMatchRange('圣哉三一', '全能大主宰')).toBeNull()
    expect(findMatchRange('圣哉三一', ' ，。')).toBeNull()
  })
})