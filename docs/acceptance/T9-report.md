# T9 验收报告（PM 实测）— Web 渲染层接线与投屏

日期：2026-11-01
产物：`fbeef90`
结论：**通过**（过程中我的两次"发现"实为测量方式造成，见第五节，已如实记录）

## 一、代码与约束

| 项 | 结果 |
|---|---|
| 依赖 | 仍是 **6 个**，零新增 ✓ |
| 五个渲染文件是否被改 | `git diff` 为空 —— **main/list-view/lyrics-view/style-panel/score-view/projection-main 一行未改** ✓ |
| typecheck | 零错误 |
| 测试 | **14 文件 145 用例全绿** |
| Electron 构建 | `npm run build` 成功，`dist/main`、`dist/renderer` 完好 ✓ |
| Web 构建 | `dist/web`：index.html + projection.html + 6 个 assets ✓ |

`web-score-url.ts` 的实现比工单要求更克制：**没有改 `shared/score.ts`**，只加了一层转发（`/api/` 开头直接给 `<img>`，否则回落原 `filePathToUrl`）。可以接受。

## 二、功能实测（真实 Chromium）

| 用例 | 实测值 |
|---|---|
| 页面加载 | `window.hymn` 是 object（adapter 已挂载），标题「赞美诗歌本」 |
| 选本下拉 | 2 项：红本《赞美诗（新编）》/ 千首本《赞美诗歌（1218首）》 |
| 初始目录 | 「共 442 首」 |
| 搜 `1` | 「找到 1 首」，首条 `第1首 圣哉三一歌`，带「编号」标签 |
| 点开 | 标题「圣哉三一歌」，**16 行歌词**，段号 `["1","2","3","4"]` |
| 字号 96 | computed `96px`、CSS 变量 `96px`、横向溢出 **0** |
| 三个预设 | 浅底 `rgb(245,240,230)`/`rgb(43,33,24)`；深底 `rgb(15,17,21)`/`rgb(242,237,227)`；暖纸 `rgb(243,231,207)`/`rgb(58,42,26)` —— 全部正确 |
| 曲谱 tab | `img.src = /api/score/red_book/1`，**naturalWidth 1280 / naturalHeight 1842**，complete=true |
| 刷新持久化 | 选本 `black_book_1218`、共 1217 首、背景 `#F3E7CF` 全部保留 ✓ |

## 三、投屏（Web 端关键差异，重点验）

Web 端用 `BroadcastChannel('hymn-projection')` 替代 Electron IPC。实测两条链路：

**接收链路**（在 `/projection` 页发真实协议消息）：

```
投屏前：0 行，空态「等待主窗口投屏」
投屏后：indicator 1/5，首行「圣哉，圣哉，圣哉！全权的神明」，
        bg rgb(15,17,21)，fontSize 96px，waiting=false
```

**端到端**（主窗口 `window.open` 开子窗 + 广播，再从 opener 读子窗 DOM）：

```
子窗可访问 true，URL /projection
渲染：indicator 1/2，2 行，bg rgb(15,17,21)，
      请求 96px → 实际 56px（自动降字号防裁切，T5F 机制在 Web 同样生效）
```

`/projection` 路由核对：curl 返回 6288 字节、含 indicator、**不含 book-select**，与 `dist/web/projection.html` 逐字节一致。

## 四、已确认的遗留问题（转 T10）

用 390×844 手机视口实测：

```
viewport 666x1442（dpr 放大）
.list-pane    display: flex（可见）
.preview-pane display: none   ← 歌词被整个隐藏
lyricLines    16（DOM 在，但不可见）
overflowX     276px           ← 顶部栏横向溢出
```

**手机上只能看列表、看不到歌词，且顶部栏溢出**。这正是我之前预判的问题，T10 工单已写好。

## 五、我的两次误报（如实记录，避免下次重犯）

这两次都出在**测量方式**，不是应用的缺陷。写下来是为了不再浪费时间：

**误报一：「/projection 返回了主界面 HTML」**
实际是我的 CDP `Target.attachToTarget` 会话路由没生效——`Runtime.evaluate` 带着 `sessionId` 仍然在主窗口上下文里执行，读到的自然是主界面。用 `curl` 直接取 `/projection` 的字节比对，证明路由完全正确。

**误报二：「改配色后预览区背景不更新」**
实际是**该标签页处于后台**（`visibilityState: hidden`），Chrome 会冻结 CSS transition（`background-color 0.18s`），导致 `getComputedStyle` 一直返回起始值。禁用 transition 后立即正确更新；`Page.bringToFront` 后三个预设也全部正常。

**教训**：
1. 跨标签页取 DOM 不要依赖 `attachToTarget` 的 session 透传，用「打开独立页面 + 单页内 js()」或同源 `window.open` + opener 读子窗 DOM。
2. 验证 CSS transition 相关的样式，必须先确认 `document.visibilityState === 'visible'`，或临时禁用 transition，否则读到的是冻结值。

## 六、结论

Web 端功能与桌面端等价：检索、歌词、段号、字号、三档配色、曲谱（走 HTTP）、投屏（BroadcastChannel）、刷新持久化全部通过，且**零新增依赖、五个渲染文件零改动**。

可进 T10（窄屏可用）。
