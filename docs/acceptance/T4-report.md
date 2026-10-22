# T4 验收报告（PM 实测）

日期：2026-10-22
被验产物：`cb3c450` / `32aff22` / `524d559`
结论：**通过**（1 项 P2 建议）

## 一、代码验收

| 项 | 命令 | 结果 |
|---|---|---|
| typecheck | `npm run typecheck` | 零错误 |
| 测试 | `npm test` | **11 文件 90 用例全绿**（T3 的 64 例全保留，新增 26 例）|
| 构建 | `npm run build` | vite 846ms，CSP 注入 |
| 新增 | — | `shared/style.ts`、`main/fonts.ts`、`control/style-panel.ts` |

代码核对（读实现确认）：

- `clampStyle` 走 `clampNumber` + `normalizeColor`，非法颜色回落默认，颜色统一成大写 `#RRGGBB`
- `fontStack()` 自动拼中文字体回退链，并对字体名做引号转义（防注入进 CSS 变量）
- 字体枚举走 `fc-list :lang=zh`（Linux）与 Windows 注册表，失败回落 5 个固定候选
- 三层 clamp：渲染层、IPC、settings 加载时各一次

## 二、UI 实测（CDP 驱动真实窗口）

### 默认样式

```
--hymn-font-size: 48px   --hymn-line-height: 1.6
--hymn-bg: #F5F0E6       --hymn-ink: #2B2118
无横向溢出
```

### 字号 120（边界值）

| 检查 | 实测 |
|---|---|
| 变量 | `120px` |
| 实际行字号 | `120px` |
| 行高 | `192px` = 120×1.6 ✓ |
| 横向溢出 | **无**（scrollWidth 713 = clientWidth 713）|
| 自动换行 | 有（截图确认「圣哉，圣哉，/圣哉！全权的/神明」）|
| **DOM 是否重建** | `sameNode: true` —— 我在改样式前给 `.lyric-line` 打了标记，改完标记仍在，证明只换 CSS 变量没重建歌词树 ✓ |

### 深底浅字预设

```
--hymn-bg: #0F1115   --hymn-ink: #F2EDE3
.preview-pane 实际背景: rgb(15, 17, 21)   文字: rgb(242, 237, 227)
```

截图确认：深黑底 + 米白字，可读性好；左侧管理列表保持浅色（样式只作用于预览/投屏区，符合设计）。样式面板可见，含 3 个预设按钮、字体下拉、字号滑块+数字框、行距、对齐。

### 越界收敛（PM 破坏性测试）

手工把 `settings.json` 写成：

```json
{ "fontSize": 9999, "lineHeight": -5, "bgColor": "notacolor", "align": "diagonal" }
```

重启后实测：

| 字段 | 坏值 | 运行态 |
|---|---|---|
| fontSize | 9999 | **120px**（收敛到上限）|
| lineHeight | -5 | **1.2**（收敛到下限）|
| bgColor | `notacolor` | **#F5F0E6**（回落默认）|
| align | `diagonal` | **center**（回落默认）|

**不崩溃、不溢出。** 用户在 UI 里点任一预设后，写盘的就是收敛后的合法值。

### 持久化

设「暖纸」+ 字号 120 → 重启 → 实测 `--hymn-bg: #F3E7CF`、`--hymn-ink: #3A2A1A`、`--hymn-font-size: 120px`，完整恢复 ✓

## 三、P2 建议（不阻塞）

**启动时只读不写，磁盘上的坏值不会被主动修正。** 实测：写入 9999/-5/notacolor 后启动，运行时已收敛正确，但 `settings.json` 里仍是原始坏值，直到用户动一次样式才被覆盖。

建议：启动加载时若 `clampStyle(input) !== input`，主动写回一次，让磁盘与运行态一致。改动很小（`SettingsStore.load()` 里加一次比较与落盘），可并入 T5 或收尾单。

风险说明：不改也不会出错，因为每次读取都会 clamp；只是磁盘脏值会让日后排查困惑。

## 四、结论

T4 达标，可派 T5（投屏）。T5 需要注意：投屏窗口必须复用同一份 `styleToCssVars()` 输出，保证"所见即所投"。
