# T9 Web 宿主（二）：渲染层 adapter + 投屏双标签 + 构建启动

**Blocked by**: T8
**Blocks**: 无

## 目标

让同一套渲染层代码在浏览器里跑起来，功能与 Electron 端等价（投屏改为「另一个浏览器标签」）。

**铁律不变**：`src/control/main.ts`、`list-view.ts`、`lyrics-view.ts`、`style-panel.ts`、`score-view.ts` 一行都不改。它们通过 `window.hymn`（类型 `HymnApi`）取数据，本单只负责在 Web 环境下把这个对象造出来。

## P0 必做

### 1. Web adapter `src/control/web-adapter.ts`

实现 `src/shared/ipc.ts` 里的 `HymnApi`，全部走 `fetch` 打 T8 的 REST 端点：

| 方法 | 实现 |
|---|---|
| `bootstrap()` | `GET /api/bootstrap` |
| `recheck()` | `POST /api/recheck` |
| `setCurrentBook(id)` | `POST /api/book` |
| `getHistory()` | `GET /api/history` |
| `addSearch(q)` | `POST /api/history/search` |
| `addOpened(entry)` | `POST /api/history/opened` |
| `clearHistory()` | `DELETE /api/history` |
| `listFonts()` | `GET /api/fonts` |
| `setStyle(style)` | `POST /api/style` |
| `getScorePath(book, number)` | 返回 `"/api/score/<book>/<number>"`（http 路径，`filePathToUrl` 已直通） |
| `toggleProjection(content)` | 见第 2 节（BroadcastChannel） |
| `updateProjection(content)` | 同上 |
| `setProjectionStyle(style)` | 同上 |
| `onProjectionState(cb)` | 同上 |
| `onProjectionChanged(cb)` | 同上 |

要点：

- 导出 `createWebApi(): HymnApi`，并**自执行**把结果挂到 `window.hymn`（若已存在则跳过，保证 Electron 端不受影响）。
- 所有 fetch 都要处理非 2xx：抛错并带状态码，不能静默返回空。
- 不需要 `baseURL` 拼接，同源用相对路径。

### 2. 投屏用 BroadcastChannel 而非 IPC

Electron 端投屏是独立 BrowserWindow + IPC。Web 端同源，用 `BroadcastChannel('hymn-projection')` 足够，**不需要服务端参与**。

- 主窗口 `toggleProjection(content)`：
  - 未激活时 `window.open('/projection', 'hymn-projection-window', 'popup,width=1280,height=800')`，等对方 ready 后广播内容。
  - 已激活时关闭该窗口（`win.close()`），广播 `{type:'close'}`。
  - 无选中内容时返回 `{ active: false, needSelection: true }`（与 Electron 语义一致）。
  - 浏览器可能拦截弹窗：捕获返回值 null 时返回 `{ active:false, hint:'浏览器拦截了弹窗，请允许本页弹出窗口' }`。
- 投屏页 `/projection` 需要一个 web 版 bridge（`src/projection/web-projection-boot.ts`）：
  - 用同一 channel 收 `content` / `style` / `close`
  - 收到内容后调用现有的投屏渲染逻辑（`src/projection/main.ts` 的渲染函数需要能被复用；若它直接依赖 `window.projectionApi`，则本单允许**新增**一个 `web-projection-boot.ts` 先构造 `window.projectionApi` 再动态 import 原 `main.ts`，**不得改 main.ts 内部逻辑**）
- 浏览器全屏需要用户手势：投屏页顶部给一个不显眼的「全屏（F11）」提示条，3 秒后淡出。

### 3. Web 入口 HTML（不污染 Electron 入口）

新增 `src/control/web.html` 与 `src/projection/web.html`：

```html
<!-- web.html 结构：复制现有 index.html，仅把脚本入口换掉 -->
<script type="module" src="./web-boot.ts"></script>
```

- `src/control/web-boot.ts`：先 `import './web-adapter'`（自挂 window.hymn），再 `import './main'`。
  **顺序很重要**：main.ts 顶层就读 `window.hymn`。
- `src/projection/web-boot.ts`：同理，先构造 `window.projectionApi`，再 import 原 `main.ts`。
- 现有 `index.html` 与 electron 入口**保持不动**。

### 4. 构建（vite）

- `npm run build:web` 产出 `dist/web/`：
  - `index.html`（来自 `src/control/web.html`）
  - `projection.html`（来自 `src/projection/web.html`）
  - `assets/*`
- 用 vite 的多入口 + 一个 web 专用 config（`vite.web.config.ts`），输出目录 `dist/web`，`base: '/'`（因为经 HTTP 服务访问，不是 file://）。
- 保留现有 `npm run build`（Electron）不变。

### 5. 启动脚本

- `npm run serve:web` = `npm run build:web && node src/web/server.mjs`
- 服务端要把 `/` 映射到 `dist/web/index.html`、`/projection` 映射到 `dist/web/projection.html`（T8 已预留路由，若路径不符本单调整服务端**仅限静态路由映射**）。

## 硬性约束

- 禁止引入新 npm 依赖
- **禁止修改** `src/control/{main,list-view,lyrics-view,style-panel,score-view}.ts` 与 `src/projection/main.ts` 的内部逻辑；只允许新增 boot/adapter 文件
- Electron 端 133 个测试必须全绿，`npm run build`（Electron）必须仍能出包
- 不写回 `hymns-data/`，不往 `docs/acceptance/` 写文件

## 验收标准（PM 会独立复跑）

```bash
npm run build:web && ls dist/web            # index.html + projection.html + assets
PORT=8790 node src/web/server.mjs &
curl -s -o /dev/null -w '%{http_code}' localhost:8790/              # 200
curl -s -o /dev/null -w '%{http_code}' localhost:8790/projection    # 200
npm run typecheck && npm test && npm run build
```

PM 会用真实浏览器（Chromium）打开页面并由 CDP 读取 DOM 事实，逐项核对：

| 用例 | 期望 |
|---|---|
| 打开 `/` | 顶部选本下拉 + 搜索框，左侧「共 442 首」 |
| 输入 `1` | 首条「第1首 圣哉三一歌」，kind=编号 |
| 点击该条 | 右侧显示 16 行歌词、段号 1–4 |
| 改字号到 96 | 预览字号实际变 96px，无横向溢出 |
| 切「深底浅字」 | 预览区背景 `rgb(15,17,21)` |
| 点「曲谱」tab | `<img>` 的 src 是 `/api/score/...`，naturalWidth 1280 |
| 点「投屏」 | 新开一个页面（target），内容与预览一致，页码 1/4 |
| 刷新主页面 | 样式与当前本被记住（服务端持久化） |

## 交付

git commit（message 带 T9）。回复列出：新增文件、`dist/web` 目录清单、构建与测试真实输出、以及你在浏览器里实测到的关键 DOM 值。
