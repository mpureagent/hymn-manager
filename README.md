# 赞美诗歌本桌面端（hymn-manager）

基督教赞美诗歌的**桌面端检索 / 管理 / 投屏**应用。目标场景：聚会前几十秒内找到一首诗，聚会中上屏。

Windows 离线应用，Electron 22 + TypeScript + 原生 DOM，无网络请求。

## 功能

- **选本**：顶部独立下拉框切换，两本互不干扰
  - 红本《赞美诗（新编）》442 首（400 正编 + 42 短歌）
  - 千首本《赞美诗歌 1218 首》1217 首
- **检索**：编号（`1`）、歌名模糊（`圣哉`）、歌词首句（`全能大主宰`）
  - 纯数字只匹配编号与标题，不匹配正文，避免噪音
  - 同义字折叠（祢↔你、祂↔他、裏↔里、著↔着）
  - 中文输入法组合期间不触发检索
- **历史**：搜索词（20 条）+ 打开记录（50 条），重启保留，损坏自动备份自愈
- **样式**：字体 / 字号（24–120）/ 行高 / 文字色 / 背景色 / 对齐，全局一套 + 三档预设
- **投屏**：独立全屏窗口，按行动态分页（长歌自动降字号防裁切），样式与预览完全一致
- **曲谱**：每首的原书简谱扫描图，缩放（50–300%）拖拽平移，可整图投屏

## 快速开始

```bash
npm ci
npm run build
npm start
```

数据包需单独准备（见下），开发态放在仓库根目录 `hymns-data/`。

## 数据与程序的边界（重要）

**本仓库不含任何诗歌数据。** 歌词与曲谱均为受版权保护的出版物：

- 红本《赞美诗（新编）》：中国基督教三民爱国运动委员会 / 中国基督教协会
- 千首本《赞美诗歌 1218 首》：浙江舟山基督教两会

因此仓库只提交**代码、抓取/清洗脚本、调研与验收文档**。真实数据由本地脚本生成，不入版本库（`.raw/`、`data/`、`hymns-data/`、`delivery/` 均在 `.gitignore`）。

`tests/fixtures/` 下有几个测试用数据包，只含**歌名与编号、歌词为空**，用于验证加载校验逻辑——标题不受版权保护，不含任何歌词或曲谱。

### 自己生成数据包

需要自备数据源。脚本在 `tools/`：

```bash
python3 tools/scrape_songbook.py hymns-red 4 .raw/442_index.json   # 红本目录
python3 tools/scrape_songbook.py hymns-bk  9 .raw/1218_index.json  # 千首本目录
python3 tools/crawl_songs_par.py 21750 23200 .raw/j51_songs.jsonl  # 歌词
python3 tools/crawl_scores.py red .raw/442_index.json .raw/scores  # 曲谱
python3 tools/build_dataset.py all                                 # 清洗成结构化数据
python3 tools/check_data_quality.py                                # 质量断言（必须全绿）
python3 tools/pack_data.py                                         # 生成 hymns-data/
```

`check_data_quality.py` 会断言时间轴残留、段号残留、杂行、元信息残留、标题行残留**全部为 0**，并校验两本第 1 首歌词不同（防跨本串味）。任何一项不达标即非零退出。

### 数据包结构

```
hymns-data/
  manifest.json        { version, books: [{id, name, alias, count}] }
  books/red_book.json
  books/black_book_1218.json
  scores/red/0001_0.jpg
  scores/black/0001_0.png
```

查找顺序：`<exe 同目录>` → `<userData>` → 开发态 `<cwd>`。缺失时显示引导页并列出实际搜索过的绝对路径，不崩溃。

## 开发

```bash
npm run dev        # 开发模式
npm test           # 133 个测试
npm run typecheck  # 双 tsconfig 类型检查
npm run pack:win   # 交叉打 Windows 包（Linux + wine）
```

技术决策见 `docs/adr/`，产品规格见 `docs/specs/`。

## 文档

| 目录 | 内容 |
|---|---|
| `docs/research/` | 诗歌本真名核实、数据源可达性实测、抓取报告 |
| `docs/adr/` | 技术栈、数据与程序分离 |
| `docs/specs/` | 产品规格 v1 |
| `docs/tickets/` | T1–T7 工单 + T5F/T6F 修复单 |
| `docs/acceptance/` | 每单 PM 验收报告（含实测数据）+ Windows 真机清单 |
| `docs/DELIVERY.md` | 交付说明 |

## 角色与方法

| 角色 | 担当 |
|---|---|
| PM / 产品设计 / 验收 | Hermes |
| 开发 / 架构 | Qoder |

流程沿用 mattpocock 方法论：`grill-with-docs → to-spec → to-tickets → implement(TDD) → code-review`。技能集 vendor 在 `.qoder/skills/`（36 个）。

每个工单由 PM 独立复验：不采信开发自述，自己跑测试、解包、用 CDP 驱动真实窗口读 DOM 事实。
