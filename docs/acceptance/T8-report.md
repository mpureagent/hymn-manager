# T8 验收报告（PM 实测）— Web 宿主后端

日期：2026-11-01
产物：`f8dc1e2`，PM 补 `fd2c11c`（gzip）
结论：**通过**（PM 补了一处性能缺陷）

## 一、代码验收

| 项 | 命令 | 结果 |
|---|---|---|
| 依赖 | 读 package.json | **仍是 6 个**，未引入任何新依赖 ✓ |
| typecheck | `npm run typecheck` | 零错误 |
| 测试 | `npm test` | **14 文件 145 用例全绿**（原 133 + 新增 12）|
| 构建 | `npm run build:web` | 产出 `dist/web` 与 `dist/web-core` |

架构核对：`src/web/server-core.ts` 直接 import 了 `data-pack` / `store` / `settings` / `scores` 四个纯 Node 模块，**没有重写业务逻辑**——这正是「一套代码两宿主」的前提成立的地方。

## 二、端点实测（PM 逐个 curl，非采信自述）

| 端点 | 实测 |
|---|---|
| `GET /api/bootstrap` | 200，返回 `{pack:{ok:true,books:[红本442, 千首本1217]}, currentBook, style}` |
| `GET /` | 200，38596 字节 |
| `GET /projection` | 200 |
| `GET /api/score/red_book/1` | **200，`image/jpeg`，289154 字节**（与磁盘文件同尺寸）|
| `GET /api/score/red_book/9999` | **404** ✓ |
| `POST /api/book` + 非法 JSON | **400** ✓（不崩溃）|
| `POST /api/history/search` | 返回 `{"searches":[{"q":"圣哉",...}],"opened":[]}` ✓ |
| `GET /nope` | 404 ✓ |

服务端启动日志正常打印四个路径，进程稳定不退出。

## 三、PM 发现的缺陷：没有 gzip

第一次实测：

```
GET /api/bootstrap  未压缩 1,423,914 字节
GET /api/bootstrap  带 Accept-Encoding: gzip → 仍然 1,423,914 字节
```

**原因**：`bootstrap` 返回两个诗歌本的**全量条目**（含全部歌词），约 1.4MB，而服务端完全没有压缩。用户要在手机上经隧道访问，1.4MB 明文传输会明显卡顿——这直接损害"手机上快速看效果"这个目标。

**修复（`fd2c11c`）**：`sendJson` 增加 gzip，仅压缩 ≥1KB 的响应（小响应压缩反而多耗 CPU 且可能变大），并带 `Vary: Accept-Encoding`。

修复后实测：

```
未压缩  1,423,914 字节
gzip      349,203 字节   → 24.5%，省下 1050KB
响应头: content-encoding: gzip / vary: accept-encoding / content-length: 349203
小响应（/api/history 73 字节）不加 gzip ✓
```

## 四、遗留 P2（记入后续优化，不阻塞）

**bootstrap 一次下发全部歌词**（压缩后仍 349KB）。更彻底的做法是：
- `bootstrap` 只返回书目 + 编号/标题目录（约几十 KB）
- 打开某首时再 `GET /api/hymn/{book}/{number}` 取歌词

但这会改动渲染层的数据获取路径（当前是 `bootstrap` 一次拿全），与"渲染层一行不改"的约束冲突，因此本轮不做。手机端实际体验若可接受（gzip 后 349KB），就不必改。

## 五、结论

T8 达标。后端契约完整、错误处理健壮（400/404 不崩）、零新依赖、四个纯 Node 模块成功复用。

可进 T9（前端 adapter + 投屏双标签）。
