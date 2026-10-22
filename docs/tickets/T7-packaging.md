# T7 打包与交付（Windows NSIS / Portable）

**Blocked by**: T6
**Blocks**: 无

## 必读

- `docs/adr/0001-stack.md`
- `docs/adr/0002-data-pack.md`
- 参考 `/data/workspace/bible-projector/package.json` 的 `build` 段与 `scripts/deliver-artifacts.mjs`（已验证可用）

## P0 必做

1. **electron-builder 配置**
   - 目标：`nsis`、`portable`、`zip`，`x64`。
   - `appId`: `com.hymn.manager`；`productName`: `赞美诗歌本`；`executableName`: `HymnManager`。
   - **`files` 白名单**：`dist/main/**/*`、`dist/renderer/**/*`、`package.json`。**绝不含 `hymns-data/`**（版权 + 让数据包可独立更新）。
   - 构建输出到 `release/`（与 `files` 白名单不同目录，避免 asar 虚胖——bible-projector 踩过这个坑）。
   - NSIS：`oneClick:false`、`allowToChangeInstallationDirectory:true`、桌面快捷方式。

2. **交叉打包环境**
   - 本机为 Linux，用 wine 打 Windows 包。wine 已装于 `/usr/local/bin/wine`。
   - `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`、`ELECTRON_BUILDER_CACHE=/data/cache/electron-builder`、`WINEPREFIX=/data/cache/wine`（全部走数据盘，**不写 /root**）。
   - `electron-builder --win --x64` 后校验产物存在、体积合理（预估 90–120MB/个）。

3. **数据包交付物**
   - `tools/pack_data.py` 生成的 `hymns-data/` 单独打成 `hymns-data-<version>.zip`。
   - **不进 Git、不上 GitHub Release**（版权），只在本地交付给用户。
   - 在程序首次启动引导页写明：把 `hymns-data` 文件夹放到安装目录旁。

4. **体积与启动断言**
   - 安装包 ≤ 130MB（超了要查是否误把数据打进 asar）。
   - 空数据包启动 ≤ 2s 到"引导页"；有数据包启动 ≤ 1.5s 到可检索。

5. **交付文档 `docs/acceptance/windows-checklist.md`**
   - 未签名警告处置（SmartScreen「更多信息 → 仍要运行」）
   - 数据包放置说明（含截图位置）
   - 9 条验收清单（对应 spec §7）

## P1 应做

- 版本号写入 `manifest.json`，程序标题栏显示版本。

## 验收标准（PM 复验，不采信自述）

```bash
ls -la release/                                    # Setup + Portable + zip
du -h release/*.exe                                # ≤130MB
unzip -l release/*.zip | grep -c hymns-data        # 必须为 0（数据未打进包）
```
- PM 会解开 asar 抽查：`npx asar list release/win-unpacked/resources/app.asar | grep -i json`，确认无诗歌数据。
- 把产物 + `hymns-data.zip` 交给用户做真机验收。

## 不含

代码签名证书、自动更新、macOS/Linux 包。

## 交付

`git commit` 引用 `T7`；产物路径与体积在回复中列明。
