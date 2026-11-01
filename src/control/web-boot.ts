// 顺序关键：main.ts 顶层读取 window.hymn，adapter 必须先执行挂载。
import './web-adapter'

void import('./main').catch((error: unknown) => {
  console.error('[web] 控制台启动失败', error)
})