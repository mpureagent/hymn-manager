# 赞美诗歌本桌面端（暂名 hymn-manager）

基督教赞美诗歌的**桌面端检索 / 管理 / 投屏**应用。目标场景：聚会前快速找到一首诗，聚会中上屏。

## 本轮范围（M0 立项）

- 目标诗歌本：红本、蓝本、千首本（三个都是教会里的**俗称**，真名待核实，见 `docs/research/hymn-data-sources.md`）
- 核心能力：按**诗歌名关键字模糊检索**、按**编号检索**（如 `1` → 第1首 圣哉圣哉）、**历史记录**
- 投屏/展示：若数据是文字 → 可配字体/字号/颜色/背景；若只有图片 → 只能整图上屏
- 非目标（本轮不做）：音频播放、歌单编排、多机同步、移动端

## 角色

| 角色 | 担当 | 职责 |
|---|---|---|
| PM / 产品设计 / 验收 | Hermes | 调研核实、写 spec 与 tickets、review 产物、真机验收 |
| 开发 / 架构 | Qoder | 按 ticket 实现（TDD） |

工作方法沿用 mattpocock 流程：`grill-with-docs → to-spec → to-tickets → implement(TDD) → code-review → retro`。
技能集已 vendor 在 `.qoder/skills/`（36 个，自 bible-projector 迁入）。

## 目录

```
.qoder/skills/        方法论技能集（mattpocock 全套 + ui-ux/design）
docs/research/        调研结论（数据源、诗歌本真名核实）
docs/adr/             架构决策记录
docs/specs/           产品 spec（/to-spec 产出）
docs/tickets/         拆解后的 ticket（/to-tickets 产出）
docs/acceptance/      验收清单
```

## 当前状态

- [x] 仓库初始化、技能集迁入
- [x] 诗歌本真名与数据源调研（红本已确认；蓝本/千首本待用户确认）
- [ ] grilling 访谈 → spec → tickets（下一步）
- [ ] 数据获取方案定案（版权与形态，见调研文档"风险"节）
