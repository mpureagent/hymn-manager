# Windows 真机验收清单（T7 交付）

版本：0.1.0
打包环境：Linux + wine 3.10 交叉打包（未签名）
验收系统：Windows 10 / 11 x64

## 一、交付物

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `release/hymn-manager-Setup-0.1.0.exe` | 65 MB | `644ceeaa4fa50092b96ada593f0da197dd9e694e37a9e2f342b05e06e04f210e` |
| `release/hymn-manager-Portable-0.1.0.exe` | 65 MB | `c94ac2b37dcfa0fc6c15de146e78569af4e6e4c0c1928885abfeb6f2eaf298e3` |
| `release/hymn-manager-0.1.0-win-x64.zip` | 90 MB | `080f1e85a5fc614a62d8b2917ebff4e103e8e8358f884f6fdb445f7508f13495` |
| `delivery/hymns-data-0.1.0.zip` | 174 MB | `322e61cc91cd6959c308b0f99bf9f921aa6c812fe5a80bd4b4618a907efd2b49` |

> `hymns-data-0.1.0.zip` 是数据包，单独交付，**不在 release/、不进 Git、不上 GitHub Release**。

- 三个程序产物均 ≤130MB，`resources/app.asar` 内只有代码与 `package.json`，无诗歌数据。
- 安装版和便携版功能相同；安装版可改安装目录并创建桌面快捷方式。

## 二、SmartScreen 未签名警告处置

安装包没有代码签名证书，Windows 会显示「未知发布者」。这是预期行为，不是文件损坏。

1. 双击 `hymn-manager-Setup-0.1.0.exe`（或 Portable 版）。
2. 出现蓝色提示「Windows 已保护你的电脑」。
3. 点击提示中的 **更多信息**。
4. 点击 **仍要运行**。
5. 若系统策略隐藏了「仍要运行」：右键 exe → **属性** → **常规** → 勾选 **解除锁定** → **确定**，再运行。
   - PowerShell 等价命令：`Unblock-File .\hymn-manager-Setup-0.1.0.exe`
6. 安装完成后从桌面「赞美诗歌本」快捷方式启动。

> 版本升级或重新下载后，SmartScreen 可能再次提示；处置步骤相同。企业内网若由安全软件拦截，需将 exe 加入白名单。

## 三、数据包放置

数据与程序完全分离。程序包内**不含**任何诗歌数据，首次启动若找不到数据包会显示引导页，不会崩溃。

数据包解压后是单个 `hymns-data` 文件夹，结构如下：

```
hymns-data/
  manifest.json
  books/red_book.json
  books/black_book_1218.json
  scores/red/*.jpg
  scores/black/*.png
```

放置位置（任选其一，推荐第一种）：

1. **与程序同级（推荐）**
   - 安装版：把整个 `hymns-data` 文件夹放到 `HymnManager.exe` 所在目录。
     - 不确定目录时：右键桌面快捷方式 → **打开文件所在位置**。
     - 默认安装在 `%LOCALAPPDATA%\Programs\` 下，安装时可自行改目录。
     - 最终应看到：`...\HymnManager.exe` 与 `...\hymns-data\manifest.json` 同级。
   - 便携版：放到 `hymn-manager-Portable-0.1.0.exe` 所在目录。便携版运行时会解压到临时目录，但程序会优先按 Portable.exe 所在目录查找数据包。
2. **用户数据目录（备用）**
   - 把 `hymns-data` 放到 `%APPDATA%\赞美诗歌本\hymns-data`。
   - 引导页会列出本机实际查找过的完整路径，以引导页显示为准。

放置后回到程序点击 **重新检测**，无需重启。更换数据包时直接替换整个 `hymns-data` 文件夹即可，程序不会修改数据包内容。

> 若把程序安装到 `Program Files`，复制数据包需要管理员权限；建议直接放在用户数据目录。

## 四、9 条真机验收清单（对应 spec §7）

逐条执行并记录结果，全部为「通过」才算验收完成。

- [ ] **1. 编号检索**：选择红本，输入 `1`，首条为「第1首 圣哉三一歌」，并标注编号命中。
- [ ] **2. 双本检索**：输入「圣哉」，红本、千首本分别选择后都能命中（不跨本混排）。
- [ ] **3. 红线用例**：输入千首本第 1 首首句「全能大主宰」→ 命中千首本第 1 首；切到红本搜同一句 → 不出现红本第 1 首。
- [ ] **4. 历史持久化**：打开一首诗后出现在历史；完全退出并重启应用，历史仍在。
- [ ] **5. 样式持久化**：修改字号/背景色，预览立即变化；重启后保持。
- [ ] **6. 投屏跟随**：点击投屏，第二窗口全屏显示同一首；在主窗口切换上一首/下一首，投屏内容跟随。
- [ ] **7. 曲谱查看**：曲谱 tab 显示简谱图，可缩放、可平移。
- [ ] **8. 断网可用**：拔掉网线（或禁用网络）后，检索、阅读、曲谱、投屏全流程可用。
- [ ] **9. 数据隔离与体积**：
  - 程序目录内除用户放入的 `hymns-data` 外，没有 `books/*.json`、`scores/` 等诗歌数据；
  - Setup / Portable / zip 均 ≤130MB；
  - 无数据包启动 ≤2 秒到引导页，有数据包启动 ≤1.5 秒到可检索。

## 五、验收辅助命令（可选）

在 Linux/CI 侧可复验产物与数据隔离：

```bash
ls -la release/
du -h release/hymn-manager-Setup-0.1.0.exe \
      release/hymn-manager-Portable-0.1.0.exe \
      release/hymn-manager-0.1.0-win-x64.zip

# 必须输出 0
unzip -l release/hymn-manager-0.1.0-win-x64.zip | grep -c hymns-data

# asar 内不含诗歌数据：解包后搜索应无命中
npx asar extract release/win-unpacked/resources/app.asar /tmp/app-asar
grep -rn "圣哉" /tmp/app-asar        # 应无输出
grep -rn "全能大主宰" /tmp/app-asar  # 应无输出
```

（本机未安装 `unzip` 时可用 `busybox unzip -l` 或 Python `zipfile` 等价检查。）