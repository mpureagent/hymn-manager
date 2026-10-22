# T1 验收报告（PM 实测）

日期：2026-10-22
被验产物：`3894055` / `7868ede` / `25b4da3`
结论：**通过**（3 项 P2 建议不影响验收）

## 一、实测记录（全部为本机复跑真实输出）

| 验收项 | 命令 | 结果 |
|---|---|---|
| 依赖合规 | 读 package.json | electron 22.3.27 ✓；无 react/vue/svelte/better-sqlite3 ✓ |
| 类型检查 | `npm run typecheck` | 双 tsconfig 通过，EXIT=0 |
| 单元测试 | `npm test` | 3 文件 14 用例全绿（data-pack 5 / catalog 5 / virtual 4）|
| 构建 | `npm run build` | vite 443ms，CSP 注入两个入口，EXIT=0 |
| 数据包生成 | `python3 tools/pack_data.py` | 红本 442 条/442 张，千首本 1217 条/1217 张，曲谱合计 1659 |
| 幂等 | 连跑两次 | 体积均 189M，books 两个 json，scores/red 442、scores/black 1217，无重复 |
| 程序不含数据 | `grep -rl 圣哉三一 dist/` | 无命中；dist 仅 132K |
| CSP | 查注入结果 | `default-src 'self'; connect-src 'none'; object-src 'none'` ✓ |
| git 排除数据 | `git check-ignore -v` | `.raw/`、`data/`、`/hymns-data/` 均被忽略 ✓ |

## 二、UI 实测（xvfb + CDP 独立驱动，非自述）

启动真实 Electron 后从页面取值：

```json
{
 "selectOptions": ["红本《赞美诗（新编）》", "千首本《赞美诗歌（1218首）》"],
 "selectValue": "red_book",
 "searchPlaceholder": "输入编号或歌名",
 "controlsSeparate": true,
 "sameParent": true,
 "domRows": 21,
 "firstRows": ["第1首圣哉三一歌", "第2首三一来临歌", "第3首万世之宗歌"],
 "countText": "共 442 首"
}
```

- **选本下拉框与搜索框是两个独立控件**（`controlsSeparate: true`），同处顶部栏，符合用户明确要求。
- 切到千首本：`共 1217 首`，首条「第1首 圣哉三一」，DOM 实际只渲染 21 行 → 虚拟滚动生效。
- 截图核对：布局为「下拉 | 搜索 | 样式 | 投屏」+ 左列表 + 右空态，无溢出错位。

## 三、数据包缺失引导页

把 `hymns-data` 改名后重启：

```
未找到数据包
应用没有在以下位置找到 hymns-data 数据包。放置后点击「重新检测」，无需重启。
1. <exe目录>/hymns-data        （打包后为安装目录）
2. /root/.config/hymn-manager/hymns-data
3. /data/workspace/hymn-manager/hymns-data   [推荐]
[重新检测]
```

放回数据包后点「重新检测」→ 直接恢复千首本 1217 首，**无需重启**，且记住了上次选择。不崩溃、不白屏。

## 四、数据正确性对账（PM 独立核对，防造假）

把数据包与源目录逐条比对：

- 千首本：`hymns-data` 1217 条 vs 源目录 1217 条，**编号零多余、标题零不一致**，缺 442 号（源站本身缺）。
- 24 首无歌词条目**保留为目录条目**（`verses: []`, `source: "index-only"`），未丢弃、未用别本歌词填充 —— 符合 spec「照常可搜、标歌词暂缺」。
- 红本 442 条：400 正编有词 + 42 短歌仅目录，与源一致。
- 重跑 `build_dataset.py` 结果稳定：红本 442/400，千首本 1217/1193，missing 24。

## 五、P2 建议（不阻塞，可并入后续单）

1. 开发态引导页第 1 条路径 `node_modules/electron/dist/hymns-data` 对开发者是噪音，建议开发态不显示该条，或标注「（打包后为安装目录）——开发时请用第 3 条」。
2. `tools/pm_verify_ui.py`、`pm_screenshot.py` 为 PM 验收工具，保留入库（已提交），供后续每单复用。
3. Electron 22 在 Node 26 下 postinstall 会静默中断，已由开发侧手工解压绕过；T7 打包前需确认该二进制仍可用，否则重复该步骤。

## 六、结论

T1 达标，可派 T2（检索）。
