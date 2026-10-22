# T1 骨架 + 数据包加载 + 选本

**Blocked by**: 无（首单）
**Blocks**: T2

## 背景

新仓库 `/data/workspace/hymn-manager`，目前只有文档与抓取脚本，没有应用代码。本单建立可运行、可测试、可打包的最小骨架，并把"读数据包"这条路打通——后续所有功能都依赖它。

参考实现：`/data/workspace/bible-projector`（Electron 22 + Vite + TS + vanilla DOM，198 测试全绿）。可直接借鉴其 `tsconfig.main.json`、`vite.config.ts`、`scripts/inject-csp.mjs`，但**不要**把圣经业务代码搬过来。

## 必读

- `docs/specs/hymn-manager-spec.md` §3 数据、§4.1 布局
- `docs/adr/0001-stack.md`、`docs/adr/0002-data-pack.md`

## P0 必做

1. **工程骨架**
   - `package.json`：electron 22.3.27、vite 5.4、typescript 5.6、vitest 2、electron-builder 26。脚本：`build:main` / `build:renderer` / `typecheck` / `test` / `lint` / `dev` / `start` / `pack:win`。
   - `src/main/`（主进程）、`src/control/`（主窗口渲染层）、`src/projection/`（投屏窗口，本单只建空壳占位）、`src/shared/`（纯函数）。
   - `tsconfig.json`（渲染层）+ `tsconfig.main.json`（主进程，CommonJS 输出到 `dist/main`）。
   - Vite 多入口：`control.html`、`projection.html`。
   - CSP：本地文件、`img-src 'self' data: file:`、禁用远程。照搬 inject-csp 思路。

2. **数据包加载（`src/main/data-pack.ts`）**
   - 解析顺序：`<exe 同目录>/hymns-data` → `<userData>/hymns-data` → 开发态 `./hymns-data`。
   - 读 `manifest.json` + `books/*.json`；校验：`manifest.books[].count` 与实际 `items.length` 一致，否则报错（错误信息含具体数字）。
   - 返回结构 `{ ok: true, books: [...] }` 或 `{ ok: false, reason: 'missing' | 'corrupt', searchedPaths: string[] }`。
   - **单元测试**：用 fixture 目录测 3 种情况（正常 / 缺 manifest / count 不符）。

3. **数据包生成脚本 `tools/pack_data.py`**
   - 输入 `data/books/*.json` + `.raw/scores/`，输出 `hymns-data/`：`manifest.json`、`books/*.json`（原样）、`scores/<book>/<NNNN>_<i>.<ext>`。
   - 幂等：重复执行不产生重复文件。

4. **主窗口 UI（最小）**
   - 顶部栏三个**互相独立**的控件，顺序固定为：**选本下拉框 → 搜索框 → 样式按钮 → 投屏按钮**。
   - **选本下拉框**（`<select>` 或自绘下拉，自绘需键盘可达）：选项文本 `红本《赞美诗（新编）》` / `千首本《赞美诗歌 1218 首》`，来自 `manifest.books`。切换即换当前本数据源，搜索框清空，列表重绘为该本全目录。**不得**把书名塞进搜索框、也不得由搜索内容推断本。
   - 搜索框：占位文字「输入编号或歌名」，本单不实现检索逻辑（T2 做），但要能输入、能 `Esc` 清空。
   - 样式按钮、投屏按钮：占位（disabled 或空动作），后续单实现。
   - 左侧列表：显示所选本的**全部条目**（编号 + 标题），虚拟滚动（1200+ 条要流畅，滚动不掉帧）。
   - 右侧：占位区显示"选择左侧诗歌"。
   - 记住上次选的本（写 `settings.json` 的 `currentBook`，重启恢复）。
   - 数据包缺失时：显示引导页，写明应放到哪个路径（给出实际绝对路径），提供"重新检测"按钮。

5. **测试**
   - vitest 覆盖 `data-pack.ts` 与列表数据装配（编号排序、缺号处理）。
   - `npm run typecheck` 零错误。

## P1 应做

- 窗口尺寸记忆（宽高 + 位置，写 settings.json）。
- `Esc` 清空搜索框（本单无检索也要能清）。

## 验收标准（PM 复验）

```bash
cd /data/workspace/hymn-manager
python3 tools/pack_data.py                 # 生成 hymns-data/
npm run typecheck && npm test && npm run build
ls hymns-data/books/                       # 两个 json
ls hymns-data/scores/red | wc -l           # 红本曲谱图数量 > 0
```
- 手动 `npm start`：能选本、能滚完 1217 条、重启记得上次的本。
- 把 `hymns-data` 改名后启动：出现引导页且不崩溃，页面显示的两个候选路径正确。

## 不含

检索、歌词渲染、历史、样式生效、投屏内容、曲谱视图。均在后继单。

## 交付

`git commit`（message 引用 `T1`），不 push（本仓库暂无 remote）。
