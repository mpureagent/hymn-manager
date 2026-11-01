# T10 窄屏（手机）可用：列表与歌词切换

**Blocked by**: T9
**Blocks**: 无

## 问题（PM 实测发现）

`src/control/index.html` 现有媒体查询：

```css
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .preview-pane { display: none; }   /* ← 歌词被整个隐藏 */
}
```

后果：手机或窄窗口下**只能看到目录列表，看不到歌词**。而用户验收 Web 端的核心目的恰恰是"在手机上看歌词样式"，当前实现直接让目标无法达成。

## 目标

窄屏（< 900px）下把「列表」与「歌词」做成**同屏切换**，而不是砍掉歌词：

```
初始（窄屏）：显示列表，顶部选本 + 搜索框
点某首后    ：切到歌词视图（全宽），左上角出现「‹ 返回列表」
在歌词视图  ：样式、曲谱 tab、投屏按钮都可用
点返回      ：回到列表，滚动位置保留
```

## P0 必做

### 1. 窄屏导航状态

- 新增模块内状态 `narrowView: 'list' | 'detail'`（**只影响窄屏**；宽屏两栏并存，行为完全不变）。
- 用 `matchMedia('(max-width: 900px)')` 判断当前是否窄屏，`change` 事件要监听（旋转屏、拖动窗口）。
- 点击列表项 → 窄屏下切到 `detail`；宽屏下保持现有行为（右侧更新，不动布局）。

### 2. 顶部栏

窄屏 `detail` 态：

- 隐藏搜索框与选本下拉（省空间），改为显示「‹ 返回列表」按钮 + 当前诗歌标题（单行省略号）。
- 样式、投屏按钮保留。
- 返回按钮点击 → `narrowView='list'`，恢复选择与焦点。

### 3. 布局

```css
@media (max-width: 900px) {
  /* 不要再用 display:none 砍掉预览 */
  .layout { grid-template-columns: 1fr; }
  .preview-pane[hidden], .list-pane[hidden] { display: none; }
}
```

用 `hidden` 属性控制显隐（由 `narrowView` 驱动），**宽屏下两者都可见**。

### 4. 触摸与移动端细节

- 列表行最小点击高度 ≥ 44px（触摸友好）。
- 顶部栏在 375px 宽下不能换行错位：搜索框 flex 收缩、按钮不换行。
- 字号滑块的 `input[type=range]` 在触摸下可正常拖动。
- 样式面板在窄屏改为**底部抽屉**（全宽、最大高度 70vh、可滚动），而不是右侧抽屉。
- 禁止页面整体横向滚动：`html, body { overflow-x: hidden; }` 仅在窄屏生效。
- 视口 meta 已有 `width=device-width` 则保留；若缺失则补。

### 5. 曲谱视图窄屏适配

- 曲谱 `viewport` 高度改为 `calc(100dvh - 顶部栏 - 底部控件)`，避免被裁。
- 缩放按钮保持可见（触摸下没有 Ctrl+滚轮）。

## 硬性约束

- **宽屏（≥901px）行为必须零变化** —— 现有 133 个测试 + Electron 端全部照旧
- 除 `index.html` 的样式与本单新增的状态逻辑外，不改 `main.ts` 里检索/历史/投屏的业务逻辑
- 禁止引入新依赖
- 不写回 `hymns-data/`，不往 `docs/acceptance/` 写文件

## 验收标准（PM 会独立复跑）

用 Chromium 以手机视口（390×844，`Emulation.setDeviceMetricsOverride`）打开 `/`，由 CDP 读 DOM 事实：

| 用例 | 期望 |
|---|---|
| 初始 | `.list-pane` 可见、`.preview-pane` **不可见**（但存在，不是 display:none 砍掉） |
| 顶部 | 有选本下拉与搜索框，「‹ 返回列表」**不存在** |
| 点列表第一行 | `.preview-pane` 可见、`.list-pane` 不可见、出现返回按钮、歌词 ≥ 10 行 |
| 歌词页改字号 96 | `.lyric-line` computed fontSize = 96px，且 `document.scrollWidth ≤ clientWidth`（无横向滚动） |
| 点返回 | 回到列表，`.preview-pane` 隐去 |
| 切 400px→1200px | 两栏并存，无返回按钮，行为与改动前一致 |
| 375px 宽顶部栏 | 无换行、无溢出（`scrollWidth ≤ clientWidth`） |

PM 会同时用 1440×900 视口回归，确认宽屏未被破坏。

## 交付

git commit（message 带 T10）。回复列出：改动文件、窄屏三种状态下的实测 DOM 值（display / 行数 / scrollWidth）。
