# T3 歌词预览 + 历史记录

**Blocked by**: T2
**Blocks**: T4

## 必读

- `docs/specs/hymn-manager-spec.md` §4.3 §4.4
- `docs/adr/0002-data-pack.md`（JSON 持久化 + 原子写）

## P0 必做

1. **歌词渲染（`control/lyrics-view.ts`）**
   - 段号小字（有 label 才显示）、行距 1.6、段落之间留白。
   - 头部：`第N首` + 标题（+ 若有 aliy 差异的 `title_alt` 用浅色括号附注）。
   - 缺歌词：显示「本首歌词暂缺」+ 说明「可在曲谱视图查看原书简谱」（曲谱视图 T6 才实现，本单只留占位按钮 disabled）。
   - 长歌词：预览区独立滚动，切歌后滚动位置归零。

2. **历史存储（`main/store.ts` + `shared/history.ts`）**
   - 文件 `<userData>/history.json`，结构 `{ searches: SearchEntry[], opened: OpenEntry[] }`。
   - `SearchEntry { q, at }`；`OpenEntry { book, number, title, at }`。
   - 纯函数 `addSearch(list, q, now, limit=20)`、`addOpened(list, entry, now, limit=50)`：
     - 去重（同 q / 同 book+number）→ 置顶 + 更新时间
     - 截断到上限
   - 原子写：写 `history.json.tmp` → `fs.renameSync`。写失败不崩，日志警告。
   - 损坏文件（非法 JSON）→ 备份为 `history.json.bad` 并从空开始，不崩溃。

3. **"有效搜索"的判定**
   - 不记录每次按键。仅当：用户按 `Enter` 打开结果，或点击了某条结果，或输入停在某查询上 ≥1.5s 且有结果时，记录一次。
   - 单测覆盖：连续输入「圣」「圣哉」「圣哉三一」只应记录最终那条（或按上述规则记录一次）。

4. **历史 UI（侧栏底部「历史」折叠区）**
   - 默认显示最近 10 条打开记录（编号 + 标题 + 相对时间如「3 分钟前」）。
   - 点击 → 切到对应本（若不同本）并打开该首。
   - 「搜索记录」chip 区显示最近搜索词，点击回填搜索框。
   - 「清空历史」按钮 → 二次确认后清空。
   - 展开后显示完整 50 条。

## P1 应做

- 相对时间每分钟自动刷新。
- 历史区可键盘可达（Tab 进入）。

## 验收标准

```bash
npm run typecheck && npm test
```
- 手动：打开第1首 → 历史出现；重启应用 → 历史仍在。
- 手动：切到 1218 打开第 5 首，再从历史点回红本第1首 → 诗歌本自动切换且内容正确。
- 手动：手工把 `history.json` 改成 `{{{` 后重启 → 应用正常，生成 `history.json.bad`。
- 手动：红本第 1001 首（短歌，无歌词）显示「本首歌词暂缺」，不空白不报错。

## 不含

投屏、曲谱视图、样式生效（T4）。

## 交付

`git commit` 引用 `T3`。
