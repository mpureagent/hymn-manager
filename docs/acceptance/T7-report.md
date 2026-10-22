# T7 PM 验收报告（Hermes 独立实测）

日期：2026-10-22
产物：`0180aa3`
结论：**通过（Linux 侧全部验证完毕）**；真机验收待 Windows 执行

## 一、代码与测试

| 项 | 命令 | 结果 |
|---|---|---|
| typecheck | `npm run typecheck` | 零错误 |
| 测试 | `npm test` | **13 文件 133 用例全绿** |
| 构建 | 已由 pack:win 触发 | 成功 |

## 二、交付物（PM 独立测量）

| 文件 | 字节 | 人类可读 | SHA-256（PM 自算，与清单一致）|
|---|---:|---|---|
| `release/hymn-manager-Setup-0.1.0.exe` | 67,860,831 | 65 MB | `644ceeaa…04f210e` ✓ |
| `release/hymn-manager-Portable-0.1.0.exe` | 67,630,524 | 65 MB | `c94ac2b3…eaf298e3` ✓ |
| `release/hymn-manager-0.1.0-win-x64.zip` | 93,806,959 | 90 MB | `080f1e85…f8f13495` ✓ |
| `delivery/hymns-data-0.1.0.zip` | 181,604,232 | 174 MB | `322e61cc…efd2b49` ✓ |

三个程序产物均 ≤130MB 预算。四个 SHA-256 与交付清单逐一对得上。

## 三、版权红线：包内无数据（PM 亲手解包验证）

```
npx asar list release/win-unpacked/resources/app.asar | wc -l  → 33
npx asar extract … /tmp/pm-asar
```

asar 内只有 `dist/main`、`dist/shared`、`dist/renderer` 与 `package.json`，**165KB**。我用关键词逐个搜：

| 关键词 | 命中文件数 |
|---|---|
| 圣哉 | **0** |
| 全能大主宰 | **0** |
| 神是我拯救 | **0** |
| 万古磐石 | **0** |
| 赞美诗歌1218 | **0** |
| 0001_0 | **0** |
| red_book / black_book | 各 1（`dist/main/scores.js`，是书名→目录名的**常量映射代码**，非数据）|

zip 包 74 个条目，只有 Electron 运行时 + `app.asar`，无 `hymns-data`。`win-unpacked` 里也没有任何 `hymns-data` 或 `scores` 目录。

**红线通过：程序不含诗歌数据。**

数据包单独在 `delivery/hymns-data-0.1.0.zip`：1662 条目 = manifest 1 + books 2 + 红本曲谱 442 + 千首本曲谱 1217。已在 `.gitignore`，不进版本库。

## 四、打包态行为实测

我用 `release/win-unpacked/resources/app.asar` 直接起 Electron，构造两种数据布局验证（脚本 `tools/pm_pack_smoke.py`）：

### 数据包缺失

```
未找到数据包
应用没有在以下位置找到 hymns-data 数据包。放置后点击「重新检测」，无需重启。
1. <exe同目录>/hymns-data
2. <userData>/hymns-data
3. <cwd>/hymns-data   [推荐]
[重新检测]
数据包与程序分离，应用本身不内置诗歌数据。
```

不崩溃、不白屏，列出**实际搜索过的绝对路径**，带「重新检测」按钮。

### 数据包存在

放入数据包后正常加载：红本全目录「共 442 首」，首条「第1首 圣哉三一歌」，历史区空态正常。

### 说明（诚实标注验证边界）

上面用 `electron app.asar` 启动时 `app.isPackaged === false`，因此**第 3 条开发态路径仍会显示**。真正打包成 exe 后该路径不参与查找（`includeDev: !app.isPackaged`），这一点由单测覆盖（`dataPackSearchPaths({includeDev:false})` 返回 2 条）而非真机实测。**Windows 上首次启动时请确认引导页只列 2 条路径**——已写进验收清单。

## 五、Qoder 上报的三处判断（我逐条核对）

1. **`files` 保留 `dist/shared/**`**：正确。主进程 `require('../shared/ipc')` 依赖它，这是运行时代码。已排 `*.map` 与 `__tests__`。
2. **asar 曾命中 1 处「圣哉」**：来源是样式面板样张文案「圣哉，圣哉，圣哉！」，不是数据。已改为「样式预览文字」，重打包后命中 0。**这个自查值得肯定**——它主动区分了"数据泄漏"和"UI 文案"。
3. **Portable 版数据定位**：`process.env.PORTABLE_EXECUTABLE_DIR ?? dirname(app.getPath('exe'))`，已实现（`src/main/index.ts:63`）。便携版解压到临时目录时仍能找到用户放在 Portable.exe 旁的数据包。

## 六、交付清单质量

`docs/acceptance/windows-checklist.md`（101 行）包含：

- 四个交付物 + 大小 + SHA-256（与我自算一致）
- SmartScreen「更多信息 → 仍要运行」分步处置 + PowerShell `Unblock-File` 备选
- 数据包放置说明（安装版 / 便携版两种位置）
- spec §7 的 9 条真机验收项 + 复验命令

## 七、结论

**Linux 侧能验的全部通过**：数据零泄漏、体积达标、哈希自洽、引导页与加载行为正常、133 测试全绿。

剩下只有真机验证，需要在 Windows 上执行 `windows-checklist.md`。这部分我在 Linux 上无法替代。

## 八、建议的真机验证重点（按风险排序）

1. **中文输入法检索**（最高风险）：我这只在合成事件下测过 IME 保护，真实搜狗/微软拼音的 `compositionend` 时序可能与合成事件不同。
2. **双屏投屏**：单屏已测，真实投影仪的显示器选择、全屏切换、色彩（尤其"深底浅字"在投影上的对比度）需要现场看。
3. **字体回退**：Linux 用 `fc-list` 枚举到 13 个字体，Windows 走注册表分支完全没跑过。若枚举失败会回落 5 个候选，但要确认宋体/楷体在投影上的实际观感。
4. **曲谱缩放**：1280 宽扫描图在 1920 投影上 100% 显示是否够清晰。
