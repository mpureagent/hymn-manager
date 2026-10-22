export interface VirtualRange {
  /** 含 */
  start: number
  /** 不含 */
  end: number
  totalHeight: number
}

export function computeRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan = 6,
): VirtualRange {
  const totalHeight = Math.max(0, count * rowHeight)
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0, totalHeight }
  const top = Math.max(0, Math.min(scrollTop, totalHeight))
  const first = Math.floor(top / rowHeight)
  const visible = Math.ceil((top + Math.max(0, viewportHeight)) / rowHeight)
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(count, visible + overscan),
    totalHeight,
  }
}