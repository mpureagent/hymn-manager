# T8 Web 宿主（一）：数据层复用 + HTTP 服务 + REST API

**Blocked by**: 无
**Blocks**: T9

## 背景

用户验收不便（每次都要在 Windows 装包）。要为 hymn-manager 增加一个 **Web 端**：同一套界面与功能，浏览器直接打开，用于快速验收样式与交互。Windows 桌面端继续保留（后续作为免安装选项）。

**必须遵守：一套代码两个宿主。** 渲染层（`src/control/`、`src/projection/`）与纯逻辑（`src/shared/`）一行都不改，靠不同 adapter 注入数据源。

用户已决策：先做 A（服务器跑 Web，浏览器访问），B（打成 Windows 便携版）后续再说。

## 关键发现（PM 已核实，直接据此实现）

`src/main/data-pack.ts`、`store.ts`、`settings.ts`、`scores.ts` **零 Electron 依赖**，全部是纯 Node。只有 `src/main/index.ts` 用 `app.getPath('userData')` 把它们接起来。所以 Web 端可以直接 import 这四个模块复用，不需要重写业务逻辑。

## P0 必做

### 1. HTTP 服务 `src/web/server.mjs`

- 纯 `node:http`，**不引入任何新依赖**（express/koa 都不许）。
- 启动参数走环境变量，全部有默认值：
  - `PORT`（默认 8787）
  - `HYMN_DATA_ROOT`：数据包父目录，在其下找 `hymns-data`（默认仓库根目录）
  - `HYMN_USER_DIR`：等价 userData 目录（默认 `<repo>/.web-user`）
  - `HYMN_STATIC`：静态资源目录（默认 `<repo>/dist/web`）
- 路由：
  - `GET /` → `index.html`（主界面）
  - `GET /projection` → `projection.html`（投屏页）
  - `GET /assets/*`、`GET /*.js|css|map` → 静态文件，正确 MIME
  - `GET /api/bootstrap` → `{ pack, currentBook, style }`（同 `Bootstrap`）
  - `POST /api/recheck` → 重新检测数据包，返回 `Bootstrap`
  - `POST /api/book` body `{ id }` → `{ currentBook }`
  - `GET /api/history` → `HistoryData`
  - `POST /api/history/search` body `{ q }` → `HistoryData`
  - `POST /api/history/opened` body `{ book, number, title }` → `HistoryData`
  - `DELETE /api/history` → `HistoryData`
  - `GET /api/fonts` → `FontChoice[]`
  - `POST /api/style` body `HymnStyle` → 收敛后的 `HymnStyle`
  - `GET /api/score/{book}/{number}` → 返回图片二进制（`Content-Type` 按扩展名），无效返回 404
- 所有 POST 用 `Content-Type: application/json`，body 上限 1MB，解析失败返回 400 而不是崩溃。
- 未捕获异常记日志并返回 500，**不能让进程退出**。

### 2. 复用四个模块

import 现成的 `loadDataPack` / `dataPackSearchPaths` / `HistoryStore` / `SettingsStore` / `resolveScorePath`。若这些模块的导出形状需要微调（例如补 `export`），**只允许加导出，不许改行为**。

`dataPackSearchPaths` 在 web 场景传：`exeDir = HYMN_DATA_ROOT`、`userDataDir = HYMN_USER_DIR`、`cwd = repo`、`includeDev = true`。

### 3. 曲谱 URL 直通（`src/shared/score.ts`）

`filePathToUrl()` 增加一条：输入已是 `http://` 或 `https://` 开头则**原样返回**。这样 web adapter 返回 `/api/score/red_book/1` 时，渲染层同一个函数也能用。

```ts
if (/^https?:\/\//i.test(filePath)) return filePath
```

### 4. 静态资源构建（`vite.config.ts` + `package.json`）

- 新增 `npm run build:web`：构建到 `dist/web`，入口 `control/index.html` 与 `projection/index.html`（web boot 版本在 T9 提供，本单先让构建产出目录结构与静态服务跑通即可，可先用现有入口占位）。
- 新增 `npm run serve:web`：`node src/web/server.mjs`。

### 5. 测试

新增 `tests/web-server.test.ts`（vitest）：

- 起一个临时端口的 server 实例，用 `fetch` 打各端点
- 覆盖：bootstrap 正常 / 数据包缺失返回 `ok:false` / history 增删查 / 非法 JSON body 返回 400 / 未知路径 404 / 曲谱 404
- 现有 133 例必须继续全绿

## 硬性约束

- **禁止引入新 npm 依赖**
- 不得修改渲染层（`src/control/**`、`src/projection/**`）的现有代码（T9 才动它们，且只加 boot）
- 不得改动 Electron 端行为（`src/main/index.ts` 现有逻辑不动）
- 不得写回 `hymns-data/`
- 不得往 `docs/acceptance/` 写任何文件

## 验收标准（PM 会独立复跑）

```bash
npm run build:web
PORT=8787 node src/web/server.mjs &   # PM 会自己换端口避免冲突
curl -s localhost:8787/api/bootstrap | head -c 400
curl -s -X POST localhost:8787/api/history/search -H 'content-type: application/json' -d '{"q":"1"}'
curl -s -o /dev/null -w '%{http_code}' localhost:8787/api/score/red_book/1   # 期望 200
curl -s -o /dev/null -w '%{http_code}' localhost:8787/api/score/red_book/9999 # 期望 404
curl -s -X POST localhost:8787/api/book -d 'not-json' -H 'content-type: application/json' -w '%{http_code}' # 期望 400
npm run typecheck && npm test
```

PM 会亲自 curl 每个端点并核对返回体字段，不采信自述。

## 交付

git commit（message 带 T8）。回复列出：新增文件、各端点 curl 实测输出、测试条数。
