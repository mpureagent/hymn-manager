# T4 全局样式（字体/字号/颜色/背景）+ 样式预设

**Blocked by**: T3
**Blocks**: T5

## 必读

- `docs/specs/hymn-manager-spec.md` §4.6
- 参考 `/data/workspace/bible-projector/src/control/style-view.ts` 与 `src/shared/fonts.ts`（字体枚举与样式应用方式已验证），**只借鉴做法，不搬业务**。

## P0 必做

1. **样式模型 `shared/style.ts`**
   - `HymnStyle { fontFamily, fontSize (24–120), lineHeight (1.2–2.2), textColor, bgColor, align: 'center'|'left' }`
   - `clampStyle(input)`：越界值收敛到合法区间，非法值回落默认（默认：系统中文字体、48px、1.6、#F5F0E6 底 / #2B2118 字、居中）。
   - 单测：边界值、NaN、负数字号、非法颜色。

2. **应用样式**
   - 预览区应用样式（CSS 变量注入，不用内联到处改）。
   - 样式变更即时生效（不重渲染整棵 DOM，只更新 CSS 变量与容器 class）。

3. **样式面板（`control/style-panel.ts`）**
   - 从抽屉/侧滑面板打开。
   - 字体：下拉列出本机可用中文字体（主进程 `fonts.ts` 枚举，`fc-list`/Windows 注册表两条路；无则回落固定候选列表：微软雅黑 / 思源宋体 / 宋体 / 楷体 / 黑体）。
   - 字号：滑块 24–120 + 数字输入，两者同步。
   - 文字色 / 背景色：预设色板（各 8–10 色）+ `<input type="color">`。
   - 行距、对齐：下拉/开关。
   - 「恢复默认」按钮。

4. **预设**
   - 三个预设：`浅底深字`（默认）、`深底浅字`（#0F1115 底 / #F2EDE3 字）、`暖纸`（#F3E7CF 底 / #3A2A1A 字）。
   - 一键切换即写入当前样式。

5. **持久化**
   - 存 `settings.json` 的 `style` 字段，启动恢复；写入失败不崩。

## P1 应做

- 面板里显示一行实时样张（「圣哉，圣哉，圣哉！」）预览效果。

## 验收标准

```bash
npm run typecheck && npm test
```
- 手动：字号拉到 120 → 预览文字明显变大且不溢出（超长行自动换行，不横向滚动）。
- 手动：切「深底浅字」→ 整屏（预览区）配色变化；重启后保持。
- 手动：手工把 `settings.json` 的 fontSize 改成 `9999` 后重启 → 收敛到 120，不崩。
- 单测覆盖 `clampStyle` 至少 8 个用例。

## 不含

投屏窗口应用样式（T5 负责把同一份 style 传给投屏窗口）。

## 交付

`git commit` 引用 `T4`。
