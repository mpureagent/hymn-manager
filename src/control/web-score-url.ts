import { filePathToUrl as toFileUrl } from '../shared/score'

export { SCORE_MAX_ZOOM, SCORE_MIN_ZOOM, stepScoreZoom } from '../shared/score'

/** Web 宿主下 /api/score/... 是同源路径，直接交给 <img src>，不要转成 file://。 */
export function filePathToUrl(filePath: string): string {
  return filePath.startsWith('/api/') ? filePath : toFileUrl(filePath)
}