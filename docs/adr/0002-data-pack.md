# ADR-0002 数据与程序分离（数据包）+ 用 JSON 而非 SQLite 存历史

状态：已定
日期：2026-10-22

## 背景

两本诗歌本（红本/千首本）的歌词与曲谱均受版权保护（红本：中国基督教两会；1218：浙江舟山基督教两会）。程序本身可以开源分发，但把全本数据打进安装包并公开分发存在侵权风险。

另外需要存"搜索词最近 20 条 + 打开记录最近 50 条"这类极小状态。

## 决策

### 数据包

1. 程序仓库**不含数据**：`.raw/` 与 `data/` 均在 `.gitignore`，仓库只提交抓取/清洗脚本与报告。
2. 运行时从**数据包目录**读取：
   ```
   hymns-data/
     manifest.json
     books/red_book.json, books/black_book_1218.json
     scores/red/*.jpg, scores/black/*.png
   ```
3. 查找顺序：`<exe 同目录>/hymns-data` → `<userData>/hymns-data` → 开发态 `./hymns-data`。
4. 找不到数据包 → 显示引导页（说明放哪里、从哪来），**不崩溃、不空白**。
5. 数据包由仓库内脚本 `tools/build_dataset.py` + `tools/pack_data.py` 在本地生成，不随 Release 分发。

### 历史与设置

用 JSON 文件存于 `app.getPath('userData')`：
- `history.json` `{ searches: [], opened: [] }`
- `settings.json` 样式与选本

不用 better-sqlite3。理由：数据量上限 70 条，JSON 全量读写 <1ms；而 better-sqlite3 是 native 模块，Electron 下需要 electron-rebuild，在交叉打包/CI 上容易出问题（bible-projector 为此付过成本）。**写入用"临时文件 + rename"保证原子性**，避免断电写坏。

## 后果

- 正面：程序可合规公开；数据可独立更新；无 native 模块。
- 负面：用户要多一步"放数据包"；需在文档和首次启动引导里讲清楚。
- 若日后要支持多用户/大量统计，再迁移到 SQLite，迁移面仅 `main/store.ts`。

## 备选与否决理由

| 备选 | 否决理由 |
|---|---|
| 数据打进 asar | 侵权风险；且数据更新必须重发整个应用 |
| better-sqlite3 | native rebuild 成本 > 收益（70 条记录） |
| localStorage | 主进程也要读（投屏窗口同步），跨进程用 IPC 绕开不便 |
